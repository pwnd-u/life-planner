/** Today's date in local timezone (YYYY-MM-DD). */
export function todayStr(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Yesterday's date in local timezone (YYYY-MM-DD). */
export function yesterdayStr(): string {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function formatDate(s: string): string {
  const d = new Date(s + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function formatWeekLabel(weekStart: string): string {
  const d = new Date(weekStart + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export function isToday(s: string): boolean {
  return s === todayStr();
}

/** Monday of the week containing the given date (YYYY-MM-DD). */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Month key YYYY-MM for the given date (YYYY-MM-DD). */
export function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** All day dates (YYYY-MM-DD) in the week that contains dateStr. */
export function getDaysInWeek(dateStr: string): string[] {
  const start = getWeekStart(dateStr);
  const out: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(start + 'T12:00:00');
    d.setDate(d.getDate() + i);
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** All day dates (YYYY-MM-DD) from startStr to endStr (start inclusive, end exclusive). Use for visible calendar range. */
export function getDaysInRange(startStr: string, endStr: string): string[] {
  const start = new Date(startStr.slice(0, 10) + 'T12:00:00').getTime();
  const end = new Date(endStr.slice(0, 10) + 'T12:00:00').getTime();
  const out: string[] = [];
  for (let t = start; t < end; t += 24 * 60 * 60 * 1000) {
    out.push(new Date(t).toISOString().slice(0, 10));
  }
  return out;
}

/** All day dates (YYYY-MM-DD) in the month YYYY-MM. */
export function getDaysInMonth(monthKey: string): string[] {
  const [y, m] = monthKey.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const out: string[] = [];
  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Returns true if d is a valid date (can call toISOString). */
function isValidDate(d: Date): boolean {
  return !Number.isNaN(d.getTime());
}

/** Deadline date (YYYY-MM-DD) for a period key: day → that day; week → Friday of that week; month → 25th. */
export function getDeadlineFromPeriodKey(periodKey: string): string {
  if (!periodKey || typeof periodKey !== 'string') return '';
  if (periodKey.startsWith('day:')) {
    const day = periodKey.slice(5).trim();
    if (!day) return '';
    const d = new Date(day + 'T12:00:00');
    return isValidDate(d) ? d.toISOString().slice(0, 10) : '';
  }
  if (periodKey.startsWith('week:')) {
    const weekStart = periodKey.slice(6).trim();
    if (!weekStart) return '';
    const d = new Date(weekStart + 'T12:00:00');
    if (!isValidDate(d)) return '';
    d.setDate(d.getDate() + 4);
    return isValidDate(d) ? d.toISOString().slice(0, 10) : '';
  }
  if (periodKey.startsWith('month:')) {
    const monthPart = periodKey.slice(6).trim();
    if (!monthPart || !/^\d{4}-\d{2}$/.test(monthPart)) return '';
    const d = new Date(monthPart + '-25T12:00:00');
    return isValidDate(d) ? d.toISOString().slice(0, 10) : '';
  }
  return '';
}

/** Week-start dates (YYYY-MM-DD) that fall in the given month (YYYY-MM). */
export function getWeekStartsInMonth(monthKey: string): string[] {
  const days = getDaysInMonth(monthKey);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of days) {
    const w = getWeekStart(d);
    if (!seen.has(w)) {
      seen.add(w);
      out.push(w);
    }
  }
  return out.sort();
}
