// src/services/calendarService.ts
// Fetches upcoming Google Calendar events using a stored OAuth access token.
// Uses the Google Calendar API v3 (read-only, calendar.readonly scope).

import { getAccessToken, getAllGoogleAccounts, getAccessTokenForEmail } from './googleAuthService';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CalendarEvent {
  id:           string;
  title:        string;
  description:  string;
  location:     string;
  startTime:    Date;         // parsed from dateTime or date
  endTime:      Date;
  isAllDay:     boolean;
  attendees:    string[];     // display names / emails
  meetLink:     string;       // Google Meet URL if present
  colorId:      string;
  accountEmail?: string;      // which Google account this event belongs to
}

export interface ConflictPair {
  a: CalendarEvent;
  b: CalendarEvent;
}

export interface CalendarResult {
  events:    CalendarEvent[];
  conflicts: ConflictPair[];
  error?:    string;
}

// ── Fetch upcoming events ─────────────────────────────────────────────────────
export async function fetchUpcomingEvents(daysAhead = 7, accessToken?: string): Promise<CalendarResult> {
  try {
    const token = accessToken ?? await getAccessToken();
    if (!token) {
      return { events: [], conflicts: [], error: 'Not connected to Google. Please connect your calendar first.' };
    }

    const now    = new Date();
    const future = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

    const params = new URLSearchParams({
      calendarId:   'primary',
      timeMin:       now.toISOString(),
      timeMax:       future.toISOString(),
      singleEvents: 'true',
      orderBy:      'startTime',
      maxResults:   '50',
    });

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { events: [], conflicts: [], error: err?.error?.message ?? `API error ${res.status}` };
    }

    const data = await res.json();
    const items: any[] = data.items ?? [];

    const events: CalendarEvent[] = items.map(item => {
      const isAllDay = !!item.start?.date && !item.start?.dateTime;
      const startRaw = item.start?.dateTime ?? item.start?.date ?? now.toISOString();
      const endRaw   = item.end?.dateTime   ?? item.end?.date   ?? now.toISOString();

      const attendees: string[] = (item.attendees ?? []).map(
        (a: any) => a.email ?? a.displayName ?? '',
      ).filter(Boolean);

      // Pull Google Meet link from conferenceData or hangoutLink
      const meetLink =
        item.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri
        ?? item.hangoutLink
        ?? '';

      return {
        id:          item.id ?? '',
        title:       item.summary ?? '(No title)',
        description: item.description ?? '',
        location:    item.location ?? '',
        startTime:   new Date(startRaw),
        endTime:     new Date(endRaw),
        isAllDay,
        attendees,
        meetLink,
        colorId:     item.colorId ?? '',
      };
    });

    // ── Detect conflicts: two events with overlapping time windows ────────────
    const conflicts: ConflictPair[] = [];
    for (let i = 0; i < events.length; i++) {
      for (let j = i + 1; j < events.length; j++) {
        const a = events[i];
        const b = events[j];
        if (a.isAllDay || b.isAllDay) continue; // skip all-day events
        const overlap = a.startTime < b.endTime && b.startTime < a.endTime;
        if (overlap) conflicts.push({ a, b });
      }
    }

    return { events, conflicts };
  } catch (err: any) {
    return { events: [], conflicts: [], error: err?.message ?? 'Unknown error' };
  }
}

// ── Fetch events from ALL connected Google accounts ───────────────────────────
export async function fetchAllAccountsEvents(daysAhead = 7): Promise<CalendarEvent[]> {
  const accounts = await getAllGoogleAccounts();
  if (accounts.length === 0) return [];

  const results = await Promise.allSettled(
    accounts.map(async (email) => {
      const token = await getAccessTokenForEmail(email);
      if (!token) return [];
      const result = await fetchUpcomingEvents(daysAhead, token);
      // tag each event with the account email
      return result.events.map(e => ({ ...e, accountEmail: email }));
    })
  );

  // merge all fulfilled results, sort by start time
  const all: CalendarEvent[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  all.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  return all;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Format a Date to "Mon 10:30 AM" */
export function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

/** Format a Date to "Wed, Mar 18" */
export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

/** Returns true if two Dates are on the same calendar day */
export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
      && a.getMonth()    === b.getMonth()
      && a.getDate()     === b.getDate();
}

/** Duration in minutes between two dates */
export function durationMins(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 60_000);
}

// ── Fetch events for a specific date range ────────────────────────────────────
/**
 * Fetches all Google Calendar events between startDate and endDate.
 * Used for calendar query mode in Voice Brain Dump.
 */
export async function fetchEventsForDateRange(
  startDate: Date,
  endDate:   Date,
): Promise<CalendarResult> {
  try {
    const accounts = await getAllGoogleAccounts();
    if (accounts.length === 0) {
      return { events: [], conflicts: [], error: 'Not connected to Google Calendar.' };
    }

    // fetch from ALL accounts in parallel
    const settled = await Promise.allSettled(
      accounts.map(async (email) => {
        const token = await getAccessTokenForEmail(email);
        if (!token) return [];

        const params = new URLSearchParams({
          calendarId:   'primary',
          timeMin:      startDate.toISOString(),
          timeMax:      endDate.toISOString(),
          singleEvents: 'true',
          orderBy:      'startTime',
          maxResults:   '50',
        });

        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return [];

        const data = await res.json();
        return (data.items ?? []).map((item: any) => {
          const isAllDay = !!item.start?.date && !item.start?.dateTime;
          const startRaw = item.start?.dateTime ?? item.start?.date ?? startDate.toISOString();
          const endRaw   = item.end?.dateTime   ?? item.end?.date   ?? endDate.toISOString();
          return {
            id: item.id ?? '', title: item.summary ?? '(No title)',
            description: item.description ?? '', location: item.location ?? '',
            startTime: new Date(startRaw), endTime: new Date(endRaw), isAllDay,
            attendees: (item.attendees ?? []).map((a: any) => a.email ?? a.displayName ?? '').filter(Boolean),
            meetLink: item.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri ?? item.hangoutLink ?? '',
            colorId: item.colorId ?? '',
            accountEmail: email,
          } as CalendarEvent;
        });
      })
    );

    const all: CalendarEvent[] = [];
    for (const r of settled) { if (r.status === 'fulfilled') all.push(...r.value); }
    all.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
    return { events: all, conflicts: [] };
  } catch (err: any) {
    return { events: [], conflicts: [], error: err?.message ?? 'Unknown error' };
  }
}

// ── Day overload detection ────────────────────────────────────────────────────
/**
 * Threshold: 4+ non-all-day meetings on a single day = overloaded.
 * Based on spec: flag when load exceeds >1.5x historical average.
 * For MVP with no history, we use a fixed threshold of 4 meetings.
 */
export const OVERLOAD_THRESHOLD = 4;

export interface DayOverloadResult {
  isOverloaded: boolean;
  count:     number;          // number of non-all-day meetings on that day
  events:    CalendarEvent[]; // all timed meetings on that day
  threshold: number;
}

export async function detectDayOverload(date: Date): Promise<DayOverloadResult> {
  const empty: DayOverloadResult = { isOverloaded: false, count: 0, events: [], threshold: OVERLOAD_THRESHOLD };
  try {
    const accounts = await getAllGoogleAccounts();
    if (accounts.length === 0) return empty;

    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);

    const settled = await Promise.allSettled(
      accounts.map(async (email) => {
        const token = await getAccessTokenForEmail(email);
        if (!token) return [] as CalendarEvent[];

        const params = new URLSearchParams({
          calendarId:   'primary',
          timeMin:      startOfDay.toISOString(),
          timeMax:      endOfDay.toISOString(),
          singleEvents: 'true',
          orderBy:      'startTime',
          maxResults:   '50',
        });

        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return [] as CalendarEvent[];

        const data  = await res.json();
        const items: any[] = data.items ?? [];

        return items.map(item => {
          const isAllDay = !!item.start?.date && !item.start?.dateTime;
          const startRaw = item.start?.dateTime ?? item.start?.date ?? startOfDay.toISOString();
          const endRaw   = item.end?.dateTime   ?? item.end?.date   ?? endOfDay.toISOString();
          return {
            id:          item.id ?? '',
            title:       item.summary ?? '(No title)',
            description: item.description ?? '',
            location:    item.location ?? '',
            startTime:   new Date(startRaw),
            endTime:     new Date(endRaw),
            isAllDay,
            attendees:   (item.attendees ?? []).map((a: any) => a.email ?? a.displayName ?? '').filter(Boolean),
            meetLink:
              item.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri
              ?? item.hangoutLink ?? '',
            colorId:      item.colorId ?? '',
            accountEmail: email,
          } as CalendarEvent;
        });
      })
    );

    const all: CalendarEvent[] = [];
    for (const r of settled) { if (r.status === 'fulfilled') all.push(...r.value); }

    // Deduplicate by event id (same event may appear across accounts)
    const seen = new Set<string>();
    const unique = all.filter(ev => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; });

    // Only timed (non-all-day) meetings count toward overload
    const meetings   = unique.filter(ev => !ev.isAllDay);
    const isOverloaded = meetings.length >= OVERLOAD_THRESHOLD;
    return { isOverloaded, count: meetings.length, events: meetings, threshold: OVERLOAD_THRESHOLD };
  } catch {
    return empty;
  }
}

// ── Cancel a calendar event (notifies attendees automatically) ────────────────
/**
 * Cancels a Google Calendar event by ID.
 * Google automatically sends cancellation emails to all attendees.
 * Requires the calendar.events scope.
 */
export async function cancelCalendarEvent(
  eventId:      string,
  accessToken?: string,
  accountEmail?: string,
): Promise<{ ok: boolean; error?: string }> {
  try {
    let token = accessToken;
    if (!token) {
      // If we know which account owns the event, fetch that account's token
      if (accountEmail) {
        token = await getAccessTokenForEmail(accountEmail) ?? undefined;
      }
      // Fall back to primary account token
      if (!token) token = await getAccessToken() ?? undefined;
    }
    if (!token) return { ok: false, error: 'Not connected to Google Calendar.' };

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
      {
        method:  'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );

    // 204 No Content = success; 410 Gone = already deleted
    if (res.status === 204 || res.status === 410) return { ok: true };

    const err = await res.json().catch(() => ({}));
    return { ok: false, error: err?.error?.message ?? `API error ${res.status}` };
  } catch (err: any) {
    return { ok: false, error: err?.message ?? 'Unknown error' };
  }
}


// ── Send Gmail email ────────────────────────────────────────────────────────────────────
/**
 * Sends an email via the Gmail API using the provided access token.
 * Requires the gmail.send scope.
 */
export async function sendGmailEmail(
  to: string,
  subject: string,
  body: string,
  accessToken: string,
): Promise<void> {
  // Construct RFC 2822 message
  const messageParts = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    body,
  ];
  const message = messageParts.join('\r\n');
  const encodedMessage = btoa(unescape(encodeURIComponent(message)))
    .replace(/[+]/g, '-')
    .replace(/[/]/g, '_')
    .replace(/=+$/g, '');

  const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ raw: encodedMessage }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Gmail send failed: ${res.status} ${JSON.stringify(err)}`);
  }
}

// ── Conflict check for a proposed time slot ───────────────────────────────────
/**
 * Given a proposed start + end time, fetches Google Calendar events
 * in that window and returns any that overlap (i.e. conflicts).
 * Returns [] if not connected or on any error.
 */
export async function checkTimeConflicts(
  proposedStart: Date,
  proposedEnd:   Date,
): Promise<CalendarEvent[]> {
  try {
    const accounts = await getAllGoogleAccounts();
    if (accounts.length === 0) return [];

    const settled = await Promise.allSettled(
      accounts.map(async (email) => {
        const token = await getAccessTokenForEmail(email);
        if (!token) return [] as CalendarEvent[];

        const params = new URLSearchParams({
          calendarId:   'primary',
          timeMin:      proposedStart.toISOString(),
          timeMax:      proposedEnd.toISOString(),
          singleEvents: 'true',
          orderBy:      'startTime',
          maxResults:   '10',
        });

        const res = await fetch(
          `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
          { headers: { Authorization: `Bearer ${token}` } },
        );
        if (!res.ok) return [] as CalendarEvent[];

        const data  = await res.json();
        const items: any[] = data.items ?? [];

        return items.map(item => {
          const isAllDay = !!item.start?.date && !item.start?.dateTime;
          const startRaw = item.start?.dateTime ?? item.start?.date ?? proposedStart.toISOString();
          const endRaw   = item.end?.dateTime   ?? item.end?.date   ?? proposedEnd.toISOString();
          return {
            id:          item.id ?? '',
            title:       item.summary ?? '(No title)',
            description: item.description ?? '',
            location:    item.location ?? '',
            startTime:   new Date(startRaw),
            endTime:     new Date(endRaw),
            isAllDay,
            attendees:   (item.attendees ?? [])
              .map((a: any) => a.email ?? a.displayName ?? '')
              .filter(Boolean),
            meetLink:
              item.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri
              ?? item.hangoutLink ?? '',
            colorId:      item.colorId ?? '',
            accountEmail: email,
          } as CalendarEvent;
        });
      })
    );

    const all: CalendarEvent[] = [];
    for (const r of settled) { if (r.status === 'fulfilled') all.push(...r.value); }

    // Deduplicate by event id
    const seen = new Set<string>();
    const unique = all.filter(ev => { if (seen.has(ev.id)) return false; seen.add(ev.id); return true; });

    // Only return events that actually overlap (not just touch boundaries)
    return unique.filter(ev => {
      if (ev.isAllDay) return false;
      return ev.startTime < proposedEnd && proposedStart < ev.endTime;
    });
  } catch {
    return [];
  }
}
