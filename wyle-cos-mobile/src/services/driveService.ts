// src/services/driveService.ts
// Stores user documents in their own Google Drive under a "Wyle Documents" folder.
// Uses the drive.file scope — only files created by this app are accessible.
//
// Flow:
//   1. ensureWyleFolder()  — creates "Wyle Documents" folder once, caches its ID
//   2. uploadFile()        — uploads file bytes + metadata JSON as a pair
//   3. listFiles()         — returns all Wyle-uploaded documents
//   4. getFileContent()    — downloads raw bytes for preview
//   5. deleteFile()        — removes a file (and its metadata sidecar)

import { Platform } from 'react-native';
import * as FileSystem from 'expo-file-system';

const DRIVE_API   = 'https://www.googleapis.com/drive/v3';
const UPLOAD_API  = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_NAME = 'Wyle Documents';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const META_SUFFIX = '.wyle-meta.json';  // sidecar file storing extracted data

// ── Folder ID cache (in-memory, re-resolved per session) ─────────────────────
let _cachedFolderId: string | null = null;

// ── Helper: authenticated fetch ───────────────────────────────────────────────
async function driveGet(path: string, token: string): Promise<any> {
  const res = await fetch(`${DRIVE_API}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Drive GET ${path} → ${res.status}: ${JSON.stringify(err)}`);
  }
  return res.json();
}

// ── Ensure "Wyle Documents" folder exists in the user's Drive ─────────────────
export async function ensureWyleFolder(token: string): Promise<string> {
  if (_cachedFolderId) return _cachedFolderId;

  // Search for existing folder
  const q = encodeURIComponent(
    `mimeType='${FOLDER_MIME}' and name='${FOLDER_NAME}' and trashed=false`
  );
  const list = await driveGet(`/files?q=${q}&fields=files(id,name)`, token);

  if (list.files?.length > 0) {
    _cachedFolderId = list.files[0].id;
    return _cachedFolderId!;
  }

  // Create it
  const res = await fetch(`${DRIVE_API}/files`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name:     FOLDER_NAME,
      mimeType: FOLDER_MIME,
    }),
  });
  if (!res.ok) throw new Error(`Could not create Wyle folder: ${res.status}`);
  const folder = await res.json();
  _cachedFolderId = folder.id;
  return folder.id;
}

// ── Upload a file to Drive + a metadata sidecar ───────────────────────────────
export type DriveUploadResult = {
  fileId:   string;
  metaId:   string;
  webViewLink: string;
};

export type WyleDocMeta = {
  documentType: string;
  title:        string;
  vendor:       string;
  personName:   string;
  amounts:      { label: string; value: string; currency: string }[];
  dates:        { label: string; date_string: string }[];
  reference:    string;
  summary:      string;
  uploadedAt:   string;  // ISO
  originalName: string;
  mimeType:     string;
};

export async function uploadFileToDrive(
  uri:      string,
  fileName: string,
  mimeType: string,
  meta:     WyleDocMeta,
  token:    string,
): Promise<DriveUploadResult> {
  const folderId = await ensureWyleFolder(token);

  // Read file bytes as base64
  let base64: string;
  if (Platform.OS === 'web') {
    base64 = await new Promise<string>((resolve, reject) => {
      fetch(uri)
        .then(r => r.blob())
        .then(blob => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
        .catch(reject);
    });
  } else {
    base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  // Convert base64 → Uint8Array for multipart upload
  const binaryStr = atob(base64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i);

  // ── Multipart upload (metadata + file bytes in one request) ──────────────────
  const boundary = '-------wyle_boundary_' + Date.now();
  const metaJson = JSON.stringify({ name: fileName, parents: [folderId] });

  // Build multipart body as Uint8Array
  const enc = new TextEncoder();
  const part1 = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metaJson}\r\n--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`
  );
  const part2 = enc.encode(`\r\n--${boundary}--`);

  const body = new Uint8Array(part1.length + bytes.length + part2.length);
  body.set(part1, 0);
  body.set(bytes, part1.length);
  body.set(part2, part1.length + bytes.length);

  const uploadRes = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id,webViewLink`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );
  if (!uploadRes.ok) {
    const err = await uploadRes.json().catch(() => ({}));
    throw new Error(`Drive upload failed: ${uploadRes.status} ${JSON.stringify(err)}`);
  }
  const uploaded = await uploadRes.json();

  // ── Upload metadata sidecar JSON ─────────────────────────────────────────────
  const metaContent = JSON.stringify(meta);
  const metaBytes   = new TextEncoder().encode(metaContent);
  const metaName    = fileName + META_SUFFIX;
  const metaPart1   = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: metaName, parents: [folderId] })}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n`
  );
  const metaBody = new Uint8Array(metaPart1.length + metaBytes.length + part2.length);
  metaBody.set(metaPart1, 0);
  metaBody.set(metaBytes, metaPart1.length);
  metaBody.set(part2, metaPart1.length + metaBytes.length);

  const metaUploadRes = await fetch(
    `${UPLOAD_API}/files?uploadType=multipart&fields=id`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body: metaBody,
    }
  );
  const metaUploaded = metaUploadRes.ok ? await metaUploadRes.json() : { id: '' };

  return {
    fileId:      uploaded.id,
    metaId:      metaUploaded.id,
    webViewLink: uploaded.webViewLink ?? '',
  };
}

// ── List all Wyle documents (reads sidecar metadata files) ────────────────────
export type WyleDriveDoc = WyleDocMeta & {
  fileId:      string;
  metaId:      string;
  webViewLink: string;
};

export async function listWyleDocs(token: string): Promise<WyleDriveDoc[]> {
  const folderId = await ensureWyleFolder(token);

  // Fetch all metadata sidecar files from the folder
  const q = encodeURIComponent(
    `'${folderId}' in parents and name contains '${META_SUFFIX}' and trashed=false`
  );
  const list = await driveGet(
    `/files?q=${q}&fields=files(id,name,createdTime)&orderBy=createdTime desc`,
    token
  );

  if (!list.files?.length) return [];

  // Download each metadata JSON
  const docs: WyleDriveDoc[] = [];
  for (const f of list.files) {
    try {
      const content = await fetch(`${DRIVE_API}/files/${f.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      }).then(r => r.json()) as WyleDocMeta;

      // Derive the original file ID from the meta file name
      const originalName = f.name.replace(META_SUFFIX, '');
      const origQ = encodeURIComponent(
        `'${folderId}' in parents and name='${originalName}' and trashed=false`
      );
      const origList = await driveGet(
        `/files?q=${origQ}&fields=files(id,webViewLink)`,
        token
      );
      const origFile = origList.files?.[0];

      docs.push({
        ...content,
        fileId:      origFile?.id      ?? '',
        metaId:      f.id,
        webViewLink: origFile?.webViewLink ?? '',
      });
    } catch {
      // skip corrupt metadata
    }
  }
  return docs;
}

// ── Delete a file and its metadata sidecar ────────────────────────────────────
export async function deleteWyleDoc(
  fileId: string,
  metaId: string,
  token:  string,
): Promise<void> {
  await Promise.all([
    fileId ? fetch(`${DRIVE_API}/files/${fileId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }) : Promise.resolve(),
    metaId ? fetch(`${DRIVE_API}/files/${metaId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    }) : Promise.resolve(),
  ]);
}
