import { useState } from 'react';
import type { Task, TaskType, EnergyType } from '../types';

const TASK_TYPES: { value: TaskType; label: string }[] = [
  { value: 'GoalTask', label: 'Goal task' },
  { value: 'DeadlineTask', label: 'Deadline' },
  { value: 'FixedEvent', label: 'Fixed event' },
  { value: 'LocationTask', label: 'Location (travel buffer)' },
  { value: 'MicroTask', label: 'Micro (<15 min)' },
];

const ENERGY: { value: EnergyType; label: string }[] = [
  { value: 'Deep', label: 'Deep' },
  { value: 'Light', label: 'Light' },
  { value: 'Admin', label: 'Admin' },
];

interface Props {
  tasks: Task[];
  goals: { id: string; name: string }[];
  onAdd: (t: Omit<Task, 'id' | 'completed'>) => void;
}

export default function Tasks({ tasks, goals, onAdd }: Props) {
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [taskType, setTaskType] = useState<TaskType>('GoalTask');
  const [goalId, setGoalId] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState(60);
  const [energyType, setEnergyType] = useState<EnergyType>('Deep');
  const [deadline, setDeadline] = useState('');
  const [dueTime, setDueTime] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low' | ''>('');
  const [note, setNote] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    onAdd({
      title: title.trim(),
      taskType,
      goalId: taskType === 'GoalTask' && goalId ? goalId : undefined,
      estimatedMinutes: taskType === 'MicroTask' ? Math.min(15, estimatedMinutes) : estimatedMinutes,
      energyType,
      deadline: deadline || undefined,
      dueTime: dueTime || undefined,
      priority: priority || undefined,
      note: note.trim() || undefined,
    });
    setTitle('');
    setTaskType('GoalTask');
    setGoalId('');
    setEstimatedMinutes(60);
    setEnergyType('Deep');
    setDeadline('');
    setDueTime('');
    setPriority('');
    setNote('');
    setShowForm(false);
  };

  const pending = tasks.filter((t) => !t.completed);

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-stone-800">Tasks</h2>
      <p className="text-sm text-stone-600">
        Add tasks. Estimate time and energy type. System adds +25% buffer when scheduling.
      </p>

      {!showForm && (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50"
        >
          + Add task
        </button>
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
          <input
            type="text"
            placeholder="Task title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            autoFocus
          />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Type</label>
              <select
                value={taskType}
                onChange={(e) => setTaskType(e.target.value as TaskType)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              >
                {TASK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Energy</label>
              <select
                value={energyType}
                onChange={(e) => setEnergyType(e.target.value as EnergyType)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              >
                {ENERGY.map((e) => (
                  <option key={e.value} value={e.value}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {taskType === 'GoalTask' && goals.length > 0 && (
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Goal</label>
              <select
                value={goalId}
                onChange={(e) => setGoalId(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              >
                <option value="">— Select —</option>
                {goals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Est. minutes</label>
              <input
                type="number"
                min={5}
                max={480}
                value={estimatedMinutes}
                onChange={(e) => setEstimatedMinutes(Number(e.target.value) || 30)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
            </div>
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Deadline (date)</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
            </div>
          </div>
          {(taskType === 'FixedEvent' || taskType === 'DeadlineTask') && (
            <div>
              <label className="block text-xs text-stone-500 mb-0.5">Time (for fixed events)</label>
              <input
                type="time"
                value={dueTime}
                onChange={(e) => setDueTime(e.target.value)}
                className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
              />
            </div>
          )}
          <div>
            <label className="block text-xs text-stone-500 mb-0.5">Priority (for AI scheduling)</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as 'high' | 'medium' | 'low' | '')}
              className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            >
              <option value="">— Optional —</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-0.5">Note for AI (e.g. &quot;morning only&quot;, &quot;before 5pm&quot;)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Optional"
              className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              className="rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
            >
              Add task
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

      <ul className="space-y-2">
        {pending.map((t) => (
          <li
            key={t.id}
            className="flex items-center justify-between rounded border border-stone-200 px-3 py-2 text-sm"
          >
            <div>
              <span className="text-stone-900">{t.title}</span>
              {(t.priority || t.note) && (
                <span className="ml-2 text-xs text-stone-500">
                  {t.priority && `[${t.priority}]`}
                  {t.note && ` ${t.note}`}
                </span>
              )}
            </div>
            <span className="text-stone-500">
              {t.estimatedMinutes} min · {t.energyType}
              {t.deadline && ` · ${t.deadline}`}
            </span>
          </li>
        ))}
        {pending.length === 0 && (
          <li className="text-sm text-stone-500 py-4">No pending tasks. Add one above.</li>
        )}
      </ul>
    </div>
  );
}
