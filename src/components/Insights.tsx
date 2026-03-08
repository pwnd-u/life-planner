import { useState, useCallback } from 'react';
import type { AppState } from '../types';
import { buildDailyPayload, buildWeeklyPayload } from '../lib/reflectionPayload';
import { getDailyReflection, getWeeklyReflection } from '../lib/openai';
import { getWeekStart, getDaysInWeek } from '../lib/date';
import { formatDate } from '../lib/date';

interface Props {
  state: AppState;
  setDailyReflection: (r: import('../types').DailyReflection) => void;
  setWeeklyReflection: (r: import('../types').WeeklyReflection) => void;
  getDailyReflection: (date: string) => import('../types').DailyReflection | undefined;
  getWeeklyReflection: (weekStart: string) => import('../types').WeeklyReflection | undefined;
  getEventCompletion: (date: string, eventId: string) => import('../types').EventCompletion | undefined;
}

export default function Insights({
  state,
  setDailyReflection,
  setWeeklyReflection,
  getDailyReflection,
  getWeeklyReflection,
  getEventCompletion,
}: Props) {
  const [dailyDate, setDailyDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  });
  const [weeklyStart, setWeeklyStart] = useState(() => getWeekStart(new Date().toISOString().slice(0, 10)));
  const [dailyLoading, setDailyLoading] = useState(false);
  const [dailyError, setDailyError] = useState<string | null>(null);
  const [weeklyLoading, setWeeklyLoading] = useState(false);
  const [weeklyError, setWeeklyError] = useState<string | null>(null);

  const apiKey = state.openAiApiKey?.trim();

  const eventsCombined = [...(state.calendarEvents ?? []), ...(state.googleCalendarEvents ?? [])];

  const runDaily = useCallback(async () => {
    if (!apiKey) {
      setDailyError('Add your OpenAI API key in My List (AI section) or in settings.');
      return;
    }
    setDailyError(null);
    setDailyLoading(true);
    try {
      const journalEntries = (state.journalEntries ?? []).filter((e) => e.createdAt.startsWith(dailyDate));
      const dailyLogsForDate = (state.dailyItemLogs ?? []).filter((l) => l.date === dailyDate);
      const periodChecklist = state.calendarPeriodChecklists?.[`day:${dailyDate}`] ?? [];
      const eventsOnDay = eventsCombined
        .filter((ev) => ev.start.slice(0, 10) === dailyDate)
        .map((ev) => ({
          id: ev.id,
          title: ev.title,
          completion: getEventCompletion(dailyDate, ev.id),
        }));

      const payload = buildDailyPayload({
        date: dailyDate,
        journalEntries,
        dailyRecurringItems: state.dailyRecurringItems ?? [],
        dailyLogsForDate,
        periodChecklist,
        eventsOnDay,
      });
      const result = await (getDailyReflection as any)(apiKey, payload);
      setDailyReflection({
        date: dailyDate,
        analysis: result.analysis,
        recommendations: result.recommendations,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setDailyError(err instanceof Error ? err.message : 'Failed to generate reflection');
    } finally {
      setDailyLoading(false);
    }
  }, [apiKey, dailyDate, state, eventsCombined, getEventCompletion, setDailyReflection]);

  const runWeekly = useCallback(async () => {
    if (!apiKey) {
      setWeeklyError('Add your OpenAI API key in My List (AI section) or in settings.');
      return;
    }
    setWeeklyError(null);
    setWeeklyLoading(true);
    try {
      const days = getDaysInWeek(weeklyStart);
      const dailyReflections = days
        .map((d) => getDailyReflection(d))
        .filter((r): r is NonNullable<typeof r> => r != null)
        .map((r) => ({ date: r.date, analysis: r.analysis, recommendations: r.recommendations }));

      if (dailyReflections.length === 0) {
        setWeeklyError('Generate at least one daily reflection for this week first.');
        setWeeklyLoading(false);
        return;
      }

      const payload = buildWeeklyPayload({
        weekStart: weeklyStart,
        dailyReflections,
        objectives: state.objectives,
        trackedGoals: state.trackedGoals,
        goalLogs: state.goalLogs,
      });
      const result = await (getWeeklyReflection as any)(apiKey, payload);
      setWeeklyReflection({
        weekStart: weeklyStart,
        analysis: result.analysis,
        recommendations: result.recommendations,
        generatedAt: new Date().toISOString(),
      });
    } catch (err) {
      setWeeklyError(err instanceof Error ? err.message : 'Failed to generate weekly analysis');
    } finally {
      setWeeklyLoading(false);
    }
  }, [apiKey, weeklyStart, getDailyReflection, setWeeklyReflection]);

  const savedDaily = getDailyReflection(dailyDate);
  const savedWeekly = getWeeklyReflection(weeklyStart);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-xl font-bold text-[var(--adhd-text)]">Insights</h2>
        <p className="mt-1 text-sm text-[var(--adhd-text-muted)]">
          Daily and weekly AI reflection from your journal, habits, checklist, and planned vs actual. Uses your OpenAI key (~1 request per reflection).
        </p>
      </div>

      {/* Daily reflection */}
      <section className="rounded-xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)] p-4">
        <h3 className="text-lg font-semibold text-[var(--adhd-text)]">Daily reflection</h3>
        <p className="mt-0.5 text-sm text-[var(--adhd-text-muted)]">Pick a date, then generate. Data: journal, daily habits, day checklist, and calendar actuals.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={dailyDate}
            onChange={(e) => setDailyDate(e.target.value)}
            className="rounded-lg border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-3 py-2 text-sm text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none"
          />
          <button
            type="button"
            onClick={runDaily}
            disabled={dailyLoading}
            className="rounded-lg bg-[var(--adhd-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {dailyLoading ? 'Generating…' : 'Generate daily reflection'}
          </button>
        </div>
        {dailyError && <p className="mt-2 text-sm text-red-600">{dailyError}</p>}
        {savedDaily && (
          <div className="mt-4 rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)] p-3">
            <p className="text-xs text-[var(--adhd-text-muted)]">Saved {formatDate(savedDaily.date)}</p>
            <p className="mt-2 text-sm text-[var(--adhd-text)] whitespace-pre-wrap">{savedDaily.analysis}</p>
            {savedDaily.recommendations.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm text-[var(--adhd-text)]">
                {savedDaily.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {/* Weekly reflection */}
      <section className="rounded-xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)] p-4">
        <h3 className="text-lg font-semibold text-[var(--adhd-text)]">Weekly analysis</h3>
        <p className="mt-0.5 text-sm text-[var(--adhd-text-muted)]">Uses this week&apos;s daily reflections to find patterns and recommend next steps.</p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={weeklyStart}
            onChange={(e) => setWeeklyStart(e.target.value)}
            className="rounded-lg border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-3 py-2 text-sm text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none"
          />
          <button
            type="button"
            onClick={runWeekly}
            disabled={weeklyLoading}
            className="rounded-lg bg-[var(--adhd-accent)] px-4 py-2 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
          >
            {weeklyLoading ? 'Generating…' : 'Generate weekly analysis'}
          </button>
        </div>
        {weeklyError && <p className="mt-2 text-sm text-red-600">{weeklyError}</p>}
        {savedWeekly && (
          <div className="mt-4 rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)] p-3">
            <p className="text-xs text-[var(--adhd-text-muted)]">Week of {formatDate(savedWeekly.weekStart)}</p>
            <p className="mt-2 text-sm text-[var(--adhd-text)] whitespace-pre-wrap">{savedWeekly.analysis}</p>
            {savedWeekly.recommendations.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-sm text-[var(--adhd-text)]">
                {savedWeekly.recommendations.map((r, i) => (
                  <li key={i}>{r}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
