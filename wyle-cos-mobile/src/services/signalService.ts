// src/services/signalService.ts
// Life Signal Engine: parses Gmail + Outlook + Google Calendar via Claude to extract obligations
// PRD Layer A: A1 Email Parsing, A2 Calendar Parsing, A4 Deadline Detection, A5 Renewal Detection

import { UIObligation } from '../types';
import { getAllGoogleAccounts, getAccessTokenForEmail } from './googleAuthService';
import { getAllOutlookAccounts, getAccessTokenForOutlookEmail } from './outlookAuthService';

const ANTHROPIC_API_KEY = process.env.EXPO_PUBLIC_ANTHROPIC_API_KEY ?? '';

// ── Types ─────────────────────────────────────────────────────────────────────
export type CalendarEvent = {
  id:       string;
  summary:  string;
  start:    string;
  end:      string;
  location?: string;
};

export type SignalScanResult = {
  obligations:    UIObligation[];
  calendarEvents: CalendarEvent[];
  summary:        string;
};

export type MultiAccountScanResult = SignalScanResult & {
  accountsScanned: { email: string; provider: 'google' | 'outlook' }[];
  errors:          { email: string; error: string }[];
};

// ── Gmail API ─────────────────────────────────────────────────────────────────
/**
 * Fetches up to 20 recent email snippets from Gmail (subject + from + snippet).
 * We only read metadata — no full bodies — for privacy.
 */
export async function fetchRecentGmailEmails(accessToken: string): Promise<string[]> {
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=newer_than:7d',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();
  if (!listData.messages) return [];

  const snippets: string[] = [];
  for (const msg of listData.messages.slice(0, 20)) {
    const msgRes = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=metadata&metadataHeaders=Subject&metadataHeaders=From&metadataHeaders=Date`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    const msgData = await msgRes.json();
    const headers: any[] = msgData.payload?.headers ?? [];
    const subject = headers.find((h: any) => h.name === 'Subject')?.value ?? '';
    const from    = headers.find((h: any) => h.name === 'From')?.value ?? '';
    const snippet = msgData.snippet ?? '';
    if (subject || snippet) {
      snippets.push(`FROM: ${from}\nSUBJECT: ${subject}\nSNIPPET: ${snippet}`);
    }
  }
  return snippets;
}

// Backwards-compatible alias (used in HomeScreen / ConnectScreen)
export const fetchRecentEmails = fetchRecentGmailEmails;

// ── Outlook / Microsoft Graph API ─────────────────────────────────────────────
/**
 * Fetches up to 20 recent email snippets from Outlook via Microsoft Graph.
 * Reads subject, from, receivedDateTime, and bodyPreview (≈ snippet equivalent).
 * No full message bodies are fetched.
 */
export async function fetchRecentOutlookEmails(accessToken: string): Promise<string[]> {
  // Emails received in the last 7 days, most recent first
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const params = new URLSearchParams({
    '$top':     '20',
    '$select':  'subject,from,receivedDateTime,bodyPreview',
    '$filter':  `receivedDateTime ge ${since}`,
    '$orderby': 'receivedDateTime desc',
  });

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/messages?${params}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    }
  );

  if (!res.ok) return [];
  const data = await res.json();
  const messages: any[] = data.value ?? [];

  return messages.map(msg => {
    const from    = msg.from?.emailAddress?.address ?? msg.from?.emailAddress?.name ?? '';
    const subject = msg.subject ?? '';
    const snippet = msg.bodyPreview ?? '';
    return `FROM: ${from}\nSUBJECT: ${subject}\nSNIPPET: ${snippet}`;
  }).filter(s => s.length > 20); // skip empty/malformed entries
}

// ── Google Calendar API ───────────────────────────────────────────────────────
export async function fetchCalendarEvents(accessToken: string): Promise<CalendarEvent[]> {
  const now      = new Date().toISOString();
  const in30days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?timeMin=${now}&timeMax=${in30days}&singleEvents=true&orderBy=startTime&maxResults=30`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const data = await res.json();
  return (data.items ?? []).map((e: any) => ({
    id:       e.id,
    summary:  e.summary ?? 'Untitled event',
    start:    e.start?.dateTime ?? e.start?.date ?? '',
    end:      e.end?.dateTime   ?? e.end?.date   ?? '',
    location: e.location,
  }));
}

// ── Claude: Extract obligations from email snippets ───────────────────────────
/**
 * Sends email snippets (from any provider — Gmail or Outlook) to Claude.
 * Claude extracts actionable obligations including reply_needed type.
 */
export async function parseEmailsForObligations(
  emailSnippets: string[],
  existingObligations: UIObligation[],
  accountLabel = ''
): Promise<UIObligation[]> {
  if (!emailSnippets.length || !ANTHROPIC_API_KEY) return [];

  const existingTitles = existingObligations
    .filter(o => o.status === 'active')
    .map(o => o.title)
    .join(', ');

  const prompt = `You are an AI assistant analyzing email snippets for a Dubai professional.
Extract ONLY actionable obligations: deadlines, renewals, payments due, appointments, expiries,
documents needing signature, and emails requiring a reply.

EXISTING OBLIGATIONS (do NOT re-extract these): ${existingTitles || 'none'}

EMAIL SNIPPETS (source: ${accountLabel || 'inbox'}):
${emailSnippets.map((s, i) => `--- Email ${i + 1} ---\n${s}`).join('\n\n')}

Return ONLY a JSON array of new obligations found (not already in the existing list).

Each item must follow this schema exactly:
{
  "_id": "email_N_TIMESTAMP",
  "emoji": "...",
  "title": "...",
  "type": one of: "visa|emirates_id|car_registration|insurance|bill|school_fee|medical|appointment|payment|subscription|reply_needed|sign_document|task|other",
  "daysUntil": NUMBER (days from today until action is needed; use 1 if urgent/same day),
  "risk": "high" (< 7 days) | "medium" (7–30 days) | "low" (> 30 days),
  "amount": NUMBER or null,
  "status": "active",
  "executionPath": "one sentence on how to handle this",
  "notes": "source: email from [sender name]",
  "replyTo": "email address to reply to, if type is reply_needed — else null",
  "replySubject": "Re: original subject, if type is reply_needed — else null"
}

Type guide:
- reply_needed: Email explicitly asks for a response, confirmation, or feedback
- sign_document: Contract, agreement, or form that needs signing
- payment: Invoice, bill, or payment that is due
- appointment: Meeting, medical visit, or booking that needs confirmation
- subscription: Subscription renewal or cancellation needed

If nothing actionable found, return: []`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1500,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });
    const data  = await res.json();
    const raw   = data.content?.[0]?.text ?? '[]';
    const clean = raw.replace(/```json|```/g, '').trim();
    const items: UIObligation[] = JSON.parse(clean);
    return items.map((item, i) => ({ ...item, _id: `email_${i}_${Date.now()}` }));
  } catch {
    return [];
  }
}

// ── Claude: Extract obligations from calendar events ─────────────────────────
export async function parseCalendarForObligations(
  events: CalendarEvent[],
  existingObligations: UIObligation[]
): Promise<UIObligation[]> {
  if (!events.length || !ANTHROPIC_API_KEY) return [];

  const existingTitles = existingObligations
    .filter(o => o.status === 'active')
    .map(o => o.title)
    .join(', ');

  const eventList = events.map(e =>
    `- "${e.summary}" on ${e.start}${e.location ? ` at ${e.location}` : ''}`
  ).join('\n');

  const prompt = `You are analyzing a Dubai professional's Google Calendar for the next 30 days.
Extract ONLY items that represent obligations, payments, appointments, renewals, or deadlines — NOT regular work meetings.

EXISTING OBLIGATIONS (skip these): ${existingTitles || 'none'}

CALENDAR EVENTS:
${eventList}

Return ONLY a JSON array of new obligations found. Use same schema as before:
{ "_id": "cal_N", "emoji": "...", "title": "...", "type": "...", "daysUntil": NUMBER, "risk": "high|medium|low", "amount": null, "status": "active", "executionPath": "...", "notes": "source: calendar", "replyTo": null, "replySubject": null }
If no obligations found, return: []`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 1000,
        messages:   [{ role: 'user', content: prompt }],
      }),
    });
    const data  = await res.json();
    const raw   = data.content?.[0]?.text ?? '[]';
    const clean = raw.replace(/```json|```/g, '').trim();
    const items: UIObligation[] = JSON.parse(clean);
    return items.map((item, i) => ({ ...item, _id: `cal_${i}_${Date.now()}` }));
  } catch {
    return [];
  }
}

// ── Single-account scan: Gmail + Google Calendar ──────────────────────────────
/** Original single-token scan — kept for backwards compatibility with ConnectScreen. */
export async function runFullSignalScan(
  accessToken: string,
  existingObligations: UIObligation[]
): Promise<SignalScanResult> {
  const [emailSnippets, calendarEvents] = await Promise.all([
    fetchRecentGmailEmails(accessToken),
    fetchCalendarEvents(accessToken),
  ]);

  const [emailObligations, calendarObligations] = await Promise.all([
    parseEmailsForObligations(emailSnippets, existingObligations, 'Gmail'),
    parseCalendarForObligations(calendarEvents, existingObligations),
  ]);

  const allNew = [...emailObligations, ...calendarObligations];
  const summary = allNew.length > 0
    ? `Found ${allNew.length} new obligation${allNew.length > 1 ? 's' : ''} from your inbox and calendar.`
    : 'No new obligations found in your inbox or calendar.';

  return { obligations: allNew, calendarEvents, summary };
}

// ── Multi-account scan: all Gmail + all Outlook accounts ─────────────────────
/**
 * Scans ALL connected Google and Outlook accounts for new obligations.
 * Runs all accounts in parallel, aggregates results, deduplicates.
 * Falls back gracefully if individual accounts fail.
 */
export async function runMultiAccountSignalScan(
  existingObligations: UIObligation[]
): Promise<MultiAccountScanResult> {
  const [googleAccounts, outlookAccounts] = await Promise.all([
    getAllGoogleAccounts(),
    Promise.resolve(getAllOutlookAccounts()),
  ]);

  const accountsScanned: { email: string; provider: 'google' | 'outlook' }[] = [];
  const errors: { email: string; error: string }[] = [];
  const allObligations: UIObligation[] = [];
  const allCalendarEvents: CalendarEvent[] = [];

  // ── Scan all Google accounts ─────────────────────────────────────────────
  await Promise.allSettled(
    googleAccounts.map(async (email) => {
      try {
        const token = await getAccessTokenForEmail(email);
        if (!token) { errors.push({ email, error: 'No valid token' }); return; }

        const [snippets, events] = await Promise.all([
          fetchRecentGmailEmails(token),
          fetchCalendarEvents(token),
        ]);

        const currentExisting = [...existingObligations, ...allObligations];
        const [emailObs, calObs] = await Promise.all([
          parseEmailsForObligations(snippets, currentExisting, `Gmail (${email})`),
          parseCalendarForObligations(events, currentExisting),
        ]);

        allObligations.push(...emailObs, ...calObs);
        allCalendarEvents.push(...events);
        accountsScanned.push({ email, provider: 'google' });
      } catch (e: any) {
        errors.push({ email, error: e?.message ?? 'Unknown error' });
      }
    })
  );

  // ── Scan all Outlook accounts ────────────────────────────────────────────
  await Promise.allSettled(
    outlookAccounts.map(async (email) => {
      try {
        const token = await getAccessTokenForOutlookEmail(email);
        if (!token) { errors.push({ email, error: 'No valid token' }); return; }

        const snippets = await fetchRecentOutlookEmails(token);
        const currentExisting = [...existingObligations, ...allObligations];
        const emailObs = await parseEmailsForObligations(
          snippets, currentExisting, `Outlook (${email})`
        );

        allObligations.push(...emailObs);
        accountsScanned.push({ email, provider: 'outlook' });
      } catch (e: any) {
        errors.push({ email, error: e?.message ?? 'Unknown error' });
      }
    })
  );

  // ── Build summary ────────────────────────────────────────────────────────
  const totalAccounts = accountsScanned.length;
  const totalNew      = allObligations.length;

  let summary = '';
  if (totalAccounts === 0) {
    summary = 'No email accounts connected. Connect Gmail or Outlook to start scanning.';
  } else if (totalNew === 0) {
    summary = `Scanned ${totalAccounts} account${totalAccounts > 1 ? 's' : ''} — no new obligations found.`;
  } else {
    summary = `Found ${totalNew} new obligation${totalNew > 1 ? 's' : ''} across ${totalAccounts} account${totalAccounts > 1 ? 's' : ''}.`;
  }

  return {
    obligations:    allObligations,
    calendarEvents: allCalendarEvents,
    summary,
    accountsScanned,
    errors,
  };
}
