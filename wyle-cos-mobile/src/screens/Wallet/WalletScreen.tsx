// src/screens/Wallet/WalletScreen.tsx
// Document Wallet — lists all documents the user has scanned and uploaded to
// their own Google Drive via Wyle. Each card shows extracted metadata.
// Documents are stored in a "Wyle Documents" folder in the user's Drive.

import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  ActivityIndicator, Linking, RefreshControl, ScrollView,
  Dimensions, StatusBar, Modal, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { getAccessToken, isGoogleConnected } from '../../services/googleAuthService';
import {
  listWyleDocs, deleteWyleDoc, uploadFileToDrive,
  findDuplicateDoc, computeContentHash,
  WyleDriveDoc, WyleDocMeta,
} from '../../services/driveService';
import type { NavProp } from '../../../app/index';

const ANTHROPIC_API_KEY = (process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '') as string;

const EXTRACTION_PROMPT = `You are analysing a document uploaded by the user. Extract all key information.

Return a JSON object with these fields (use null for fields you cannot find):
{
  "document_type": one of: invoice | receipt | passport | emirates_id | national_id | driving_license | visa | boarding_pass | hotel_booking | travel_insurance | insurance_policy | bank_statement | tax_document | payslip | medical_report | prescription | vaccination_record | health_insurance | contract | agreement | power_of_attorney | court_document | certificate | transcript | diploma | admission_letter | lease_agreement | utility_bill | property_deed | employment_letter | offer_letter | noc_letter | work_permit | vehicle_registration | vehicle_insurance | other,
  "title": short descriptive title (e.g. "TechMart Invoice #TM-2025-4821"),
  "vendor_or_issuer": company or authority name,
  "person_name": person the document belongs to (or null),
  "reference_number": invoice / policy / ID number (or null),
  "amounts": [ { "label": "Total", "value": "₹98,825", "currency": "INR" } ],
  "dates": [ { "label": "Due Date", "date_string": "15 Feb 2025", "iso_date": "2025-02-15" } ],
  "summary": "2-3 sentence plain English summary of what this document is",
  "has_trackable_deadline": true or false,
  "suggested_obligation": null
}

Respond ONLY with the raw JSON object. No markdown, no explanation, no code fences.`;

async function readAsBase64(uri: string): Promise<string> {
  if (Platform.OS === 'web') {
    return new Promise<string>((resolve, reject) => {
      fetch(uri).then(r => r.blob()).then(blob => {
        const reader = new FileReader();
        reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror  = reject;
        reader.readAsDataURL(blob);
      }).catch(reject);
    });
  }
  return FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
}

async function buildFileBlocks(
  uri: string, mimeType: string, name: string, base64?: string,
): Promise<any[]> {
  const isImage = mimeType.startsWith('image/');
  const isPdf   = mimeType === 'application/pdf';

  if (isImage) {
    const b64 = base64 ?? await readAsBase64(uri);
    return [{ type: 'image', source: { type: 'base64', media_type: mimeType, data: b64 } }];
  }
  if (isPdf) {
    const b64 = base64 ?? await readAsBase64(uri);
    return [{ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } }];
  }
  return [{
    type: 'text',
    text: `The user uploaded a file named "${name}" (${mimeType}). ` +
          `This format cannot be read directly. Please let them know you can read images and PDFs.`,
  }];
}

const { width } = Dimensions.get('window');

const C = {
  bg:         '#0D0D0D',
  surface:    '#161616',
  surfaceEl:  '#1E1E1E',
  surfaceHi:  '#252525',
  verdigris:  '#1B998B',
  chartreuse: '#D5FF3F',
  salmon:     '#FF6B6B',
  crimson:    '#FF3B30',
  orange:     '#FF9500',
  white:      '#FFFFFF',
  textSec:    '#9A9A9A',
  textTer:    '#555555',
  border:     '#2A2A2A',
};

// ── Document type → icon + colour ────────────────────────────────────────────
const DOC_CONFIG: Record<string, { icon: string; color: string; label: string }> = {
  // Identity
  passport:            { icon: '🛂', color: '#4A90D9', label: 'Passport' },
  emirates_id:         { icon: '🪪', color: '#7B61FF', label: 'Emirates ID' },
  national_id:         { icon: '🪪', color: '#7B61FF', label: 'National ID' },
  driving_license:     { icon: '🚗', color: '#FF9500', label: 'Driving License' },
  // Travel
  visa:                { icon: '✈️', color: '#1B998B', label: 'Visa' },
  boarding_pass:       { icon: '🎫', color: '#1B998B', label: 'Boarding Pass' },
  hotel_booking:       { icon: '🏨', color: '#34C759', label: 'Hotel Booking' },
  travel_insurance:    { icon: '🌍', color: '#34C759', label: 'Travel Insurance' },
  // Finance
  invoice:             { icon: '📄', color: '#FF6B6B', label: 'Invoice' },
  receipt:             { icon: '🧾', color: '#FF9500', label: 'Receipt' },
  bank_statement:      { icon: '🏦', color: '#4A90D9', label: 'Bank Statement' },
  insurance_policy:    { icon: '🛡️', color: '#34C759', label: 'Insurance' },
  tax_document:        { icon: '📊', color: '#FF6B6B', label: 'Tax Document' },
  payslip:             { icon: '💰', color: '#34C759', label: 'Payslip' },
  // Medical
  medical_report:      { icon: '🏥', color: '#FF6B6B', label: 'Medical Report' },
  prescription:        { icon: '💊', color: '#FF9500', label: 'Prescription' },
  vaccination_record:  { icon: '💉', color: '#34C759', label: 'Vaccination' },
  health_insurance:    { icon: '❤️‍🩹', color: '#FF6B6B', label: 'Health Insurance' },
  // Legal
  contract:            { icon: '📝', color: '#7B61FF', label: 'Contract' },
  agreement:           { icon: '🤝', color: '#7B61FF', label: 'Agreement' },
  power_of_attorney:   { icon: '⚖️', color: '#7B61FF', label: 'Power of Attorney' },
  court_document:      { icon: '🏛️', color: '#9A9A9A', label: 'Court Document' },
  // Education
  certificate:         { icon: '🎓', color: '#FFD60A', label: 'Certificate' },
  transcript:          { icon: '📚', color: '#FFD60A', label: 'Transcript' },
  diploma:             { icon: '🏅', color: '#FFD60A', label: 'Diploma' },
  admission_letter:    { icon: '🎒', color: '#FFD60A', label: 'Admission Letter' },
  // Property
  lease_agreement:     { icon: '🏠', color: '#FF9500', label: 'Lease Agreement' },
  utility_bill:        { icon: '💡', color: '#FF9500', label: 'Utility Bill' },
  property_deed:       { icon: '🏡', color: '#FF9500', label: 'Property Deed' },
  // Work
  employment_letter:   { icon: '💼', color: '#4A90D9', label: 'Employment Letter' },
  offer_letter:        { icon: '📩', color: '#4A90D9', label: 'Offer Letter' },
  noc_letter:          { icon: '📋', color: '#4A90D9', label: 'NOC Letter' },
  work_permit:         { icon: '🔖', color: '#4A90D9', label: 'Work Permit' },
  // Vehicle
  vehicle_registration: { icon: '🚘', color: '#FF9500', label: 'Vehicle Reg.' },
  vehicle_insurance:    { icon: '🚗', color: '#34C759', label: 'Vehicle Insurance' },
  // Fallback
  other:               { icon: '📎', color: '#9A9A9A', label: 'Document' },
};

function getDocConfig(type: string) {
  return DOC_CONFIG[type] ?? DOC_CONFIG.other;
}

// ── Expiry badge helper ───────────────────────────────────────────────────────
function getExpiryInfo(dates: WyleDriveDoc['dates']): {
  label: string; daysLeft: number | null; color: string
} {
  const expiryDate = dates.find(d =>
    d.label.toLowerCase().includes('expir') ||
    d.label.toLowerCase().includes('valid') ||
    d.label.toLowerCase().includes('due')
  );
  if (!expiryDate) return { label: '', daysLeft: null, color: C.textTer };

  const parsed = new Date(expiryDate.date_string);
  if (isNaN(parsed.getTime())) return { label: expiryDate.date_string, daysLeft: null, color: C.textTer };

  const daysLeft = Math.ceil((parsed.getTime() - Date.now()) / 86400000);
  const color = daysLeft <= 7 ? C.crimson : daysLeft <= 30 ? C.orange : daysLeft <= 90 ? '#FFD60A' : C.verdigris;
  const label = daysLeft < 0
    ? 'Expired'
    : daysLeft === 0
    ? 'Expires today'
    : daysLeft <= 90
    ? `Expires in ${daysLeft}d`
    : parsed.toLocaleDateString('en-AE', { day: 'numeric', month: 'short', year: 'numeric' });

  return { label, daysLeft, color };
}

// ── Filter tabs ───────────────────────────────────────────────────────────────
const FILTERS = [
  { key: 'all',       label: 'All' },
  { key: 'id',        label: '🪪 IDs' },
  { key: 'finance',   label: '💰 Finance' },
  { key: 'travel',    label: '✈️ Travel' },
  { key: 'medical',   label: '🏥 Medical' },
  { key: 'legal',     label: '⚖️ Legal' },
  { key: 'education', label: '🎓 Education' },
  { key: 'property',  label: '🏠 Property' },
  { key: 'work',      label: '💼 Work' },
  { key: 'vehicle',   label: '🚘 Vehicle' },
  { key: 'other',     label: '📎 Other' },
];

const FILTER_TYPES: Record<string, string[]> = {
  id:        ['passport', 'emirates_id', 'national_id', 'driving_license'],
  finance:   ['invoice', 'receipt', 'bank_statement', 'insurance_policy', 'tax_document', 'payslip'],
  travel:    ['visa', 'passport', 'boarding_pass', 'hotel_booking', 'travel_insurance'],
  medical:   ['medical_report', 'prescription', 'vaccination_record', 'health_insurance'],
  legal:     ['contract', 'agreement', 'power_of_attorney', 'court_document'],
  education: ['certificate', 'transcript', 'diploma', 'admission_letter'],
  property:  ['lease_agreement', 'utility_bill', 'property_deed'],
  work:      ['employment_letter', 'offer_letter', 'noc_letter', 'work_permit', 'payslip'],
  vehicle:   ['vehicle_registration', 'vehicle_insurance', 'driving_license'],
  other:     ['other'],
};

// ── Doc Card ─────────────────────────────────────────────────────────────────
function DocCard({
  doc,
  onDelete,
}: {
  doc: WyleDriveDoc;
  onDelete: (doc: WyleDriveDoc) => void;   // opens confirm modal in parent
}) {
  const cfg    = getDocConfig(doc.documentType);
  const expiry = getExpiryInfo(doc.dates);
  const uploadedDate = new Date(doc.uploadedAt).toLocaleDateString('en-AE', {
    day: 'numeric', month: 'short', year: 'numeric',
  });

  const handleOpen = () => {
    if (doc.webViewLink) {
      Linking.openURL(doc.webViewLink).catch(() => {});
    }
  };

  const handleDelete = () => onDelete(doc);

  return (
    <TouchableOpacity style={card.wrap} activeOpacity={0.85} onPress={handleOpen}>
      {/* Icon */}
      <View style={[card.iconWrap, { backgroundColor: `${cfg.color}18`, borderColor: `${cfg.color}30` }]}>
        <Text style={card.icon}>{cfg.icon}</Text>
      </View>

      {/* Content */}
      <View style={card.content}>
        <View style={card.titleRow}>
          <Text style={card.title} numberOfLines={1}>{doc.title}</Text>
          <TouchableOpacity onPress={handleDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Text style={card.deleteBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        <Text style={[card.typeLabel, { color: cfg.color }]}>{cfg.label}</Text>

        {doc.vendor ? (
          <Text style={card.meta} numberOfLines={1}>🏢 {doc.vendor}</Text>
        ) : null}
        {doc.personName ? (
          <Text style={card.meta} numberOfLines={1}>👤 {doc.personName}</Text>
        ) : null}
        {doc.reference ? (
          <Text style={card.meta} numberOfLines={1}>🔖 {doc.reference}</Text>
        ) : null}

        {/* Amounts */}
        {doc.amounts?.length > 0 && (
          <View style={card.amountRow}>
            {doc.amounts.slice(0, 2).map((a, i) => (
              <View key={i} style={card.amountBadge}>
                <Text style={card.amountText}>💰 {a.currency} {a.value}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Expiry / date */}
        <View style={card.footer}>
          {expiry.label ? (
            <View style={[card.expiryBadge, { backgroundColor: `${expiry.color}18`, borderColor: `${expiry.color}35` }]}>
              <Text style={[card.expiryText, { color: expiry.color }]}>📅 {expiry.label}</Text>
            </View>
          ) : null}
          <Text style={card.uploadedAt}>Scanned {uploadedDate}</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

const card = StyleSheet.create({
  wrap: {
    flexDirection: 'row', gap: 14,
    backgroundColor: C.surface,
    borderRadius: 16, padding: 14,
    marginBottom: 12,
    borderWidth: 1, borderColor: C.border,
  },
  iconWrap: {
    width: 52, height: 52, borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
  },
  icon:      { fontSize: 26 },
  content:   { flex: 1, gap: 4 },
  titleRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  title:     { color: C.white, fontSize: 15, fontWeight: '700', flex: 1, marginRight: 8 },
  deleteBtn: { color: C.textTer, fontSize: 14, fontWeight: '600' },
  typeLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.8 },
  meta:      { color: C.textSec, fontSize: 12, marginTop: 1 },
  amountRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  amountBadge: {
    backgroundColor: `${C.verdigris}14`,
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3,
    borderWidth: 1, borderColor: `${C.verdigris}28`,
  },
  amountText:  { color: C.verdigris, fontSize: 12, fontWeight: '600' },
  footer:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 6 },
  expiryBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3, borderWidth: 1 },
  expiryText:  { fontSize: 11, fontWeight: '700' },
  uploadedAt:  { color: C.textTer, fontSize: 10 },
});

// ── Main Screen ───────────────────────────────────────────────────────────────
export default function WalletScreen({ navigation }: { navigation: NavProp }) {
  const nav = navigation ?? { navigate: (_: any) => {}, goBack: () => {} };

  const [docs, setDocs]         = useState<WyleDriveDoc[]>([]);
  const [loading, setLoading]   = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeFilter, setActiveFilter] = useState('all');
  const [connected, setConnected] = useState(false);
  const [confirmDoc, setConfirmDoc] = useState<WyleDriveDoc | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Direct upload state ────────────────────────────────────────────────────
  const [uploadMenuVisible, setUploadMenuVisible] = useState(false);
  const [uploading, setUploading]                 = useState(false);
  const [uploadStatus, setUploadStatus]           = useState('');   // progress label

  const loadDocs = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const { connected: isConnected } = await isGoogleConnected();
      setConnected(isConnected);
      if (!isConnected) return;

      const token = await getAccessToken();
      if (!token) return;

      const list = await listWyleDocs(token);
      setDocs(list);
    } catch (e: any) {
      console.warn('[Wallet] Load error:', e.message);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Reload every time the tab is focused
  useEffect(() => { loadDocs(); }, [loadDocs]);

  const handleDelete = async (doc: WyleDriveDoc) => {
    setConfirmDoc(null);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not signed in');
      await deleteWyleDoc(doc.fileId, doc.metaId, token);
      setDocs(prev => prev.filter(d => d.metaId !== doc.metaId));
    } catch (e: any) {
      setDeleteError(`Could not delete document: ${e.message}`);
    }
  };

  // ── Direct upload handler ──────────────────────────────────────────────────
  const processAndUpload = async (
    uri: string, name: string, mimeType: string, base64?: string,
  ) => {
    setUploadMenuVisible(false);
    setUploading(true);
    try {
      const token = await getAccessToken();
      if (!token) throw new Error('Not signed in to Google');

      // Read base64 if not already provided
      const b64 = base64 ?? await readAsBase64(uri);

      // Duplicate check
      setUploadStatus('Checking for duplicates…');
      const contentHash = computeContentHash(b64);
      const duplicate   = await findDuplicateDoc(name, contentHash, token).catch(() => null);
      if (duplicate) {
        const uploadedOn = new Date(duplicate.uploadedAt).toLocaleDateString('en-AE', {
          day: 'numeric', month: 'short', year: 'numeric',
        });
        setDeleteError(`"${duplicate.title}" is already in your Wallet (scanned ${uploadedOn}).`);
        return;
      }

      // Extract with Claude
      setUploadStatus('Extracting document info…');
      const blocks = await buildFileBlocks(uri, mimeType, name, b64);
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1024,
          messages: [{ role: 'user', content: [...blocks, { type: 'text', text: EXTRACTION_PROMPT }] }],
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message ?? 'Claude API error');

      let extracted: any = null;
      try {
        extracted = JSON.parse(data.content?.[0]?.text?.replace(/```json|```/g, '').trim() ?? '');
      } catch { /* use fallback metadata */ }

      // Upload to Drive
      setUploadStatus('Saving to Google Drive…');
      const docMeta: WyleDocMeta = {
        documentType: extracted?.document_type    ?? 'other',
        title:        extracted?.title            ?? name,
        vendor:       extracted?.vendor_or_issuer ?? '',
        personName:   extracted?.person_name      ?? '',
        amounts:      extracted?.amounts          ?? [],
        dates:        extracted?.dates            ?? [],
        reference:    extracted?.reference_number ?? '',
        summary:      extracted?.summary          ?? '',
        uploadedAt:   new Date().toISOString(),
        originalName: name,
        mimeType,
        contentHash,
      };
      await uploadFileToDrive(uri, name, mimeType, docMeta, token);

      // Refresh the list
      setUploadStatus('Done!');
      await loadDocs();
    } catch (e: any) {
      setDeleteError(`Upload failed: ${e.message}`);
    } finally {
      setUploading(false);
      setUploadStatus('');
    }
  };

  const handlePickCamera = async () => {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) { setDeleteError('Camera permission denied.'); return; }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true, quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const name  = asset.fileName ?? `scan_${Date.now()}.jpg`;
    await processAndUpload(asset.uri, name, asset.mimeType ?? 'image/jpeg', asset.base64 ?? undefined);
  };

  const handlePickPhotos = async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { setDeleteError('Photo library permission denied.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      base64: true, quality: 0.85,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    const name  = asset.fileName ?? `photo_${Date.now()}.jpg`;
    await processAndUpload(asset.uri, name, asset.mimeType ?? 'image/jpeg', asset.base64 ?? undefined);
  };

  const handlePickFiles = async () => {
    const result = await DocumentPicker.getDocumentAsync({
      type: ['application/pdf', 'image/*'],
      copyToCacheDirectory: true,
    });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    await processAndUpload(asset.uri, asset.name, asset.mimeType ?? 'application/octet-stream');
  };

  // Filter docs
  const filteredDocs = activeFilter === 'all'
    ? docs
    : docs.filter(d => (FILTER_TYPES[activeFilter] ?? []).includes(d.documentType));

  // ── Not connected state ───────────────────────────────────────────────────
  if (!loading && !connected) {
    return (
      <View style={s.container}>
        <StatusBar barStyle="light-content" backgroundColor={C.bg} />
        <SafeAreaView edges={['top']} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 }}>
          <Text style={{ fontSize: 48, marginBottom: 16 }}>🔐</Text>
          <Text style={s.emptyTitle}>Connect Google to access your Wallet</Text>
          <Text style={s.emptySub}>
            Your documents are stored securely in your own Google Drive.
            Connect your account to view them here.
          </Text>
          <TouchableOpacity
            style={s.connectBtn}
            onPress={() => nav.navigate('connect' as any)}
          >
            <Text style={s.connectBtnText}>Connect Google Account</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={s.container}>
      <StatusBar barStyle="light-content" backgroundColor={C.bg} />
      <SafeAreaView edges={['top']} style={{ flex: 1 }}>

        {/* Header */}
        <View style={s.header}>
          <View>
            <Text style={s.headerTitle}>Document Wallet</Text>
            <Text style={s.headerSub}>
              {docs.length > 0
                ? `${docs.length} document${docs.length === 1 ? '' : 's'} · stored in your Google Drive`
                : 'Your scanned documents live here'}
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TouchableOpacity
              style={s.uploadBtn}
              onPress={() => setUploadMenuVisible(true)}
              disabled={uploading}
            >
              <Text style={s.uploadBtnText}>＋ Upload</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.driveBtn} onPress={() =>
              Linking.openURL('https://drive.google.com').catch(() => {})
            }>
              <Text style={s.driveBtnText}>📁 Drive</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Upload progress banner */}
        {uploading && (
          <View style={s.uploadBanner}>
            <ActivityIndicator color={C.verdigris} size="small" />
            <Text style={s.uploadBannerText}>{uploadStatus || 'Processing…'}</Text>
          </View>
        )}

        {/* Filter tabs — horizontally scrollable */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.filterRow}
        >
          {FILTERS.map(f => (
            <TouchableOpacity
              key={f.key}
              style={[s.filterTab, activeFilter === f.key && s.filterTabActive]}
              onPress={() => setActiveFilter(f.key)}
            >
              <Text style={[s.filterTabText, activeFilter === f.key && s.filterTabTextActive]}>
                {f.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Content */}
        {loading ? (
          <View style={s.center}>
            <ActivityIndicator color={C.verdigris} size="large" />
            <Text style={s.loadingText}>Loading your documents...</Text>
          </View>
        ) : filteredDocs.length === 0 ? (
          <View style={s.center}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>
              {activeFilter === 'all' ? '📂' : '🔍'}
            </Text>
            <Text style={s.emptyTitle}>
              {activeFilter === 'all' ? 'No documents yet' : `No ${activeFilter} documents`}
            </Text>
            <Text style={s.emptySub}>
              {activeFilter === 'all'
                ? 'Scan a document in the Buddy chat using the + button and Buddy will save it here automatically.'
                : 'Try switching to "All" or scan a new document.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredDocs}
            keyExtractor={d => d.metaId}
            renderItem={({ item }) => (
              <DocCard doc={item} onDelete={setConfirmDoc} />
            )}
            contentContainerStyle={s.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => loadDocs(true)}
                tintColor={C.verdigris}
              />
            }
          />
        )}
      </SafeAreaView>

      {/* ── Upload source menu ──────────────────────────────────── */}
      <Modal
        visible={uploadMenuVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setUploadMenuVisible(false)}
      >
        <TouchableOpacity
          style={upMenu.overlay}
          activeOpacity={1}
          onPress={() => setUploadMenuVisible(false)}
        >
          <View style={upMenu.sheet}>
            <View style={upMenu.handle} />
            <Text style={upMenu.title}>Add Document</Text>

            <TouchableOpacity style={upMenu.row} onPress={handlePickCamera}>
              <View style={upMenu.iconWrap}><Text style={upMenu.icon}>📷</Text></View>
              <View style={upMenu.rowText}>
                <Text style={upMenu.rowLabel}>Camera</Text>
                <Text style={upMenu.rowSub}>Take a photo of a document</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={upMenu.row} onPress={handlePickPhotos}>
              <View style={upMenu.iconWrap}><Text style={upMenu.icon}>🖼️</Text></View>
              <View style={upMenu.rowText}>
                <Text style={upMenu.rowLabel}>Photo Library</Text>
                <Text style={upMenu.rowSub}>Choose an existing photo</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={upMenu.row} onPress={handlePickFiles}>
              <View style={upMenu.iconWrap}><Text style={upMenu.icon}>📄</Text></View>
              <View style={upMenu.rowText}>
                <Text style={upMenu.rowLabel}>Files</Text>
                <Text style={upMenu.rowSub}>Pick a PDF or image file</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={upMenu.cancelBtn} onPress={() => setUploadMenuVisible(false)}>
              <Text style={upMenu.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Delete confirmation modal ────────────────────────────── */}
      <Modal
        visible={confirmDoc !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setConfirmDoc(null)}
      >
        <View style={modal.overlay}>
          <View style={modal.box}>
            <Text style={modal.title}>Remove Document</Text>
            <Text style={modal.message}>
              Remove <Text style={modal.docName}>"{confirmDoc?.title}"</Text> from your Wallet?{'\n'}
              It will also be deleted from your Google Drive.
            </Text>
            <View style={modal.btnRow}>
              <TouchableOpacity style={modal.cancelBtn} onPress={() => setConfirmDoc(null)}>
                <Text style={modal.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={modal.removeBtn}
                onPress={() => confirmDoc && handleDelete(confirmDoc)}
              >
                <Text style={modal.removeText}>Remove</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── Delete error modal ───────────────────────────────────── */}
      <Modal
        visible={deleteError !== null}
        transparent
        animationType="fade"
        onRequestClose={() => setDeleteError(null)}
      >
        <View style={modal.overlay}>
          <View style={modal.box}>
            <Text style={modal.title}>Error</Text>
            <Text style={modal.message}>{deleteError}</Text>
            <View style={modal.btnRow}>
              <TouchableOpacity style={modal.removeBtn} onPress={() => setDeleteError(null)}>
                <Text style={modal.removeText}>OK</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 16,
  },
  headerTitle: { color: C.white, fontSize: 24, fontWeight: '800' },
  headerSub:   { color: C.textSec, fontSize: 12, marginTop: 2 },
  driveBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, backgroundColor: C.surfaceEl,
    borderWidth: 1, borderColor: C.border,
  },
  driveBtnText: { color: C.textSec, fontSize: 13, fontWeight: '600' },

  filterRow: {
    flexDirection: 'row', gap: 8,
    paddingHorizontal: 20, paddingBottom: 14,
  },
  filterTab: {
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 999, backgroundColor: C.surfaceEl,
    borderWidth: 1, borderColor: C.border,
  },
  filterTabActive: {
    backgroundColor: C.verdigris, borderColor: C.verdigris,
  },
  filterTabText:       { color: C.textSec, fontSize: 13, fontWeight: '600' },
  filterTabTextActive: { color: C.white },

  list:   { paddingHorizontal: 20, paddingBottom: 24 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },

  emptyTitle: {
    color: C.white, fontSize: 18, fontWeight: '700',
    textAlign: 'center', marginBottom: 10,
  },
  emptySub: {
    color: C.textSec, fontSize: 14, textAlign: 'center', lineHeight: 21,
  },

  connectBtn: {
    marginTop: 24, backgroundColor: C.verdigris,
    borderRadius: 14, paddingHorizontal: 24, paddingVertical: 14,
  },
  connectBtnText: { color: C.white, fontSize: 15, fontWeight: '700' },

  loadingText: { color: C.textSec, fontSize: 14, marginTop: 12 },

  uploadBtn: {
    paddingHorizontal: 14, paddingVertical: 8,
    borderRadius: 12, backgroundColor: C.verdigris,
  },
  uploadBtnText: { color: C.white, fontSize: 13, fontWeight: '700' },

  uploadBanner: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginHorizontal: 20, marginBottom: 10,
    backgroundColor: `${C.verdigris}18`,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1, borderColor: `${C.verdigris}30`,
  },
  uploadBannerText: { color: C.verdigris, fontSize: 13, fontWeight: '600' },
});

const upMenu = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: C.surface,
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingHorizontal: 20, paddingBottom: 36, paddingTop: 12,
  },
  handle: {
    width: 40, height: 4, borderRadius: 2,
    backgroundColor: C.textTer, alignSelf: 'center', marginBottom: 18,
  },
  title: {
    color: C.white, fontSize: 17, fontWeight: '800',
    marginBottom: 16,
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  iconWrap: {
    width: 48, height: 48, borderRadius: 14,
    backgroundColor: C.surfaceEl,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: C.border,
  },
  icon:     { fontSize: 22 },
  rowText:  { flex: 1 },
  rowLabel: { color: C.white, fontSize: 15, fontWeight: '700' },
  rowSub:   { color: C.textSec, fontSize: 12, marginTop: 2 },
  cancelBtn: {
    marginTop: 16, alignItems: 'center',
    paddingVertical: 14, borderRadius: 14,
    backgroundColor: C.surfaceEl,
    borderWidth: 1, borderColor: C.border,
  },
  cancelText: { color: C.textSec, fontSize: 15, fontWeight: '700' },
});

const modal = StyleSheet.create({
  overlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center', justifyContent: 'center',
    paddingHorizontal: 32,
  },
  box: {
    width: '100%', backgroundColor: C.surface,
    borderRadius: 20, padding: 24,
    borderWidth: 1, borderColor: C.border,
  },
  title: {
    color: C.white, fontSize: 18, fontWeight: '800',
    marginBottom: 10,
  },
  message: {
    color: C.textSec, fontSize: 14, lineHeight: 22,
    marginBottom: 24,
  },
  docName: { color: C.white, fontWeight: '700' },
  btnRow: { flexDirection: 'row', gap: 12, justifyContent: 'flex-end' },
  cancelBtn: {
    paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: 12, backgroundColor: C.surfaceEl,
    borderWidth: 1, borderColor: C.border,
  },
  cancelText: { color: C.textSec, fontSize: 14, fontWeight: '700' },
  removeBtn: {
    paddingHorizontal: 20, paddingVertical: 11,
    borderRadius: 12, backgroundColor: C.crimson,
  },
  removeText: { color: C.white, fontSize: 14, fontWeight: '700' },
});
