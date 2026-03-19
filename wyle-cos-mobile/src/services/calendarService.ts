// src/services/calendarService.ts
// Fetches upcoming Google Calendar events using a stored OAuth access token.
// Uses the Google Calendar API v3 (read-only, calendar.readonly scope).

import { getAccessToken } from './googleAuthService';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface CalendarEvent {
  id:          string;
  title:       string;
  description: string;
  location:    string;
  startTime:   Date;         // parsed from dateTime or date
  endTime:     Date;
  isAllDay:    boolean;
  attendees:   string[];     // display names / emails
  meetLink:    string;       // Google Meet URL if present
  colorId:     string;
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
export async function fetchUpcomingEvents(daysAhead = 7): Promise<CalendarResult> {
  try {
    const token = await getAccessToken();
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
        (a: any) => a.displayName ?? a.email ?? '',
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
    const token = await getAccessToken();
    if (!token) {
      return { events: [], conflicts: [], error: 'Not connected to Google Calendar.' };
    }

    const params = new URLSearchParams({
      calendarId:   'primary',
      timeMin:       startDate.toISOString(),
      timeMax:       endDate.toISOString(),
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

    const data  = await res.json();
    const items: any[] = data.items ?? [];

    const events: CalendarEvent[] = items.map(item => {
      const isAllDay = !!item.start?.date && !item.start?.dateTime;
      const startRaw = item.start?.dateTime ?? item.start?.date ?? startDate.toISOString();
      const endRaw   = item.end?.dateTime   ?? item.end?.date   ?? endDate.toISOString();
      return {
        id:          item.id ?? '',
        title:       item.summary ?? '(No title)',
        description: item.description ?? '',
        location:    item.location ?? '',
        startTime:   new Date(startRaw),
        endTime:     new Date(endRaw),
        isAllDay,
        attendees:   (item.attendees ?? []).map((a: any) => a.displayName ?? a.email ?? '').filter(Boolean),
        meetLink:
          item.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri
          ?? item.hangoutLink ?? '',
        colorId: item.colorId ?? '',
      };
    });

    return { events, conflicts: [] };
  } catch (err: any) {
    return { events: [], conflicts: [], error: err?.message ?? 'Unknown error' };
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
    const token = await getAccessToken();
    if (!token) return [];

    // Fetch events in a window around the proposed slot
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
    if (!res.ok) return [];

    const data  = await res.json();
    const items: any[] = data.items ?? [];

    const events: CalendarEvent[] = items.map(item => {
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
          .map((a: any) => a.displayName ?? a.email ?? '')
          .filter(Boolean),
        meetLink:
          item.conferenceData?.entryPoints?.find((ep: any) => ep.entryPointType === 'video')?.uri
          ?? item.hangoutLink ?? '',
        colorId: item.colorId ?? '',
      };
    });

    // Only return events that actually overlap (not just touch boundaries)
    return events.filter(ev => {
      if (ev.isAllDay) return false;
      return ev.startTime < proposedEnd && proposedStart < ev.endTime;
    });
  } catch {
    return [];
  }
}
