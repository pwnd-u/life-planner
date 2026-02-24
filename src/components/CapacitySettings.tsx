import type { CapacitySettings } from '../types';

interface Props {
  capacity: CapacitySettings;
  onChange: (c: CapacitySettings) => void;
}

export default function CapacitySettingsForm({ capacity, onChange }: Props) {
  const update = (patch: Partial<CapacitySettings>) => onChange({ ...capacity, ...patch });

  return (
    <div className="space-y-6 max-w-md">
      <h2 className="text-lg font-semibold text-stone-800">Capacity</h2>
      <p className="text-sm text-stone-600">
        Set your weekly availability. The scheduler will never exceed these limits.
      </p>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Weekly discretionary hours
        </label>
        <input
          type="number"
          min={1}
          max={80}
          value={capacity.weeklyDiscretionaryHours}
          onChange={(e) => update({ weeklyDiscretionaryHours: Number(e.target.value) || 1 })}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Sleep start</label>
          <input
            type="time"
            value={capacity.sleepStart}
            onChange={(e) => update({ sleepStart: e.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Sleep end</label>
          <input
            type="time"
            value={capacity.sleepEnd}
            onChange={(e) => update({ sleepEnd: e.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Work start</label>
          <input
            type="time"
            value={capacity.workStart}
            onChange={(e) => update({ workStart: e.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-stone-700 mb-1">Work end</label>
          <input
            type="time"
            value={capacity.workEnd}
            onChange={(e) => update({ workEnd: e.target.value })}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
          />
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Work days per week</label>
        <input
          type="number"
          min={0}
          max={7}
          value={capacity.workDays}
          onChange={(e) => update({ workDays: Number(e.target.value) || 0 })}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Max deep-work blocks per day
        </label>
        <input
          type="number"
          min={1}
          max={5}
          value={capacity.maxDeepBlocksPerDay}
          onChange={(e) => update({ maxDeepBlocksPerDay: Number(e.target.value) || 1 })}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
        <p className="text-xs text-stone-500 mt-1">Recommended: 3</p>
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">
          Max planned hours per day
        </label>
        <input
          type="number"
          min={1}
          max={12}
          step={0.5}
          value={capacity.maxPlannedHoursPerDay}
          onChange={(e) => update({ maxPlannedHoursPerDay: Number(e.target.value) || 1 })}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-stone-700 mb-1">Buffer %</label>
        <input
          type="number"
          min={15}
          max={40}
          value={capacity.bufferPercent}
          onChange={(e) => update({ bufferPercent: Number(e.target.value) || 20 })}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        />
        <p className="text-xs text-stone-500 mt-1">Tasks get +{capacity.bufferPercent}% time</p>
      </div>
    </div>
  );
}
