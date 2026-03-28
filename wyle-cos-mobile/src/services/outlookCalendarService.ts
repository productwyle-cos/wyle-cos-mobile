// src/services/outlookCalendarService.ts
// Fetches calendar events from Microsoft Graph API for all connected
// Outlook / Microsoft accounts. Mirrors the pattern of calendarService.ts.

import { getAllOutlookAccounts, getAccessTokenForOutlookEmail } from './outlookAuthService';
import type { CalendarEvent } from './calendarService';

// ── Map a Microsoft Graph event → CalendarEvent ───────────────────────────────
function mapGraphEvent(item: any, accountEmail: string): CalendarEvent {
  const isAllDay = !!item.isAllDay;

  const startRaw = item.start?.dateTime ?? item.start?.date ?? new Date().toISOString();
  const endRaw   = item.end?.dateTime   ?? item.end?.date   ?? new Date().toISOString();

  // Microsoft Graph returns times in the event's timezone.
  // Append 'Z' only for all-day date strings to treat them as UTC midnight.
  const startTime = new Date(isAllDay ? startRaw + 'T00:00:00Z' : startRaw);
  const endTime   = new Date(isAllDay ? endRaw   + 'T00:00:00Z' : endRaw);

  const attendees: string[] = (item.attendees ?? []).map(
    (a: any) => a.emailAddress?.name ?? a.emailAddress?.address ?? ''
  ).filter(Boolean);

  // Extract Teams meeting link if present
  const meetLink: string =
    item.onlineMeeting?.joinUrl ??
    item.body?.content?.match(/https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s"<>]+/)?.[0] ??
    '';

  return {
    id:           item.id ?? '',
    title:        item.subject ?? '(No title)',
    description:  item.bodyPreview ?? '',
    location:     item.location?.displayName ?? '',
    startTime,
    endTime,
    isAllDay,
    attendees,
    meetLink,
    colorId:      'outlook',   // signals "this is an Outlook event" for colour coding
    accountEmail,
  };
}

// ── Fetch events from all Outlook accounts for a date range ──────────────────
export async function fetchOutlookEventsForDateRange(
  startDate: Date,
  endDate:   Date,
): Promise<CalendarEvent[]> {
  const accounts = getAllOutlookAccounts();
  if (accounts.length === 0) return [];

  const settled = await Promise.allSettled(
    accounts.map(async (email) => {
      const token = await getAccessTokenForOutlookEmail(email);
      if (!token) return [];

      const params = new URLSearchParams({
        startDateTime: startDate.toISOString(),
        endDateTime:   endDate.toISOString(),
        $select:       'id,subject,bodyPreview,start,end,isAllDay,location,attendees,onlineMeeting,body',
        $orderby:      'start/dateTime',
        $top:          '50',
      });

      const res = await fetch(
        `https://graph.microsoft.com/v1.0/me/calendarView?${params}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            Prefer: `outlook.timezone="UTC"`,
          },
        },
      );

      if (!res.ok) return [];
      const data = await res.json();
      return (data.value ?? []).map((item: any) => mapGraphEvent(item, email));
    })
  );

  const all: CalendarEvent[] = [];
  for (const r of settled) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  return all;
}

// ── Fetch upcoming Outlook events (convenience wrapper) ───────────────────────
export async function fetchUpcomingOutlookEvents(daysAhead = 7): Promise<CalendarEvent[]> {
  const start = new Date();
  const end   = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);
  return fetchOutlookEventsForDateRange(start, end);
}

// ── Send an email via Microsoft Graph (Mail.Send scope) ───────────────────────
export async function sendOutlookEmail(
  fromEmail:  string,
  toEmail:    string,
  subject:    string,
  bodyHtml:   string,
): Promise<boolean> {
  const token = await getAccessTokenForOutlookEmail(fromEmail);
  if (!token) return false;

  const payload = {
    message: {
      subject,
      body:       { contentType: 'HTML', content: bodyHtml },
      toRecipients: [{ emailAddress: { address: toEmail } }],
    },
    saveToSentItems: true,
  };

  const res = await fetch('https://graph.microsoft.com/v1.0/me/sendMail', {
    method:  'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });

  return res.ok || res.status === 202;
}

// ── Cancel (delete) an Outlook calendar event ─────────────────────────────────
export async function cancelOutlookCalendarEvent(
  accountEmail: string,
  eventId:      string,
): Promise<boolean> {
  const token = await getAccessTokenForOutlookEmail(accountEmail);
  if (!token) return false;

  const res = await fetch(
    `https://graph.microsoft.com/v1.0/me/events/${eventId}`,
    {
      method:  'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );

  return res.ok || res.status === 204;
}
