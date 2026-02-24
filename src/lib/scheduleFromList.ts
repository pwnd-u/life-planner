import type { MyListItem } from '../types';
import type { CalendarEvent } from '../types';
import { todayStr } from './date';

export interface ScheduleSlot {
  title: string;
  start: string; // ISO
  end: string;
}

const DEFAULT_DAY_START = '09:00';
const DEFAULT_DAY_END = '21:00';

function toLocalISO(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}:00`;
}

/** Build busy ranges (ms) for a given day from calendar events. */
function getBusyRangesForDay(events: CalendarEvent[], dateStr: string): [number, number][] {
  const dayStart = new Date(dateStr + 'T00:00:00').getTime();
  const dayEnd = new Date(dateStr + 'T23:59:59').getTime();
  const ranges: [number, number][] = [];
  for (const ev of events) {
    const start = new Date(ev.start).getTime();
    const end = new Date(ev.end).getTime();
    if (ev.allDay) {
      ranges.push([dayStart, dayEnd]);
      continue;
    }
    const s = Math.max(dayStart, start);
    const e = Math.min(dayEnd, end);
    if (s < e) ranges.push([s, e]);
  }
  return ranges.sort((a, b) => a[0] - b[0]);
}

/** Find first free slot on a day that fits durationMinutes. dayStart/dayEnd in HH:mm. minStartMs: only consider slots starting at or after this time (e.g. now, for today). */
function findSlotOnDay(
  dateStr: string,
  durationMinutes: number,
  busyRanges: [number, number][],
  dayStart: string,
  dayEnd: string,
  minStartMs?: number
): { start: string; end: string } | null {
  const dayStartTime = new Date(dateStr + 'T' + dayStart + ':00').getTime();
  const dayEndTime = new Date(dateStr + 'T' + dayEnd + ':00').getTime();
  const durationMs = durationMinutes * 60 * 1000;
  let cursor = minStartMs != null ? Math.max(dayStartTime, minStartMs) : dayStartTime;
  if (cursor >= dayEndTime) return null;
  for (const [bStart, bEnd] of busyRanges) {
    if (cursor + durationMs <= bStart) {
      const start = new Date(cursor);
      const end = new Date(cursor + durationMs);
      return { start: toLocalISO(start), end: toLocalISO(end) };
    }
    cursor = Math.max(cursor, bEnd);
  }
  if (cursor + durationMs <= dayEndTime) {
    const start = new Date(cursor);
    const end = new Date(cursor + durationMs);
    return { start: toLocalISO(start), end: toLocalISO(end) };
  }
  return null;
}

/**
 * Schedule prioritized list items into calendar slots without overlapping existing events.
 * Items are placed in order; deadline items only on or before deadline date.
 */
export function scheduleListIntoCalendar(
  items: MyListItem[],
  existingEvents: CalendarEvent[],
  options: {
    dayStart?: string;
    dayEnd?: string;
    daysAhead?: number;
  } = {}
): ScheduleSlot[] {
  const dayStart = options.dayStart ?? DEFAULT_DAY_START;
  const dayEnd = options.dayEnd ?? DEFAULT_DAY_END;
  const daysAhead = options.daysAhead ?? 14;
  const today = todayStr();
  const slots: ScheduleSlot[] = [];
  const eventsSoFar: CalendarEvent[] = [...existingEvents];

  /** Current time rounded up to next 15 min so we only schedule after now. */
  const nowMs = Date.now();
  const roundedNow = Math.ceil(nowMs / (15 * 60 * 1000)) * (15 * 60 * 1000);

  for (const item of items) {
    const duration = Math.max(15, Math.min(240, item.estimatedMinutes));
    const deadline = item.deadline;
    for (let d = 0; d < daysAhead; d++) {
      const date = new Date(today + 'T12:00:00');
      date.setDate(date.getDate() + d);
      const dateStr = date.toISOString().slice(0, 10);
      if (deadline && dateStr > deadline) continue;
      const busy = getBusyRangesForDay(eventsSoFar, dateStr);
      const isToday = dateStr === today;
      const slot = findSlotOnDay(dateStr, duration, busy, dayStart, dayEnd, isToday ? roundedNow : undefined);
      if (slot) {
        slots.push({ title: item.title, start: slot.start, end: slot.end });
        eventsSoFar.push({
          id: 'temp-' + slots.length,
          title: item.title,
          start: slot.start,
          end: slot.end,
        });
        break;
      }
    }
  }
  return slots;
}
