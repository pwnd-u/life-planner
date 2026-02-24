import type { CalendarEvent } from '../types';

/** Google Calendar API event item (minimal shape we need). */
interface GCalEvent {
  id: string;
  summary?: string | null;
  start?: { dateTime?: string; date?: string } | null;
  end?: { dateTime?: string; date?: string } | null;
  description?: string | null;
  location?: string | null;
  backgroundColor?: string | null;
}

/**
 * Fetch events from Google Calendar API (primary calendar) for the given range.
 * Returns events in our app's CalendarEvent format with id prefixed by "google-".
 */
export async function fetchGoogleCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string
): Promise<CalendarEvent[]> {
  const url = new URL('https://www.googleapis.com/calendar/v3/calendars/primary/events');
  url.searchParams.set('timeMin', timeMin);
  url.searchParams.set('timeMax', timeMax);
  url.searchParams.set('singleEvents', 'true');
  url.searchParams.set('orderBy', 'startTime');

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(res.status === 401 ? 'Sign in again' : err || `Google Calendar error ${res.status}`);
  }
  const data = (await res.json()) as { items?: GCalEvent[] };
  const items = data.items ?? [];

  const out: CalendarEvent[] = [];
  for (const item of items) {
    const start = item.start?.dateTime ?? item.start?.date;
    const end = item.end?.dateTime ?? item.end?.date;
    if (!start || !end) continue;
    const allDay = !!item.start?.date;
    out.push({
      id: `google-${item.id}`,
      title: item.summary?.trim() || '(No title)',
      start: allDay ? (start.includes('T') ? start.slice(0, 10) : start) : start,
      end: allDay ? (end.includes('T') ? end.slice(0, 10) : end) : end,
      allDay,
      description: item.description?.trim() || undefined,
      location: item.location?.trim() || undefined,
      color: item.backgroundColor ?? undefined,
    });
  }
  return out;
}

/** Default range: 2 weeks ago to 3 months ahead. */
export function defaultTimeMin(): string {
  const d = new Date();
  d.setDate(d.getDate() - 14);
  return d.toISOString();
}

export function defaultTimeMax(): string {
  const d = new Date();
  d.setMonth(d.getMonth() + 3);
  return d.toISOString();
}
