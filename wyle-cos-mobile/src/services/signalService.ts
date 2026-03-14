// src/services/signalService.ts
// Life Signal Engine: parses Gmail + Google Calendar via Claude to extract obligations
// PRD Layer A: A1 Email Parsing, A2 Calendar Parsing, A4 Deadline Detection, A5 Renewal Detection

import { UIObligation } from '../types';

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
  obligations: UIObligation[];
  calendarEvents: CalendarEvent[];
  summary: string;
};

// ── Gmail API ─────────────────────────────────────────────────────────────────
export async function fetchRecentEmails(accessToken: string): Promise<string[]> {
  // Fetch last 20 email IDs (only non-promotional, unread or recent)
  const listRes = await fetch(
    'https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=20&q=newer_than:7d',
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const listData = await listRes.json();
  if (!listData.messages) return [];

  // Fetch snippets (not full bodies — we only need subject + snippet for privacy)
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
export async function parseEmailsForObligations(
  emailSnippets: string[],
  existingObligations: UIObligation[]
): Promise<UIObligation[]> {
  if (!emailSnippets.length || !ANTHROPIC_API_KEY) return [];

  const existingTitles = existingObligations
    .filter(o => o.status === 'active')
    .map(o => o.title)
    .join(', ');

  const prompt = `You are an AI assistant analyzing email snippets for a Dubai professional.
Extract ONLY actionable obligations: deadlines, renewals, payments due, appointments, or expiries.

EXISTING OBLIGATIONS (do NOT re-extract these): ${existingTitles || 'none'}

EMAIL SNIPPETS:
${emailSnippets.map((s, i) => `--- Email ${i + 1} ---\n${s}`).join('\n\n')}

Return ONLY a JSON array of new obligations found (not already in existing list).
Each item: { "_id": "email_N_TIMESTAMP", "emoji": "...", "title": "...", "type": "visa|emirates_id|car_registration|insurance|bill|school_fee|medical|appointment|payment|subscription|task|other", "daysUntil": NUMBER, "risk": "high|medium|low", "amount": NUMBER_OR_NULL, "status": "active", "executionPath": "one sentence how to handle", "notes": "source: email" }
Risk: high=<7 days, medium=7-30 days, low=>30 days.
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
{ "_id": "cal_N", "emoji": "...", "title": "...", "type": "...", "daysUntil": NUMBER, "risk": "high|medium|low", "amount": null, "status": "active", "executionPath": "...", "notes": "source: calendar" }
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

// ── Full scan: email + calendar ───────────────────────────────────────────────
export async function runFullSignalScan(
  accessToken: string,
  existingObligations: UIObligation[]
): Promise<SignalScanResult> {
  const [emailSnippets, calendarEvents] = await Promise.all([
    fetchRecentEmails(accessToken),
    fetchCalendarEvents(accessToken),
  ]);

  const [emailObligations, calendarObligations] = await Promise.all([
    parseEmailsForObligations(emailSnippets, existingObligations),
    parseCalendarForObligations(calendarEvents, existingObligations),
  ]);

  const allNew = [...emailObligations, ...calendarObligations];
  const summary = allNew.length > 0
    ? `Found ${allNew.length} new obligation${allNew.length > 1 ? 's' : ''} from your inbox and calendar.`
    : 'No new obligations found in your inbox or calendar.';

  return { obligations: allNew, calendarEvents, summary };
}
