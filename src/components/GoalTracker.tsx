import { useState, useMemo } from 'react';
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
import type { TrackedGoal, GoalLog, Objective, ObjectiveStatus } from '../types';
import type { NumericDirection, FrequencyPeriod } from '../types';
import { getNumericProgress, getLogForDate, getChartData, getFrequencyChartData, getWeeklyLogsForGoal, getPeriodDateForFrequency, getFrequencyCount, getMilestoneProgress, isKRComplete, getLastActivityDate, getObjectiveProgress } from '../lib/goalProgress';
import { todayStr, getWeekStart, formatWeekLabel } from '../lib/date';

function getCurrentQuarter(): string {
  const d = new Date();
  const q = Math.ceil((d.getMonth() + 1) / 3);
  return `${d.getFullYear()}-Q${q}`;
}

function getAvailableQuarters(objectives: Objective[]): string[] {
  const set = new Set<string>();
  set.add(getCurrentQuarter());
  for (const o of objectives) set.add(o.quarter);
  return Array.from(set).sort();
}

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
  objectives: Objective[];
  onAddObjective: (o: Omit<Objective, 'id'>) => void;
  onUpdateObjective: (id: string, patch: Partial<Objective>) => void;
  onRemoveObjective: (id: string) => void;
  onToggleMilestoneStep: (trackedGoalId: string, stepIndex: number) => void;
  onAddMilestoneStep: (trackedGoalId: string, text: string) => void;
  onRemoveMilestoneStep: (trackedGoalId: string, stepIndex: number) => void;
}

const STALENESS_THRESHOLDS: Record<string, number> = {
  numeric: 7,
  verbal: 5,
  frequency: 5,
  weekly: 10,
  milestone: 14,
};

export default function GoalTracker({
  trackedGoals,
  goalLogs,
  onAddGoal,
  onUpdateGoal,
  onRemoveGoal,
  onAddOrUpdateLog,
  objectives,
  onAddObjective,
  onUpdateObjective,
  onRemoveObjective,
  onToggleMilestoneStep,
  onAddMilestoneStep,
  onRemoveMilestoneStep,
}: Props) {
  const [selectedQuarter, setSelectedQuarter] = useState(getCurrentQuarter());
  const [showObjForm, setShowObjForm] = useState(false);
  const [editingObj, setEditingObj] = useState<Objective | null>(null);
  const [showKRForm, setShowKRForm] = useState<string | null>(null);
  const [editingGoal, setEditingGoal] = useState<TrackedGoal | null>(null);

  const [objName, setObjName] = useState('');
  const [objStatus, setObjStatus] = useState<ObjectiveStatus>('focus');
  const [objDeadline, setObjDeadline] = useState('');
  const [objDescription, setObjDescription] = useState('');

  const quarters = useMemo(() => getAvailableQuarters(objectives), [objectives]);
  const quarterObjectives = useMemo(
    () => objectives.filter((o) => o.quarter === selectedQuarter),
    [objectives, selectedQuarter]
  );
  const focusObjs = quarterObjectives.filter((o) => o.status === 'focus');
  const stretchObjs = quarterObjectives.filter((o) => o.status === 'stretch');
  const unlinkedGoals = trackedGoals.filter(
    (g) => !g.objectiveId || !objectives.some((o) => o.id === g.objectiveId)
  );

  const today = todayStr();

  const resetObjForm = () => {
    setObjName('');
    setObjStatus('focus');
    setObjDeadline('');
    setObjDescription('');
  };

  const handleCreateObj = (e: React.FormEvent) => {
    e.preventDefault();
    if (!objName.trim()) return;
    onAddObjective({
      name: objName.trim(),
      quarter: selectedQuarter,
      status: objStatus,
      deadline: objDeadline.trim() || undefined,
      description: objDescription.trim() || undefined,
    });
    resetObjForm();
    setShowObjForm(false);
  };

  const handleOpenEditObj = (obj: Objective) => {
    setEditingObj(obj);
    setObjName(obj.name);
    setObjStatus(obj.status);
    setObjDeadline(obj.deadline ?? '');
    setObjDescription(obj.description ?? '');
  };

  const handleSaveEditObj = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingObj || !objName.trim()) return;
    onUpdateObjective(editingObj.id, {
      name: objName.trim(),
      status: objStatus,
      deadline: objDeadline.trim() || undefined,
      description: objDescription.trim() || undefined,
    });
    setEditingObj(null);
    resetObjForm();
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h2 className="text-lg font-semibold text-stone-800">OKR Goal Tracker</h2>
        <div className="flex items-center gap-2">
          <label className="text-sm text-stone-500">Quarter:</label>
          <select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
            className="rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
          >
            {quarters.map((q) => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
      </div>
      <p className="text-sm text-stone-600">
        Set quarterly objectives and track key results: numeric targets, habits, milestones, and more.
      </p>

      {!showObjForm && (
        <button
          type="button"
          onClick={() => { resetObjForm(); setShowObjForm(true); }}
          className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          + Add objective
        </button>
      )}

      {showObjForm && (
        <form onSubmit={handleCreateObj} className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <input
            type="text"
            placeholder="Objective (e.g. Become healthier)"
            value={objName}
            onChange={(e) => setObjName(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-0.5">Priority</label>
              <select
                value={objStatus}
                onChange={(e) => setObjStatus(e.target.value as ObjectiveStatus)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              >
                <option value="focus">Focus (top priority)</option>
                <option value="stretch">Stretch</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-stone-500 mb-0.5">Deadline (optional)</label>
              <input type="date" value={objDeadline} onChange={(e) => setObjDeadline(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-0.5">Description / why (optional)</label>
            <input type="text" placeholder="Why this matters" value={objDescription} onChange={(e) => setObjDescription(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
          </div>
          <div className="flex gap-2">
            <button type="submit" className="rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Add objective</button>
            <button type="button" onClick={() => setShowObjForm(false)} className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Cancel</button>
          </div>
        </form>
      )}

      {focusObjs.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-stone-500 uppercase tracking-wider">Focus</h3>
          {focusObjs.map((obj) => (
            <ObjectiveSection
              key={obj.id}
              objective={obj}
              trackedGoals={trackedGoals}
              goalLogs={goalLogs}
              today={today}
              onEditObjective={handleOpenEditObj}
              onRemoveObjective={onRemoveObjective}
              onEditGoal={setEditingGoal}
              onRemoveGoal={onRemoveGoal}
              onAddOrUpdateLog={onAddOrUpdateLog}
              onToggleMilestoneStep={onToggleMilestoneStep}
              onAddMilestoneStep={onAddMilestoneStep}
              onRemoveMilestoneStep={onRemoveMilestoneStep}
              showKRFormId={showKRForm}
              onShowKRForm={setShowKRForm}
              onAddGoal={onAddGoal}
              onUpdateGoal={onUpdateGoal}
              unlinkedGoals={unlinkedGoals}
            />
          ))}
        </div>
      )}

      {stretchObjs.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-stone-500 uppercase tracking-wider">Stretch</h3>
          {stretchObjs.map((obj) => (
            <ObjectiveSection
              key={obj.id}
              objective={obj}
              trackedGoals={trackedGoals}
              goalLogs={goalLogs}
              today={today}
              onEditObjective={handleOpenEditObj}
              onRemoveObjective={onRemoveObjective}
              onEditGoal={setEditingGoal}
              onRemoveGoal={onRemoveGoal}
              onAddOrUpdateLog={onAddOrUpdateLog}
              onToggleMilestoneStep={onToggleMilestoneStep}
              onAddMilestoneStep={onAddMilestoneStep}
              onRemoveMilestoneStep={onRemoveMilestoneStep}
              showKRFormId={showKRForm}
              onShowKRForm={setShowKRForm}
              onAddGoal={onAddGoal}
              onUpdateGoal={onUpdateGoal}
              unlinkedGoals={unlinkedGoals}
            />
          ))}
        </div>
      )}

      {unlinkedGoals.length > 0 && (
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-stone-500 uppercase tracking-wider">Unlinked (no objective)</h3>
          <ul className="space-y-4">
            {unlinkedGoals.map((goal) => (
              <TrackedGoalCard
                key={goal.id}
                goal={goal}
                goalLogs={goalLogs}
                today={today}
                onEditGoal={setEditingGoal}
                onRemoveGoal={onRemoveGoal}
                onAddOrUpdateLog={onAddOrUpdateLog}
                onToggleMilestoneStep={onToggleMilestoneStep}
                onAddMilestoneStep={onAddMilestoneStep}
                onRemoveMilestoneStep={onRemoveMilestoneStep}
              />
            ))}
          </ul>
        </div>
      )}

      {quarterObjectives.length === 0 && unlinkedGoals.length === 0 && !showObjForm && (
        <p className="text-sm text-stone-500 py-4">
          No objectives for {selectedQuarter}. Add one to start tracking key results.
        </p>
      )}

      {/* Edit objective modal */}
      {editingObj && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setEditingObj(null); resetObjForm(); }}>
          <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold text-stone-800">Edit objective</h3>
            <form onSubmit={handleSaveEditObj} className="mt-4 space-y-3">
              <input type="text" value={objName} onChange={(e) => setObjName(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" required />
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-0.5">Priority</label>
                  <select value={objStatus} onChange={(e) => setObjStatus(e.target.value as ObjectiveStatus)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900">
                    <option value="focus">Focus</option>
                    <option value="stretch">Stretch</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-stone-500 mb-0.5">Deadline</label>
                  <input type="date" value={objDeadline} onChange={(e) => setObjDeadline(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-stone-500 mb-0.5">Description</label>
                <input type="text" value={objDescription} onChange={(e) => setObjDescription(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" className="rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Save</button>
                <button type="button" onClick={() => { setEditingObj(null); resetObjForm(); }} className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit KR modal */}
      {editingGoal && (
        <EditGoalModal
          goal={editingGoal}
          objectives={objectives}
          onSave={(id, patch) => { onUpdateGoal(id, patch); setEditingGoal(null); }}
          onClose={() => setEditingGoal(null)}
        />
      )}
    </div>
  );
}

// ---- Objective Section ----

function ObjectiveSection({
  objective,
  trackedGoals,
  goalLogs,
  today,
  onEditObjective,
  onRemoveObjective,
  onEditGoal,
  onRemoveGoal,
  onAddOrUpdateLog,
  onToggleMilestoneStep,
  onAddMilestoneStep,
  onRemoveMilestoneStep,
  showKRFormId,
  onShowKRForm,
  onAddGoal,
  onUpdateGoal,
  unlinkedGoals,
}: {
  objective: Objective;
  trackedGoals: TrackedGoal[];
  goalLogs: GoalLog[];
  today: string;
  onEditObjective: (o: Objective) => void;
  onRemoveObjective: (id: string) => void;
  onEditGoal: (g: TrackedGoal) => void;
  onRemoveGoal: (id: string) => void;
  onAddOrUpdateLog: Props['onAddOrUpdateLog'];
  onToggleMilestoneStep: Props['onToggleMilestoneStep'];
  onAddMilestoneStep: Props['onAddMilestoneStep'];
  onRemoveMilestoneStep: Props['onRemoveMilestoneStep'];
  showKRFormId: string | null;
  onShowKRForm: (id: string | null) => void;
  onAddGoal: Props['onAddGoal'];
  onUpdateGoal: Props['onUpdateGoal'];
  unlinkedGoals: TrackedGoal[];
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showLinkPicker, setShowLinkPicker] = useState(false);
  const krs = trackedGoals.filter((g) => g.objectiveId === objective.id);
  const progress = getObjectiveProgress(objective.id, trackedGoals, goalLogs);

  return (
    <div className="rounded-xl border border-stone-200 bg-white overflow-hidden">
      <div
        className="flex items-center justify-between gap-2 px-4 py-3 cursor-pointer hover:bg-stone-50"
        onClick={() => setCollapsed((v) => !v)}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-stone-400 text-sm">{collapsed ? '▶' : '▼'}</span>
          <span className="font-semibold text-stone-900 truncate">{objective.name}</span>
          {objective.description && (
            <span className="text-xs text-stone-400 truncate hidden sm:inline">— {objective.description}</span>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-sm text-stone-500">
            {progress.done} of {progress.total} done
            {progress.total > 0 && (
              <span className="ml-1.5 inline-flex gap-0.5">
                {krs.map((kr) => (
                  <span key={kr.id} className={`inline-block w-2 h-2 rounded-full ${isKRComplete(kr, goalLogs) ? 'bg-green-500' : 'bg-stone-300'}`} />
                ))}
              </span>
            )}
          </span>
          {objective.deadline && (
            <span className="text-xs text-amber-700 font-medium">By {formatDeadline(objective.deadline)}</span>
          )}
          <button type="button" onClick={(e) => { e.stopPropagation(); onEditObjective(objective); }} className="text-xs text-stone-500 hover:underline">Edit</button>
          <button type="button" onClick={(e) => { e.stopPropagation(); onRemoveObjective(objective.id); }} className="text-xs text-rose-500 hover:underline">Remove</button>
        </div>
      </div>

      {!collapsed && (
        <div className="border-t border-stone-100 px-4 pb-4">
          {krs.length === 0 && (
            <p className="text-sm text-stone-400 py-3">No key results yet. Add one below.</p>
          )}
          <ul className="space-y-4 mt-3">
            {krs.map((goal) => (
              <TrackedGoalCard
                key={goal.id}
                goal={goal}
                goalLogs={goalLogs}
                today={today}
                onEditGoal={onEditGoal}
                onRemoveGoal={onRemoveGoal}
                onAddOrUpdateLog={onAddOrUpdateLog}
                onToggleMilestoneStep={onToggleMilestoneStep}
                onAddMilestoneStep={onAddMilestoneStep}
                onRemoveMilestoneStep={onRemoveMilestoneStep}
              />
            ))}
          </ul>

          {showKRFormId === objective.id ? (
            <AddKRForm
              objectiveId={objective.id}
              onAddGoal={onAddGoal}
              onClose={() => onShowKRForm(null)}
            />
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => onShowKRForm(objective.id)}
                className="text-sm font-medium text-[var(--adhd-accent,#57534e)] hover:underline"
              >
                + Add key result
              </button>
              {unlinkedGoals.length > 0 && (
                <>
                  {!showLinkPicker ? (
                    <button
                      type="button"
                      onClick={() => setShowLinkPicker(true)}
                      className="text-sm font-medium text-stone-500 hover:underline"
                    >
                      Link existing
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        defaultValue=""
                        onChange={(e) => {
                          if (e.target.value) {
                            onUpdateGoal(e.target.value, { objectiveId: objective.id });
                            setShowLinkPicker(false);
                          }
                        }}
                        className="rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
                      >
                        <option value="" disabled>Pick a key result…</option>
                        {unlinkedGoals.map((g) => (
                          <option key={g.id} value={g.id}>{g.name} ({g.type})</option>
                        ))}
                      </select>
                      <button type="button" onClick={() => setShowLinkPicker(false)} className="text-xs text-stone-400 hover:text-stone-600">Cancel</button>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Add KR Form (inline under an objective) ----

function AddKRForm({
  objectiveId,
  onAddGoal,
  onClose,
}: {
  objectiveId: string;
  onAddGoal: Props['onAddGoal'];
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [type, setType] = useState<TrackedGoal['type']>('numeric');
  const [targetValue, setTargetValue] = useState('');
  const [direction, setDirection] = useState<NumericDirection>('decrease');
  const [unit, setUnit] = useState('');
  const [startValue, setStartValue] = useState('');
  const [startDate, setStartDate] = useState('');
  const [weeklyTargetDescription, setWeeklyTargetDescription] = useState('');
  const [frequencyPeriod, setFrequencyPeriod] = useState<FrequencyPeriod>('day');
  const [frequencyTargetCount, setFrequencyTargetCount] = useState('');
  const [deadline, setDeadline] = useState('');
  const [milestoneStepInputs, setMilestoneStepInputs] = useState<string[]>(['']);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    if (type === 'numeric' && (targetValue === '' || targetValue == null)) return;
    if (type === 'frequency' && (!frequencyTargetCount.trim() || Number(frequencyTargetCount) < 1)) return;
    if (type === 'milestone') {
      const steps = milestoneStepInputs.filter((s) => s.trim()).map((s) => ({ text: s.trim(), done: false }));
      if (steps.length === 0) return;
      onAddGoal({
        name: name.trim(),
        type: 'milestone',
        objectiveId,
        deadline: deadline.trim() || undefined,
        milestoneSteps: steps,
      });
    } else {
      onAddGoal({
        name: name.trim(),
        type,
        objectiveId,
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
    }
    onClose();
  };

  return (
    <form onSubmit={handleSubmit} className="mt-3 space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
      <input
        type="text"
        placeholder="Key result (e.g. Reduce weight to 80 kg)"
        value={name}
        onChange={(e) => setName(e.target.value)}
        className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        autoFocus
      />
      <div>
        <label className="block text-xs font-medium text-stone-500 mb-1">Type</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value as TrackedGoal['type'])}
          className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
        >
          <option value="numeric">Numeric (e.g. weight, savings)</option>
          <option value="milestone">Milestone (one-time deliverable with steps)</option>
          <option value="frequency">Frequency (e.g. 3x/week)</option>
          <option value="verbal">Verbal (daily check-in)</option>
          <option value="weekly">Weekly (yes/no per week)</option>
        </select>
      </div>
      <div>
        <label className="block text-xs font-medium text-stone-500 mb-0.5">Deadline (optional)</label>
        <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
      </div>
      {type === 'milestone' && (
        <div className="space-y-2">
          <label className="block text-xs font-medium text-stone-500">Steps</label>
          {milestoneStepInputs.map((step, i) => (
            <div key={i} className="flex gap-2">
              <input
                type="text"
                placeholder={`Step ${i + 1}`}
                value={step}
                onChange={(e) => {
                  const next = [...milestoneStepInputs];
                  next[i] = e.target.value;
                  setMilestoneStepInputs(next);
                }}
                className="flex-1 rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-900"
              />
              {milestoneStepInputs.length > 1 && (
                <button type="button" onClick={() => setMilestoneStepInputs(milestoneStepInputs.filter((_, j) => j !== i))} className="text-xs text-rose-500 hover:underline">Remove</button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => setMilestoneStepInputs([...milestoneStepInputs, ''])} className="text-xs text-stone-600 hover:underline">+ Add step</button>
        </div>
      )}
      {type === 'frequency' && (
        <div className="space-y-2">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-0.5">Period</label>
            <select value={frequencyPeriod} onChange={(e) => setFrequencyPeriod(e.target.value as FrequencyPeriod)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900">
              <option value="day">Per day</option>
              <option value="week">Per week</option>
              <option value="month">Per month</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-0.5">Target count</label>
            <input type="number" min={1} placeholder="e.g. 3" value={frequencyTargetCount} onChange={(e) => setFrequencyTargetCount(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
          </div>
        </div>
      )}
      {type === 'weekly' && (
        <div>
          <label className="block text-xs text-stone-500 mb-0.5">Target description (optional)</label>
          <input type="text" placeholder="e.g. 10 applications" value={weeklyTargetDescription} onChange={(e) => setWeeklyTargetDescription(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
        </div>
      )}
      {type === 'numeric' && (
        <>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-1">Direction</label>
            <select value={direction} onChange={(e) => setDirection(e.target.value as NumericDirection)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900">
              <option value="decrease">Decrease (e.g. weight 90 → 82)</option>
              <option value="increase">Increase (e.g. savings 1k → 5k)</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Target value</label>
              <input type="number" step="any" placeholder={direction === 'decrease' ? '82' : '5000'} value={targetValue} onChange={(e) => setTargetValue(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Unit (optional)</label>
              <input type="text" placeholder="kg, min, $" value={unit} onChange={(e) => setUnit(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
            </div>
          </div>
          <div className="rounded border border-stone-200 bg-stone-100/50 p-3 space-y-2">
            <p className="text-xs font-medium text-stone-700">Starting point (chart begins here)</p>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-stone-500 mb-0.5">Start value</label>
                <input type="number" step="any" placeholder={direction === 'decrease' ? '91' : '1000'} value={startValue} onChange={(e) => setStartValue(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
              </div>
              <div>
                <label className="block text-xs text-stone-500 mb-0.5">Start date</label>
                <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
              </div>
            </div>
          </div>
        </>
      )}
      <div className="flex gap-2">
        <button type="submit" className="rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700">Add key result</button>
        <button type="button" onClick={onClose} className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Cancel</button>
      </div>
    </form>
  );
}

// ---- Edit Goal Modal ----

function EditGoalModal({
  goal,
  objectives,
  onSave,
  onClose,
}: {
  goal: TrackedGoal;
  objectives: Objective[];
  onSave: (id: string, patch: Partial<TrackedGoal>) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState(goal.name);
  const [deadline, setDeadline] = useState(goal.deadline ?? '');
  const [objectiveId, setObjectiveId] = useState(goal.objectiveId ?? '');
  const [targetValue, setTargetValue] = useState(goal.targetValue != null ? String(goal.targetValue) : '');
  const [direction, setDirection] = useState<NumericDirection>(goal.direction ?? 'decrease');
  const [unit, setUnit] = useState(goal.unit ?? '');
  const [startValue, setStartValue] = useState(goal.startValue != null ? String(goal.startValue) : '');
  const [startDate, setStartDate] = useState(goal.startDate ?? '');
  const [weeklyTargetDescription, setWeeklyTargetDescription] = useState(goal.weeklyTargetDescription ?? '');
  const [frequencyPeriod, setFrequencyPeriod] = useState<FrequencyPeriod>(goal.period ?? 'day');
  const [frequencyTargetCount, setFrequencyTargetCount] = useState(goal.targetCount != null ? String(goal.targetCount) : '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const patch: Partial<TrackedGoal> = {
      name: name.trim(),
      deadline: deadline.trim() || undefined,
      objectiveId: objectiveId || undefined,
    };
    if (goal.type === 'numeric') {
      patch.targetValue = targetValue !== '' ? Number(targetValue) : undefined;
      patch.direction = direction;
      patch.unit = unit.trim() || undefined;
      patch.startValue = startValue !== '' ? Number(startValue) : undefined;
      patch.startDate = startDate.trim() || undefined;
    }
    if (goal.type === 'weekly') patch.weeklyTargetDescription = weeklyTargetDescription.trim() || undefined;
    if (goal.type === 'frequency') {
      patch.period = frequencyPeriod;
      patch.targetCount = frequencyTargetCount !== '' ? Number(frequencyTargetCount) : undefined;
    }
    onSave(goal.id, patch);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-xl border border-stone-200 bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-stone-800">Edit key result</h3>
        <form onSubmit={handleSubmit} className="mt-4 space-y-3">
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-0.5">Name</label>
            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" required />
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-0.5">Objective</label>
            <select
              value={objectiveId}
              onChange={(e) => setObjectiveId(e.target.value)}
              className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            >
              <option value="">None (unlinked)</option>
              {objectives.map((o) => (
                <option key={o.id} value={o.id}>{o.name} ({o.quarter})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-stone-500 mb-0.5">Deadline (optional)</label>
            <input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
          </div>
          {goal.type === 'numeric' && (
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
                <p className="text-xs font-medium text-stone-700">Starting point</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-xs text-stone-500 mb-0.5">Start value</label>
                    <input type="number" step="any" value={startValue} onChange={(e) => setStartValue(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                  </div>
                  <div>
                    <label className="block text-xs text-stone-500 mb-0.5">Start date</label>
                    <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
                  </div>
                </div>
              </div>
            </>
          )}
          {goal.type === 'weekly' && (
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Target description</label>
              <input type="text" placeholder="e.g. 10 applications" value={weeklyTargetDescription} onChange={(e) => setWeeklyTargetDescription(e.target.value)} className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900" />
            </div>
          )}
          {goal.type === 'frequency' && (
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
            <button type="button" onClick={onClose} className="rounded border border-stone-300 px-4 py-2 text-sm text-stone-600 hover:bg-stone-100">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---- Charts (unchanged) ----

const CHART_PADDING = 2;
const FREQUENCY_CHART_TOLERANCE = 5;

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
      <button type="button" onClick={onToggle} className="text-sm font-medium text-stone-600 hover:text-stone-800 underline">
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
                <XAxis dataKey="displayDate" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} />
                <YAxis domain={[yMin, yMax]} tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={36} allowDataOverflow />
                <Tooltip contentStyle={{ borderRadius: 6, border: '1px solid #e5e5e5' }} formatter={(value: number | undefined) => [value != null ? String(value) : '—', 'Count']} labelFormatter={(label) => label} />
                <ReferenceLine y={target} stroke="#44403c" strokeDasharray="4 4" label={{ value: `Target ${target}`, fontSize: 10, fill: '#44403c' }} />
                <ReferenceLine y={high} stroke="#a8a29e" strokeDasharray="2 2" label={{ value: `+${FREQUENCY_CHART_TOLERANCE}`, fontSize: 9, fill: '#a8a29e' }} />
                <ReferenceLine y={low} stroke="#a8a29e" strokeDasharray="2 2" label={{ value: `−${FREQUENCY_CHART_TOLERANCE}`, fontSize: 9, fill: '#a8a29e' }} />
                <Line type="monotone" dataKey="value" stroke="#44403c" strokeWidth={2} dot={{ fill: '#44403c', r: 4 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={true} />
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
      <button type="button" onClick={onToggle} className="text-sm font-medium text-stone-600 hover:text-stone-800 underline">
        {isOpen ? 'Hide chart' : 'View chart'}
      </button>
      {isOpen && (
        <div className="mt-2 rounded border border-stone-200 bg-stone-50/50 p-2" style={{ width: '100%', minHeight: 200 }}>
          {chartData.length === 0 ? (
            <p className="text-sm text-stone-500 py-8 text-center">
              Log at least one value to see the chart. Or set a <strong>start value</strong> and <strong>start date</strong> when editing this goal so the chart begins there.
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e5e5" />
                <XAxis dataKey="displayDate" tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} />
                <YAxis domain={yDomain} tick={{ fontSize: 11, fill: '#78716c' }} tickLine={false} axisLine={false} width={36} allowDataOverflow />
                <Tooltip contentStyle={{ borderRadius: 6, border: '1px solid #e5e5e5' }} formatter={(value: number | undefined) => [value != null ? `${value}${unitStr}` : '—', 'Value']} labelFormatter={(label) => `Date: ${label}`} />
                {goal.targetValue != null && (
                  <ReferenceLine y={goal.targetValue} stroke="#78716c" strokeDasharray="4 4" label={{ value: `Target ${goal.targetValue}${unitStr}`, fontSize: 10, fill: '#78716c' }} />
                )}
                <Line type="monotone" dataKey="value" stroke="#44403c" strokeWidth={2} dot={{ fill: '#44403c', r: 4 }} activeDot={{ r: 5 }} connectNulls={false} isAnimationActive={true} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>
      )}
    </div>
  );
}

// ---- Helpers ----

function formatDeadline(iso: string): string {
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString(undefined, { month: 'short', year: 'numeric', day: 'numeric' });
}

function daysBetween(a: string, b: string): number {
  const da = new Date(a + 'T00:00:00');
  const db = new Date(b + 'T00:00:00');
  return Math.floor((db.getTime() - da.getTime()) / (1000 * 60 * 60 * 24));
}

// ---- TrackedGoalCard (preserved + milestone support + staleness) ----

function TrackedGoalCard({
  goal,
  goalLogs,
  today,
  onEditGoal,
  onRemoveGoal,
  onAddOrUpdateLog,
  onToggleMilestoneStep,
  onAddMilestoneStep,
  onRemoveMilestoneStep,
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
  onToggleMilestoneStep: (trackedGoalId: string, stepIndex: number) => void;
  onAddMilestoneStep: (trackedGoalId: string, text: string) => void;
  onRemoveMilestoneStep: (trackedGoalId: string, stepIndex: number) => void;
}) {
  const [logInput, setLogInput] = useState('');
  const [verbalNote, setVerbalNote] = useState('');
  const [weeklyNote, setWeeklyNote] = useState('');
  const [chartOpen, setChartOpen] = useState(false);
  const [frequencyChartOpen, setFrequencyChartOpen] = useState(false);
  const [newStepText, setNewStepText] = useState('');

  const todayLog = getLogForDate(goalLogs, goal.id, today);
  const thisWeekStart = getWeekStart(today);
  const thisWeekLog = getLogForDate(goalLogs, goal.id, thisWeekStart);
  const progress = goal.type === 'numeric' ? getNumericProgress(goal, goalLogs) : null;
  const milestoneProgress = goal.type === 'milestone' ? getMilestoneProgress(goal) : null;
  const weeklyLogs = goal.type === 'weekly' ? getWeeklyLogsForGoal(goalLogs, goal.id) : [];
  const pastWeeklyLogs = weeklyLogs.filter((l) => l.date !== thisWeekStart).slice(0, 6);
  const periodDate = goal.type === 'frequency' && goal.period ? getPeriodDateForFrequency(goal.period, today) : '';
  const frequencyCount = goal.type === 'frequency' ? getFrequencyCount(goalLogs, goal.id, periodDate) : 0;
  const frequencyTarget = goal.type === 'frequency' ? (goal.targetCount ?? 0) : 0;

  const lastActivity = getLastActivityDate(goal, goalLogs);
  const threshold = STALENESS_THRESHOLDS[goal.type] ?? 7;
  const stale = goal.type === 'milestone'
    ? false
    : lastActivity ? daysBetween(lastActivity, today) > threshold : false;

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
  const complete = isKRComplete(goal, goalLogs);

  return (
    <li className={`rounded-lg border p-4 ${complete ? 'border-green-200 bg-green-50/50' : 'border-stone-200 bg-white'}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            {complete && <span className="text-green-600 text-sm">✓</span>}
            <span className={`font-medium ${complete ? 'text-green-800' : 'text-stone-900'}`}>{goal.name}</span>
            {goal.type === 'numeric' && goal.targetValue != null && (
              <span className="text-sm text-stone-500">
                {goal.direction === 'decrease' ? '↓' : '↑'} {goal.targetValue}{unitStr}
              </span>
            )}
            {goal.type === 'milestone' && milestoneProgress && (
              <span className="text-sm text-stone-500">{milestoneProgress.done} of {milestoneProgress.total} steps</span>
            )}
            {goal.type === 'weekly' && goal.weeklyTargetDescription && (
              <span className="text-sm text-stone-500">— {goal.weeklyTargetDescription}/week</span>
            )}
            {goal.type === 'frequency' && goal.targetCount != null && goal.period && (
              <span className="text-sm text-stone-500">
                — {goal.targetCount}× per {goal.period === 'day' ? 'day' : goal.period === 'week' ? 'week' : 'month'}
              </span>
            )}
            {goal.deadline && (
              <span className="text-sm text-amber-700 font-medium">By {formatDeadline(goal.deadline)}</span>
            )}
            {stale && lastActivity && (
              <span className="text-xs text-amber-600 font-medium bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                No activity in {daysBetween(lastActivity, today)}d
              </span>
            )}
          </div>
          {goal.type === 'numeric' && (goal.startValue != null || goal.startDate) && (
            <p className="text-xs text-stone-400 mt-0.5">
              {goal.startValue != null && `Start: ${goal.startValue}${unitStr}`}
              {goal.startValue != null && goal.startDate && ' · '}
              {goal.startDate && `From ${formatDeadline(goal.startDate)}`}
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          <button type="button" onClick={() => onEditGoal(goal)} className="text-xs text-stone-600 hover:underline">Edit</button>
          <button type="button" onClick={() => onRemoveGoal(goal.id)} className="text-xs text-rose-600 hover:underline">Remove</button>
        </div>
      </div>

      {/* Milestone steps */}
      {goal.type === 'milestone' && goal.milestoneSteps && (
        <div className="mt-3 space-y-1.5">
          {goal.milestoneSteps.map((step, i) => (
            <div key={i} className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={step.done}
                onChange={() => onToggleMilestoneStep(goal.id, i)}
                className="h-4 w-4 rounded border-stone-300 text-stone-700 accent-stone-700"
              />
              <span className={`text-sm flex-1 ${step.done ? 'line-through text-stone-400' : 'text-stone-700'}`}>{step.text}</span>
              <button type="button" onClick={() => onRemoveMilestoneStep(goal.id, i)} className="text-xs text-stone-400 hover:text-rose-500">×</button>
            </div>
          ))}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!newStepText.trim()) return;
              onAddMilestoneStep(goal.id, newStepText);
              setNewStepText('');
            }}
            className="flex gap-2 mt-1"
          >
            <input
              type="text"
              placeholder="Add step..."
              value={newStepText}
              onChange={(e) => setNewStepText(e.target.value)}
              className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm text-stone-900"
            />
            <button type="submit" className="rounded bg-stone-700 px-2 py-1 text-xs text-white hover:bg-stone-600">Add</button>
          </form>
          {milestoneProgress && milestoneProgress.total > 0 && (
            <div className="mt-2 h-2 w-full rounded-full bg-stone-200 overflow-hidden">
              <div className="h-full rounded-full bg-green-600 transition-all" style={{ width: `${Math.round((milestoneProgress.done / milestoneProgress.total) * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {/* Frequency */}
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
            <button type="button" onClick={() => onAddOrUpdateLog(goal.id, periodDate, { value: frequencyCount + 1 })} className="rounded-lg bg-green-600 px-4 py-2 text-sm font-bold text-white hover:bg-green-700">+1 Log once</button>
            {frequencyCount > 0 && (
              <button type="button" onClick={() => onAddOrUpdateLog(goal.id, periodDate, { value: frequencyCount - 1 })} className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600 hover:bg-stone-100">−1</button>
            )}
          </div>
          <div className="mt-2 h-2 w-full rounded-full bg-stone-200 overflow-hidden">
            <div className="h-full rounded-full bg-stone-700 transition-all" style={{ width: `${Math.min(100, (frequencyCount / frequencyTarget) * 100)}%` }} />
          </div>
          {frequencyCount >= frequencyTarget && (
            <p className="mt-1 text-sm font-medium text-green-700">Target reached for this period!</p>
          )}
          <FrequencyGoalChart goal={goal} goalLogs={goalLogs} isOpen={frequencyChartOpen} onToggle={() => setFrequencyChartOpen((v) => !v)} />
        </div>
      )}

      {/* Numeric progress + chart */}
      {goal.type === 'numeric' && progress && (
        <div className="mt-3">
          {progress.start === progress.target && progress.current == null ? (
            <p className="text-sm text-stone-500">Log your first value below to see progress.</p>
          ) : (
            <>
              <div className="flex items-baseline gap-2 text-sm text-stone-600">
                <span>{progress.start}{unitStr} → {progress.target}{unitStr}</span>
                {progress.current != null && (
                  <span className="font-medium text-stone-800">· current: {progress.current}{unitStr}</span>
                )}
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-stone-200 overflow-hidden">
                <div className="h-full rounded-full bg-stone-700 transition-all" style={{ width: `${Math.round(progress.progress * 100)}%` }} />
              </div>
              <p className="mt-1 text-xs text-stone-500">
                {progress.progress >= 1 ? 'Target reached!' : `${Math.round(progress.progress * 100)}% of the way there`}
                {progress.current != null && progress.progress < 1 && (
                  <span> · {Math.round((1 - progress.progress) * 100)}% to go</span>
                )}
              </p>
            </>
          )}
          <NumericGoalChart goal={goal} goalLogs={goalLogs} unitStr={unitStr} isOpen={chartOpen} onToggle={() => setChartOpen((v) => !v)} />
        </div>
      )}

      {/* Verbal */}
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

      {/* Weekly */}
      {goal.type === 'weekly' && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-medium text-stone-500">This week (week of {formatWeekLabel(thisWeekStart)})</p>
          <div className="flex flex-wrap gap-2 items-center">
            <button type="button" onClick={() => onAddOrUpdateLog(goal.id, thisWeekStart, { done: true, note: weeklyNote.trim() || undefined })} className={`rounded px-3 py-1.5 text-sm ${thisWeekLog?.done ? 'bg-green-600 text-white' : 'border border-stone-300 text-stone-600 hover:bg-stone-100'}`}>Done</button>
            <button type="button" onClick={() => onAddOrUpdateLog(goal.id, thisWeekStart, { done: false, note: weeklyNote.trim() || undefined })} className={`rounded px-3 py-1.5 text-sm ${thisWeekLog?.done === false ? 'bg-amber-100 text-amber-800' : 'border border-stone-300 text-stone-600 hover:bg-stone-100'}`}>Not done</button>
            <input type="text" placeholder="Optional note" value={weeklyNote !== '' ? weeklyNote : (thisWeekLog?.note ?? '')} onChange={(e) => setWeeklyNote(e.target.value)} onBlur={() => { if (weeklyNote.trim() || thisWeekLog) onAddOrUpdateLog(goal.id, thisWeekStart, { done: thisWeekLog?.done ?? false, note: weeklyNote.trim() || undefined }); }} className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-900 w-40" />
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
                  <li key={l.id}>Week of {formatWeekLabel(l.date)}: {l.done ? 'Done' : 'Not done'}{l.note && ` — ${l.note}`}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* Log for today (numeric/verbal) — not for milestone or weekly */}
      {goal.type !== 'weekly' && goal.type !== 'milestone' && (
        <div className="mt-3 pt-3 border-t border-stone-100">
          <p className="text-xs font-medium text-stone-500 mb-2">Log for today</p>
          {goal.type === 'numeric' ? (
            <form onSubmit={handleLogNumeric} className="flex gap-2">
              <input type="number" step="any" placeholder={`Current value${unitStr}`} value={logInput} onChange={(e) => setLogInput(e.target.value)} className="flex-1 rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-900" />
              <button type="submit" className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600">Log</button>
            </form>
          ) : (
            <div className="flex flex-wrap gap-2 items-center">
              <button type="button" onClick={() => handleLogVerbal(true)} className={`rounded px-3 py-1.5 text-sm ${todayLog?.done ? 'bg-green-600 text-white' : 'border border-stone-300 text-stone-600 hover:bg-stone-100'}`}>Did it today</button>
              <input type="text" placeholder="Optional note" value={verbalNote !== '' ? verbalNote : (todayLog?.note ?? '')} onChange={(e) => setVerbalNote(e.target.value)} onBlur={handleVerbalNoteBlur} className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-900 w-40" />
            </div>
          )}
        </div>
      )}
    </li>
  );
}
