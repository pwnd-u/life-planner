import type { TrackedGoal, GoalLog } from '../types';
import type { FrequencyPeriod } from '../types';
import { getWeekStart, formatWeekLabel } from './date';

/** Date key for a frequency goal log: one per day (YYYY-MM-DD), week (week-start), or month (YYYY-MM-01). */
export function getPeriodDateForFrequency(period: FrequencyPeriod, dateStr: string): string {
  if (period === 'day') return dateStr;
  if (period === 'week') return getWeekStart(dateStr);
  return dateStr.slice(0, 7) + '-01'; // month
}

/** Current count for a frequency goal in the given period (log.value ?? 0). */
export function getFrequencyCount(logs: GoalLog[], trackedGoalId: string, periodDate: string): number {
  const log = getLogForDate(logs, trackedGoalId, periodDate);
  const v = log?.value;
  return typeof v === 'number' && v >= 0 ? v : 0;
}

export function getLatestLogValue(logs: GoalLog[], trackedGoalId: string): number | undefined {
  const goalLogs = logs
    .filter((l) => l.trackedGoalId === trackedGoalId && l.value != null)
    .sort((a, b) => b.date.localeCompare(a.date));
  return goalLogs[0]?.value;
}

export function getStartValue(goal: TrackedGoal, logs: GoalLog[]): number | undefined {
  if (goal.startValue != null) return goal.startValue;
  const goalLogs = logs
    .filter((l) => l.trackedGoalId === goal.id && l.value != null)
    .sort((a, b) => a.date.localeCompare(b.date));
  return goalLogs[0]?.value;
}

/** Progress 0–1: how much of the way from start to target. Returns null if no start value (set start or log first). */
export function getNumericProgress(
  goal: TrackedGoal,
  logs: GoalLog[]
): { progress: number; current: number | undefined; start: number; target: number } | null {
  if (goal.type !== 'numeric' || goal.targetValue == null || goal.direction == null) return null;
  const target = goal.targetValue;
  const start = getStartValue(goal, logs);
  const current = getLatestLogValue(logs, goal.id);
  if (start == null) return { progress: 0, current, start: target, target }; // UI can treat start===target as "log first"
  const range = goal.direction === 'decrease' ? start - target : target - start;
  if (range <= 0) return { progress: 1, current, start, target };
  if (current == null) return { progress: 0, current, start, target };
  let progress: number;
  if (goal.direction === 'decrease') {
    progress = (start - current) / range;
  } else {
    progress = (current - start) / range;
  }
  progress = Math.max(0, Math.min(1, progress));
  return { progress, current, start, target };
}

export function getLogForDate(logs: GoalLog[], trackedGoalId: string, date: string): GoalLog | undefined {
  return logs.find((l) => l.trackedGoalId === trackedGoalId && l.date === date);
}

/** Weekly goals: logs keyed by week-start date, newest first. */
export function getWeeklyLogsForGoal(logs: GoalLog[], trackedGoalId: string): GoalLog[] {
  return logs
    .filter((l) => l.trackedGoalId === trackedGoalId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Sorted by date for charting. If goal has startValue and startDate, prepends that point so the chart starts there. */
export function getChartData(
  logs: GoalLog[],
  trackedGoalId: string,
  goal?: { startValue?: number; startDate?: string }
): { date: string; value: number; displayDate: string }[] {
  const fromLogs = logs
    .filter((l) => l.trackedGoalId === trackedGoalId && l.value != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({
      date: l.date,
      value: l.value as number,
      displayDate: formatChartDate(l.date),
    }));
  if (goal?.startValue != null && goal?.startDate) {
    const startPoint = {
      date: goal.startDate,
      value: goal.startValue,
      displayDate: formatChartDate(goal.startDate),
    };
    const combined = [startPoint, ...fromLogs];
    combined.sort((a, b) => a.date.localeCompare(b.date));
    return combined;
  }
  return fromLogs;
}

/** Chart data for frequency goals: one point per period (week/month/day) with period-appropriate labels. */
export function getFrequencyChartData(
  logs: GoalLog[],
  trackedGoalId: string,
  period: FrequencyPeriod
): { date: string; value: number; displayDate: string }[] {
  const raw = logs
    .filter((l) => l.trackedGoalId === trackedGoalId && l.value != null)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((l) => ({ date: l.date, value: l.value as number }));
  return raw.map((l) => ({
    date: l.date,
    value: l.value,
    displayDate: period === 'week' ? `Week of ${formatWeekLabel(l.date)}` : period === 'month' ? formatChartDateMonth(l.date) : formatChartDate(l.date),
  }));
}

function formatChartDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatChartDateMonth(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric' });
}
