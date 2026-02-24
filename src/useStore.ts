import { useState, useEffect, useCallback, useRef } from 'react';
import type { AppState, Goal, Task, ScheduledBlock, CapacitySettings, Checklist, ChecklistItem, TrackedGoal, GoalLog, JournalEntry, CalendarEvent, CalendarPeriodKey, CalendarPeriodChecklistItem, MyListItem, DailyRecurringItem, DailyItemLog } from './types';
import { applyUpdate, type StoreUpdate } from './store';
import { todayStr, yesterdayStr } from './lib/date';
import { loadFromSupabase, saveToSupabase, loadLocal, saveLocal } from './lib/persistence';
import { useAuth } from './contexts/AuthContext';

export function useStore(): [AppState, (update: StoreUpdate) => void] {
  const { user } = useAuth();
  const signedIn = Boolean(user);
  const cloudLoadedRef = useRef(false);
  const [state, setState] = useState<AppState>(() => loadLocal());

  // When user signs in, load state from Supabase once (then allow local edits to push up)
  useEffect(() => {
    if (!signedIn) {
      cloudLoadedRef.current = false;
      return;
    }
    if (cloudLoadedRef.current) return;
    cloudLoadedRef.current = true;
    loadFromSupabase().then((cloud) => {
      if (cloud) setState(cloud);
    });
  }, [signedIn]);

  // Persist state: Supabase (debounced) when signed in, else localStorage
  useEffect(() => {
    if (signedIn) {
      saveToSupabase(state);
    } else {
      saveLocal(state);
    }
  }, [state, signedIn]);

  const dispatch = useCallback((update: StoreUpdate) => {
    setState((s) => applyUpdate(s, update));
  }, []);

  return [state, dispatch];
}

// Helpers for common updates
export function useGoals(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const addGoal = useCallback(
    (g: Omit<Goal, 'id' | 'active'>) => {
      if (state.goals.filter((x) => x.active).length >= 3) return;
      const newGoal: Goal = {
        ...g,
        id: `goal-${Date.now()}`,
        active: true,
      };
      dispatch({ type: 'setGoals', goals: [...state.goals, newGoal] });
    },
    [state.goals, dispatch]
  );
  const updateGoal = useCallback(
    (id: string, patch: Partial<Goal>) => {
      dispatch({
        type: 'setGoals',
        goals: state.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      });
    },
    [state.goals, dispatch]
  );
  const removeGoal = useCallback(
    (id: string) => {
      dispatch({
        type: 'setGoals',
        goals: state.goals.map((g) => (g.id === id ? { ...g, active: false } : g)),
      });
    },
    [state.goals, dispatch]
  );
  const setGoals = useCallback(
    (goals: Goal[]) => dispatch({ type: 'setGoals', goals }),
    [dispatch]
  );
  return { goals: state.goals.filter((g) => g.active), addGoal, updateGoal, removeGoal, setGoals };
}

export function useTasks(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const addTask = useCallback(
    (t: Omit<Task, 'id' | 'completed'>) => {
      const newTask: Task = {
        ...t,
        id: `task-${Date.now()}`,
        completed: false,
      };
      dispatch({ type: 'setTasks', tasks: [...state.tasks, newTask] });
    },
    [state.tasks, dispatch]
  );
  const updateTask = useCallback(
    (id: string, patch: Partial<Task>) => {
      dispatch({
        type: 'setTasks',
        tasks: state.tasks.map((t) => (t.id === id ? { ...t, ...patch } : t)),
      });
    },
    [state.tasks, dispatch]
  );
  const completeTask = useCallback(
    (id: string) => {
      dispatch({
        type: 'setTasks',
        tasks: state.tasks.map((t) =>
          t.id === id ? { ...t, completed: true, completedAt: new Date().toISOString() } : t
        ),
      });
    },
    [state.tasks, dispatch]
  );
  const setTasks = useCallback(
    (tasks: Task[]) => dispatch({ type: 'setTasks', tasks }),
    [dispatch]
  );
  return { tasks: state.tasks, addTask, updateTask, completeTask, setTasks };
}

export function useScheduledBlocks(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const updateBlock = useCallback(
    (id: string, patch: Partial<ScheduledBlock>) => {
      dispatch({
        type: 'setScheduledBlocks',
        blocks: state.scheduledBlocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      });
    },
    [state.scheduledBlocks, dispatch]
  );
  const setBlocks = useCallback(
    (blocks: ScheduledBlock[]) => {
      dispatch({ type: 'setScheduledBlocks', blocks });
    },
    [dispatch]
  );
  return { blocks: state.scheduledBlocks, updateBlock, setBlocks };
}

export function useCapacity(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const setCapacity = useCallback(
    (capacity: CapacitySettings) => {
      dispatch({ type: 'setCapacity', capacity });
    },
    [dispatch]
  );
  return { capacity: state.capacity, setCapacity };
}

export function useChecklists(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const addChecklist = useCallback(
    (c: Omit<Checklist, 'id'>) => {
      const id = `cl-${Date.now()}`;
      dispatch({
        type: 'setChecklists',
        checklists: [...state.checklists, { ...c, id, itemIds: c.itemIds ?? [] }],
      });
    },
    [state.checklists, dispatch]
  );
  const updateChecklist = useCallback(
    (id: string, patch: Partial<Checklist>) => {
      dispatch({
        type: 'setChecklists',
        checklists: state.checklists.map((c) => (c.id === id ? { ...c, ...patch } : c)),
      });
    },
    [state.checklists, dispatch]
  );
  const removeChecklist = useCallback(
    (id: string) => {
      dispatch({
        type: 'setChecklists',
        checklists: state.checklists.filter((c) => c.id !== id),
      });
      dispatch({
        type: 'setChecklistItems',
        checklistItems: state.checklistItems.filter((i) => i.checklistId !== id),
      });
      // Unlink from tasks
      dispatch({
        type: 'setTasks',
        tasks: state.tasks.map((t) => (t.checklistId === id ? { ...t, checklistId: undefined } : t)),
      });
    },
    [state.checklists, state.checklistItems, state.tasks, dispatch]
  );
  const addItem = useCallback(
    (checklistId: string, text: string) => {
      const items = state.checklistItems.filter((i) => i.checklistId === checklistId);
      const order = items.length;
      const id = `cli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const newItem: ChecklistItem = { id, checklistId, text, order, done: false };
      dispatch({
        type: 'setChecklistItems',
        checklistItems: [...state.checklistItems, newItem],
      });
      const checklist = state.checklists.find((c) => c.id === checklistId);
      if (checklist) {
        dispatch({
          type: 'setChecklists',
          checklists: state.checklists.map((c) =>
            c.id === checklistId ? { ...c, itemIds: [...c.itemIds, id] } : c
          ),
        });
      }
    },
    [state.checklists, state.checklistItems, dispatch]
  );
  const updateItem = useCallback(
    (itemId: string, patch: Partial<ChecklistItem>) => {
      dispatch({
        type: 'setChecklistItems',
        checklistItems: state.checklistItems.map((i) => (i.id === itemId ? { ...i, ...patch } : i)),
      });
    },
    [state.checklistItems, dispatch]
  );
  const removeItem = useCallback(
    (checklistId: string, itemId: string) => {
      dispatch({
        type: 'setChecklistItems',
        checklistItems: state.checklistItems.filter((i) => i.id !== itemId),
      });
      dispatch({
        type: 'setChecklists',
        checklists: state.checklists.map((c) =>
          c.id === checklistId ? { ...c, itemIds: c.itemIds.filter((id) => id !== itemId) } : c
        ),
      });
    },
    [state.checklists, state.checklistItems, dispatch]
  );
  return {
    checklists: state.checklists,
    checklistItems: state.checklistItems,
    addChecklist,
    updateChecklist,
    removeChecklist,
    addItem,
    updateItem,
    removeItem,
  };
}

export function useTrackedGoals(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const addTrackedGoal = useCallback(
    (g: Omit<TrackedGoal, 'id'>) => {
      const id = `tg-${Date.now()}`;
      dispatch({
        type: 'setTrackedGoals',
        trackedGoals: [...state.trackedGoals, { ...g, id }],
      });
    },
    [state.trackedGoals, dispatch]
  );
  const updateTrackedGoal = useCallback(
    (id: string, patch: Partial<TrackedGoal>) => {
      dispatch({
        type: 'setTrackedGoals',
        trackedGoals: state.trackedGoals.map((g) => (g.id === id ? { ...g, ...patch } : g)),
      });
    },
    [state.trackedGoals, dispatch]
  );
  const removeTrackedGoal = useCallback(
    (id: string) => {
      dispatch({
        type: 'setTrackedGoals',
        trackedGoals: state.trackedGoals.filter((g) => g.id !== id),
      });
      dispatch({
        type: 'setGoalLogs',
        goalLogs: state.goalLogs.filter((l) => l.trackedGoalId !== id),
      });
    },
    [state.trackedGoals, state.goalLogs, dispatch]
  );
  const addOrUpdateLog = useCallback(
    (trackedGoalId: string, date: string, payload: { value?: number } | { done?: boolean; note?: string }) => {
      const existing = state.goalLogs.find((l) => l.trackedGoalId === trackedGoalId && l.date === date);
      const id = existing?.id ?? `gl-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const isNumeric = 'value' in payload && payload.value !== undefined;
      const newLog: GoalLog = (() => {
        if (existing) {
          return isNumeric
            ? { ...existing, value: payload.value }
            : { ...existing, done: (payload as { done?: boolean; note?: string }).done, note: (payload as { done?: boolean; note?: string }).note };
        }
        return isNumeric
          ? { id, trackedGoalId, date, value: payload.value }
          : { id, trackedGoalId, date, done: (payload as { done?: boolean; note?: string }).done, note: (payload as { done?: boolean; note?: string }).note };
      })();
      const otherLogs = state.goalLogs.filter((l) => !(l.trackedGoalId === trackedGoalId && l.date === date));
      dispatch({
        type: 'setGoalLogs',
        goalLogs: [...otherLogs, newLog],
      });
    },
    [state.goalLogs, dispatch]
  );
  return {
    trackedGoals: state.trackedGoals,
    goalLogs: state.goalLogs,
    addTrackedGoal,
    updateTrackedGoal,
    removeTrackedGoal,
    addOrUpdateLog,
  };
}

export function useJournals(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const addEntry = useCallback(
    (e: Omit<JournalEntry, 'id' | 'createdAt'>) => {
      const now = new Date().toISOString();
      const entry: JournalEntry = {
        ...e,
        id: `je-${Date.now()}`,
        createdAt: now,
      };
      dispatch({
        type: 'setJournalEntries',
        journalEntries: [...state.journalEntries, entry],
      });
    },
    [state.journalEntries, dispatch]
  );
  const updateEntry = useCallback(
    (id: string, patch: Partial<Pick<JournalEntry, 'content' | 'mood' | 'tags'>>) => {
      dispatch({
        type: 'setJournalEntries',
        journalEntries: state.journalEntries.map((entry) =>
          entry.id === id
            ? { ...entry, ...patch, updatedAt: new Date().toISOString() }
            : entry
        ),
      });
    },
    [state.journalEntries, dispatch]
  );
  const removeEntry = useCallback(
    (id: string) => {
      dispatch({
        type: 'setJournalEntries',
        journalEntries: state.journalEntries.filter((e) => e.id !== id),
      });
    },
    [state.journalEntries, dispatch]
  );
  return {
    journalEntries: state.journalEntries,
    addEntry,
    updateEntry,
    removeEntry,
  };
}

export function useCalendarEvents(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const setCalendarEvents = useCallback(
    (events: CalendarEvent[]) => dispatch({ type: 'setCalendarEvents', calendarEvents: events }),
    [dispatch]
  );
  const addEvent = useCallback(
    (e: Omit<CalendarEvent, 'id'>) => {
      const event: CalendarEvent = {
        ...e,
        id: `cal-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      };
      dispatch({
        type: 'setCalendarEvents',
        calendarEvents: [...state.calendarEvents, event],
      });
    },
    [state.calendarEvents, dispatch]
  );
  const updateEvent = useCallback(
    (id: string, patch: Partial<CalendarEvent>) => {
      dispatch({
        type: 'setCalendarEvents',
        calendarEvents: state.calendarEvents.map((ev) => (ev.id === id ? { ...ev, ...patch } : ev)),
      });
    },
    [state.calendarEvents, dispatch]
  );
  const removeEvent = useCallback(
    (id: string) => {
      dispatch({
        type: 'setCalendarEvents',
        calendarEvents: state.calendarEvents.filter((e) => e.id !== id),
      });
    },
    [state.calendarEvents, dispatch]
  );
  return {
    calendarEvents: state.calendarEvents,
    setCalendarEvents,
    addEvent,
    updateEvent,
    removeEvent,
  };
}

export function useGoogleCalendar(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const setGoogleCalendarEvents = useCallback(
    (events: CalendarEvent[]) => dispatch({ type: 'setGoogleCalendarEvents', googleCalendarEvents: events }),
    [dispatch]
  );
  const setGoogleClientId = useCallback(
    (id: string | undefined) => dispatch({ type: 'setGoogleClientId', googleClientId: id }),
    [dispatch]
  );
  return {
    googleCalendarEvents: state.googleCalendarEvents,
    googleClientId: state.googleClientId,
    setGoogleCalendarEvents,
    setGoogleClientId,
  };
}

export function useCalendarPeriods(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const setPeriodNote = useCallback(
    (periodKey: CalendarPeriodKey, text: string) => {
      dispatch({
        type: 'setCalendarPeriodNotes',
        calendarPeriodNotes: { ...state.calendarPeriodNotes, [periodKey]: text },
      });
    },
    [state.calendarPeriodNotes, dispatch]
  );
  const setPeriodChecklist = useCallback(
    (periodKey: CalendarPeriodKey, items: CalendarPeriodChecklistItem[]) => {
      dispatch({
        type: 'setCalendarPeriodChecklists',
        calendarPeriodChecklists: { ...state.calendarPeriodChecklists, [periodKey]: items },
      });
    },
    [state.calendarPeriodChecklists, dispatch]
  );
  const getNote = useCallback(
    (periodKey: CalendarPeriodKey) => state.calendarPeriodNotes[periodKey] ?? '',
    [state.calendarPeriodNotes]
  );
  const getChecklist = useCallback(
    (periodKey: CalendarPeriodKey) => state.calendarPeriodChecklists[periodKey] ?? [],
    [state.calendarPeriodChecklists]
  );
  const addChecklistItem = useCallback(
    (periodKey: CalendarPeriodKey, text: string) => {
      const list = state.calendarPeriodChecklists[periodKey] ?? [];
      const item: CalendarPeriodChecklistItem = {
        id: `cp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        text: text.trim(),
        done: false,
      };
      if (!item.text) return;
      dispatch({
        type: 'setCalendarPeriodChecklists',
        calendarPeriodChecklists: { ...state.calendarPeriodChecklists, [periodKey]: [...list, item] },
      });
    },
    [state.calendarPeriodChecklists, dispatch]
  );
  const toggleChecklistItem = useCallback(
    (periodKey: CalendarPeriodKey, id: string) => {
      const list = state.calendarPeriodChecklists[periodKey] ?? [];
      dispatch({
        type: 'setCalendarPeriodChecklists',
        calendarPeriodChecklists: {
          ...state.calendarPeriodChecklists,
          [periodKey]: list.map((i) => (i.id === id ? { ...i, done: !i.done } : i)),
        },
      });
    },
    [state.calendarPeriodChecklists, dispatch]
  );
  const updateChecklistItem = useCallback(
    (periodKey: CalendarPeriodKey, id: string, patch: Partial<Pick<CalendarPeriodChecklistItem, 'text'>>) => {
      const list = state.calendarPeriodChecklists[periodKey] ?? [];
      dispatch({
        type: 'setCalendarPeriodChecklists',
        calendarPeriodChecklists: {
          ...state.calendarPeriodChecklists,
          [periodKey]: list.map((i) => (i.id === id ? { ...i, ...patch } : i)),
        },
      });
    },
    [state.calendarPeriodChecklists, dispatch]
  );
  const removeChecklistItem = useCallback(
    (periodKey: CalendarPeriodKey, id: string) => {
      const list = state.calendarPeriodChecklists[periodKey] ?? [];
      dispatch({
        type: 'setCalendarPeriodChecklists',
        calendarPeriodChecklists: {
          ...state.calendarPeriodChecklists,
          [periodKey]: list.filter((i) => i.id !== id),
        },
      });
    },
    [state.calendarPeriodChecklists, dispatch]
  );
  const clearPeriodNote = useCallback(
    (periodKey: CalendarPeriodKey) => {
      const next = { ...state.calendarPeriodNotes };
      delete next[periodKey];
      dispatch({ type: 'setCalendarPeriodNotes', calendarPeriodNotes: next });
    },
    [state.calendarPeriodNotes, dispatch]
  );

  const moveYesterdayChecklistToToday = useCallback(() => {
    const today = todayStr();
    const yesterday = yesterdayStr();
    const yesterdayKey: CalendarPeriodKey = `day:${yesterday}`;
    const todayKey: CalendarPeriodKey = `day:${today}`;
    const yesterdayList = state.calendarPeriodChecklists[yesterdayKey] ?? [];
    const undone = yesterdayList.filter((i) => !i.done);
    if (undone.length === 0) return;
    const todayList = state.calendarPeriodChecklists[todayKey] ?? [];
    const ts = Date.now();
    const newItems: CalendarPeriodChecklistItem[] = undone.map((i, idx) => ({
      id: `cp-${ts}-${idx}-${Math.random().toString(36).slice(2, 9)}`,
      text: i.text,
      done: false,
    }));
    const yesterdayFiltered = yesterdayList.filter((i) => i.done);
    dispatch({
      type: 'setCalendarPeriodChecklists',
      calendarPeriodChecklists: {
        ...state.calendarPeriodChecklists,
        [yesterdayKey]: yesterdayFiltered,
        [todayKey]: [...todayList, ...newItems],
      },
    });
  }, [state.calendarPeriodChecklists, dispatch]);

  return {
    getNote,
    setPeriodNote,
    clearPeriodNote,
    getChecklist,
    setPeriodChecklist,
    addChecklistItem,
    toggleChecklistItem,
    updateChecklistItem,
    removeChecklistItem,
    moveYesterdayChecklistToToday,
  };
}

export function useMyListItems(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const setMyListItems = useCallback(
    (items: MyListItem[]) => dispatch({ type: 'setMyListItems', myListItems: items }),
    [dispatch]
  );
  const addItem = useCallback(
    (item: Omit<MyListItem, 'id' | 'order'>): string => {
      const siblings = state.myListItems.filter((i) => (i.parentId ?? null) === (item.parentId ?? null));
      const maxOrder = siblings.length ? Math.max(...siblings.map((i) => i.order)) : 0;
      const id = `mli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      dispatch({
        type: 'setMyListItems',
        myListItems: [
          ...state.myListItems,
          { ...item, id, order: maxOrder + 1, completed: item.completed ?? false },
        ],
      });
      return id;
    },
    [state.myListItems, dispatch]
  );

  /** Add a root-level parent and one empty subtask so every parent has at least one subtask. */
  const addParentWithEmptySubtask = useCallback(
    (item: Omit<MyListItem, 'id' | 'order'>) => {
      const roots = state.myListItems.filter((i) => !i.parentId);
      const maxOrder = roots.length ? Math.max(...roots.map((i) => i.order)) : 0;
      const parentId = `mli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const parent = { ...item, id: parentId, order: maxOrder + 1, completed: item.completed ?? false };
      const child: MyListItem = {
        id: `mli-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        order: 0,
        title: '',
        category: 'personal',
        importance: 3,
        estimatedMinutes: 30,
        energyType: 'Light',
        deadline: undefined,
        parentId,
        completed: false,
      };
      dispatch({
        type: 'setMyListItems',
        myListItems: [...state.myListItems, parent, child],
      });
    },
    [state.myListItems, dispatch]
  );
  const updateItem = useCallback(
    (id: string, patch: Partial<MyListItem>) => {
      dispatch({
        type: 'setMyListItems',
        myListItems: state.myListItems.map((i) => (i.id === id ? { ...i, ...patch } : i)),
      });
    },
    [state.myListItems, dispatch]
  );
  const removeItem = useCallback(
    (id: string) => {
      const toRemove = new Set<string>([id]);
      state.myListItems.forEach((i) => {
        if (i.parentId && toRemove.has(i.parentId)) toRemove.add(i.id);
      });
      let changed = true;
      while (changed) {
        changed = false;
        state.myListItems.forEach((i) => {
          if (i.parentId && toRemove.has(i.parentId) && !toRemove.has(i.id)) {
            toRemove.add(i.id);
            changed = true;
          }
        });
      }
      dispatch({
        type: 'setMyListItems',
        myListItems: state.myListItems.filter((i) => !toRemove.has(i.id)),
      });
    },
    [state.myListItems, dispatch]
  );
  const reorder = useCallback(
    (items: MyListItem[]) => dispatch({ type: 'setMyListItems', myListItems: items }),
    [dispatch]
  );
  const moveUp = useCallback(
    (id: string) => {
      const item = state.myListItems.find((i) => i.id === id);
      if (!item) return;
      const siblings = state.myListItems
        .filter((i) => (i.parentId ?? null) === (item.parentId ?? null))
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((i) => i.id === id);
      if (idx <= 0) return;
      const prev = siblings[idx - 1];
      dispatch({
        type: 'setMyListItems',
        myListItems: state.myListItems.map((i) => {
          if (i.id === id) return { ...i, order: prev.order };
          if (i.id === prev.id) return { ...i, order: item.order };
          return i;
        }),
      });
    },
    [state.myListItems, dispatch]
  );
  const moveDown = useCallback(
    (id: string) => {
      const item = state.myListItems.find((i) => i.id === id);
      if (!item) return;
      const siblings = state.myListItems
        .filter((i) => (i.parentId ?? null) === (item.parentId ?? null))
        .sort((a, b) => a.order - b.order);
      const idx = siblings.findIndex((i) => i.id === id);
      if (idx < 0 || idx >= siblings.length - 1) return;
      const next = siblings[idx + 1];
      dispatch({
        type: 'setMyListItems',
        myListItems: state.myListItems.map((i) => {
          if (i.id === id) return { ...i, order: next.order };
          if (i.id === next.id) return { ...i, order: item.order };
          return i;
        }),
      });
    },
    [state.myListItems, dispatch]
  );
  return { myListItems: state.myListItems, setMyListItems, addItem, addParentWithEmptySubtask, updateItem, removeItem, reorder, moveUp, moveDown };
}

// ---- Daily Recurring Items & Logs ----
export function useDailyRecurring(state: AppState, dispatch: (u: StoreUpdate) => void) {
  const items = state.dailyRecurringItems ?? [];
  const logs = state.dailyItemLogs ?? [];

  const addItem = useCallback(
    (title: string) => {
      const maxOrder = items.length ? Math.max(...items.map((i) => i.order)) : 0;
      const newItem: DailyRecurringItem = {
        id: `dri-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        title: title.trim(),
        order: maxOrder + 1,
      };
      dispatch({ type: 'setDailyRecurringItems', items: [...items, newItem] });
    },
    [items, dispatch]
  );

  const updateItem = useCallback(
    (id: string, patch: Partial<DailyRecurringItem>) => {
      dispatch({ type: 'setDailyRecurringItems', items: items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });
    },
    [items, dispatch]
  );

  const removeItem = useCallback(
    (id: string) => {
      dispatch({ type: 'setDailyRecurringItems', items: items.filter((i) => i.id !== id) });
      dispatch({ type: 'setDailyItemLogs', logs: logs.filter((l) => l.dailyItemId !== id) });
    },
    [items, logs, dispatch]
  );

  const getLog = useCallback(
    (dailyItemId: string, date: string): DailyItemLog | undefined =>
      logs.find((l) => l.dailyItemId === dailyItemId && l.date === date),
    [logs]
  );

  const toggleLog = useCallback(
    (dailyItemId: string, date: string) => {
      const existing = logs.find((l) => l.dailyItemId === dailyItemId && l.date === date);
      if (existing) {
        dispatch({ type: 'setDailyItemLogs', logs: logs.map((l) => (l.id === existing.id ? { ...l, done: !l.done } : l)) });
      } else {
        const newLog: DailyItemLog = {
          id: `dil-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          dailyItemId,
          date,
          done: true,
        };
        dispatch({ type: 'setDailyItemLogs', logs: [...logs, newLog] });
      }
    },
    [logs, dispatch]
  );

  /** Ensure every recurring item has a log for the given date (creates "not done" logs for items without one). */
  const ensureLogsForDate = useCallback(
    (date: string) => {
      const missing = items.filter((i) => !logs.some((l) => l.dailyItemId === i.id && l.date === date));
      if (missing.length === 0) return;
      const newLogs: DailyItemLog[] = missing.map((i) => ({
        id: `dil-${Date.now()}-${Math.random().toString(36).slice(2, 9)}-${i.id}`,
        dailyItemId: i.id,
        date,
        done: false,
      }));
      dispatch({ type: 'setDailyItemLogs', logs: [...logs, ...newLogs] });
    },
    [items, logs, dispatch]
  );

  const getLogsForDate = useCallback(
    (date: string) => logs.filter((l) => l.date === date),
    [logs]
  );

  return { items, logs, addItem, updateItem, removeItem, getLog, toggleLog, ensureLogsForDate, getLogsForDate };
}
