import type { CapacitySettings, EnergyType, ScheduledBlock } from './types';

/**
 * Get total planned minutes for a given day from blocks.
 */
export function getPlannedMinutesForDay(
  blocks: ScheduledBlock[],
  date: string,
  includeBuffer = true
): number {
  return blocks
    .filter((b) => b.date === date && (b.status === 'pending' || b.status === 'in_progress'))
    .reduce((sum, b) => {
      const [sh, sm] = b.startTime.split(':').map(Number);
      const [eh, em] = b.endTime.split(':').map(Number);
      const blockMins = eh * 60 + em - (sh * 60 + sm);
      return sum + blockMins + (includeBuffer ? b.bufferMinutes : 0);
    }, 0);
}

/**
 * Count deep-work blocks on a given day.
 */
export function getDeepBlockCountForDay(blocks: ScheduledBlock[], date: string): number {
  return blocks.filter(
    (b) => b.date === date && b.energyType === 'Deep' && (b.status === 'pending' || b.status === 'in_progress')
  ).length;
}

/**
 * Check if adding a new block would exceed daily limits.
 */
export function wouldExceedDailyLimits(
  capacity: CapacitySettings,
  blocks: ScheduledBlock[],
  date: string,
  newBlockMinutes: number,
  energyType: EnergyType
): { ok: boolean; reason?: string } {
  const plannedMins = getPlannedMinutesForDay(blocks, date);
  const maxMins = capacity.maxPlannedHoursPerDay * 60;
  if (plannedMins + newBlockMinutes > maxMins) {
    return { ok: false, reason: `Daily planned time would exceed ${capacity.maxPlannedHoursPerDay}h. Remove something first.` };
  }
  if (energyType === 'Deep') {
    const deepCount = getDeepBlockCountForDay(blocks, date);
    if (deepCount >= capacity.maxDeepBlocksPerDay) {
      return { ok: false, reason: `Max ${capacity.maxDeepBlocksPerDay} deep-work blocks per day.` };
    }
  }
  return { ok: true };
}

/**
 * Weekly remaining capacity (simplified: discretionary hours * 60 - sum of scheduled minutes for the week).
 */
export function getWeeklyPlannedMinutes(
  blocks: ScheduledBlock[],
  weekStart: string
): number {
  const start = new Date(weekStart);
  let total = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    const dateStr = d.toISOString().slice(0, 10);
    total += getPlannedMinutesForDay(blocks, dateStr);
  }
  return total;
}

export function getWeeklyCapacityMinutes(capacity: CapacitySettings): number {
  return capacity.weeklyDiscretionaryHours * 60;
}
