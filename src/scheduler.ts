import type { AppState, ScheduledBlock } from './types';
import { DEFAULT_CAPACITY } from './types';
import { getPlannedMinutesForDay, getDeepBlockCountForDay, wouldExceedDailyLimits } from './capacity';

const BUFFER_MULTIPLIER = 1.25; // +25% on estimate

function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * Allocate weekly schedule: fixed events first, then deadlines, then goal quotas, then rest.
 * Distributes evenly, max 3 deep/day, respects daily planned cap.
 */
export function runWeeklyScheduler(state: AppState, weekStart: string): ScheduledBlock[] {
  const blocks: ScheduledBlock[] = [];
  const capacity = state.capacity ?? DEFAULT_CAPACITY;
  const workStartMins = timeToMinutes(capacity.workStart);
  const workEndMins = timeToMinutes(capacity.workEnd);
  const blockId = () => `blk-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

  const weekStartDate = new Date(weekStart);
  const dayDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    dayDates.push(toDateStr(addDays(weekStartDate, i)));
  }

  // 1) Fixed events (place first)
  const fixedTasks = state.tasks.filter(
    (t) => !t.completed && (t.taskType === 'FixedEvent' || (t.taskType === 'DeadlineTask' && t.dueTime))
  );
  for (const task of fixedTasks) {
    const date = task.deadline ? task.deadline.slice(0, 10) : dayDates[0];
    if (!dayDates.includes(date)) continue;
    const mins = Math.ceil(task.estimatedMinutes * BUFFER_MULTIPLIER);
    const buffer = Math.ceil(task.estimatedMinutes * (capacity.bufferPercent / 100));
    const start = task.dueTime ?? capacity.workStart;
    const startMins = timeToMinutes(start);
    const endMins = startMins + mins + buffer;
    blocks.push({
      id: blockId(),
      taskId: task.id,
      date,
      startTime: start,
      endTime: minutesToTime(endMins),
      bufferMinutes: buffer,
      energyType: task.energyType,
      status: 'pending',
      sortOrder: 1,
    });
  }

  // 2) Deadline tasks (no fixed time)
  const deadlineTasks = state.tasks.filter(
    (t) =>
      !t.completed &&
      t.taskType === 'DeadlineTask' &&
      t.deadline &&
      !t.dueTime &&
      !fixedTasks.some((f) => f.id === t.id)
  );
  for (const task of deadlineTasks) {
    const date = task.deadline!.slice(0, 10);
    if (!dayDates.includes(date)) continue;
    const totalMins = Math.ceil(task.estimatedMinutes * BUFFER_MULTIPLIER);
    const buffer = Math.ceil(task.estimatedMinutes * (capacity.bufferPercent / 100));
    const check = wouldExceedDailyLimits(capacity, blocks, date, totalMins + buffer, task.energyType);
    if (!check.ok) continue;
    const existingMins = getPlannedMinutesForDay(blocks, date);
    const startMins = workStartMins + Math.min(existingMins, (workEndMins - workStartMins) - totalMins - buffer);
    blocks.push({
      id: blockId(),
      taskId: task.id,
      date,
      startTime: minutesToTime(startMins),
      endTime: minutesToTime(startMins + totalMins + buffer),
      bufferMinutes: buffer,
      energyType: task.energyType,
      status: 'pending',
      sortOrder: 2,
    });
  }

  // 3) Goal tasks by tier (fill quotas across week; each task scheduled at most once)
  const scheduledTaskIds = new Set(blocks.map((b) => b.taskId));
  const activeGoals = state.goals.filter((g) => g.active).sort((a, b) => a.priorityTier - b.priorityTier);
  for (const goal of activeGoals) {
    const quotaSessions = goal.weeklyQuotaSessions ?? (goal.weeklyQuotaHours ? Math.ceil(goal.weeklyQuotaHours) : 0);
    if (quotaSessions <= 0) continue;
    const goalTasks = state.tasks.filter(
      (t) => !t.completed && t.taskType === 'GoalTask' && t.goalId === goal.id && !scheduledTaskIds.has(t.id)
    );
    let sessionsPlaced = 0;
    for (const date of dayDates) {
      if (sessionsPlaced >= quotaSessions) break;
      const deepCount = getDeepBlockCountForDay(blocks, date);
      const plannedMins = getPlannedMinutesForDay(blocks, date);
      const maxNewMins = capacity.maxPlannedHoursPerDay * 60 - plannedMins;
      if (maxNewMins < 30) continue;
      const task = goalTasks.find((t) => t.energyType === 'Deep' && deepCount < capacity.maxDeepBlocksPerDay)
        ?? goalTasks.find(() => deepCount < capacity.maxDeepBlocksPerDay)
        ?? goalTasks[0];
      if (!task) continue;
      const totalMins = Math.ceil(task.estimatedMinutes * BUFFER_MULTIPLIER);
      const buffer = Math.ceil(task.estimatedMinutes * (capacity.bufferPercent / 100));
      const check = wouldExceedDailyLimits(capacity, blocks, date, totalMins + buffer, task.energyType);
      if (!check.ok) continue;
      const existingMins = getPlannedMinutesForDay(blocks, date);
      const startMins = workStartMins + Math.min(existingMins, (workEndMins - workStartMins) - totalMins - buffer);
      blocks.push({
        id: blockId(),
        taskId: task.id,
        date,
        startTime: minutesToTime(startMins),
        endTime: minutesToTime(startMins + totalMins + buffer),
        bufferMinutes: buffer,
        energyType: task.energyType,
        status: 'pending',
        sortOrder: 3,
      });
      scheduledTaskIds.add(task.id);
      sessionsPlaced++;
    }
  }

  // 4) One micro task per day if space (sortOrder 4)
  const microTasks = state.tasks.filter(
    (t) => !t.completed && t.taskType === 'MicroTask' && t.estimatedMinutes <= 15
  );
  for (const date of dayDates) {
    const planned = getPlannedMinutesForDay(blocks, date);
    if (planned >= capacity.maxPlannedHoursPerDay * 60 - 20) continue;
    const task = microTasks.find((t) => !blocks.some((b) => b.taskId === t.id && b.date === date));
    if (!task) continue;
    const totalMins = 15 + 5; // 15 + 5 buffer
    const existingMins = getPlannedMinutesForDay(blocks, date);
    const startMins = workStartMins + Math.min(existingMins, (workEndMins - workStartMins) - totalMins);
    blocks.push({
      id: blockId(),
      taskId: task.id,
      date,
      startTime: minutesToTime(startMins),
      endTime: minutesToTime(startMins + totalMins),
      bufferMinutes: 5,
      energyType: 'Light',
      status: 'pending',
      sortOrder: 4,
    });
  }

  // Assign sortOrder 5 for buffer blocks if we want to show "buffer" explicitly; for MVP we just cap daily time.
  return blocks.sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date);
    return a.sortOrder - b.sortOrder;
  });
}

/**
 * Get week start (Monday) for a given date string.
 */
export function getWeekStart(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00');
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day; // Monday = 1
  d.setDate(d.getDate() + diff);
  return toDateStr(d);
}
