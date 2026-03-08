import type { JournalEntry, CalendarPeriodChecklistItem, DailyRecurringItem, DailyItemLog, EventCompletion, Objective, TrackedGoal, GoalLog } from '../types';
import { getObjectiveProgress, isKRComplete, getNumericProgress, getMilestoneProgress, getFrequencyCount, getPeriodDateForFrequency } from './goalProgress';

export interface DailyPayloadInput {
  date: string;
  journalEntries: JournalEntry[];
  dailyRecurringItems: DailyRecurringItem[];
  dailyLogsForDate: DailyItemLog[];
  periodChecklist: CalendarPeriodChecklistItem[];
  /** Events that occur on this day: { title, id } and completion if any */
  eventsOnDay: { id: string; title: string; completion?: EventCompletion }[];
}

/** Build a single text payload for the daily reflection prompt. */
export function buildDailyPayload(input: DailyPayloadInput): string {
  const lines: string[] = [`Date: ${input.date}`, ''];

  if (input.journalEntries.length > 0) {
    lines.push('--- Journal ---');
    input.journalEntries.forEach((e) => {
      lines.push(e.content.trim());
      if (e.mood) lines.push(`Mood: ${e.mood}`);
      if (e.tags?.length) lines.push(`Tags: ${e.tags.join(', ')}`);
      lines.push('');
    });
  } else {
    lines.push('--- Journal ---', '(no entries)', '');
  }

  if (input.dailyRecurringItems.length > 0) {
    lines.push('--- Daily habits ---');
    input.dailyRecurringItems.forEach((item) => {
      const log = input.dailyLogsForDate.find((l) => l.dailyItemId === item.id);
      lines.push(`- ${item.title}: ${log?.done ? 'done' : 'missed'}`);
    });
    lines.push('');
  }

  if (input.periodChecklist.length > 0) {
    lines.push('--- Day checklist ---');
    input.periodChecklist.forEach((c) => {
      lines.push(`- ${c.text}: ${c.done ? 'done' : 'not done'}`);
    });
    lines.push('');
  }

  if (input.eventsOnDay.length > 0) {
    lines.push('--- Planned vs actual (calendar) ---');
    input.eventsOnDay.forEach((e) => {
      const status = e.completion?.status ?? '(not logged)';
      const note = e.completion?.note ? ` — note: ${e.completion.note}` : '';
      const what = e.completion?.whatIdidInstead ? ` — what I did instead: ${e.completion.whatIdidInstead}` : '';
      lines.push(`- ${e.title}: ${status}${note}${what}`);
    });
  }

  return lines.join('\n');
}

export interface WeeklyPayloadInput {
  weekStart: string;
  dailyReflections: { date: string; analysis: string; recommendations: string[] }[];
  objectives?: Objective[];
  trackedGoals?: TrackedGoal[];
  goalLogs?: GoalLog[];
}

/** Build payload for weekly reflection from the week's daily reflections. */
export function buildWeeklyPayload(input: WeeklyPayloadInput): string {
  const lines: string[] = [`Week starting: ${input.weekStart}`, ''];

  input.dailyReflections.forEach((d) => {
    lines.push(`### ${d.date}`);
    lines.push(d.analysis);
    if (d.recommendations.length > 0) {
      lines.push('Recommendations that day:', ...d.recommendations.map((r) => `- ${r}`));
    }
    lines.push('');
  });

  if (input.objectives && input.trackedGoals && input.goalLogs) {
    const currentQ = getCurrentQuarterString();
    const focusObjs = input.objectives.filter((o) => o.quarter === currentQ && o.status === 'focus');
    if (focusObjs.length > 0) {
      lines.push('--- OKR Progress (focus objectives this quarter) ---');
      for (const obj of focusObjs) {
        const progress = getObjectiveProgress(obj.id, input.trackedGoals, input.goalLogs);
        lines.push(`Objective: ${obj.name} — ${progress.done}/${progress.total} key results done`);
        const krs = input.trackedGoals.filter((g) => g.objectiveId === obj.id);
        for (const kr of krs) {
          const done = isKRComplete(kr, input.goalLogs);
          let detail = done ? 'DONE' : 'in progress';
          if (kr.type === 'numeric') {
            const np = getNumericProgress(kr, input.goalLogs);
            if (np) detail = `${Math.round(np.progress * 100)}% (current: ${np.current ?? '?'}${kr.unit ? ' ' + kr.unit : ''})`;
          } else if (kr.type === 'milestone') {
            const mp = getMilestoneProgress(kr);
            if (mp) detail = `${mp.done}/${mp.total} steps`;
          } else if (kr.type === 'frequency' && kr.period && kr.targetCount) {
            const pd = getPeriodDateForFrequency(kr.period, input.weekStart);
            const count = getFrequencyCount(input.goalLogs, kr.id, pd);
            detail = `${count}/${kr.targetCount} per ${kr.period}`;
          }
          lines.push(`  - ${kr.name}: ${detail}`);
        }
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

function getCurrentQuarterString(): string {
  const d = new Date();
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}-Q${q}`;
}
