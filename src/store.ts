import type { AppState, CapacitySettings, Goal, Task, ScheduledBlock, Checklist, ChecklistItem, TrackedGoal, GoalLog, JournalEntry, CalendarEvent, CalendarPeriodKey, CalendarPeriodChecklistItem, MyListItem, DailyRecurringItem, DailyItemLog } from './types';
import { DEFAULT_CAPACITY } from './types';

const STORAGE_KEY = 'life-planner-state';
const OLD_STORAGE_KEY = 'adhd-planner-state';

/** Merge parsed (e.g. from API or localStorage) into full AppState. */
export function mergeParsedState(parsed: Partial<AppState> | null): AppState {
  if (!parsed) return getInitialState();
  return {
    goals: parsed.goals ?? [],
    tasks: parsed.tasks ?? [],
    scheduledBlocks: parsed.scheduledBlocks ?? [],
    capacity: { ...DEFAULT_CAPACITY, ...parsed.capacity },
    lastScheduledWeekStart: parsed.lastScheduledWeekStart,
    checklists: parsed.checklists ?? [],
    checklistItems: parsed.checklistItems ?? [],
    trackedGoals: parsed.trackedGoals ?? [],
    goalLogs: parsed.goalLogs ?? [],
    journalEntries: parsed.journalEntries ?? [],
    calendarEvents: parsed.calendarEvents ?? [],
    calendarPeriodNotes: parsed.calendarPeriodNotes ?? {},
    calendarPeriodChecklists: parsed.calendarPeriodChecklists ?? {},
    myListItems: parsed.myListItems ?? [],
    dailyRecurringItems: parsed.dailyRecurringItems ?? [],
    dailyItemLogs: parsed.dailyItemLogs ?? [],
    openAiApiKey: parsed.openAiApiKey,
    googleCalendarEvents: parsed.googleCalendarEvents ?? [],
    googleClientId: parsed.googleClientId,
  };
}

function load(): AppState {
  try {
    let raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const oldRaw = localStorage.getItem(OLD_STORAGE_KEY);
      if (oldRaw) {
        raw = oldRaw;
        localStorage.setItem(STORAGE_KEY, oldRaw);
        localStorage.removeItem(OLD_STORAGE_KEY);
      }
    }
    if (!raw) return getInitialState();
    const parsed = JSON.parse(raw) as AppState;
    return mergeParsedState(parsed);
  } catch {
    return getInitialState();
  }
}

function save(state: AppState): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function getInitialState(): AppState {
  return {
    goals: [],
    tasks: [],
    scheduledBlocks: [],
    capacity: { ...DEFAULT_CAPACITY },
    checklists: [],
    checklistItems: [],
    trackedGoals: [],
    goalLogs: [],
    journalEntries: [],
    calendarEvents: [],
    calendarPeriodNotes: {},
    calendarPeriodChecklists: {},
    myListItems: [],
    dailyRecurringItems: [],
    dailyItemLogs: [],
    googleCalendarEvents: [],
  };
}

export const store = {
  load,
  save,
};

export type StoreUpdate =
  | { type: 'setGoals'; goals: Goal[] }
  | { type: 'setTasks'; tasks: Task[] }
  | { type: 'setScheduledBlocks'; blocks: ScheduledBlock[] }
  | { type: 'setCapacity'; capacity: CapacitySettings }
  | { type: 'setLastScheduledWeekStart'; weekStart: string }
  | { type: 'setChecklists'; checklists: Checklist[] }
  | { type: 'setChecklistItems'; checklistItems: ChecklistItem[] }
  | { type: 'setTrackedGoals'; trackedGoals: TrackedGoal[] }
  | { type: 'setGoalLogs'; goalLogs: GoalLog[] }
  | { type: 'setJournalEntries'; journalEntries: JournalEntry[] }
  | { type: 'setCalendarEvents'; calendarEvents: CalendarEvent[] }
  | { type: 'setCalendarPeriodNotes'; calendarPeriodNotes: Record<CalendarPeriodKey, string> }
  | { type: 'setCalendarPeriodChecklists'; calendarPeriodChecklists: Record<CalendarPeriodKey, CalendarPeriodChecklistItem[]> }
  | { type: 'setMyListItems'; myListItems: MyListItem[] }
  | { type: 'setDailyRecurringItems'; items: DailyRecurringItem[] }
  | { type: 'setDailyItemLogs'; logs: DailyItemLog[] }
  | { type: 'setOpenAiApiKey'; key: string | undefined }
  | { type: 'setGoogleCalendarEvents'; googleCalendarEvents: CalendarEvent[] }
  | { type: 'setGoogleClientId'; googleClientId: string | undefined }
  | { type: 'replace'; state: AppState };

export function applyUpdate(state: AppState, update: StoreUpdate): AppState {
  switch (update.type) {
    case 'setGoals':
      return { ...state, goals: update.goals };
    case 'setTasks':
      return { ...state, tasks: update.tasks };
    case 'setScheduledBlocks':
      return { ...state, scheduledBlocks: update.blocks };
    case 'setCapacity':
      return { ...state, capacity: update.capacity };
    case 'setLastScheduledWeekStart':
      return { ...state, lastScheduledWeekStart: update.weekStart };
    case 'setChecklists':
      return { ...state, checklists: update.checklists };
    case 'setChecklistItems':
      return { ...state, checklistItems: update.checklistItems };
    case 'setTrackedGoals':
      return { ...state, trackedGoals: update.trackedGoals };
    case 'setGoalLogs':
      return { ...state, goalLogs: update.goalLogs };
    case 'setJournalEntries':
      return { ...state, journalEntries: update.journalEntries };
    case 'setCalendarEvents':
      return { ...state, calendarEvents: update.calendarEvents };
    case 'setCalendarPeriodNotes':
      return { ...state, calendarPeriodNotes: update.calendarPeriodNotes };
    case 'setCalendarPeriodChecklists':
      return { ...state, calendarPeriodChecklists: update.calendarPeriodChecklists };
    case 'setMyListItems':
      return { ...state, myListItems: update.myListItems };
    case 'setDailyRecurringItems':
      return { ...state, dailyRecurringItems: update.items };
    case 'setDailyItemLogs':
      return { ...state, dailyItemLogs: update.logs };
    case 'setOpenAiApiKey':
      return { ...state, openAiApiKey: update.key };
    case 'setGoogleCalendarEvents':
      return { ...state, googleCalendarEvents: update.googleCalendarEvents };
    case 'setGoogleClientId':
      return { ...state, googleClientId: update.googleClientId };
    case 'replace':
      return update.state;
    default:
      return state;
  }
}
