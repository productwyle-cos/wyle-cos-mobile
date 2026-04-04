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

// ── Rule-based email parser (zero API cost) ───────────────────────────────────
/**
 * Parses email snippets using keyword matching + regex — no Claude API needed.
 * Used as the primary parser when Claude API is unavailable or has no credits.
 */

const MONTHS_MAP: Record<string, number> = {
  january: 0, february: 1, march: 2,    april: 3,   may: 4,      june: 5,
  july: 6,    august: 7,   september: 8, october: 9, november: 10, december: 11,
  jan: 0, feb: 1, mar: 2, apr: 3, jun: 5, jul: 6, aug: 7,
  sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

function extractDateFromText(text: string): Date | null {
  const lower = text.toLowerCase();
  const now   = new Date();

  // "in X days"
  const inDays = lower.match(/in (\d+) days?/);
  if (inDays) {
    const d = new Date(now); d.setDate(d.getDate() + parseInt(inDays[1])); return d;
  }
  // "X days" near "expire/due/before"
  const nearDue = lower.match(/(?:due|expire[sd]?|before|within)\s+(?:in\s+)?(\d+)\s+days?/);
  if (nearDue) {
    const d = new Date(now); d.setDate(d.getDate() + parseInt(nearDue[1])); return d;
  }
  if (lower.includes('tomorrow')) {
    const d = new Date(now); d.setDate(d.getDate() + 1); return d;
  }
  if (lower.includes('next week')) {
    const d = new Date(now); d.setDate(d.getDate() + 7); return d;
  }

  // "April 7, 2026" or "April 7 2026"
  const mdy = text.match(/(\b\w+\b)\s+(\d{1,2}),?\s+(20\d{2})/);
  if (mdy) {
    const mo = MONTHS_MAP[mdy[1].toLowerCase()];
    if (mo !== undefined) return new Date(parseInt(mdy[3]), mo, parseInt(mdy[2]));
  }
  // "7 April 2026"
  const dmy = text.match(/(\d{1,2})\s+(\b\w+\b)\s+(20\d{2})/);
  if (dmy) {
    const mo = MONTHS_MAP[dmy[2].toLowerCase()];
    if (mo !== undefined) return new Date(parseInt(dmy[3]), mo, parseInt(dmy[1]));
  }
  // DD/MM/YYYY
  const slash = text.match(/(\d{1,2})\/(\d{1,2})\/(20\d{2})/);
  if (slash) return new Date(parseInt(slash[3]), parseInt(slash[2]) - 1, parseInt(slash[1]));

  return null;
}

function calcDaysUntil(d: Date): number {
  return Math.round((d.getTime() - Date.now()) / 86_400_000);
}

function detectType(text: string): { type: string; emoji: string } {
  const t = text.toLowerCase();
  if (/\bvisa\b|residence permit|gdrfa|overstay/.test(t))                          return { type: 'visa',             emoji: '🛂' };
  if (/emirates id|eid renewal|identity card/.test(t))                             return { type: 'emirates_id',      emoji: '🪪' };
  if (/car registr|vehicle registr|mulkiya|\brta\b/.test(t))                       return { type: 'car_registration', emoji: '🚗' };
  if (/insurance|policy.*due|premium.*due|takaful/.test(t))                        return { type: 'insurance',        emoji: '🛡️' };
  if (/school fee|tuition|university fee|college fee/.test(t))                     return { type: 'school_fee',       emoji: '🎓' };
  if (/\bdewa\b|\bsewa\b|\baadc\b|utility bill|electricity.*bill|water.*bill/.test(t)) return { type: 'bill',         emoji: '💡' };
  if (/invoice|amount due|payment due|aed\s*[\d,]+|please pay|outstanding balance/.test(t)) return { type: 'payment', emoji: '💰' };
  if (/please sign|signature required|sign.*document|docusign|e-sign|sign.*agreement|sign.*contract/.test(t)) return { type: 'sign_document', emoji: '📄' };
  if (/appointment|confirm.*attend|please confirm|booking confirm|reservation/.test(t)) return { type: 'appointment', emoji: '📅' };
  if (/subscription.*expir|renew.*subscription|auto-renew|membership.*expir/.test(t)) return { type: 'subscription', emoji: '🔄' };
  if (/medical|doctor.*appoint|hospital|clinic|prescription/.test(t))              return { type: 'medical',          emoji: '🏥' };
  if (/please reply|let me know|your feedback|awaiting.*response|kindly respond|get back to me|your response needed/.test(t)) return { type: 'reply_needed', emoji: '📧' };
  return { type: 'task', emoji: '📌' };
}

function extractAmount(text: string): number | null {
  const m = text.match(/(?:AED|aed)\s*([\d,]+(?:\.\d{1,2})?)/i)
         ?? text.match(/([\d,]+(?:\.\d{1,2})?)\s*(?:AED|aed)/i)
         ?? text.match(/(?:amount|total|due|pay)[^\d]*([\d,]+(?:\.\d{1,2})?)/i);
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, ''));
    if (n > 0 && n < 10_000_000) return n; // sanity cap
  }
  return null;
}

function extractEmailFromField(from: string): string {
  const angle = from.match(/<([^>]+)>/);
  if (angle) return angle[1];
  const bare = from.match(/[\w.+-]+@[\w.-]+\.\w{2,}/);
  if (bare) return bare[0];
  return from.trim();
}

function senderName(from: string): string {
  return from.replace(/<[^>]+>/, '').replace(/"/g, '').trim() || extractEmailFromField(from);
}

function isActionable(text: string): boolean {
  return /due|expir|invoice|payment|sign|confirm|renew|reply|respond|feedback|outstanding|overdue|deadline|urgent|action required|please pay|visa|emirates id|registr|insurance|bill|utility|subscription|appointment|awaiting|kindly|please confirm|let me know/i.test(text);
}

/** Parse email snippets into obligations without any AI API call. */
export function parseEmailsWithRules(
  emailSnippets: string[],
  existingObligations: UIObligation[] = [],
): UIObligation[] {
  const existingNorm = existingObligations
    .filter(o => o.status === 'active')
    .map(o => o.title.toLowerCase().trim());

  const results: UIObligation[] = [];

  for (let i = 0; i < emailSnippets.length; i++) {
    const raw     = emailSnippets[i];
    const fromRaw = raw.match(/^FROM:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const subject = raw.match(/^SUBJECT:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const snippet = raw.match(/^SNIPPET:\s*(.+)$/m)?.[1]?.trim() ?? '';
    const fullText = `${subject} ${snippet}`;

    if (!isActionable(fullText)) continue;

    const { type, emoji } = detectType(fullText);
    const dateFound  = extractDateFromText(fullText);
    const amount     = extractAmount(fullText);
    const sender     = senderName(fromRaw);
    const replyEmail = extractEmailFromField(fromRaw);

    let daysUntil = dateFound
      ? Math.max(0, calcDaysUntil(dateFound))
      : (type === 'reply_needed' ? 2 : type === 'payment' ? 5 : 7);

    const risk: 'high' | 'medium' | 'low' =
      daysUntil <= 7 ? 'high' : daysUntil <= 30 ? 'medium' : 'low';

    // Build title from subject (trim boilerplate prefixes)
    const title = subject
      .replace(/^(fwd?:|re:|fw:|action required:|urgent:)\s*/i, '')
      .trim() || `Email from ${sender}`;

    // Skip if very similar to an existing active obligation
    const titleNorm = title.toLowerCase().trim();
    if (existingNorm.some(e => e === titleNorm || e.includes(titleNorm.slice(0, 20)))) continue;

    let executionPath = '';
    switch (type) {
      case 'reply_needed':    executionPath = `Reply to ${sender}: ${subject}`; break;
      case 'payment':         executionPath = `Pay ${amount ? `AED ${amount.toLocaleString()} ` : ''}to ${sender}`; break;
      case 'sign_document':   executionPath = `Review and sign the document from ${sender}`; break;
      case 'appointment':     executionPath = `Confirm your appointment with ${sender}`; break;
      case 'subscription':    executionPath = `Renew subscription — check ${sender} for details`; break;
      case 'visa':            executionPath = 'Initiate visa renewal via GDRFA portal or typing centre'; break;
      case 'emirates_id':     executionPath = 'Renew Emirates ID via ICA Smart Services app or typing centre'; break;
      case 'car_registration': executionPath = 'Renew vehicle registration via RTA app or service centre'; break;
      case 'bill':            executionPath = `Pay ${amount ? `AED ${amount.toLocaleString()} ` : ''}bill online or at payment centre`; break;
      case 'insurance':       executionPath = `Renew insurance policy — contact ${sender}`; break;
      case 'medical':         executionPath = `Attend medical appointment — confirm with ${sender}`; break;
      default:                executionPath = `Handle: ${subject || `email from ${sender}`}`;
    }

    results.push({
      _id:          `rule_${i}_${Date.now()}`,
      emoji,
      title,
      type,
      daysUntil,
      risk,
      amount:       amount ?? null,
      status:       'active',
      executionPath,
      notes:        `source: email from ${sender}`,
      replyTo:      type === 'reply_needed' ? replyEmail : null,
      replySubject: type === 'reply_needed' ? `Re: ${subject}` : null,
    });
  }

  return results;
}

// ── Claude: Extract obligations from email snippets ───────────────────────────
/**
 * Sends email snippets (from any provider — Gmail or Outlook) to Claude.
 * Claude extracts actionable obligations including reply_needed type.
 * Falls back to rule-based parsing if Claude is unavailable or has no credits.
 */
export async function parseEmailsForObligations(
  emailSnippets: string[],
  existingObligations: UIObligation[],
  accountLabel = ''
): Promise<UIObligation[]> {
  if (!emailSnippets.length) return [];

  // ── Rule-based fallback: use immediately if no API key ────────────────────
  if (!ANTHROPIC_API_KEY) {
    return parseEmailsWithRules(emailSnippets, existingObligations);
  }

  const existingTitles = existingObligations
    .filter(o => o.status === 'active')
    .map(o => o.title)
    .join(', ');

  const prompt = `You are an AI assistant analyzing email snippets for a Dubai professional.
Your job is to extract ONLY emails that require the user to take an action — not informational notifications.

━━━ SKIP these — they are informational, no user action needed ━━━
• Transaction confirmations: "Your SIP of ₹X has been processed", "Payment successful", "Order confirmed"
• Bank/financial statements: "Weekly combined statement", "Monthly account summary", "Portfolio update"
• Automated receipts: "Thank you for your payment", "Receipt for your purchase", "Booking confirmed"
• Security/system notifications: "New sign-in detected", "Password changed", "2FA enabled"
• Marketing/newsletters: welcome emails, product updates, promotional offers
• Status updates where the action is already DONE: "Your request has been approved", "Your order has been dispatched"
• Mutual fund / investment confirmations: unit allotments, NAV updates, SIP execution reports

━━━ INCLUDE these — the user must do something ━━━
• Payments that are DUE (not already paid): invoice due, bill due, EMI due, outstanding balance
• Documents needing signature: contract, agreement, form to fill/sign
• Appointments needing confirmation or attendance: medical, government, meeting requiring RSVP
• Emails explicitly asking for a reply, response, feedback, or approval
• Renewals expiring soon: visa, Emirates ID, insurance, vehicle registration, subscription
• Tasks or follow-ups where the sender is waiting on the user

EXISTING OBLIGATIONS (do NOT re-extract these): ${existingTitles || 'none'}

EMAIL SNIPPETS (source: ${accountLabel || 'inbox'}):
${emailSnippets.map((s, i) => `--- Email ${i + 1} ---\n${s}`).join('\n\n')}

Return ONLY a JSON array of new obligations found (not already in the existing list).
If an email is informational/confirmation with no pending user action, DO NOT include it.

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

    // ── If Claude API fails (low credits, bad key, rate limit) → rule-based ──
    if (!res.ok) {
      console.warn(`[SignalService] Claude API error ${res.status} — using rule-based parser`);
      return parseEmailsWithRules(emailSnippets, existingObligations);
    }

    const data  = await res.json();

    // Catch credit exhaustion / quota errors returned in the body
    if (data.error || !data.content) {
      console.warn('[SignalService] Claude API quota/error — using rule-based parser', data.error?.type);
      return parseEmailsWithRules(emailSnippets, existingObligations);
    }

    const raw   = data.content?.[0]?.text ?? '[]';
    const clean = raw.replace(/```json|```/g, '').trim();
    const items: UIObligation[] = JSON.parse(clean);
    return items.map((item, i) => ({ ...item, _id: `email_${i}_${Date.now()}` }));
  } catch {
    // Network error or JSON parse failure → fall back to rules
    console.warn('[SignalService] Claude call failed — using rule-based parser');
    return parseEmailsWithRules(emailSnippets, existingObligations);
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
