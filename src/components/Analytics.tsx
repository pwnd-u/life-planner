import { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
  ReferenceLine,
  Cell,
} from 'recharts';
import type { DailyRecurringItem, DailyItemLog } from '../types';
import { todayStr } from '../lib/date';

interface Props {
  dailyRecurringItems: DailyRecurringItem[];
  dailyItemLogs: DailyItemLog[];
}

type Range = '7' | '14' | '30' | '90';

function getDatesInRange(endDate: string, days: number): string[] {
  const dates: string[] = [];
  const end = new Date(endDate + 'T12:00:00');
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }
  return dates;
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function getDayOfWeek(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { weekday: 'short' });
}

export default function Analytics({ dailyRecurringItems: items, dailyItemLogs: logs }: Props) {
  const [range, setRange] = useState<Range>('14');
  const today = todayStr();
  const days = Number(range);

  const dates = useMemo(() => getDatesInRange(today, days), [today, days]);

  const logMap = useMemo(() => {
    const m = new Map<string, DailyItemLog>();
    for (const l of logs) m.set(`${l.dailyItemId}:${l.date}`, l);
    return m;
  }, [logs]);

  // --- Completion rate per day ---
  const dailyCompletionData = useMemo(() => {
    if (items.length === 0) return [];
    return dates.map((date) => {
      let done = 0;
      let total = 0;
      for (const item of items) {
        const log = logMap.get(`${item.id}:${date}`);
        if (log) {
          total++;
          if (log.done) done++;
        }
      }
      return {
        date,
        displayDate: formatShortDate(date),
        rate: total > 0 ? Math.round((done / total) * 100) : 0,
        done,
        total,
      };
    });
  }, [dates, items, logMap]);

  // --- Per-item streak & completion % ---
  const itemStats = useMemo(() => {
    return items.map((item) => {
      let streak = 0;
      let doneCount = 0;
      let loggedDays = 0;
      for (let i = dates.length - 1; i >= 0; i--) {
        const log = logMap.get(`${item.id}:${dates[i]}`);
        if (log) {
          loggedDays++;
          if (log.done) {
            doneCount++;
            if (i === dates.length - 1 - (dates.length - 1 - i)) {
              // counting from latest
            }
          }
        }
      }

      // Streak: count from most recent backwards
      for (let i = dates.length - 1; i >= 0; i--) {
        const log = logMap.get(`${item.id}:${dates[i]}`);
        if (log?.done) streak++;
        else break;
      }

      const pct = loggedDays > 0 ? Math.round((doneCount / loggedDays) * 100) : 0;

      return { id: item.id, title: item.title, streak, doneCount, loggedDays, pct };
    }).sort((a, b) => b.pct - a.pct);
  }, [items, dates, logMap]);

  // --- Day-of-week completion rate ---
  const dayOfWeekData = useMemo(() => {
    if (items.length === 0) return [];
    const buckets: Record<string, { done: number; total: number }> = {};
    const weekdays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    for (const wd of weekdays) buckets[wd] = { done: 0, total: 0 };
    for (const date of dates) {
      const wd = getDayOfWeek(date);
      for (const item of items) {
        const log = logMap.get(`${item.id}:${date}`);
        if (log) {
          buckets[wd].total++;
          if (log.done) buckets[wd].done++;
        }
      }
    }
    return weekdays.map((wd) => ({
      day: wd,
      rate: buckets[wd].total > 0 ? Math.round((buckets[wd].done / buckets[wd].total) * 100) : 0,
    }));
  }, [dates, items, logMap]);

  // --- Per-item heatmap grid ---
  const heatmapDates = useMemo(
    () => (days > 30 ? getDatesInRange(today, 30) : dates),
    [today, days, dates]
  );

  // Overall stats
  const totalDone = itemStats.reduce((s, i) => s + i.doneCount, 0);
  const totalLogged = itemStats.reduce((s, i) => s + i.loggedDays, 0);
  const overallPct = totalLogged > 0 ? Math.round((totalDone / totalLogged) * 100) : 0;
  const bestStreak = itemStats.length > 0 ? Math.max(...itemStats.map((i) => i.streak)) : 0;

  if (items.length === 0) {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-stone-800">Analytics</h2>
        <p className="text-base text-stone-500 py-8 text-center">
          No daily items yet. Go to Calendar → Day view and add recurring daily items to start tracking.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-stone-800">Analytics</h2>
        <div className="flex gap-2">
          {(['7', '14', '30', '90'] as Range[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRange(r)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                range === r ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {r}d
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-stone-800">{overallPct}%</p>
          <p className="mt-1 text-sm text-stone-500">Overall completion</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-stone-800">{bestStreak}</p>
          <p className="mt-1 text-sm text-stone-500">Best streak (days)</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-stone-800">{totalDone}</p>
          <p className="mt-1 text-sm text-stone-500">Items done</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4 text-center">
          <p className="text-3xl font-bold text-stone-800">{items.length}</p>
          <p className="mt-1 text-sm text-stone-500">Daily items</p>
        </div>
      </div>

      {/* Daily completion rate chart */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500 mb-3">Daily Completion Rate</h3>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={dailyCompletionData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={false} width={30} />
            <Tooltip
              formatter={(value: number) => [`${value}%`, 'Completion']}
              labelFormatter={(label) => `${label}`}
            />
            <ReferenceLine y={80} stroke="#a3a3a3" strokeDasharray="4 4" label={{ value: '80%', fontSize: 10, fill: '#a3a3a3' }} />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
              {dailyCompletionData.map((entry, index) => (
                <Cell key={index} fill={entry.rate >= 80 ? '#16a34a' : entry.rate >= 50 ? '#f59e0b' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-item stats table */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500 mb-3">Per-Item Performance</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 text-left text-stone-500">
                <th className="pb-2 pr-4 font-medium">Item</th>
                <th className="pb-2 pr-4 font-medium text-center">Done</th>
                <th className="pb-2 pr-4 font-medium text-center">Streak</th>
                <th className="pb-2 font-medium text-center">Rate</th>
              </tr>
            </thead>
            <tbody>
              {itemStats.map((s) => (
                <tr key={s.id} className="border-b border-stone-100">
                  <td className="py-2 pr-4 font-medium text-stone-800">{s.title}</td>
                  <td className="py-2 pr-4 text-center text-stone-600">{s.doneCount}/{s.loggedDays}</td>
                  <td className="py-2 pr-4 text-center">
                    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-bold ${s.streak >= 7 ? 'bg-green-100 text-green-700' : s.streak >= 3 ? 'bg-amber-100 text-amber-700' : 'bg-stone-100 text-stone-500'}`}>
                      {s.streak}d
                    </span>
                  </td>
                  <td className="py-2 text-center">
                    <div className="flex items-center gap-2 justify-center">
                      <div className="h-2 w-16 rounded-full bg-stone-200 overflow-hidden">
                        <div
                          className={`h-full rounded-full ${s.pct >= 80 ? 'bg-green-500' : s.pct >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
                          style={{ width: `${s.pct}%` }}
                        />
                      </div>
                      <span className="text-xs text-stone-500 w-8 text-right">{s.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Day of week pattern */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500 mb-3">Best & Worst Days</h3>
        <p className="text-xs text-stone-400 mb-3">Which days of the week are you most consistent?</p>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={dayOfWeekData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
            <XAxis dataKey="day" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={false} width={30} />
            <Tooltip formatter={(value: number) => [`${value}%`, 'Completion']} />
            <Bar dataKey="rate" radius={[4, 4, 0, 0]}>
              {dayOfWeekData.map((entry, index) => (
                <Cell key={index} fill={entry.rate >= 80 ? '#16a34a' : entry.rate >= 50 ? '#f59e0b' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Heatmap grid */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500 mb-3">Heatmap (last {heatmapDates.length} days)</h3>
        <div className="overflow-x-auto">
          <table className="text-xs">
            <thead>
              <tr>
                <th className="pr-2 pb-1 text-left font-medium text-stone-400 sticky left-0 bg-white">Item</th>
                {heatmapDates.map((d) => (
                  <th key={d} className="px-0.5 pb-1 font-normal text-stone-400 min-w-[18px] text-center" title={d}>
                    {new Date(d + 'T12:00:00').getDate()}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td className="pr-2 py-0.5 text-stone-700 truncate max-w-[120px] sticky left-0 bg-white">{item.title}</td>
                  {heatmapDates.map((d) => {
                    const log = logMap.get(`${item.id}:${d}`);
                    const bg = !log ? 'bg-stone-100' : log.done ? 'bg-green-500' : 'bg-red-300';
                    return (
                      <td key={d} className="px-0.5 py-0.5">
                        <div className={`w-4 h-4 rounded-sm ${bg}`} title={`${item.title} — ${d}: ${!log ? 'no log' : log.done ? 'done' : 'missed'}`} />
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-2 flex items-center gap-3 text-xs text-stone-500">
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-green-500 inline-block" /> Done</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-300 inline-block" /> Missed</span>
          <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-stone-100 inline-block" /> No log</span>
        </div>
      </div>

      {/* Trend line */}
      <div className="rounded-xl border border-stone-200 bg-white p-4">
        <h3 className="text-sm font-bold uppercase tracking-wide text-stone-500 mb-3">Completion Trend (7-day rolling avg)</h3>
        <RollingAvgChart data={dailyCompletionData} />
      </div>
    </div>
  );
}

function RollingAvgChart({ data }: { data: { date: string; displayDate: string; rate: number }[] }) {
  const rollingData = useMemo(() => {
    if (data.length < 7) return data.map((d) => ({ ...d, rolling: d.rate }));
    return data.map((d, i) => {
      if (i < 6) return { ...d, rolling: null as number | null };
      const window = data.slice(i - 6, i + 1);
      const avg = Math.round(window.reduce((s, w) => s + w.rate, 0) / 7);
      return { ...d, rolling: avg };
    });
  }, [data]);

  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={rollingData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
        <XAxis dataKey="displayDate" tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} />
        <YAxis domain={[0, 100]} tick={{ fontSize: 10, fill: '#78716c' }} tickLine={false} axisLine={false} width={30} />
        <Tooltip formatter={(value: number | null) => [value != null ? `${value}%` : '—', '7d avg']} />
        <ReferenceLine y={80} stroke="#a3a3a3" strokeDasharray="4 4" />
        <Line type="monotone" dataKey="rolling" stroke="#44403c" strokeWidth={2} dot={false} connectNulls />
      </LineChart>
    </ResponsiveContainer>
  );
}
