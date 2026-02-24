import { useState } from 'react';
import type { Goal, PriorityTier } from '../types';

interface Props {
  goals: Goal[];
  onAdd: (g: Omit<Goal, 'id' | 'active'>) => void;
  onRemove: (id: string) => void;
}

const TIERS: { value: PriorityTier; label: string }[] = [
  { value: 1, label: 'Tier 1 (highest)' },
  { value: 2, label: 'Tier 2' },
  { value: 3, label: 'Tier 3' },
];

export default function Goals({ goals, onAdd, onRemove }: Props) {
  const canAdd = goals.length < 3;
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState('');
  const [quotaHours, setQuotaHours] = useState<number | ''>('');
  const [quotaSessions, setQuotaSessions] = useState<number | ''>('');
  const [dailyRepetition, setDailyRepetition] = useState<number | ''>('');
  const [tier, setTier] = useState<PriorityTier>(1);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const weeklyQuotaHours = typeof quotaHours === 'number' ? quotaHours : undefined;
    const weeklyQuotaSessions = typeof quotaSessions === 'number' ? quotaSessions : undefined;
    const dailyRep = typeof dailyRepetition === 'number' ? dailyRepetition : undefined;
    if (weeklyQuotaHours == null && weeklyQuotaSessions == null && dailyRep == null) return;
    onAdd({
      name: name.trim(),
      weeklyQuotaHours: weeklyQuotaHours ?? undefined,
      weeklyQuotaSessions: weeklyQuotaSessions ?? (dailyRep != null ? dailyRep * 7 : undefined),
      dailyRepetition: dailyRep,
      priorityTier: tier,
    });
    setName('');
    setQuotaHours('');
    setQuotaSessions('');
    setDailyRepetition('');
    setTier(1);
    setShowForm(false);
  };

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-lg font-semibold text-stone-800">Goals (max 3)</h2>
      <p className="text-sm text-stone-600">
        Define up to 3 active quarterly goals. Each needs a weekly quota so the scheduler can allocate time.
      </p>

      <ul className="space-y-3">
        {goals.map((g) => (
          <li
            key={g.id}
            className="flex items-center justify-between rounded-lg border border-stone-200 bg-stone-50 p-3"
          >
            <div>
              <span className="font-medium text-stone-900">{g.name}</span>
              <span className="ml-2 text-sm text-stone-500">
                Tier {g.priorityTier}
                {g.dailyRepetition != null && ` · ${g.dailyRepetition}x/day`}
                {g.weeklyQuotaHours != null && ` · ${g.weeklyQuotaHours}h/week`}
                {g.weeklyQuotaSessions != null && g.weeklyQuotaHours == null && ` · ${g.weeklyQuotaSessions} sessions/week`}
              </span>
            </div>
            <button
              type="button"
              onClick={() => onRemove(g.id)}
              className="text-sm text-rose-600 hover:underline"
            >
              Remove
            </button>
          </li>
        ))}
      </ul>

      {canAdd && !showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          + Add goal
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <input
            type="text"
            placeholder="Goal name (e.g. Health)"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            autoFocus
          />
          <div className="flex gap-4">
            <div className="flex-1">
              <label className="block text-xs text-stone-500 mb-0.5">Quota (hours/week)</label>
              <input
                type="number"
                min={0}
                step={0.5}
                placeholder="e.g. 4"
                value={quotaHours}
                onChange={(e) => setQuotaHours(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
            </div>
            <div className="flex-1">
              <label className="block text-xs text-stone-500 mb-0.5">Or sessions/week</label>
              <input
                type="number"
                min={0}
                placeholder="e.g. 5"
                value={quotaSessions}
                onChange={(e) => setQuotaSessions(e.target.value === '' ? '' : Number(e.target.value))}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-0.5">Times per day (optional, e.g. 3 for medication)</label>
            <input
              type="number"
              min={0}
              max={20}
              placeholder="e.g. 3"
              value={dailyRepetition}
              onChange={(e) => setDailyRepetition(e.target.value === '' ? '' : Number(e.target.value))}
              className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-0.5">Priority</label>
            <select
              value={tier}
              onChange={(e) => setTier(Number(e.target.value) as PriorityTier)}
              className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            >
              {TIERS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Save
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
    </div>
  );
}
