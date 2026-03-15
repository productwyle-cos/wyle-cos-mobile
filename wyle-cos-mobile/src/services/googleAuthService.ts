// src/services/googleAuthService.ts
// Handles Google OAuth for Gmail + Calendar access
// Requires: EXPO_PUBLIC_GOOGLE_CLIENT_ID in .env

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';

// expo-auth-session v7 (SDK 54+) removed the auth.expo.io proxy.
// makeRedirectUri() now returns:
//   - Expo Go (tunnel): exp://xxx.exp.direct
//   - Standalone app:   com.wyle.cos:// (matches app.json scheme + android package)
// The returned URI must be registered in Google Cloud Console each session (Expo Go)
// or once permanently (standalone APK/IPA).
export function getOAuthRedirectUri(): string {
  return AuthSession.makeRedirectUri({ scheme: 'com.wyle.cos' });
}

const SCOPES = [
  'openid',
  'profile',
  'email',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

const SECURE_KEYS = {
  ACCESS_TOKEN:  'google_access_token',
  REFRESH_TOKEN: 'google_refresh_token',
  TOKEN_EXPIRY:  'google_token_expiry',
  USER_EMAIL:    'google_user_email',
};

// ── Storage abstraction (SecureStore on native, localStorage on web) ───────────
async function storeItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.setItem(key, value);
  } else {
    await SecureStore.setItemAsync(key, value);
  }
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    return localStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    localStorage.removeItem(key);
  } else {
    await SecureStore.deleteItemAsync(key).catch(() => {});
  }
}

export type GoogleAuthResult =
  | { success: true;  accessToken: string; email: string }
  | { success: false; error: string };

// ── OAuth discovery ────────────────────────────────────────────────────────────
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint:         'https://oauth2.googleapis.com/token',
  revocationEndpoint:    'https://oauth2.googleapis.com/revoke',
};

// ── Sign in with Google ────────────────────────────────────────────────────────
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  if (Platform.OS === 'web') {
    return { success: false, error: 'web' }; // ConnectScreen handles this case
  }
  if (!GOOGLE_CLIENT_ID) {
    return { success: false, error: 'EXPO_PUBLIC_GOOGLE_CLIENT_ID not set in .env' };
  }

  try {
    const redirectUri = getOAuthRedirectUri();
    console.log('[GoogleAuth] redirect URI →', redirectUri); // copy this into Google Cloud Console

    const request = new AuthSession.AuthRequest({
      clientId:            GOOGLE_CLIENT_ID,
      scopes:              SCOPES,
      redirectUri,
      responseType:        AuthSession.ResponseType.Code,
      usePKCE:             true,
      extraParams:         { access_type: 'offline', prompt: 'consent' },
    });

    const result = await request.promptAsync(discovery);

    if (result.type !== 'success') {
      return { success: false, error: result.type === 'cancel' ? 'Cancelled' : 'Auth failed' };
    }

    // Exchange code for tokens
    const tokenRes = await AuthSession.exchangeCodeAsync(
      {
        clientId:     GOOGLE_CLIENT_ID,
        code:         result.params.code,
        redirectUri,
        extraParams:  { code_verifier: request.codeVerifier ?? '' },
      },
      discovery
    );

    const { accessToken, refreshToken, expiresIn } = tokenRes;
    if (!accessToken) return { success: false, error: 'No access token returned' };

    // Persist tokens
    await storeItem(SECURE_KEYS.ACCESS_TOKEN, accessToken);
    if (refreshToken) await storeItem(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
    const expiry = Date.now() + (expiresIn ?? 3600) * 1000;
    await storeItem(SECURE_KEYS.TOKEN_EXPIRY, expiry.toString());

    // Fetch user email
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${accessToken}` },
    }).then(r => r.json());
    const email = userInfo.email ?? '';
    await storeItem(SECURE_KEYS.USER_EMAIL, email);

    return { success: true, accessToken, email };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Unknown error' };
  }
}

// ── Get stored access token (refreshes if expired) ────────────────────────────
export async function getAccessToken(): Promise<string | null> {
  try {
    const token  = await getItem(SECURE_KEYS.ACCESS_TOKEN);
    const expiry = await getItem(SECURE_KEYS.TOKEN_EXPIRY);

    if (!token) return null;

    // Token still valid
    if (expiry && Date.now() < parseInt(expiry) - 60_000) return token;

    // Try refresh
    const refresh = await getItem(SECURE_KEYS.REFRESH_TOKEN);
    if (!refresh || !GOOGLE_CLIENT_ID) return null;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     GOOGLE_CLIENT_ID,
        refresh_token: refresh,
        grant_type:    'refresh_token',
      }).toString(),
    });
    const data = await res.json();
    if (!data.access_token) return null;

    await storeItem(SECURE_KEYS.ACCESS_TOKEN, data.access_token);
    const newExpiry = Date.now() + (data.expires_in ?? 3600) * 1000;
    await storeItem(SECURE_KEYS.TOKEN_EXPIRY, newExpiry.toString());

    return data.access_token;
  } catch {
    return null;
  }
}

// ── Check if connected ─────────────────────────────────────────────────────────
export async function isGoogleConnected(): Promise<{ connected: boolean; email: string }> {
  const token = await getAccessToken();
  const email = (await getItem(SECURE_KEYS.USER_EMAIL)) ?? '';
  return { connected: !!token, email };
}

// ── Disconnect ─────────────────────────────────────────────────────────────────
export async function disconnectGoogle(): Promise<void> {
  const token = await getItem(SECURE_KEYS.ACCESS_TOKEN);
  if (token) {
    fetch(`https://oauth2.googleapis.com/revoke?token=${token}`, { method: 'POST' }).catch(() => {});
  }
  await Promise.all(Object.values(SECURE_KEYS).map(k => deleteItem(k)));
}
