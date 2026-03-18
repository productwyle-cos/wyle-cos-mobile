// src/services/googleAuthService.ts
// Handles Google OAuth for Gmail + Calendar access
// Requires platform-specific client IDs in .env:
//   EXPO_PUBLIC_GOOGLE_CLIENT_ID         — Web application client (fallback)
//   EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID — Android OAuth client (for APK builds)
//   EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS     — iOS OAuth client (for IPA builds)

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// Pick the right client ID based on platform
function getClientId(): string {
  if (Platform.OS === 'android') {
    return process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID
        ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID
        ?? '';
  }
  if (Platform.OS === 'ios') {
    return process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS
        ?? process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID
        ?? '';
  }
  // web — use the Web Application client ID
  return process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
}

// expo-auth-session v7 (SDK 54+) removed the auth.expo.io proxy.
// On web: returns window.location.origin (e.g. https://xxx.app.github.dev)
//         → must be added as an Authorised Redirect URI in Google Cloud Console
// On native: returns the app scheme URI (com.wyle.cos://)
export function getOAuthRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
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
  const clientId = getClientId();
  if (!clientId) {
    return { success: false, error: 'Google Client ID not set in .env' };
  }

  try {
    const redirectUri = getOAuthRedirectUri();
    console.log('[GoogleAuth] redirect URI →', redirectUri); // copy this into Google Cloud Console
    console.log('[GoogleAuth] platform →', Platform.OS);

    const request = new AuthSession.AuthRequest({
      clientId,
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
        clientId,
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
    const clientId = getClientId();
    if (!refresh || !clientId) return null;

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
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
