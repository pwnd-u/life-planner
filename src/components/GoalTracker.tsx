import { useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import type { TrackedGoal, GoalLog } from '../types';
import type { NumericDirection, FrequencyPeriod } from '../types';
import { getNumericProgress, getLogForDate, getChartData, getFrequencyChartData, getWeeklyLogsForGoal, getPeriodDateForFrequency, getFrequencyCount } from '../lib/goalProgress';
import { todayStr, getWeekStart, formatWeekLabel } from '../lib/date';

type GoalTrackerTab = 'all' | 'habits' | 'targets';

interface Props {
  trackedGoals: TrackedGoal[];
  goalLogs: GoalLog[];
  onAddGoal: (g: Omit<TrackedGoal, 'id'>) => void;
  onUpdateGoal: (id: string, patch: Partial<TrackedGoal>) => void;
  onRemoveGoal: (id: string) => void;
  onAddOrUpdateLog: (
    trackedGoalId: string,
    date: string,
    payload: { value?: number } | { done?: boolean; note?: string }
  ) => void;
}

function filterGoalsByTab(goals: TrackedGoal[], tab: GoalTrackerTab): TrackedGoal[] {
  if (tab === 'all') return goals;
  if (tab === 'habits') return goals.filter((g) => !g.deadline);
  return goals.filter((g) => !!g.deadline);
}

export default function GoalTracker({
  trackedGoals,
  goalLogs,
  onAddGoal,
  onUpdateGoal,
  onRemoveGoal,
  onAddOrUpdateLog,
}: Props) {
  const [tab, setTab] = useState<GoalTrackerTab>('all');
  const [showForm, setShowForm] = useState(false);
  const [editingGoal, setEditingGoal] = useState<TrackedGoal | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<'numeric' | 'verbal' | 'weekly' | 'frequency'>('numeric');
  const [targetValue, setTargetValue] = useState('');
  const [direction, setDirection] = useState<NumericDirection>('decrease');
  const [unit, setUnit] = useState('');
  const [startValue, setStartValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [weeklyTargetDescription, setWeeklyTargetDescription] = useState('');
  const [frequencyPeriod, setFrequencyPeriod] = useState<FrequencyPeriod>('day');
  const [frequencyTargetCount, setFrequencyTargetCount] = useState('');
  const [deadline, setDeadline] = useState('');
  const today = todayStr();

  const filteredGoals = filterGoalsByTab(trackedGoals, tab);

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (type === 'numeric' && (targetValue === '' || targetValue == null)) return;
    if (type === 'frequency' && (!frequencyTargetCount.trim() || Number(frequencyTargetCount) < 1)) return;
    onAddGoal({
      name: name.trim(),
      type,
      deadline: deadline.trim() || undefined,
      ...(type === 'numeric' && {
        targetValue: Number(targetValue),
        direction,
        unit: unit.trim() || undefined,
        startValue: startValue === '' ? undefined : Number(startValue),
        startDate: startDate.trim() || undefined,
      }),
      ...(type === 'weekly' && {
        weeklyTargetDescription: weeklyTargetDescription.trim() || undefined,
      }),
      ...(type === 'frequency' && {
        period: frequencyPeriod,
        targetCount: Number(frequencyTargetCount),
      }),
    });
    setName('');
    setType('numeric');
    setTargetValue('');
    setDirection('decrease');
    setUnit('');
    setStartValue('');
    setStartDate('');
    setWeeklyTargetDescription('');
    setFrequencyPeriod('day');
    setFrequencyTargetCount('');
    setDeadline('');
    setShowForm(false);
  };

  const handleOpenEdit = (goal: TrackedGoal) => {
    setEditingGoal(goal);
    setName(goal.name);
    setDeadline(goal.deadline ?? '');
    setType(goal.type);
    setTargetValue(goal.targetValue != null ? String(goal.targetValue) : '');
    setDirection(goal.direction ?? 'decrease');
    setUnit(goal.unit ?? '');
    setStartValue(goal.startValue != null ? String(goal.startValue) : '');
    setStartDate(goal.startDate ?? '');
    setWeeklyTargetDescription(goal.weeklyTargetDescription ?? '');
    setFrequencyPeriod(goal.period ?? 'day');
    setFrequencyTargetCount(goal.targetCount != null ? String(goal.targetCount) : '');
  };

  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGoal || !name.trim()) return;
    const patch: Partial<TrackedGoal> = {
      name: name.trim(),
      deadline: deadline.trim() || undefined,
    };
    if (editingGoal.type === 'numeric') {
      patch.targetValue = targetValue !== '' ? Number(targetValue) : undefined;
      patch.direction = direction;
      patch.unit = unit.trim() || undefined;
      patch.startValue = startValue !== '' ? Number(startValue) : undefined;
      patch.startDate = startDate.trim() || undefined;
    }
    if (editingGoal.type === 'weekly') patch.weeklyTargetDescription = weeklyTargetDescription.trim() || undefined;
    if (editingGoal.type === 'frequency') {
      patch.period = frequencyPeriod;
      patch.targetCount = frequencyTargetCount !== '' ? Number(frequencyTargetCount) : undefined;
    }
    onUpdateGoal(editingGoal.id, patch);
    setEditingGoal(null);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-stone-800">Goal Tracker</h2>
      <p className="text-sm text-stone-600">
        Track numeric goals (weight, savings…), verbal (daily check-in), weekly (yes/no per week), or frequency (e.g. 3x/day, 4x/week). Set a deadline for targets (e.g. 82 kg by June).
      </p>

      <div className="flex flex-wrap gap-2">
        {(['all', 'habits', 'targets'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === t ? 'bg-stone-800 text-white' : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
            }`}
          >
            {t === 'all' ? 'All' : t === 'habits' ? 'Habits (ongoing)' : 'Targets (by deadline)'}
          </button>
        ))}
      </div>

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          + Add tracked goal
        </button>
      )}

      {showForm && (
        <form onSubmit={handleCreate} className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <input
            type="text"
            placeholder="Goal name (e.g. Reduce weight)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            autoFocus
          />
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Type</label>
            <select
              value={type}
              onChange={(e) => setType(e.target.value as 'numeric' | 'verbal' | 'weekly' | 'frequency')}
              className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            >
              <option value="numeric">Numeric (e.g. weight, savings, time)</option>
              <option value="verbal">Verbal (daily check-in, no number)</option>
              <option value="weekly">Weekly (yes/no per week, e.g. 10 jobs/week)</option>
              <option value="frequency">Frequency (e.g. 3x/day, 4x/week)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-0.5">Deadline (optional)</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
            <p className="text-xs text-stone-500 mt-0.5">e.g. reach 82 kg by June → set to last day of June.</p>
          </div>
          {type === 'frequency' && (
            <div className="space-y-2">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-0.5">Period</label>
                <select
                  value={frequencyPeriod}
                  onChange={(e) => setFrequencyPeriod(e.target.value as FrequencyPeriod)}
                  className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
                >
                  <option value="day">Per day</option>
                  <option value="week">Per week</option>
                  <option value="month">Per month</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-0.5">Target count (how many times)</label>
                <input
                  type="number"
                  min={1}
                  placeholder="e.g. 3"
                  value={frequencyTargetCount}
                  onChange={(e) => setFrequencyTargetCount(e.target.value)}
                  className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
                />
                <p className="text-xs text-stone-500 mt-0.5">Tap “Log once” each time you do it. Progress resets each period.</p>
              </div>
            </div>
          )}
          {type === 'weekly' && (
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Target description (optional)</label>
              <input
                type="text"
                placeholder="e.g. 10 applications"
                value={weeklyTargetDescription}
                onChange={(e) => setWeeklyTargetDescription(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
              <p className="text-xs text-stone-500 mt-0.5">You’ll log each week as Done or Not done.</p>
            </div>
          )}
          {type === 'numeric' && (
            <>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-1">Direction</label>
                <select
                  value={direction}
                  onChange={(e) => setDirection(e.target.value as NumericDirection)}
                  className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
                >
                  <option value="decrease">Decrease (e.g. weight 90 → 82)</option>
                  <option value="increase">Increase (e.g. savings 1k → 5k)</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-stone-500 mb-0.5">Target value</label>
                  <input
                    type="number"
                    step="any"
                    placeholder={direction === 'decrease' ? '82' : '5000'}
                    value={targetValue}
                    onChange={(e) => setTargetValue(e.target.value)}
                    className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-xs text-stone-500 mb-0.5">Unit (optional)</label>
                  <input
                    type="text"
                    placeholder="kg, min, $"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
                  />
                </div>
              </div>
              <div className="rounded border border-stone-200 bg-stone-100/50 p-3 space-y-2">
                <p className="text-xs font-medium text-stone-700">Starting point (chart begins here)</p>
                <p className="text-xs text-stone-500">e.g. weight was 91 kg on Jan 1 — enter both so the chart shows progress from this value.</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-stone-500 mb-0.5">Start value</label>
                    <input
                      type="number"
                      step="any"
                      placeholder={direction === 'decrease' ? '91' : '1000'}
                      value={startValue}
                      onChange={(e) => setStartValue(e.target.value)}
                      className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-0.5">Start date</label>
                    <input
                      type="date"
                      value={startDate}
                      onChange={(e) => setStartDate(e.target.value)}
                      className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Add goal
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      <ul className="space-y-4">
        {filteredGoals.map((goal) => (
          <TrackedGoalCard
            key={goal.id}
            goal={goal}
            goalLogs={goalLogs}
            today={today}
            onEditGoal={handleOpenEdit}
            onRemoveGoal={onRemoveGoal}
            onAddOrUpdateLog={onAddOrUpdateLog}
          />
        ))}
      </ul>

      {filteredGoals.length === 0 && !showForm && (
        <p className="text-sm text-stone-500 py-4">
          {tab === 'all' && 'No tracked goals yet. Add one to log progress (e.g. weight 90→82 kg, or a verbal goal).'}
          {tab === 'habits' && 'No ongoing habits. Add a goal without a deadline (verbal, weekly, or frequency).'}
          {tab === 'targets' && 'No goals with a deadline. Edit a goal and set a deadline (e.g. reach 82 kg by June).'}
        </p>
      )}

      {editingGoal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setEditingGoal(null)}>
          <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-800">Edit goal</h3>
            <form onSubmit={handleSaveEdit} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-0.5">Name</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" required />
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-0.5">Deadline (optional, YYYY-MM-DD)</label>
                <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                <p className="text-xs text-stone-500 mt-0.5">e.g. reach 82 kg by end of June → 2025-06-30</p>
              </div>
              {editingGoal.type === 'numeric' && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">Target value</label>
                      <input type="number" step="any" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                    </div>
                    <div>
                      <label className="block text-xs text-stone-500 mb-0.5">Unit</label>
                      <input type="text" placeholder="kg, $" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-0.5">Direction</label>
                    <select value={direction} onChange={(e) => setDirection(e.target.value as NumericDirection)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900">
                      <option value="decrease">Decrease</option>
                      <option value="increase">Increase</option>
                    </select>
                  </div>
                  <div className="rounded border border-stone-200 bg-stone-100/50 p-3 space-y-2">
                    <p className="text-xs font-medium text-stone-700">Starting point (chart begins here)</p>
                    <p className="text-xs text-stone-500">e.g. weight was 91 kg on Jan 1 — set both so the chart shows progress from this value.</p>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-xs text-stone-500 mb-0.5">Start value</label>
                        <input type="number" step="any" placeholder="91" value={startValue} onChange={(e) => setStartValue(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                      </div>
                      <div>
                        <label className="block text-xs text-stone-500 mb-0.5">Start date</label>
                        <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                      </div>
                    </div>
                  </div>
                </>
              )}
              {editingGoal.type === 'weekly' && (
                <div>
                  <label className="block text-xs text-stone-500 mb-0.5">Target description (optional)</label>
                  <input type="text" placeholder="e.g. 10 applications" value={weeklyTargetDescription} onChange={(e) => setWeeklyTargetDescription(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                </div>
              )}
              {editingGoal.type === 'frequency' && (
                <>
                  <div>
                    <label className="block text-xs text-stone-500 mb-0.5">Period</label>
                    <select value={frequencyPeriod} onChange={(e) => setFrequencyPeriod(e.target.value as FrequencyPeriod)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900">
                      <option value="day">Per day</option>
                      <option value="week">Per week</option>
                      <option value="month">Per month</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-0.5">Target count</label>
                    <input type="number" min={1} value={frequencyTargetCount} onChange={(e) => setFrequencyTargetCount(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                  </div>
                </>
              )}
              <div className="flex gap-2 pt-2">
                <button type="submit" className="rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Save</button>
                <button type="button" onClick={() => setEditingGoal(null)} className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const CHART_PADDING = 2; // extra units above/below so line isn't on the edge
const FREQUENCY_CHART_TOLERANCE = 5; // ±5 band around target on frequency chart

function FrequencyGoalChart({
  goal,
  goalLogs,
  isOpen,
  onToggle,
}: {
  goal: TrackedGoal;
  goalLogs: GoalLog[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (goal.type !== 'frequency' || !goal.period || goal.targetCount == null) return null;
  const chartData = getFrequencyChartData(goalLogs, goal.id, goal.period);
  const target = goal.targetCount;
  const low = Math.max(0, target - FREQUENCY_CHART_TOLERANCE);
  const high = target + FREQUENCY_CHART_TOLERANCE;
  const dataMin = chartData.length ? Math.min(...chartData.map((d) => d.value)) : 0;
  const dataMax = chartData.length ? Math.max(...chartData.map((d) => d.value)) : target;
  const yMin = Math.min(low, dataMin) - CHART_PADDING;
  const yMax = Math.max(high, dataMax) + CHART_PADDING;

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        className="text-sm font-medium text-stone-600 hover:text-stone-800 underline"
      >
        {isOpen ? 'Hide chart' : 'View chart'}
      </button>
      {isOpen && (
        <div className="mt-2 rounded border border-stone-200 bg-stone-50/50 p-2" style={{ width: '100%', minHeight: 200 }}>
          {chartData.length === 0 ? (
            <p className="text-sm text-stone-500 py-8 text-center">Log at least one period to see the chart.</p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                />
                <YAxis
                  domain={[yMin, yMax]}
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  allowDataOverflow
                />
                <Tooltip
                  contentStyle={{ borderRadius: 6, border: '1px solid #e5e5e5' }}
                  formatter={(value: number | undefined) => [value != null ? String(value) : '—', 'Count']}
                  labelFormatter={(label) => label}
                />
                <ReferenceLine
                  y={target}
                  stroke="#44403c"
                  strokeDasharray="4 4"
                  label={{ value: `Target ${target}`, fontSize: 10, fill: '#44403c' }}
                />
                <ReferenceLine
                  y={high}
                  stroke="#a8a29e"
                  strokeDasharray="2 2"
                  label={{ value: `+${FREQUENCY_CHART_TOLERANCE}`, fontSize: 9, fill: '#a8a29e' }}
                />
                <ReferenceLine
                  y={low}
                  stroke="#a8a29e"
                  strokeDasharray="2 2"
                  label={{ value: `−${FREQUENCY_CHART_TOLERANCE}`, fontSize: 9, fill: '#a8a29e' }}
                />
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#44403c"
                  strokeWidth={2}
                  dot={{ fill: '#44403c', r: 4 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

function NumericGoalChart({
  goal,
  goalLogs,
  unitStr,
  isOpen,
  onToggle,
}: {
  goal: TrackedGoal;
  goalLogs: GoalLog[];
  unitStr: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const chartData = getChartData(goalLogs, goal.id, goal);
  const target = goal.targetValue ?? 0;
  const isDecrease = goal.direction === 'decrease';
  const startVal = goal.startValue;

  const yDomain = ((): [number, number] => {
    if (chartData.length === 0) {
      if (isDecrease) return [Math.max(0, target - 5), (startVal ?? target) + CHART_PADDING];
      return [Math.min(startVal ?? target, target) - CHART_PADDING, target + 5];
    }
    const values = chartData.map((d) => d.value);
    const dataMin = Math.min(...values);
    const dataMax = Math.max(...values);
    const withStart = startVal != null ? [dataMin, dataMax, startVal] : [dataMin, dataMax];
    const minVal = Math.min(...withStart);
    const maxVal = Math.max(...withStart);
    if (isDecrease) {
      const yMin = Math.min(target - 5, minVal);
      const yMax = Math.max(maxVal, target) + CHART_PADDING;
      return [yMin, yMax];
    }
    const yMin = Math.min(minVal, target) - CHART_PADDING;
    const yMax = Math.max(target + 5, maxVal);
    return [yMin, yMax];
  })();

  return (
    <div className="mt-3">
      <button
        type="button"
        onClick={onToggle}
        className="text-sm font-medium text-stone-600 hover:text-stone-800 underline"
      >
        {isOpen ? 'Hide chart' : 'View chart'}
      </button>
      {isOpen && (
        <div className="mt-2 rounded border border-stone-200 bg-stone-50/50 p-2" style={{ width: '100%', minHeight: 200 }}>
          {chartData.length === 0 ? (
            <p className="text-sm text-stone-500 py-8 text-center">
              Log at least one value to see the chart. Or set a <strong>start value</strong> and <strong>start date</strong> when adding/editing this goal (e.g. weight 91 on Jan 1) so the chart begins there.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis
                  dataKey="displayDate"
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                />
                <YAxis
                  domain={yDomain}
                  tick={{ fontSize: 11, fill: '#78716c' }}
                  tickLine={false}
                  axisLine={false}
                  width={36}
                  allowDataOverflow
                />
                <Tooltip
                  contentStyle={{ borderRadius: 6, border: '1px solid #e5e5e5' }}
                  formatter={(value: number | undefined) => [value != null ? `${value}${unitStr}` : '—', 'Value']}
                  labelFormatter={(label) => `Date: ${label}`}
                />
                {goal.targetValue != null && (
                  <ReferenceLine
                    y={goal.targetValue}
                    stroke="#78716c"
                    strokeDasharray="4 4"
                    label={{ value: `Target ${goal.targetValue}${unitStr}`, fontSize: 10, fill: '#78716c' }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="value"
                  stroke="#44403c"
                  strokeWidth={2}
                  dot={{ fill: '#44403c', r: 4 }}
                  activeDot={{ r: 5 }}
                  connectNulls={false}
                  isAnimationActive={true}
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

function formatDeadline(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', day: 'numeric' });
}

function TrackedGoalCard({
  goal,
  goalLogs,
  today,
  onEditGoal,
  onRemoveGoal,
  onAddOrUpdateLog,
}: {
  goal: TrackedGoal;
  goalLogs: GoalLog[];
  today: string;
  onEditGoal: (goal: TrackedGoal) => void;
  onRemoveGoal: (id: string) => void;
  onAddOrUpdateLog: (
    trackedGoalId: string,
    date: string,
    payload: { value?: number } | { done?: boolean; note?: string }
  ) => void;
}) {
  const [logInput, setLogInput] = useState('');
  const [verbalNote, setVerbalNote] = useState('');
  const [weeklyNote, setWeeklyNote] = useState('');
  const [chartOpen, setChartOpen] = useState(false);
  const [frequencyChartOpen, setFrequencyChartOpen] = useState(false);

  const todayLog = getLogForDate(goalLogs, goal.id, today);
  const thisWeekStart = getWeekStart(today);
  const thisWeekLog = getLogForDate(goalLogs, goal.id, thisWeekStart);
  const progress = goal.type === 'numeric' ? getNumericProgress(goal, goalLogs) : null;
  const weeklyLogs = goal.type === 'weekly' ? getWeeklyLogsForGoal(goalLogs, goal.id) : [];
  const pastWeeklyLogs = weeklyLogs.filter((l) => l.date !== thisWeekStart).slice(0, 6);
  const periodDate = goal.type === 'frequency' && goal.period ? getPeriodDateForFrequency(goal.period, today) : '';
  const frequencyCount = goal.type === 'frequency' ? getFrequencyCount(goalLogs, goal.id, periodDate) : 0;
  const frequencyTarget = goal.type === 'frequency' ? (goal.targetCount ?? 0) : 0;

  const handleLogNumeric = (e: React.FormEvent) => {
    e.preventDefault();
    const v = Number(logInput);
    if (Number.isNaN(v)) return;
    onAddOrUpdateLog(goal.id, today, { value: v });
    setLogInput('');
  };

  const handleLogVerbal = (done: boolean) => {
    onAddOrUpdateLog(goal.id, today, { done, note: verbalNote.trim() || undefined });
    if (done) setVerbalNote('');
  };

  const handleVerbalNoteBlur = () => {
    if (verbalNote.trim())
      onAddOrUpdateLog(goal.id, today, { done: todayLog?.done ?? false, note: verbalNote.trim() });
  };

  const unitStr = goal.unit ? ` ${goal.unit}` : '';

  return (
    <li className="rounded-lg border border-stone-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-medium text-stone-900">{goal.name}</span>
          {goal.type === 'numeric' && goal.targetValue != null && (
            <span className="ml-2 text-sm text-stone-500">
              {goal.direction === 'decrease' ? '↓' : '↑'} {goal.targetValue}
              {unitStr}
            </span>
          )}
          {goal.type === 'numeric' && (goal.startValue != null || goal.startDate) && (
            <span className="ml-2 text-xs text-stone-400">
              {goal.startValue != null && `Start: ${goal.startValue}${unitStr}`}
              {goal.startValue != null && goal.startDate && ' · '}
              {goal.startDate && `From ${formatDeadline(goal.startDate)}`}
            </span>
          )}
          {goal.type === 'weekly' && goal.weeklyTargetDescription && (
            <span className="ml-2 text-sm text-stone-500">— {goal.weeklyTargetDescription}/week</span>
          )}
          {goal.type === 'frequency' && goal.targetCount != null && goal.period && (
            <span className="ml-2 text-sm text-stone-500">
              — {goal.targetCount}× per {goal.period === 'day' ? 'day' : goal.period === 'week' ? 'week' : 'month'}
            </span>
          )}
          {goal.deadline && (
            <span className="ml-2 text-sm text-amber-700 font-medium">By {formatDeadline(goal.deadline)}</span>
          )}
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => onEditGoal(goal)} className="text-xs text-stone-600 hover:underline">
            Edit
          </button>
          <button type="button" onClick={() => onRemoveGoal(goal.id)} className="text-xs text-rose-600 hover:underline">
            Remove
          </button>
        </div>
      </div>

      {goal.type === 'frequency' && goal.period && frequencyTarget > 0 && (
        <div className="mt-3">
          <p className="text-xs font-medium text-stone-500 mb-1">
            {goal.period === 'day' && 'Today'}
            {goal.period === 'week' && `This week (week of ${formatWeekLabel(periodDate)})`}
            {goal.period === 'month' && (() => {
              const d = new Date(periodDate + 'T12:00:00');
              return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
            })()}
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-2xl font-bold text-stone-800">
              {frequencyCount} <span className="text-stone-400 font-normal">/ {frequencyTarget}</span>
            </span>
            <button
              type="button"
              onClick={() => onAddOrUpdateLog(goal.id, periodDate, { value: frequencyCount + 1 })}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700"
            >
              +1 Log once
            </button>
            {frequencyCount > 0 && (
              <button
                type="button"
                onClick={() => onAddOrUpdateLog(goal.id, periodDate, { value: frequencyCount - 1 })}
                className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100"
              >
                −1
              </button>
            )}
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-stone-200 overflow-hidden">
            <div
              className="h-full rounded-full bg-stone-700 transition-all"
              style={{ width: `${Math.min(100, (frequencyCount / frequencyTarget) * 100)}%` }}
            />
          </div>
          {frequencyCount >= frequencyTarget && (
            <p className="mt-1 text-sm font-medium text-green-700">Target reached for this period!</p>
          )}
          <FrequencyGoalChart
            goal={goal}
            goalLogs={goalLogs}
            isOpen={frequencyChartOpen}
            onToggle={() => setFrequencyChartOpen((v) => !v)}
          />
        </div>
      )}

      {goal.type === 'numeric' && progress && (
        <div className="mt-3">
          {progress.start === progress.target && progress.current == null ? (
            <p className="text-sm text-stone-500">Log your first value below (or set a starting value when creating the goal) to see progress.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2 text-sm text-stone-600">
                <span>
                  {progress.start}
                  {unitStr} → {progress.target}
                  {unitStr}
                </span>
                {progress.current != null && (
                  <span className="font-medium text-stone-800">
                    · current: {progress.current}
                    {unitStr}
                  </span>
                )}
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-stone-200 overflow-hidden">
                <div
                  className="h-full rounded-full bg-stone-700 transition-all"
                  style={{ width: `${Math.round(progress.progress * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-stone-500">
                {progress.progress >= 1
                  ? 'Target reached!'
                  : `${Math.round(progress.progress * 100)}% of the way there`}
                {progress.current != null && progress.progress < 1 && (
                  <span>
                    {' '}
                    · {Math.round((1 - progress.progress) * 100)}% to go
                  </span>
                )}
              </p>
            </>
          )}
          <NumericGoalChart
            goal={goal}
            goalLogs={goalLogs}
            unitStr={unitStr}
            isOpen={chartOpen}
            onToggle={() => setChartOpen((v) => !v)}
          />
        </div>
      )}

      {goal.type === 'verbal' && (
        <div className="mt-3 text-sm text-stone-600">
          {todayLog?.done != null && (
            <span className={todayLog.done ? 'text-green-700' : 'text-stone-500'}>
              Today: {todayLog.done ? 'Did something toward it' : 'Not yet'}
              {todayLog.note && ` — ${todayLog.note}`}
            </span>
          )}
        </div>
      )}

      {goal.type === 'weekly' && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-stone-500">This week (week of {formatWeekLabel(thisWeekStart)})</p>
          <div className="flex flex-wrap gap-2 items-center">
            <button
              type="button"
              onClick={() => onAddOrUpdateLog(goal.id, thisWeekStart, { done: true, note: weeklyNote.trim() || undefined })}
              className={`rounded px-3 py-1.5 text-sm ${thisWeekLog?.done ? 'bg-green-600 text-white' : 'border border-stone-300 text-stone-600 hover:bg-stone-100'}`}
            >
              Done
            </button>
            <button
              type="button"
              onClick={() => onAddOrUpdateLog(goal.id, thisWeekStart, { done: false, note: weeklyNote.trim() || undefined })}
              className={`rounded px-3 py-1.5 text-sm ${thisWeekLog?.done === false ? 'bg-amber-100 text-amber-800' : 'border border-stone-300 text-stone-600 hover:bg-stone-100'}`}
            >
              Not done
            </button>
            <input
              type="text"
              placeholder="Optional note"
              value={weeklyNote !== '' ? weeklyNote : (thisWeekLog?.note ?? '')}
              onChange={(e) => setWeeklyNote(e.target.value)}
              onBlur={() => {
                if (weeklyNote.trim() || thisWeekLog)
                  onAddOrUpdateLog(goal.id, thisWeekStart, { done: thisWeekLog?.done ?? false, note: weeklyNote.trim() || undefined });
              }}
              className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-900 w-40"
            />
          </div>
          {thisWeekLog?.done != null && (
            <span className={`text-sm ${thisWeekLog.done ? 'text-green-700' : 'text-stone-500'}`}>
              Logged: {thisWeekLog.done ? 'Done' : 'Not done'}
              {thisWeekLog.note && ` — ${thisWeekLog.note}`}
            </span>
          )}
          {pastWeeklyLogs.length > 0 && (
            <div className="pt-2 border-t border-stone-100">
              <p className="text-xs font-medium text-stone-500 mb-1">Past weeks</p>
              <ul className="text-sm text-stone-600 space-y-0.5">
                {pastWeeklyLogs.map((l) => (
                  <li key={l.id}>
                    Week of {formatWeekLabel(l.date)}: {l.done ? 'Done' : 'Not done'}
                    {l.note && ` — ${l.note}`}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {goal.type !== 'weekly' && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          <p className="text-xs font-medium text-stone-500 mb-2">Log for today</p>
          {goal.type === 'numeric' ? (
            <form onSubmit={handleLogNumeric} className="flex gap-2">
              <input
                type="number"
                step="any"
                placeholder={`Current value${unitStr}`}
                value={logInput}
                onChange={(e) => setLogInput(e.target.value)}
                className="flex-1 rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-900"
              />
              <button
                type="submit"
                className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600"
              >
                Log
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              <button
                type="button"
                onClick={() => handleLogVerbal(true)}
                className={`rounded px-3 py-1.5 text-sm ${todayLog?.done ? 'bg-green-600 text-white' : 'border border-stone-300 text-stone-600 hover:bg-stone-100'}`}
              >
                Did it today
              </button>
              <input
                type="text"
                placeholder="Optional note"
                value={verbalNote !== '' ? verbalNote : (todayLog?.note ?? '')}
                onChange={(e) => setVerbalNote(e.target.value)}
                onBlur={handleVerbalNoteBlur}
                className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-900 w-40"
              />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
