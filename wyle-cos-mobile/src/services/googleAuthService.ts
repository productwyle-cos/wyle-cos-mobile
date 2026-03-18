// src/services/googleAuthService.ts
// Handles Google OAuth for Gmail + Calendar access
//
// ── Platform strategy ─────────────────────────────────────────────────────────
// Native (iOS / Android):  expo-auth-session popup flow (unchanged)
// Web (Codespaces / PWA):  Full-page redirect flow
//   GitHub Codespaces sets  Cross-Origin-Opener-Policy: same-origin
//   which blocks the popup from sending the auth code back to the parent window.
//   Fix: redirect the current page to Google OAuth instead of a popup.
//   The code/token is exchanged when the page reloads with ?code=... in the URL.
//   Call handleGoogleOAuthCallback() early in the app (e.g. HomeScreen useEffect)
//   to complete the flow transparently.
//
// Requires platform-specific client IDs in .env:
//   EXPO_PUBLIC_GOOGLE_CLIENT_ID         — Web application client
//   EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID — Android OAuth client
//   EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS     — iOS OAuth client

import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

WebBrowser.maybeCompleteAuthSession();

// ── Client ID & Secret ────────────────────────────────────────────────────────
// Web Application OAuth clients require client_secret for token exchange.
// Android/iOS native clients (public clients) do NOT need a secret.
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
  return process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? '';
}

// Only needed for web (Web Application client type).
// Not required for Android/iOS native clients.
function getClientSecret(): string {
  return process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET ?? '';
}

// ── Redirect URI ──────────────────────────────────────────────────────────────
// Web:    window.location.origin  (e.g. https://xxx.app.github.dev)
//         → add to Google Cloud Console → Authorised Redirect URIs
// Native: com.wyle.cos://
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

// Temp keys stored in localStorage between the redirect away and back
const WEB_PKCE_KEYS = {
  VERIFIER:     'wyle_oauth_verifier',
  STATE:        'wyle_oauth_state',
  REDIRECT_URI: 'wyle_oauth_redirect_uri',
  CLIENT_ID:    'wyle_oauth_client_id',
};

// ── Storage abstraction ────────────────────────────────────────────────────────
async function storeItem(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') { localStorage.setItem(key, value); return; }
  await SecureStore.setItemAsync(key, value);
}
async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === 'web') return localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
async function deleteItem(key: string): Promise<void> {
  if (Platform.OS === 'web') { localStorage.removeItem(key); return; }
  await SecureStore.deleteItemAsync(key).catch(() => {});
}

export type GoogleAuthResult =
  | { success: true;  accessToken: string; email: string }
  | { success: false; error: string }
  | { success: 'redirect' };          // web only — page is navigating away

// ── OAuth discovery ────────────────────────────────────────────────────────────
const discovery = {
  authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
  tokenEndpoint:         'https://oauth2.googleapis.com/token',
  revocationEndpoint:    'https://oauth2.googleapis.com/revoke',
};

// ── Web PKCE helpers ──────────────────────────────────────────────────────────
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const verifier = base64url(arr);

  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  const challenge = base64url(new Uint8Array(digest));
  return { verifier, challenge };
}

function base64url(buf: Uint8Array): string {
  return btoa(String.fromCharCode(...buf))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function randomState(): string {
  const arr = new Uint8Array(16);
  crypto.getRandomValues(arr);
  return base64url(arr);
}

// ── Web: Redirect-based OAuth (avoids COOP popup blockage on Codespaces) ──────
//
// Step 1: Call this to start sign-in. It saves PKCE state and redirects the page.
//         The calling component will never get a response — the page navigates away.
async function startWebRedirect(): Promise<void> {
  const clientId   = getClientId();
  const redirectUri = getOAuthRedirectUri();

  console.log('[GoogleAuth] web redirect URI →', redirectUri);
  console.log('[GoogleAuth] web client ID present →', !!clientId);

  const { verifier, challenge } = await generatePKCE();
  const state = randomState();

  // Save everything needed after the redirect comes back
  localStorage.setItem(WEB_PKCE_KEYS.VERIFIER,     verifier);
  localStorage.setItem(WEB_PKCE_KEYS.STATE,        state);
  localStorage.setItem(WEB_PKCE_KEYS.REDIRECT_URI, redirectUri);
  localStorage.setItem(WEB_PKCE_KEYS.CLIENT_ID,    clientId);

  const params = new URLSearchParams({
    client_id:             clientId,
    redirect_uri:          redirectUri,
    response_type:         'code',
    scope:                 SCOPES.join(' '),
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    access_type:           'offline',
    prompt:                'consent',
  });

  // Full-page redirect — no popup, no COOP issues
  window.location.href = `${discovery.authorizationEndpoint}?${params}`;
}

// Step 2: Call this on every app mount on web.
//         If the URL has ?code=..., it completes the token exchange and returns the result.
//         If not a callback, returns null (no-op).
export async function handleGoogleOAuthCallback(): Promise<GoogleAuthResult | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  const urlParams = new URLSearchParams(window.location.search);
  const code  = urlParams.get('code');
  const state = urlParams.get('state');
  const error = urlParams.get('error');

  // Not a callback — nothing to do
  if (!code && !error) return null;

  // Clean the URL immediately so a page refresh doesn't re-trigger
  window.history.replaceState({}, document.title, window.location.pathname);

  if (error) return { success: false, error: `Google OAuth error: ${error}` };

  // Retrieve saved PKCE state
  const storedState    = localStorage.getItem(WEB_PKCE_KEYS.STATE);
  const codeVerifier   = localStorage.getItem(WEB_PKCE_KEYS.VERIFIER);
  const redirectUri    = localStorage.getItem(WEB_PKCE_KEYS.REDIRECT_URI);
  const storedClientId = localStorage.getItem(WEB_PKCE_KEYS.CLIENT_ID);

  // Clean up PKCE keys
  Object.values(WEB_PKCE_KEYS).forEach(k => localStorage.removeItem(k));

  if (state !== storedState) {
    return { success: false, error: 'OAuth state mismatch — possible CSRF attack, please try again.' };
  }
  if (!codeVerifier || !redirectUri || !storedClientId) {
    return { success: false, error: 'OAuth session expired — please try connecting again.' };
  }

  try {
    // Exchange auth code for tokens.
    // Web Application clients require client_secret; native clients do not.
    const clientSecret = getClientSecret();
    const tokenBody: Record<string, string> = {
      code,
      client_id:     storedClientId,
      redirect_uri:  redirectUri,
      code_verifier: codeVerifier,
      grant_type:    'authorization_code',
    };
    if (clientSecret) tokenBody.client_secret = clientSecret;

    const tokenRes = await fetch(discovery.tokenEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(tokenBody).toString(),
    });

    const data = await tokenRes.json();
    if (!data.access_token) {
      return { success: false, error: data.error_description ?? data.error ?? 'No access token returned' };
    }

    const { access_token, refresh_token, expires_in } = data;

    await storeItem(SECURE_KEYS.ACCESS_TOKEN, access_token);
    if (refresh_token) await storeItem(SECURE_KEYS.REFRESH_TOKEN, refresh_token);
    const expiry = Date.now() + (expires_in ?? 3600) * 1000;
    await storeItem(SECURE_KEYS.TOKEN_EXPIRY, expiry.toString());

    // Fetch user email
    const userInfo = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${access_token}` },
    }).then(r => r.json());
    const email = userInfo.email ?? '';
    await storeItem(SECURE_KEYS.USER_EMAIL, email);

    return { success: true, accessToken: access_token, email };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Token exchange failed' };
  }
}

// ── Sign in with Google (entry point for both platforms) ──────────────────────
export async function signInWithGoogle(): Promise<GoogleAuthResult> {
  const clientId = getClientId();
  if (!clientId) {
    return { success: false, error: 'Google Client ID not set in .env' };
  }

  // ── Web: use full-page redirect to avoid COOP popup issue ─────────────────
  if (Platform.OS === 'web') {
    await startWebRedirect(); // triggers window.location.href redirect → never returns normally
    return { success: 'redirect' }; // page is navigating; caller should not act on this
  }

  // ── Native: use expo-auth-session popup (unchanged) ───────────────────────
  try {
    const redirectUri = getOAuthRedirectUri();
    console.log('[GoogleAuth] native redirect URI →', redirectUri);

    const request = new AuthSession.AuthRequest({
      clientId,
      scopes:       SCOPES,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      usePKCE:      true,
      extraParams:  { access_type: 'offline', prompt: 'consent' },
    });

    const result = await request.promptAsync(discovery);

    if (result.type !== 'success') {
      return { success: false, error: result.type === 'cancel' ? 'Cancelled' : 'Auth failed' };
    }

    const tokenRes = await AuthSession.exchangeCodeAsync(
      {
        clientId,
        code:        result.params.code,
        redirectUri,
        extraParams: { code_verifier: request.codeVerifier ?? '' },
      },
      discovery,
    );

    const { accessToken, refreshToken, expiresIn } = tokenRes;
    if (!accessToken) return { success: false, error: 'No access token returned' };

    await storeItem(SECURE_KEYS.ACCESS_TOKEN, accessToken);
    if (refreshToken) await storeItem(SECURE_KEYS.REFRESH_TOKEN, refreshToken);
    const expiry = Date.now() + (expiresIn ?? 3600) * 1000;
    await storeItem(SECURE_KEYS.TOKEN_EXPIRY, expiry.toString());

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
    if (expiry && Date.now() < parseInt(expiry) - 60_000) return token;

    const refresh  = await getItem(SECURE_KEYS.REFRESH_TOKEN);
    const clientId = getClientId();
    if (!refresh || !clientId) return null;

    const refreshBody: Record<string, string> = {
      client_id:     clientId,
      refresh_token: refresh,
      grant_type:    'refresh_token',
    };
    const clientSecret = getClientSecret();
    if (clientSecret) refreshBody.client_secret = clientSecret;

    const res = await fetch(discovery.tokenEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(refreshBody).toString(),
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
    fetch(`${discovery.revocationEndpoint}?token=${token}`, { method: 'POST' }).catch(() => {});
  }
  await Promise.all(Object.values(SECURE_KEYS).map(k => deleteItem(k)));
}
