import { useState } from 'react';
import type { ScheduledBlock, Task, Checklist, ChecklistItem } from '../types';
import { todayStr, formatDate } from '../lib/date';
import { getPlannedMinutesForDay } from '../capacity';

const SKIP_REASONS = [
  'Overwhelmed',
  'Wrong time',
  'Not needed',
  'Energy low',
  'Other',
];

interface Props {
  blocks: ScheduledBlock[];
  tasks: Task[];
  today: string;
  onBlockStatus: (blockId: string, status: 'in_progress' | 'completed' | 'skipped', skipReason?: string) => void;
  capacityMaxHoursPerDay: number;
  checklists: Checklist[];
  checklistItems: ChecklistItem[];
}

export default function DailyView({
  blocks,
  tasks,
  today,
  onBlockStatus,
  capacityMaxHoursPerDay,
  checklists,
  checklistItems,
}: Props) {
  const todayBlocks = blocks
    .filter((b) => b.date === today && (b.status === 'pending' || b.status === 'in_progress' || b.status === 'completed' || b.status === 'skipped'))
    .sort((a, b) => a.sortOrder - b.sortOrder);

  const priorityBlocks = todayBlocks.filter((b) => b.sortOrder <= 3);
  const microBlock = todayBlocks.find((b) => b.sortOrder === 4);
  const plannedMins = getPlannedMinutesForDay(
    blocks.filter((b) => b.date === today && (b.status === 'pending' || b.status === 'in_progress')),
    today
  );
  const bufferMins = Math.max(0, capacityMaxHoursPerDay * 60 - plannedMins);

  const getTask = (taskId: string) => tasks.find((t) => t.id === taskId);
  const getChecklist = (id: string) => checklists.find((c) => c.id === id);
  const getItemsForChecklist = (c: Checklist) =>
    c.itemIds
      .map((id) => checklistItems.find((i) => i.id === id))
      .filter((i): i is ChecklistItem => i != null);
  const toggleChecklistItem = (blockId: string, itemId: string) => {
    setChecklistChecked((prev) => ({
      ...prev,
      [blockId]: {
        ...prev[blockId],
        [itemId]: !prev[blockId]?.[itemId],
      },
    }));
  };

  const [skippingBlockId, setSkippingBlockId] = useState<string | null>(null);
  const [skipReason, setSkipReason] = useState('');
  const [checklistOpenForBlockId, setChecklistOpenForBlockId] = useState<string | null>(null);
  const [checklistChecked, setChecklistChecked] = useState<Record<string, Record<string, boolean>>>({});

  const handleSkip = (blockId: string) => {
    if (skipReason) {
      onBlockStatus(blockId, 'skipped', skipReason);
      setSkippingBlockId(null);
      setSkipReason('');
    }
  };

  const isToday = today === todayStr();

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="text-lg font-semibold text-stone-800">
        {isToday ? "Today's plan" : formatDate(today)}
      </h2>
      <p className="text-sm text-stone-600">
        Up to 3 priority blocks, 1 micro task. No full task list — just what to do now.
      </p>

      <div className="space-y-3">
        {priorityBlocks.map((block) => {
          const task = getTask(block.taskId);
          const label = task?.title ?? 'Task';
          const isSkipping = skippingBlockId === block.id;
          const linkedChecklist = task?.checklistId ? getChecklist(task.checklistId) : null;
          const checklistOpen = checklistOpenForBlockId === block.id;

          return (
            <div
              key={block.id}
              className={`rounded-lg border p-4 ${
                block.status === 'completed'
                  ? 'border-green-200 bg-green-50'
                  : block.status === 'skipped'
                    ? 'border-amber-200 bg-amber-50 opacity-75'
                    : block.status === 'in_progress'
                      ? 'border-blue-300 bg-blue-50'
                      : 'border-stone-200 bg-stone-50'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <span className="font-medium text-stone-900">{label}</span>
                  <span className="ml-2 text-sm text-stone-500">
                    {block.startTime}–{block.endTime} · {block.energyType}
                  </span>
                  {block.status === 'skipped' && block.skipReason && (
                    <p className="text-xs text-amber-700 mt-1">Skipped: {block.skipReason}</p>
                  )}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {linkedChecklist && (
                    <button
                      type="button"
                      onClick={() => setChecklistOpenForBlockId(checklistOpen ? null : block.id)}
                      className={`rounded px-2 py-1 text-xs font-medium ${
                        checklistOpen ? 'bg-stone-600 text-white' : 'border border-stone-300 text-stone-600 hover:bg-stone-100'
                      }`}
                    >
                      {checklistOpen ? 'Hide checklist' : 'Checklist'}
                    </button>
                  )}
                  {block.status === 'pending' && (
                    <>
                      <button
                        type="button"
                        onClick={() => onBlockStatus(block.id, 'in_progress')}
                        className="rounded bg-stone-800 px-3 py-1.5 text-xs font-medium text-white hover:bg-stone-700"
                      >
                        Start
                      </button>
                      <button
                        type="button"
                        onClick={() => setSkippingBlockId(block.id)}
                        className="rounded border border-stone-300 px-3 py-1.5 text-xs text-stone-600 hover:bg-stone-100"
                      >
                        Skip
                      </button>
                    </>
                  )}
                  {block.status === 'in_progress' && (
                    <button
                      type="button"
                      onClick={() => onBlockStatus(block.id, 'completed')}
                      className="rounded bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700"
                    >
                      Complete
                    </button>
                  )}
                </div>
              </div>

              {linkedChecklist && checklistOpen && (
                <div className="mt-3 pt-3 border-t border-stone-200">
                  <p className="text-xs font-medium text-stone-600 mb-2">Run through before you start — stay focused</p>
                  <ul className="space-y-1.5">
                    {getItemsForChecklist(linkedChecklist).map((item) => (
                      <li key={item.id} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={!!checklistChecked[block.id]?.[item.id]}
                          onChange={() => toggleChecklistItem(block.id, item.id)}
                          className="rounded border-stone-300"
                        />
                        <span className={`text-sm ${checklistChecked[block.id]?.[item.id] ? 'text-stone-500 line-through' : 'text-stone-800'}`}>
                          {item.text}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {isSkipping && (
                <div className="mt-3 pt-3 border-t border-stone-200">
                  <p className="text-xs text-stone-600 mb-2">Reason (shame-free):</p>
                  <div className="flex flex-wrap gap-2">
                    {SKIP_REASONS.map((r) => (
                      <button
                        key={r}
                        type="button"
                        onClick={() => {
                          setSkipReason(r);
                          handleSkip(block.id);
                        }}
                        className="rounded border border-stone-300 px-2 py-1 text-xs hover:bg-stone-100"
                      >
                        {r}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={() => setSkippingBlockId(null)}
                    className="mt-2 text-xs text-stone-500 hover:underline"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {microBlock && (
          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50/50 p-3">
            <span className="text-sm font-medium text-stone-700">Optional micro</span>
            <span className="ml-2 text-sm text-stone-500">
              {getTask(microBlock.taskId)?.title ?? 'Task'} · {microBlock.startTime}
            </span>
            {microBlock.status === 'pending' && (
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => onBlockStatus(microBlock.id, 'in_progress')}
                  className="rounded bg-stone-700 px-2 py-1 text-xs text-white hover:bg-stone-600"
                >
                  Start
                </button>
                <button
                  type="button"
                  onClick={() => onBlockStatus(microBlock.id, 'skipped', 'Skipped')}
                  className="rounded border border-stone-300 px-2 py-1 text-xs text-stone-600"
                >
                  Skip
                </button>
              </div>
            )}
            {microBlock.status === 'in_progress' && (
              <button
                type="button"
                onClick={() => onBlockStatus(microBlock.id, 'completed')}
                className="mt-2 rounded bg-green-600 px-2 py-1 text-xs text-white"
              >
                Complete
              </button>
            )}
          </div>
        )}

        <div className="rounded border border-stone-200 bg-stone-50/50 px-3 py-2 text-sm text-stone-600">
          Buffer time today: ~{Math.round(bufferMins / 60 * 10) / 10}h (unplanned)
        </div>
      </div>

      {todayBlocks.length === 0 && (
        <p className="text-sm text-stone-500 py-6">
          Nothing scheduled for this day. Run the weekly scheduler from the Week tab.
        </p>
      )}
    </div>
  );
}
