import type { AppState, ScheduledBlock } from '../types';
import { runWeeklyScheduler, getWeekStart } from '../scheduler';
import { formatDate } from '../lib/date';
import { todayStr } from '../lib/date';

interface Props {
  state: AppState;
  onReplaceBlocks: (blocks: ScheduledBlock[]) => void;
  onSetWeekStart: (weekStart: string) => void;
  onNavigateToDay: (date: string) => void;
}

export default function WeeklyView({
  state,
  onReplaceBlocks,
  onSetWeekStart,
  onNavigateToDay,
}: Props) {
  const weekStart = state.lastScheduledWeekStart ?? getWeekStart(todayStr());
  const weekDates: string[] = [];
  const start = new Date(weekStart + 'T12:00:00');
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    weekDates.push(d.toISOString().slice(0, 10));
  }

  const blocksByDate = state.scheduledBlocks.reduce<Record<string, ScheduledBlock[]>>((acc, b) => {
    if (!acc[b.date]) acc[b.date] = [];
    acc[b.date].push(b);
    return acc;
  }, {});

  const handleGenerate = () => {
    const newBlocks = runWeeklyScheduler(state, weekStart);
    onReplaceBlocks(newBlocks);
    onSetWeekStart(weekStart);
  };

  const handlePrevWeek = () => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() - 7);
    onSetWeekStart(d.toISOString().slice(0, 10));
  };

  const handleNextWeek = () => {
    const d = new Date(weekStart + 'T12:00:00');
    d.setDate(d.getDate() + 7);
    onSetWeekStart(d.toISOString().slice(0, 10));
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <h2 className="text-lg font-semibold text-stone-800">Week</h2>
      <p className="text-sm text-stone-600">
        Generate a schedule for the week. Priority: fixed events → deadlines → goal quotas. Approve or tweak.
      </p>

      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={handlePrevWeek}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
        >
          ← Prev
        </button>
        <span className="text-sm font-medium text-stone-700">
          Week of {formatDate(weekStart)}
        </span>
        <button
          type="button"
          onClick={handleNextWeek}
          className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-50"
        >
          Next →
        </button>
        <button
          type="button"
          onClick={handleGenerate}
          className="ml-auto rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          Generate week
        </button>
      </div>

      <div className="grid grid-cols-7 gap-2">
        {weekDates.map((date) => {
          const dayBlocks = (blocksByDate[date] ?? []).sort((a, b) => a.sortOrder - b.sortOrder);
          const isToday = date === todayStr();

          return (
            <div
              key={date}
              className={`rounded-lg border p-2 min-h-[120px] ${
                isToday ? 'border-blue-400 bg-blue-50/50' : 'border-stone-200 bg-stone-50/50'
              }`}
            >
              <button
                type="button"
                onClick={() => onNavigateToDay(date)}
                className="text-left w-full text-xs font-medium text-stone-700 hover:underline"
              >
                {formatDate(date)}
              </button>
              <ul className="mt-1 space-y-0.5">
                {dayBlocks.slice(0, 4).map((b) => (
                  <li key={b.id} className="text-xs text-stone-600 truncate" title={b.startTime}>
                    {b.startTime} {b.energyType}
                  </li>
                ))}
                {dayBlocks.length > 4 && (
                  <li className="text-xs text-stone-400">+{dayBlocks.length - 4}</li>
                )}
              </ul>
            </div>
          );
        })}
      </div>

      {state.scheduledBlocks.length === 0 && (
        <p className="text-sm text-stone-500 py-4">
          No schedule yet. Add goals and tasks, then click &quot;Generate week&quot;.
        </p>
      )}
    </div>
  );
}
