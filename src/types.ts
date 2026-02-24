// Goals: max 3 active, weekly quota, priority 1–3
export type PriorityTier = 1 | 2 | 3;

export interface Goal {
  id: string;
  name: string;
  targetMetric?: string; // e.g. "4 workouts"
  weeklyQuotaHours?: number;
  weeklyQuotaSessions?: number;
  /** Sub-tasks that repeat N times per day (e.g. medication 3x). */
  dailyRepetition?: number;
  priorityTier: PriorityTier;
  active: boolean;
}

// Energy types for capacity (max 3 deep per day)
export type EnergyType = 'Deep' | 'Light' | 'Admin';

export type TaskType =
  | 'GoalTask'   // linked to goal
  | 'DeadlineTask'
  | 'FixedEvent'
  | 'LocationTask'
  | 'MicroTask'; // <15 min

export interface Task {
  id: string;
  title: string;
  taskType: TaskType;
  goalId?: string;
  estimatedMinutes: number; // system adds +25% buffer when scheduling
  energyType: EnergyType;
  deadline?: string; // ISO date
  dueTime?: string; // optional time for fixed events
  location?: string;
  completed: boolean;
  completedAt?: string;
  /** When set, this task's calendar blocks show the checklist so you stay focused */
  checklistId?: string;
  /** Repeat this task N times per day (e.g. medication 3x). AI or user can set suggestedTimeSlots. */
  timesPerDay?: number;
  /** Suggested times (HH:mm) when AI or user wants this repeated task placed. */
  suggestedTimeSlots?: string[];
  /** Optional importance for prioritization (e.g. for one-off tasks without a goal). */
  priority?: 'high' | 'medium' | 'low';
  /** Optional note for AI (e.g. "must do before 5pm" or "can skip if tired"). */
  note?: string;
}

// Situation-based checklists (e.g. "Before trading", "Morning routine") — linked to tasks/calendar
export interface ChecklistItem {
  id: string;
  checklistId: string;
  text: string;
  order: number;
  /** Checkbox state; new items start unchecked. */
  done?: boolean;
}

export interface Checklist {
  id: string;
  name: string; // e.g. "Before opening trading app"
  situationDescription?: string; // when to use this
  itemIds: string[]; // order of items
}

// Scheduled block (output of weekly allocator)
export interface ScheduledBlock {
  id: string;
  taskId: string;
  date: string; // YYYY-MM-DD
  startTime: string; // HH:mm
  endTime: string;
  bufferMinutes: number; // 25% of estimate
  energyType: EnergyType;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  skipReason?: string;
  sortOrder: number; // 1–3 for priority blocks, 4 for micro, 5 for buffer
}

// Capacity settings
export interface CapacitySettings {
  weeklyDiscretionaryHours: number;
  sleepStart: string; // HH:mm
  sleepEnd: string;
  workStart: string;
  workEnd: string;
  workDays: number; // 0–7
  maxDeepBlocksPerDay: number;
  maxPlannedHoursPerDay: number;
  bufferPercent: number; // 20–30
}

// Goal Tracker: numeric (increase/decrease), verbal (daily check-in), weekly (yes/no per week), frequency (N times per period)
export type TrackedGoalType = 'numeric' | 'verbal' | 'weekly' | 'frequency';

export type NumericDirection = 'increase' | 'decrease';

/** For frequency goals: period to count in. One log per period; value = count. */
export type FrequencyPeriod = 'day' | 'week' | 'month';

export interface TrackedGoal {
  id: string;
  name: string;
  type: TrackedGoalType;
  // Numeric: target and direction; startValue/startDate optional (chart starts here)
  targetValue?: number;
  direction?: NumericDirection;
  unit?: string; // e.g. "kg", "min", "$"
  startValue?: number;
  /** Optional start date (YYYY-MM-DD) for chart; chart begins at this date with startValue. */
  startDate?: string;
  // Weekly: optional description of target (e.g. "10 jobs") — logged yes/no per week
  weeklyTargetDescription?: string;
  // Frequency: N times per period (e.g. 3x/day medication, 4x/week workouts)
  period?: FrequencyPeriod;
  targetCount?: number; // e.g. 3 per day, 4 per week
  /** Optional deadline (YYYY-MM-DD). e.g. "reach 82 kg by June" → deadline end of June. */
  deadline?: string;
}

/** One log per goal per day (or per week for weekly goals — date = week start). */
export interface GoalLog {
  id: string;
  trackedGoalId: string;
  date: string; // YYYY-MM-DD (for weekly goals, use week-start date)
  value?: number; // numeric goal
  done?: boolean; // verbal/weekly: did it (today or this week)
  note?: string; // optional note
}

/** Journal entry: timestamp, content, optional mood/tags for AI analysis. */
export interface JournalEntry {
  id: string;
  createdAt: string; // ISO 8601
  updatedAt?: string; // ISO 8601, set when edited
  content: string;
  mood?: string; // e.g. "calm", "anxious", "focused"
  tags?: string[]; // e.g. ["work", "reflection", "sleep"]
}

/** AI-parsed item from brain dump (before adding as Task/Goal). */
export interface AIParsedItem {
  title: string;
  suggestedGoalName?: string; // create or link to goal
  timesPerDay?: number;
  suggestedTimeSlots?: string[];
  estimatedMinutes: number;
  energyType: EnergyType;
  taskType: TaskType;
}

/** Item in "My list" before prioritization / adding to calendar. User sets category, importance, time, energy. */
export type ListItemCategory = 'personal' | 'work';

export interface MyListItem {
  id: string;
  title: string;
  category: ListItemCategory;
  /** 1–5, user's importance (5 = highest). */
  importance: number;
  /** User's time estimate in minutes (often wrong — just for prioritization/scheduling). */
  estimatedMinutes: number;
  energyType: EnergyType;
  /** Optional deadline (YYYY-MM-DD). */
  deadline?: string;
  /** Order after prioritization (lower = earlier). Sibling order among same parent (or root). */
  order: number;
  /** If set, this item is a sub-task of the item with this id. */
  parentId?: string;
  /** Checkbox completion; subtasks are execution units, parent can reflect progress. */
  completed?: boolean;
}

/** Calendar event (Google Calendar–style). start/end are ISO date-time strings. */
export type CalendarRecurrence = 'daily' | 'weekly' | 'monthly' | '';

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO date-time or date for all-day
  end: string;
  allDay?: boolean;
  description?: string;
  location?: string;
  color?: string; // hex or name
  recurrence?: CalendarRecurrence;
  /** Minutes before start to show a browser notification. 0 = at start. Only for local events. */
  remindMinutesBefore?: number;
  /** Optional checklist to show when this event is now/next (e.g. "Deep work", "Before trading"). If unset, use default GSD. */
  checklistId?: string;
}

/** Checklist item for a calendar period (day/week/month). Key = periodKey e.g. "day:2025-02-19". */
export interface CalendarPeriodChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

/** Period keys: "day:YYYY-MM-DD" | "week:YYYY-MM-DD" (Monday) | "month:YYYY-MM". */
export type CalendarPeriodKey = string;

/** A recurring daily checklist item template (appears every day). */
export interface DailyRecurringItem {
  id: string;
  title: string;
  order: number;
}

/** Per-day completion record for a daily recurring item. */
export interface DailyItemLog {
  id: string;
  dailyItemId: string;
  date: string; // YYYY-MM-DD
  done: boolean;
}

export interface AppState {
  goals: Goal[];
  tasks: Task[];
  scheduledBlocks: ScheduledBlock[];
  capacity: CapacitySettings;
  lastScheduledWeekStart?: string; // so we know when to re-run
  checklists: Checklist[];
  checklistItems: ChecklistItem[];
  trackedGoals: TrackedGoal[];
  goalLogs: GoalLog[];
  journalEntries: JournalEntry[];
  calendarEvents: CalendarEvent[];
  /** Notes per calendar period (day/week/month). Key = periodKey. */
  calendarPeriodNotes: Record<CalendarPeriodKey, string>;
  /** Checklist items per calendar period. Key = periodKey. */
  calendarPeriodChecklists: Record<CalendarPeriodKey, CalendarPeriodChecklistItem[]>;
  myListItems: MyListItem[];
  dailyRecurringItems: DailyRecurringItem[];
  dailyItemLogs: DailyItemLog[];
  /** Stored locally; used only for OpenAI API calls from this app. */
  openAiApiKey?: string;
  /** Fetched from Google Calendar; read-only in this app. */
  googleCalendarEvents: CalendarEvent[];
  /** Google OAuth client ID (from Cloud Console) for Calendar sync. */
  googleClientId?: string;
}

export const DEFAULT_CAPACITY: CapacitySettings = {
  weeklyDiscretionaryHours: 25,
  sleepStart: '23:00',
  sleepEnd: '07:00',
  workStart: '09:00',
  workEnd: '17:00',
  workDays: 5,
  maxDeepBlocksPerDay: 3,
  maxPlannedHoursPerDay: 6,
  bufferPercent: 25,
};
