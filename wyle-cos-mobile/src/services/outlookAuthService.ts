// src/services/outlookAuthService.ts
// Handles Microsoft / Outlook OAuth using the same PKCE redirect pattern as
// googleAuthService.ts — no popup, no MSAL library needed for web.
//
// ── Platform strategy ─────────────────────────────────────────────────────────
// Web (Codespaces / PWA):  Full-page redirect → PKCE → token exchange on return
// Native (iOS / Android):  expo-auth-session popup (future)
//
// Requires in .env.local:
//   EXPO_PUBLIC_MICROSOFT_CLIENT_ID   — from Azure App Registration
//   EXPO_PUBLIC_MICROSOFT_TENANT_ID   — use "common" (personal + work accounts)

import { Platform } from 'react-native';

// ── Config ────────────────────────────────────────────────────────────────────
function getMsClientId(): string {
  return process.env.EXPO_PUBLIC_MICROSOFT_CLIENT_ID ?? '';
}

function getMsTenantId(): string {
  return process.env.EXPO_PUBLIC_MICROSOFT_TENANT_ID ?? 'common';
}

function getMsRedirectUri(): string {
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    return window.location.origin;
  }
  return 'msauth://com.wyle.cos/callback';
}

// ── Microsoft OAuth endpoints ─────────────────────────────────────────────────
function getDiscovery() {
  const tenant = getMsTenantId();
  return {
    authorizationEndpoint: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/authorize`,
    tokenEndpoint:         `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}

// ── Scopes ────────────────────────────────────────────────────────────────────
const MS_SCOPES = [
  'openid',
  'profile',
  'email',
  'offline_access',
  'Calendars.Read',
  'Calendars.ReadWrite',
  'Mail.Read',
  'Mail.Send',
  'User.Read',
];

// ── Storage keys ──────────────────────────────────────────────────────────────
const ACCOUNTS_KEY = 'wyle_outlook_accounts';

const PKCE_KEYS = {
  VERIFIER:     'wyle_ms_oauth_verifier',
  STATE:        'wyle_ms_oauth_state',
  REDIRECT_URI: 'wyle_ms_oauth_redirect_uri',
  CLIENT_ID:    'wyle_ms_oauth_client_id',
  MODE:         'wyle_ms_oauth_mode',
};

// Shared provider marker — tells Google handler "this is a Microsoft flow"
const PROVIDER_KEY = 'wyle_oauth_provider';

// ── Storage helpers ───────────────────────────────────────────────────────────
function store(key: string, val: string) { localStorage.setItem(key, val); }
function load(key: string): string | null { return localStorage.getItem(key); }
function remove(key: string) { localStorage.removeItem(key); }

// ── Per-account key builders ──────────────────────────────────────────────────
function accountKeys(email: string) {
  const safe = email.replace(/[^a-zA-Z0-9]/g, '_');
  return {
    ACCESS_TOKEN:  `mat_${safe}`,   // ms access token
    REFRESH_TOKEN: `mrt_${safe}`,   // ms refresh token
    TOKEN_EXPIRY:  `mte_${safe}`,   // ms token expiry
  };
}

// ── Account list helpers ──────────────────────────────────────────────────────
function getAccountsList(): string[] {
  try { return JSON.parse(load(ACCOUNTS_KEY) ?? '[]'); } catch { return []; }
}

function saveAccountsList(emails: string[]) {
  store(ACCOUNTS_KEY, JSON.stringify([...new Set(emails)]));
}

// ── PKCE helpers ──────────────────────────────────────────────────────────────
async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  const verifier = base64url(arr);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier));
  return { verifier, challenge: base64url(new Uint8Array(digest)) };
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

// ── Types ─────────────────────────────────────────────────────────────────────
export type OutlookAuthResult =
  | { success: true;  accessToken: string; email: string }
  | { success: false; error: string }
  | { success: 'redirect' };

// ── Step 1: Start OAuth redirect ──────────────────────────────────────────────
async function startMicrosoftRedirect(mode: 'sign_in' | 'add_account' = 'sign_in'): Promise<void> {
  const clientId   = getMsClientId();
  const redirectUri = getMsRedirectUri();
  const discovery  = getDiscovery();

  console.log('[OutlookAuth] clientId →', clientId ? clientId.slice(0, 8) + '...' : 'MISSING');
  console.log('[OutlookAuth] redirectUri →', redirectUri);
  console.log('[OutlookAuth] authEndpoint →', discovery.authorizationEndpoint);

  if (!clientId || clientId === 'YOUR_AZURE_CLIENT_ID_HERE') {
    console.error('[OutlookAuth] EXPO_PUBLIC_MICROSOFT_CLIENT_ID not set in .env.local');
    alert('Microsoft Client ID not configured.\n\nAdd EXPO_PUBLIC_MICROSOFT_CLIENT_ID=your-client-id to .env.local in your Codespace, then restart Expo.');
    return;
  }

  const { verifier, challenge } = await generatePKCE();
  const state = randomState();

  // Save PKCE state for after redirect returns
  store(PKCE_KEYS.VERIFIER,     verifier);
  store(PKCE_KEYS.STATE,        state);
  store(PKCE_KEYS.REDIRECT_URI, redirectUri);
  store(PKCE_KEYS.CLIENT_ID,    clientId);
  store(PKCE_KEYS.MODE,         mode);

  // Mark this as a Microsoft flow (so Google callback handler skips it)
  store(PROVIDER_KEY, 'microsoft');

  const prompt = mode === 'add_account' ? 'select_account' : 'consent';

  const params = new URLSearchParams({
    client_id:             clientId,
    redirect_uri:          redirectUri,
    response_type:         'code',
    scope:                 MS_SCOPES.join(' '),
    state,
    code_challenge:        challenge,
    code_challenge_method: 'S256',
    response_mode:         'query',
    prompt,
  });

  window.location.href = `${discovery.authorizationEndpoint}?${params}`;
}

// ── Step 2: Handle callback on page reload ────────────────────────────────────
// Call this in app/index.tsx (web) alongside handleGoogleOAuthCallback().
// Returns null if this page load is NOT a Microsoft OAuth callback.
export async function handleOutlookOAuthCallback(): Promise<OutlookAuthResult | null> {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return null;

  // Only handle if we know this is a Microsoft flow
  const provider = load(PROVIDER_KEY);
  if (provider !== 'microsoft') return null;

  const urlParams = new URLSearchParams(window.location.search);
  const code  = urlParams.get('code');
  const state = urlParams.get('state');
  const error = urlParams.get('error');

  // Not a callback URL
  if (!code && !error) return null;

  // Clean URL immediately
  window.history.replaceState({}, document.title, window.location.pathname);

  // Clean provider key
  remove(PROVIDER_KEY);

  if (error) return { success: false, error: `Microsoft OAuth error: ${error}` };

  const storedState    = load(PKCE_KEYS.STATE);
  const codeVerifier   = load(PKCE_KEYS.VERIFIER);
  const redirectUri    = load(PKCE_KEYS.REDIRECT_URI);
  const storedClientId = load(PKCE_KEYS.CLIENT_ID);
  const mode           = load(PKCE_KEYS.MODE) ?? 'sign_in';

  // Clean up PKCE keys
  Object.values(PKCE_KEYS).forEach(k => remove(k));

  if (state !== storedState) {
    return { success: false, error: 'OAuth state mismatch — please try again.' };
  }
  if (!codeVerifier || !redirectUri || !storedClientId) {
    return { success: false, error: 'OAuth session expired — please try connecting again.' };
  }

  try {
    const discovery = getDiscovery();

    const tokenRes = await fetch(discovery.tokenEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     storedClientId,
        code:          code!,
        redirect_uri:  redirectUri,
        code_verifier: codeVerifier,
        grant_type:    'authorization_code',
        scope:         MS_SCOPES.join(' '),
      }).toString(),
    });

    const data = await tokenRes.json();
    if (!data.access_token) {
      return { success: false, error: data.error_description ?? data.error ?? 'No access token returned' };
    }

    const { access_token, refresh_token, expires_in } = data;
    const expiry = Date.now() + (expires_in ?? 3600) * 1000;

    // Get user email from Microsoft Graph
    const meRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${access_token}` },
    });
    const me = await meRes.json();
    const email = me.mail ?? me.userPrincipalName ?? '';

    if (!email) return { success: false, error: 'Could not retrieve Microsoft account email.' };

    // Add to accounts list
    const accounts = getAccountsList();
    if (!accounts.includes(email)) {
      saveAccountsList([...accounts, email]);
    } else {
      saveAccountsList(accounts);
    }

    // Store tokens
    const keys = accountKeys(email);
    store(keys.ACCESS_TOKEN, access_token);
    if (refresh_token) store(keys.REFRESH_TOKEN, refresh_token);
    store(keys.TOKEN_EXPIRY, expiry.toString());

    return { success: true, accessToken: access_token, email };
  } catch (err: any) {
    return { success: false, error: err?.message ?? 'Token exchange failed' };
  }
}

// ── Sign in with Microsoft ────────────────────────────────────────────────────
export async function signInWithMicrosoft(): Promise<OutlookAuthResult> {
  const clientId = getMsClientId();
  if (!clientId) return { success: false, error: 'Microsoft Client ID not set. Add EXPO_PUBLIC_MICROSOFT_CLIENT_ID to .env.local' };

  if (Platform.OS === 'web') {
    await startMicrosoftRedirect('sign_in');
    return { success: 'redirect' };
  }

  return { success: false, error: 'Native Microsoft auth not yet implemented.' };
}

// ── Add another Microsoft / Outlook account ───────────────────────────────────
export async function addOutlookAccount(): Promise<OutlookAuthResult> {
  const clientId = getMsClientId();
  if (!clientId) return { success: false, error: 'Microsoft Client ID not set.' };

  if (Platform.OS === 'web') {
    await startMicrosoftRedirect('add_account');
    return { success: 'redirect' };
  }

  return { success: false, error: 'Native Microsoft auth not yet implemented.' };
}

// ── Get access token for a specific email (with auto-refresh) ─────────────────
export async function getAccessTokenForOutlookEmail(email: string): Promise<string | null> {
  const keys   = accountKeys(email);
  const token  = load(keys.ACCESS_TOKEN);
  const expiry = load(keys.TOKEN_EXPIRY);

  if (!token) return null;
  if (expiry && Date.now() < parseInt(expiry) - 60_000) return token;

  // Refresh
  const refresh  = load(keys.REFRESH_TOKEN);
  const clientId = getMsClientId();
  if (!refresh || !clientId) return null;

  try {
    const discovery = getDiscovery();
    const res = await fetch(discovery.tokenEndpoint, {
      method:  'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id:     clientId,
        refresh_token: refresh,
        grant_type:    'refresh_token',
        scope:         MS_SCOPES.join(' '),
      }).toString(),
    });
    const data = await res.json();

    if (!res.ok || !data.access_token) {
      // Refresh token is invalid or expired — clear stored credentials so
      // the UI shows the account as disconnected and prompts re-auth.
      console.warn('[OutlookAuth] Refresh token expired/invalid for', email, '— clearing credentials');
      remove(keys.ACCESS_TOKEN);
      remove(keys.REFRESH_TOKEN);
      remove(keys.TOKEN_EXPIRY);
      const accounts = getAccountsList();
      saveAccountsList(accounts.filter(e => e !== email));
      return null;
    }

    store(keys.ACCESS_TOKEN, data.access_token);
    if (data.refresh_token) store(keys.REFRESH_TOKEN, data.refresh_token);
    store(keys.TOKEN_EXPIRY, (Date.now() + (data.expires_in ?? 3600) * 1000).toString());
    return data.access_token;
  } catch { return null; }
}

// ── Get all connected Outlook accounts ────────────────────────────────────────
export function getAllOutlookAccounts(): string[] {
  return getAccountsList();
}

// ── Disconnect a specific Outlook account ─────────────────────────────────────
export async function disconnectOutlookAccount(email: string): Promise<void> {
  const keys = accountKeys(email);
  remove(keys.ACCESS_TOKEN);
  remove(keys.REFRESH_TOKEN);
  remove(keys.TOKEN_EXPIRY);

  const accounts = getAccountsList();
  saveAccountsList(accounts.filter(e => e !== email));
}

// ── Disconnect all Outlook accounts ───────────────────────────────────────────
export async function disconnectAllOutlookAccounts(): Promise<void> {
  const accounts = getAccountsList();
  accounts.forEach(email => {
    const keys = accountKeys(email);
    remove(keys.ACCESS_TOKEN);
    remove(keys.REFRESH_TOKEN);
    remove(keys.TOKEN_EXPIRY);
  });
  remove(ACCOUNTS_KEY);
}

// ── Check if any Outlook account is connected ─────────────────────────────────
export function isOutlookConnected(): { connected: boolean; email: string } {
  const accounts = getAccountsList();
  return { connected: accounts.length > 0, email: accounts[0] ?? '' };
}
