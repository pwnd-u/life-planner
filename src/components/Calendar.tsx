import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useGoogleLogin } from '@react-oauth/google';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import type { EventClickArg, EventDropArg, DateSelectArg, DatesSetArg } from '@fullcalendar/core';
import type { EventResizeDoneArg } from '@fullcalendar/interaction';
import type { CalendarEvent, CalendarPeriodChecklistItem, CalendarRecurrence, Checklist, ChecklistItem, DailyRecurringItem, DailyItemLog, MyListItem } from '../types';
import { getWeekStart, getMonthKey, getDaysInWeek, getDaysInMonth, getWeekStartsInMonth, getDaysInRange, todayStr } from '../lib/date';
import { formatDate } from '../lib/date';
import { fetchGoogleCalendarEvents, defaultTimeMin, defaultTimeMax } from '../lib/googleCalendar';

interface PeriodActions {
  getNote: (key: string) => string;
  setPeriodNote: (key: string, text: string) => void;
  clearPeriodNote: (key: string) => void;
  getChecklist: (key: string) => CalendarPeriodChecklistItem[];
  addChecklistItem: (key: string, text: string) => void;
  toggleChecklistItem: (key: string, id: string) => void;
  updateChecklistItem: (key: string, id: string, patch: { text?: string }) => void;
  removeChecklistItem: (key: string, id: string) => void;
  moveYesterdayChecklistToToday?: () => void;
}

interface Props {
  events: CalendarEvent[];
  readOnlyEventIds?: Set<string>;
  onAddEvent: (e: Omit<CalendarEvent, 'id'>) => void;
  onUpdateEvent: (id: string, patch: Partial<CalendarEvent>) => void;
  onRemoveEvent: (id: string) => void;
  periodActions: PeriodActions;
  /** For event checklist dropdown and Now/Next checklist display. Default GSD = first named "GSD" or first checklist. */
  checklists?: Checklist[];
  checklistItems?: ChecklistItem[];
  googleClientId?: string;
  onSetGoogleClientId?: (id: string | undefined) => void;
  googleCalendarEvents?: CalendarEvent[];
  onSyncFromGoogle?: (events: CalendarEvent[]) => void;
  /** When set, adding a checklist item also adds a My List item with the period-derived deadline (day→that day, week→Friday, month→25th). */
  onAddChecklistItemToMyList?: (periodKey: string, title: string) => void;
  /** When set, sync existing calendar checklist items to My List (once on mount). */
  onSyncExistingChecklistToMyList?: () => void;
  myListItems?: MyListItem[];
  // Daily recurring items
  dailyRecurringItems?: DailyRecurringItem[];
  dailyItemLogs?: DailyItemLog[];
  onAddDailyItem?: (title: string) => void;
  onUpdateDailyItem?: (id: string, patch: Partial<DailyRecurringItem>) => void;
  onRemoveDailyItem?: (id: string) => void;
  onToggleDailyLog?: (dailyItemId: string, date: string) => void;
  getDailyLog?: (dailyItemId: string, date: string) => DailyItemLog | undefined;
}

function toCalendarEvent(
  ev: CalendarEvent,
  editable: boolean
): { id: string; title: string; start: string; end: string; allDay?: boolean; backgroundColor?: string; editable: boolean; extendedProps: Record<string, unknown> } {
  return {
    id: ev.id,
    title: ev.title,
    start: ev.start,
    end: ev.end,
    allDay: ev.allDay,
    backgroundColor: ev.color,
    editable,
    extendedProps: { description: ev.description, location: ev.location },
  };
}

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const h = String(d.getHours()).padStart(2, '0');
  const min = String(d.getMinutes()).padStart(2, '0');
  return `${y}-${m}-${day}T${h}:${min}`;
}

function toISOFromInput(value: string): string {
  if (!value) return '';
  return value.length === 16 ? `${value}:00` : value;
}

/** Default range for "Add event" button: today, next full hour, 1 hour duration. */
function getDefaultNewEventRange(): { start: string; end: string; allDay: boolean } {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${day}`;
  let hour = d.getHours();
  if (d.getMinutes() > 0 || d.getSeconds() > 0) hour += 1;
  const start = `${dateStr}T${String(hour).padStart(2, '0')}:00:00`;
  const end = `${dateStr}T${String(hour + 1).padStart(2, '0')}:00:00`;
  return { start, end, allDay: false };
}

function getPeriodKey(viewType: string, startStr: string): string {
  const dateStr = startStr.slice(0, 10);
  if (viewType === 'timeGridDay') return `day:${dateStr}`;
  if (viewType === 'timeGridWeek') return `week:${getWeekStart(dateStr)}`;
  return `month:${getMonthKey(dateStr)}`;
}

function periodLabel(key: string): string {
  const [, value] = key.split(':');
  if (key.startsWith('day:')) return formatDate(value);
  if (key.startsWith('week:')) return `Week of ${formatDate(value)}`;
  const [y, m] = value.split('-');
  const d = new Date(Number(y), Number(m) - 1, 1);
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const REMIND_OPTIONS = [0, 5, 10, 15, 30] as const;

const EVENT_COLORS = [
  { value: '', label: 'Default' },
  { value: '#3b82f6', label: 'Blue' },
  { value: '#22c55e', label: 'Green' },
  { value: '#f59e0b', label: 'Amber' },
  { value: '#ef4444', label: 'Red' },
  { value: '#a855f7', label: 'Purple' },
  { value: '#14b8a6', label: 'Teal' },
  { value: '#ec4899', label: 'Pink' },
  { value: '#64748b', label: 'Slate' },
] as const;

/** Resolve which checklist to show for an event: event.checklistId, or default GSD (first named "GSD" or first checklist). */
function getChecklistForEvent(
  event: CalendarEvent,
  checklists: Checklist[],
  checklistItems: ChecklistItem[]
): { name: string; items: ChecklistItem[] } | null {
  const list = event.checklistId
    ? checklists.find((c) => c.id === event.checklistId)
    : checklists.find((c) => c.name === 'GSD') ?? checklists[0];
  if (!list) return null;
  const items = list.itemIds
    .map((id) => checklistItems.find((i) => i.id === id))
    .filter((i): i is ChecklistItem => i != null);
  return { name: list.name, items };
}

/** Today's timed events (start has time), sorted by start. */
function getTodaysTimedEvents(events: CalendarEvent[]): CalendarEvent[] {
  const today = todayStr();
  return events
    .filter((ev) => {
      if (ev.allDay) return false;
      const startStr = ev.start.slice(0, 10);
      return startStr === today;
    })
    .sort((a, b) => a.start.localeCompare(b.start));
}

/** Current block (event containing now) and next block (first after now). */
function getNowAndNext(events: CalendarEvent[]): { now: CalendarEvent | null; next: CalendarEvent | null } {
  const now = Date.now();
  let current: CalendarEvent | null = null;
  let next: CalendarEvent | null = null;
  for (const ev of events) {
    const start = new Date(ev.start).getTime();
    const end = new Date(ev.end).getTime();
    if (now >= start && now < end) current = ev;
    if (start > now && next == null) next = ev;
  }
  if (current == null && events.length > 0 && new Date(events[0].start).getTime() > now) next = events[0];
  return { now: current, next };
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

export default function Calendar({
  events,
  readOnlyEventIds = new Set(),
  onAddEvent,
  onUpdateEvent,
  onRemoveEvent,
  periodActions,
  checklists = [],
  checklistItems = [],
  googleClientId,
  onSetGoogleClientId,
  googleCalendarEvents = [],
  onSyncFromGoogle,
  onAddChecklistItemToMyList,
  onSyncExistingChecklistToMyList,
  myListItems = [],
  dailyRecurringItems = [],
  dailyItemLogs = [],
  onAddDailyItem,
  onUpdateDailyItem,
  onRemoveDailyItem,
  onToggleDailyLog,
  getDailyLog,
}: Props) {
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [newEventRange, setNewEventRange] = useState<{ start: string; end: string; allDay: boolean } | null>(null);
  const [currentView, setCurrentView] = useState<string>('timeGridDay');
  const [currentStart, setCurrentStart] = useState<string>(() => todayStr() + 'T00:00:00');
  const calendarRef = useRef<InstanceType<typeof FullCalendar>>(null);
  const newEventFormRef = useRef<HTMLFormElement>(null);
  const [currentEnd, setCurrentEnd] = useState<string>('');
  // Initial scroll time for first load: 1 hour before now so current slot is visible, not hidden at the very top
  const initialScrollTime = useMemo(() => {
    const d = new Date();
    let hour = d.getHours() - 1;
    if (hour < 0) hour = 0;
    // Keep in visible day range (same as slotMinTime = 06:00)
    if (hour < 6) hour = 6;
    const minute = d.getMinutes();
    return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00`;
  }, []);
  const [includeWeekly, setIncludeWeekly] = useState(false);
  const [includeDaily, setIncludeDaily] = useState(false);
  const [editingChecklistId, setEditingChecklistId] = useState<{ key: string; id: string } | null>(null);
  const [newChecklistText, setNewChecklistText] = useState('');
  const [newItemForKey, setNewItemForKey] = useState<string | null>(null);
  const [addToPeriodKey, setAddToPeriodKey] = useState('');
  const [newLowerChecklistText, setNewLowerChecklistText] = useState('');
  const [googleSyncLoading, setGoogleSyncLoading] = useState(false);
  const [googleSyncError, setGoogleSyncError] = useState<string | null>(null);
  const [googleClientIdInput, setGoogleClientIdInput] = useState(googleClientId ?? '');
  const reminderFiredRef = useRef<Set<string>>(new Set());
  const [checklistConnectId, setChecklistConnectId] = useState('');
  const [checklistSearchQuery, setChecklistSearchQuery] = useState('');
  const [showBlockChecklist, setShowBlockChecklist] = useState(false);

  useEffect(() => {
    if (newEventRange) {
      setChecklistConnectId('');
      setChecklistSearchQuery('');
    } else if (selectedEvent) {
      setChecklistConnectId(selectedEvent.checklistId ?? '');
      setChecklistSearchQuery('');
    }
  }, [newEventRange, selectedEvent]);

  const periodKey = currentStart ? getPeriodKey(currentView, currentStart) : '';
  const label = periodKey ? periodLabel(periodKey) : '';

  const todaysTimedEvents = useMemo(() => getTodaysTimedEvents(events), [events]);
  const { now: nowBlock, next: nextBlock } = useMemo(() => getNowAndNext(todaysTimedEvents), [todaysTimedEvents]);

  const fcEvents = useMemo(
    () => events.map((ev) => toCalendarEvent(ev, !readOnlyEventIds.has(ev.id))),
    [events, readOnlyEventIds]
  );

  const login = useGoogleLogin({
    scope: 'https://www.googleapis.com/auth/calendar.events.readonly',
    onSuccess: async (tokenResponse) => {
      setGoogleSyncError(null);
      setGoogleSyncLoading(true);
      try {
        const eventsFromGoogle = await fetchGoogleCalendarEvents(
          tokenResponse.access_token,
          defaultTimeMin(),
          defaultTimeMax()
        );
        onSyncFromGoogle?.(eventsFromGoogle);
      } catch (e) {
        setGoogleSyncError(e instanceof Error ? e.message : 'Sync failed');
      } finally {
        setGoogleSyncLoading(false);
      }
    },
    onError: () => setGoogleSyncError('Sign-in was cancelled or failed'),
  });

  const selectedEventReadOnly = selectedEvent ? readOnlyEventIds.has(selectedEvent.id) : false;

  // Reminders: check every minute, show notification when remindAt <= now (only for events with remindMinutesBefore set)
  useEffect(() => {
    const run = () => {
      const now = Date.now();
      for (const ev of events) {
        if (ev.allDay || ev.remindMinutesBefore == null) continue;
        const startMs = new Date(ev.start).getTime();
        const remindAt = startMs - ev.remindMinutesBefore * 60 * 1000;
        if (now < remindAt) continue;
        const key = `${ev.id}-${remindAt}`;
        if (reminderFiredRef.current.has(key)) continue;
        reminderFiredRef.current.add(key);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
          const mins = ev.remindMinutesBefore === 0 ? 'now' : `in ${ev.remindMinutesBefore} min`;
          new Notification('Life Planner', { body: `${mins}: ${ev.title}`, tag: key });
        }
      }
    };
    run();
    const id = setInterval(run, 60 * 1000);
    return () => clearInterval(id);
  }, [events]);

  const handleRequestReminderPermission = useCallback(() => {
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      Notification.requestPermission();
    }
  }, []);

  const handleAddChecklistItem = useCallback(
    (key: string, text: string) => {
      periodActions.addChecklistItem(key, text);
      onAddChecklistItemToMyList?.(key, text);
    },
    [periodActions, onAddChecklistItemToMyList]
  );

  useEffect(() => {
    onSyncExistingChecklistToMyList?.();
  }, [onSyncExistingChecklistToMyList]);

  const handleDatesSet = useCallback((arg: DatesSetArg) => {
    setCurrentView(arg.view.type);
    setCurrentStart(arg.startStr);
    setCurrentEnd(arg.endStr ?? '');
    // When viewing today in day or week view, scroll to current time (not 12am)
    const viewType = arg.view.type;
    if (viewType !== 'timeGridDay' && viewType !== 'timeGridWeek') return;
    const today = todayStr();
    const startDate = arg.startStr.slice(0, 10);
    const endDate = (arg.endStr ?? arg.startStr).slice(0, 10);
    const viewingToday = viewType === 'timeGridDay' ? startDate === today : startDate <= today && today < endDate;
    if (!viewingToday || !calendarRef.current) return;
    const now = new Date();
    const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:00`;
    const scrollToNow = () => {
      const api = calendarRef.current?.getApi();
      if (api) api.scrollToTime(timeStr);
    };
    // Run after FullCalendar has painted the time grid; delay needed for scroll container to be ready
    setTimeout(scrollToNow, 50);
    setTimeout(scrollToNow, 200);
  }, []);

  const handleSelect = useCallback(
    (arg: DateSelectArg) => {
      setNewEventRange({
        start: arg.startStr,
        end: arg.endStr,
        allDay: arg.allDay,
      });
      setSelectedEvent(null);
    },
    []
  );

  const handleEventClick = useCallback((arg: EventClickArg) => {
    const ev = events.find((e) => e.id === arg.event.id);
    if (ev) setSelectedEvent(ev);
    setNewEventRange(null);
    arg.jsEvent.preventDefault();
  }, [events]);

  const handleEventDrop = useCallback(
    (arg: EventDropArg) => {
      if (readOnlyEventIds.has(arg.event.id)) return;
      const ev = events.find((e) => e.id === arg.event.id);
      if (!ev) return;
      onUpdateEvent(ev.id, {
        start: arg.event.startStr,
        end: arg.event.endStr ?? ev.end,
      });
    },
    [events, onUpdateEvent, readOnlyEventIds]
  );

  const handleEventResize = useCallback(
    (arg: EventResizeDoneArg) => {
      if (readOnlyEventIds.has(arg.event.id)) return;
      const ev = events.find((e) => e.id === arg.event.id);
      if (!ev) return;
      onUpdateEvent(ev.id, {
        start: arg.event.startStr,
        end: arg.event.endStr ?? ev.end,
      });
    },
    [events, onUpdateEvent, readOnlyEventIds]
  );

  const handleAddNew = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!newEventRange) return;
      const form = e.currentTarget;
      const title = (form.querySelector('[name="title"]') as HTMLInputElement)?.value?.trim();
      if (!title) return;
      const startInput = (form.querySelector('[name="start"]') as HTMLInputElement)?.value;
      const endInput = (form.querySelector('[name="end"]') as HTMLInputElement)?.value;
      const recurrenceVal = (form.querySelector('[name="recurrence"]') as HTMLSelectElement)?.value as CalendarRecurrence;
      const remindVal = (form.querySelector('[name="remind"]') as HTMLSelectElement)?.value;
      const remindMinutesBefore = remindVal ? Number(remindVal) : undefined;
      const colorVal = (form.querySelector('[name="color"]:checked') as HTMLInputElement)?.value?.trim() || undefined;
      const allDay = (form.querySelector('[name="allDay"]') as HTMLInputElement)?.checked ?? newEventRange.allDay;
      const checklistVal = (form.querySelector('[name="checklist"]') as HTMLInputElement)?.value?.trim();
      onAddEvent({
        title,
        start: startInput ? toISOFromInput(startInput) : newEventRange.start,
        end: endInput ? toISOFromInput(endInput) : newEventRange.end,
        allDay,
        description: (form.querySelector('[name="description"]') as HTMLTextAreaElement)?.value?.trim() || undefined,
        location: (form.querySelector('[name="location"]') as HTMLInputElement)?.value?.trim() || undefined,
        recurrence: recurrenceVal || undefined,
        remindMinutesBefore: remindMinutesBefore != null && !allDay ? remindMinutesBefore : undefined,
        color: colorVal || undefined,
        checklistId: checklistVal || undefined,
      });
      setNewEventRange(null);
    },
    [newEventRange, onAddEvent]
  );

  const applyQuickPreset = useCallback((start: string, end: string, allDay?: boolean) => {
    const form = newEventFormRef.current;
    if (!form) return;
    const startEl = form.querySelector('[name="start"]') as HTMLInputElement;
    const endEl = form.querySelector('[name="end"]') as HTMLInputElement;
    const allDayEl = form.querySelector('[name="allDay"]') as HTMLInputElement;
    if (startEl) startEl.value = formatDateTime(start);
    if (endEl) endEl.value = formatDateTime(end);
    if (allDayEl && allDay !== undefined) allDayEl.checked = allDay;
  }, []);

  const handleUpdateEvent = useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!selectedEvent) return;
      const form = e.currentTarget;
      const startVal = (form.querySelector('[name="start"]') as HTMLInputElement)?.value;
      const endVal = (form.querySelector('[name="end"]') as HTMLInputElement)?.value;
      const recurrenceVal = (form.querySelector('[name="recurrence"]') as HTMLSelectElement)?.value as CalendarRecurrence;
      const remindVal = (form.querySelector('[name="remind"]') as HTMLSelectElement)?.value;
      const remindMinutesBefore = remindVal ? Number(remindVal) : undefined;
      const colorVal = (form.querySelector('[name="color"]:checked') as HTMLInputElement)?.value?.trim() || undefined;
      const checklistVal = (form.querySelector('[name="checklist"]') as HTMLInputElement)?.value?.trim();
      onUpdateEvent(selectedEvent.id, {
        title: (form.querySelector('[name="title"]') as HTMLInputElement)?.value?.trim() ?? selectedEvent.title,
        start: startVal ? toISOFromInput(startVal) : selectedEvent.start,
        end: endVal ? toISOFromInput(endVal) : selectedEvent.end,
        description: (form.querySelector('[name="description"]') as HTMLTextAreaElement)?.value?.trim() || undefined,
        location: (form.querySelector('[name="location"]') as HTMLInputElement)?.value?.trim() || undefined,
        recurrence: recurrenceVal || undefined,
        remindMinutesBefore: selectedEvent.allDay ? undefined : remindMinutesBefore,
        color: colorVal || undefined,
        checklistId: checklistVal || undefined,
      });
      setSelectedEvent(null);
    },
    [selectedEvent, onUpdateEvent]
  );

  const canIncludeWeekly = currentView === 'dayGridMonth';
  const canIncludeDaily = currentView === 'dayGridMonth' || currentView === 'timeGridWeek';

  const lowerPeriods: { key: string; label: string }[] = useMemo(() => {
    if (!currentStart) return [];
    const dateStr = currentStart.slice(0, 10);
    if (currentView === 'dayGridMonth') {
      const monthKey = getMonthKey(dateStr);
      const list: { key: string; label: string }[] = [];
      if (includeWeekly) {
        for (const w of getWeekStartsInMonth(monthKey)) list.push({ key: `week:${w}`, label: `Week of ${formatDate(w)}` });
      }
      if (includeDaily) {
        for (const d of getDaysInMonth(monthKey)) list.push({ key: `day:${d}`, label: formatDate(d) });
      }
      return list;
    }
    if (currentView === 'timeGridWeek' && includeDaily) {
      const days = currentEnd ? getDaysInRange(currentStart, currentEnd) : getDaysInWeek(dateStr);
      return days.map((d) => ({ key: `day:${d}`, label: formatDate(d) }));
    }
    return [];
  }, [currentView, currentStart, currentEnd, includeWeekly, includeDaily]);

  const deadlinesNextWeek = useMemo(() => {
    if (currentView !== 'timeGridWeek' || !currentStart) return [];
    const weekStartDate = new Date(currentStart.slice(0, 10));
    const nextWeekStart = new Date(weekStartDate);
    nextWeekStart.setDate(nextWeekStart.getDate() + 7);
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setDate(nextWeekEnd.getDate() + 6);
    const nwStart = nextWeekStart.toISOString().slice(0, 10);
    const nwEnd = nextWeekEnd.toISOString().slice(0, 10);
    return myListItems
      .filter((item) => !item.parentId && item.deadline && item.deadline >= nwStart && item.deadline <= nwEnd && !(item.completed))
      .sort((a, b) => (a.deadline ?? '').localeCompare(b.deadline ?? ''));
  }, [currentView, currentStart, myListItems]);

  return (
    <div className="flex flex-col gap-4">
      {/* Google Calendar sync — compact, top right */}
      {(onSetGoogleClientId != null || onSyncFromGoogle != null) && (
        <div className="flex flex-wrap items-center justify-end gap-2 text-sm">
          {onSetGoogleClientId != null && (
            <>
              <input
                type="text"
                value={googleClientIdInput}
                onChange={(e) => setGoogleClientIdInput(e.target.value)}
                placeholder="Google Client ID"
                title="From Cloud Console: enable Calendar API, create OAuth 2.0 Client ID (Web), add this app URL to authorized origins."
                className="w-48 max-w-[200px] rounded-md border border-[var(--adhd-border)] px-2 py-1.5 text-[var(--adhd-text)] placeholder:text-[var(--adhd-text-muted)]"
              />
              <button
                type="button"
                onClick={() => onSetGoogleClientId(googleClientIdInput.trim() || undefined)}
                className="rounded-md bg-[var(--adhd-accent)] px-3 py-1.5 text-white hover:opacity-90"
              >
                Save
              </button>
            </>
          )}
          {onSyncFromGoogle != null && (
            <>
              <button
                type="button"
                onClick={() => login()}
                disabled={!googleClientId?.trim() || googleSyncLoading}
                className="rounded-md bg-blue-600 px-3 py-1.5 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {googleSyncLoading ? 'Syncing…' : 'Sync from Google'}
              </button>
              {googleCalendarEvents.length > 0 && (
                <span className="text-[var(--adhd-text-muted)]">{googleCalendarEvents.length} from Google</span>
              )}
              {googleSyncError && <span className="text-red-600">{googleSyncError}</span>}
            </>
          )}
        </div>
      )}

      <div className="flex flex-col gap-6 lg:flex-row lg:items-stretch lg:gap-8">
      {/* Calendar: big and readable */}
      <div className="adhd-calendar min-h-0 min-w-0 flex-1 rounded-2xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)] p-4 shadow-sm flex flex-col gap-3">
        {/* Now / Next focus strip */}
        {(nowBlock || nextBlock) && (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 rounded-xl border-2 border-[var(--adhd-accent)] bg-[var(--adhd-accent-soft)] px-4 py-3">
              <span className="text-sm font-bold uppercase tracking-wide text-[var(--adhd-text-muted)]">Focus</span>
              {nowBlock ? (
                <span className="text-base font-semibold text-[var(--adhd-text)]">
                  Now: {nowBlock.title} <span className="font-normal text-[var(--adhd-text-muted)]">until {formatTime(nowBlock.end)}</span>
                </span>
              ) : nextBlock ? (
                <span className="text-base font-semibold text-[var(--adhd-text)]">
                  Free until {formatTime(nextBlock.start)} — Next: {nextBlock.title}
                </span>
              ) : null}
              {nextBlock && nowBlock && nowBlock.id !== nextBlock.id && (
                <span className="text-sm text-[var(--adhd-text-muted)]">
                  Next: {nextBlock.title} at {formatTime(nextBlock.start)}
                </span>
              )}
            </div>
            {/* Checklist for this block — only when there is a current block; collapsed by default */}
            {checklists.length > 0 && (() => {
              // Only show checklist when there is an active \"Now\" block; if there are no current slots, hide.
              if (!nowBlock) return null;
              const block = nowBlock;
              const resolved = getChecklistForEvent(block, checklists, checklistItems);
              if (!resolved) return null;
              return (
                <div className="rounded-xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)]">
                  <button
                    type="button"
                    onClick={() => setShowBlockChecklist((v) => !v)}
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                  >
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wide text-[var(--adhd-text-muted)]">
                        Checklist for this block
                      </span>
                      <p className="mt-0.5 text-base font-semibold text-[var(--adhd-text)]">{resolved.name}</p>
                    </div>
                    <span className="text-lg text-[var(--adhd-text-muted)]">
                      {showBlockChecklist ? '−' : '+'}
                    </span>
                  </button>
                  {showBlockChecklist && (
                    <div className="border-t border-[var(--adhd-border)] px-4 py-3">
                      {resolved.items.length > 0 ? (
                        <ul className="space-y-1">
                          {resolved.items.map((item) => (
                            <li key={item.id} className="flex items-center gap-2 text-base text-[var(--adhd-text)]">
                              <span className="inline-block h-5 w-5 shrink-0 rounded border-2 border-[var(--adhd-border)]" aria-hidden />
                              <span>{item.text}</span>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <p className="text-sm text-[var(--adhd-text-muted)]">
                          No items — add some in the Checklist tab.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setNewEventRange(getDefaultNewEventRange())}
            className="rounded-xl bg-[var(--adhd-accent)] px-4 py-2.5 text-base font-bold text-white shadow-sm hover:opacity-90"
          >
            + Add event
          </button>
          {typeof Notification !== 'undefined' && Notification.permission !== 'granted' && (
            <button
              type="button"
              onClick={handleRequestReminderPermission}
              className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm text-amber-800"
            >
              Enable reminders
            </button>
          )}
        </div>
        <FullCalendar
          ref={calendarRef}
          plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
          initialView="timeGridDay"
          initialDate={todayStr()}
          headerToolbar={{
            left: 'prev,next today',
            center: 'title',
            right: 'dayGridMonth,timeGridWeek,timeGridDay',
          }}
          events={fcEvents}
          editable
          selectable
          select={handleSelect}
          eventClick={handleEventClick}
          eventDrop={handleEventDrop}
          eventResize={handleEventResize}
          datesSet={handleDatesSet}
          selectMirror
          dayMaxEvents={5}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          scrollTime={initialScrollTime}
          height={720}
          nowIndicator
          buttonText={{ today: 'Today', month: 'Month', week: 'Week', day: 'Day' }}
        />
      </div>

      {/* Side panel: Daily checklist → Checklist → Notes */}
      <div className="w-full shrink-0 rounded-2xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)] p-4 shadow-sm lg:w-[28rem]">
        {periodKey ? (
          <>
            <p className="text-base font-medium text-[var(--adhd-accent)]">{label}</p>

            {/* Daily Items — recurring daily checklist, only in day view */}
            {currentView === 'timeGridDay' && onAddDailyItem && onToggleDailyLog && getDailyLog && (
              <DailyItemsSection
                items={dailyRecurringItems}
                date={currentStart ?? todayStr()}
                getDailyLog={getDailyLog}
                onToggleLog={onToggleDailyLog}
                onAddItem={onAddDailyItem}
                onUpdateItem={onUpdateDailyItem}
                onRemoveItem={onRemoveDailyItem}
              />
            )}

            {/* Include from lower timeframe */}
            {(canIncludeWeekly || canIncludeDaily) && (
              <div className="mt-2 flex flex-wrap gap-3 border-b border-[var(--adhd-border)] pb-2">
                {canIncludeWeekly && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--adhd-text-muted)]">
                    <input type="checkbox" checked={includeWeekly} onChange={(e) => setIncludeWeekly(e.target.checked)} className="h-4 w-4 rounded border border-[var(--adhd-border)] accent-[var(--adhd-accent)]" />
                    Include weekly
                  </label>
                )}
                {canIncludeDaily && (
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-[var(--adhd-text-muted)]">
                    <input type="checkbox" checked={includeDaily} onChange={(e) => setIncludeDaily(e.target.checked)} className="h-4 w-4 rounded border border-[var(--adhd-border)] accent-[var(--adhd-accent)]" />
                    Include daily
                  </label>
                )}
              </div>
            )}

            {/* 2. Checklist (moved before notes) */}
            <div className="mt-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold uppercase tracking-wide text-[var(--adhd-text-muted)]">Checklist</span>
                {periodKey === `day:${todayStr()}` && periodActions.moveYesterdayChecklistToToday && (
                  <button
                    type="button"
                    onClick={() => periodActions.moveYesterdayChecklistToToday?.()}
                    className="rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-2 py-1 text-xs font-medium text-[var(--adhd-text-muted)] hover:border-[var(--adhd-accent)] hover:text-[var(--adhd-accent)]"
                  >
                    Move yesterday's unchecked → today
                  </button>
                )}
              </div>
              <ul className="mt-2 space-y-1">
                {periodActions.getChecklist(periodKey).map((item) => (
                  <li key={item.id} className="flex items-center gap-2 rounded-lg border-2 border-transparent px-2 py-1.5 group hover:border-[var(--adhd-border)] hover:bg-[var(--adhd-bg)]">
                    {editingChecklistId?.key === periodKey && editingChecklistId?.id === item.id ? (
                      <input
                        type="text"
                        defaultValue={item.text}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const v = (e.target as HTMLInputElement).value.trim();
                            if (v) periodActions.updateChecklistItem(periodKey, item.id, { text: v });
                            setEditingChecklistId(null);
                          }
                          if (e.key === 'Escape') setEditingChecklistId(null);
                        }}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v) periodActions.updateChecklistItem(periodKey, item.id, { text: v });
                          setEditingChecklistId(null);
                        }}
                        className="min-w-0 flex-1 rounded-lg border-2 border-[var(--adhd-border)] px-2 py-1 text-sm focus:border-[var(--adhd-accent)] focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => periodActions.toggleChecklistItem(periodKey, item.id)}
                          className="h-5 w-5 shrink-0 rounded-md border-2 border-[var(--adhd-border)] accent-[var(--adhd-success)]"
                        />
                        <span className={`min-w-0 flex-1 text-sm font-medium ${item.done ? 'text-[var(--adhd-text-muted)] line-through' : 'text-[var(--adhd-text)]'}`}>{item.text}</span>
                        <button type="button" onClick={() => setEditingChecklistId({ key: periodKey, id: item.id })} className="rounded px-1.5 py-0.5 text-xs text-[var(--adhd-text-muted)] opacity-0 hover:bg-[var(--adhd-border)] group-hover:opacity-100">Edit</button>
                        <button type="button" onClick={() => periodActions.removeChecklistItem(periodKey, item.id)} className="rounded px-1.5 py-0.5 text-xs text-red-600 opacity-0 hover:bg-red-50 group-hover:opacity-100">Del</button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex gap-2">
                <input
                  type="text"
                  value={newItemForKey === null ? newChecklistText : ''}
                  onChange={(e) => { setNewItemForKey(null); setNewChecklistText(e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newItemForKey === null && newChecklistText.trim()) {
                        handleAddChecklistItem(periodKey, newChecklistText);
                        setNewChecklistText('');
                      }
                    }
                  }}
                  placeholder="Add an item..."
                  className="min-w-0 flex-1 rounded-lg border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-3 py-2 text-sm text-[var(--adhd-text)] placeholder:text-[var(--adhd-text-muted)] focus:border-[var(--adhd-accent)] focus:outline-none"
                />
                <button type="button" onClick={() => { if (newItemForKey === null && newChecklistText.trim()) { handleAddChecklistItem(periodKey, newChecklistText); setNewChecklistText(''); } }} className="shrink-0 rounded-lg bg-[var(--adhd-accent)] px-4 py-2 text-sm font-bold text-white hover:opacity-90">Add</button>
              </div>
            </div>

            {/* 3. Notes (last) */}
            <div className="mt-3">
              <span className="text-sm font-bold uppercase tracking-wide text-[var(--adhd-text-muted)]">Notes</span>
              <textarea
                value={periodActions.getNote(periodKey)}
                onChange={(e) => periodActions.setPeriodNote(periodKey, e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-3 py-2 text-sm text-[var(--adhd-text)] placeholder:text-[var(--adhd-text-muted)] focus:border-[var(--adhd-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--adhd-accent-soft)]"
                placeholder="Click here and type… saved automatically when you’re done"
              />
              {periodActions.getNote(periodKey) && (
                <button type="button" onClick={() => periodActions.clearPeriodNote(periodKey)} className="mt-1 text-xs font-medium text-[var(--adhd-text-muted)] hover:text-red-600">Clear note</button>
              )}
            </div>

            {/* old checklist removed — now rendered above notes */}
            {false && (
            <div className="mt-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-bold uppercase tracking-wide text-[var(--adhd-text-muted)]">Checklist</span>
                {periodKey === `day:${todayStr()}` && periodActions.moveYesterdayChecklistToToday && (
                  <button
                    type="button"
                    onClick={() => periodActions.moveYesterdayChecklistToToday?.()}
                    className="rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-2.5 py-1.5 text-xs font-medium text-[var(--adhd-text-muted)] hover:border-[var(--adhd-accent)] hover:text-[var(--adhd-accent)]"
                  >
                    Move yesterday’s unchecked → today
                  </button>
                )}
              </div>
              <ul className="mt-3 space-y-2">
                {periodActions.getChecklist(periodKey).map((item) => (
                  <li key={item.id} className="flex items-center gap-3 rounded-xl border-2 border-transparent px-3 py-2.5 group hover:border-[var(--adhd-border)] hover:bg-[var(--adhd-bg)]">
                    {editingChecklistId?.key === periodKey && editingChecklistId?.id === item.id ? (
                      <input
                        type="text"
                        defaultValue={item.text}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            const v = (e.target as HTMLInputElement).value.trim();
                            if (v) periodActions.updateChecklistItem(periodKey, item.id, { text: v });
                            setEditingChecklistId(null);
                          }
                          if (e.key === 'Escape') setEditingChecklistId(null);
                        }}
                        onBlur={(e) => {
                          const v = e.target.value.trim();
                          if (v) periodActions.updateChecklistItem(periodKey, item.id, { text: v });
                          setEditingChecklistId(null);
                        }}
                        className="min-w-0 flex-1 rounded-lg border-2 border-[var(--adhd-border)] px-3 py-2 text-base focus:border-[var(--adhd-accent)] focus:outline-none"
                        autoFocus
                      />
                    ) : (
                      <>
                        <input
                          type="checkbox"
                          checked={item.done}
                          onChange={() => periodActions.toggleChecklistItem(periodKey, item.id)}
                          className="h-6 w-6 shrink-0 rounded-md border-2 border-[var(--adhd-border)] accent-[var(--adhd-success)]"
                        />
                        <span className={`min-w-0 flex-1 text-base font-medium ${item.done ? 'text-[var(--adhd-text-muted)] line-through' : 'text-[var(--adhd-text)]'}`}>{item.text}</span>
                        <button type="button" onClick={() => setEditingChecklistId({ key: periodKey, id: item.id })} className="rounded-lg px-2 py-1 text-sm font-medium text-[var(--adhd-text-muted)] opacity-0 hover:bg-[var(--adhd-border)] group-hover:opacity-100">Edit</button>
                        <button type="button" onClick={() => periodActions.removeChecklistItem(periodKey, item.id)} className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 opacity-0 hover:bg-red-50 group-hover:opacity-100">Delete</button>
                      </>
                    )}
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex gap-3">
                <input
                  type="text"
                  value={newItemForKey === null ? newChecklistText : ''}
                  onChange={(e) => { setNewItemForKey(null); setNewChecklistText(e.target.value); }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      if (newItemForKey === null && newChecklistText.trim()) {
                        handleAddChecklistItem(periodKey, newChecklistText);
                        setNewChecklistText('');
                      }
                    }
                  }}
                  placeholder="Add an item..."
                  className="min-w-0 flex-1 rounded-xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-4 py-3 text-base text-[var(--adhd-text)] placeholder:text-[var(--adhd-text-muted)] focus:border-[var(--adhd-accent)] focus:outline-none"
                />
                <button type="button" onClick={() => { if (newItemForKey === null && newChecklistText.trim()) { handleAddChecklistItem(periodKey, newChecklistText); setNewChecklistText(''); } }} className="shrink-0 rounded-xl bg-[var(--adhd-accent)] px-5 py-3 text-base font-bold text-white hover:opacity-90">Add</button>
              </div>
            </div>
            )}

            {/* Deadlines next week — only in weekly view */}
            {deadlinesNextWeek.length > 0 && (
              <div className="mt-3 border-t border-[var(--adhd-border)] pt-3">
                <span className="text-sm font-bold uppercase tracking-wide text-orange-600">Deadlines next week</span>
                <ul className="mt-2 space-y-1">
                  {deadlinesNextWeek.map((item) => (
                    <li key={item.id} className="flex items-center gap-2 py-1 px-1 rounded hover:bg-[var(--adhd-bg)]">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-orange-400" />
                      <span className="min-w-0 flex-1 text-sm text-[var(--adhd-text)] truncate">{item.title}</span>
                      <span className="shrink-0 text-xs text-[var(--adhd-text-muted)]">{formatDate(item.deadline!)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* From lower timeframe */}
            {lowerPeriods.length > 0 && (
              <div className="mt-3 border-t border-[var(--adhd-border)] pt-3">
                <span className="text-sm font-bold uppercase tracking-wide text-[var(--adhd-text-muted)]">From lower timeframe</span>

                {/* Checklists: one section, rows = checkbox | what | date (right) */}
                <div className="mt-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--adhd-text-muted)]">Checklists</span>
                  <ul className="mt-1 space-y-0.5">
                    {lowerPeriods.flatMap(({ key, label: periodLabel }) =>
                      periodActions.getChecklist(key).map((item) => (
                        <li key={item.id} className="group flex items-center gap-2 py-1 pr-1 rounded hover:bg-[var(--adhd-bg)]">
                          <input
                            type="checkbox"
                            checked={item.done}
                            onChange={() => periodActions.toggleChecklistItem(key, item.id)}
                            className="h-4 w-4 shrink-0 rounded accent-[var(--adhd-success)]"
                          />
                          {editingChecklistId?.key === key && editingChecklistId?.id === item.id ? (
                            <input
                              type="text"
                              defaultValue={item.text}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  periodActions.updateChecklistItem(key, item.id, { text: (e.target as HTMLInputElement).value.trim() });
                                  setEditingChecklistId(null);
                                }
                                if (e.key === 'Escape') setEditingChecklistId(null);
                              }}
                              onBlur={(e) => {
                                periodActions.updateChecklistItem(key, item.id, { text: e.target.value.trim() });
                                setEditingChecklistId(null);
                              }}
                              className="min-w-0 flex-1 rounded border border-[var(--adhd-border)] px-2 py-0.5 text-sm"
                              autoFocus
                            />
                          ) : (
                            <>
                              <span className={`min-w-0 flex-1 text-sm truncate ${item.done ? 'line-through text-[var(--adhd-text-muted)]' : 'text-[var(--adhd-text)]'}`}>{item.text}</span>
                              <span className="shrink-0 text-xs text-[var(--adhd-text-muted)]">{periodLabel}</span>
                              <button type="button" onClick={() => setEditingChecklistId({ key, id: item.id })} className="shrink-0 text-xs text-[var(--adhd-text-muted)] opacity-0 group-hover:opacity-100">Edit</button>
                              <button type="button" onClick={() => periodActions.removeChecklistItem(key, item.id)} className="shrink-0 text-xs text-red-600 opacity-0 group-hover:opacity-100">Del</button>
                            </>
                          )}
                        </li>
                      ))
                    )}
                  </ul>
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    <input
                      type="text"
                      placeholder="Add item..."
                      value={newLowerChecklistText}
                      onChange={(e) => setNewLowerChecklistText(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const key = addToPeriodKey || lowerPeriods[0]?.key;
                          if (newLowerChecklistText.trim() && key) {
                            handleAddChecklistItem(key, newLowerChecklistText);
                            setNewLowerChecklistText('');
                          }
                        }
                      }}
                      className="min-w-0 flex-1 rounded border border-[var(--adhd-border)] px-2 py-1 text-sm max-w-[140px]"
                    />
                    <select
                      value={(addToPeriodKey || lowerPeriods[0]?.key) ?? ''}
                      onChange={(e) => setAddToPeriodKey(e.target.value)}
                      className="rounded border border-[var(--adhd-border)] px-2 py-1 text-xs text-[var(--adhd-text)]"
                    >
                      {lowerPeriods.map(({ key, label }) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                    <button type="button" onClick={() => { const key = addToPeriodKey || lowerPeriods[0]?.key; if (newLowerChecklistText.trim() && key) { handleAddChecklistItem(key, newLowerChecklistText); setNewLowerChecklistText(''); } }} className="rounded bg-[var(--adhd-accent)] px-2 py-1 text-xs text-white">Add</button>
                  </div>
                </div>

                {/* Notes: click and type in each box, saves as you type */}
                <div className="mt-4">
                  <span className="text-xs font-semibold uppercase tracking-wide text-[var(--adhd-text-muted)]">Notes</span>
                  <ul className="mt-1 space-y-2">
                    {lowerPeriods.map(({ key, label: periodLabel }) => (
                      <li key={key} className="flex items-start gap-2">
                        <textarea
                          value={periodActions.getNote(key)}
                          onChange={(e) => periodActions.setPeriodNote(key, e.target.value)}
                          rows={2}
                          placeholder="Type here…"
                          className="min-w-0 flex-1 rounded border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-2 py-1.5 text-sm text-[var(--adhd-text)] placeholder:text-[var(--adhd-text-muted)] focus:border-[var(--adhd-accent)] focus:outline-none"
                        />
                        <span className="shrink-0 pt-1 text-xs text-[var(--adhd-text-muted)]">{periodLabel}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="mt-4 text-base text-[var(--adhd-text-muted)]">Switch to Day, Week, or Month view to see notes and checklist here.</p>
        )}
      </div>

      {newEventRange && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setNewEventRange(null)}>
          <div className="w-full max-w-lg rounded-2xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-[var(--adhd-text)]">New event</h3>
            <form ref={newEventFormRef} onSubmit={handleAddNew} className="mt-4 space-y-4">
              <input name="title" type="text" placeholder="What's happening?" required className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" autoFocus />
              <div>
                <label className="block text-sm font-semibold text-[var(--adhd-text-muted)] mb-2">Quick time</label>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => { const r = getDefaultNewEventRange(); applyQuickPreset(r.start, r.end, false); }} className="rounded-lg border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-3 py-2 text-sm font-medium text-[var(--adhd-text)] hover:border-[var(--adhd-accent)]">
                    Next hour
                  </button>
                  <button type="button" onClick={() => applyQuickPreset(`${todayStr()}T09:00:00`, `${todayStr()}T10:00:00`, false)} className="rounded-lg border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-3 py-2 text-sm font-medium text-[var(--adhd-text)] hover:border-[var(--adhd-accent)]">
                    Morning 9–10
                  </button>
                  <button type="button" onClick={() => applyQuickPreset(`${todayStr()}T14:00:00`, `${todayStr()}T15:00:00`, false)} className="rounded-lg border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-3 py-2 text-sm font-medium text-[var(--adhd-text)] hover:border-[var(--adhd-accent)]">
                    Afternoon 2–3
                  </button>
                  <button type="button" onClick={() => applyQuickPreset(`${todayStr()}T18:00:00`, `${todayStr()}T19:00:00`, false)} className="rounded-lg border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-3 py-2 text-sm font-medium text-[var(--adhd-text)] hover:border-[var(--adhd-accent)]">
                    Evening 6–7
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold text-[var(--adhd-text-muted)]">Start</label>
                <label className="text-sm font-semibold text-[var(--adhd-text-muted)]">End</label>
                <input name="start" type="datetime-local" defaultValue={formatDateTime(newEventRange.start)} className="rounded-xl border-2 border-[var(--adhd-border)] px-3 py-2.5 text-base text-[var(--adhd-text)]" />
                <input name="end" type="datetime-local" defaultValue={formatDateTime(newEventRange.end)} className="rounded-xl border-2 border-[var(--adhd-border)] px-3 py-2.5 text-base text-[var(--adhd-text)]" />
                <label className="col-span-2 flex items-center gap-2 cursor-pointer text-sm text-[var(--adhd-text-muted)]">
                  <input name="allDay" type="checkbox" defaultChecked={newEventRange.allDay} className="h-3.5 w-3.5 rounded border border-[var(--adhd-border)] accent-[var(--adhd-accent)]" />
                  All day
                </label>
              </div>
              <input name="location" type="text" placeholder="Location (optional)" className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" />
              <div>
                <label className="block text-sm font-semibold text-[var(--adhd-text-muted)] mb-1">Repeats</label>
                <select name="recurrence" className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)]">
                  <option value="">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--adhd-text-muted)] mb-1">Remind me</label>
                <select name="remind" className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)]">
                  <option value="">Off</option>
                  {REMIND_OPTIONS.map((m) => (
                    <option key={m} value={m}>{m === 0 ? 'At start' : `${m} min before`}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-semibold text-[var(--adhd-text-muted)] mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_COLORS.map(({ value, label }) => (
                    <label key={value || 'default'} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="color" value={value} defaultChecked={!value} className="sr-only peer" />
                      <span
                        className="inline-block w-6 h-6 rounded-full border-2 border-[var(--adhd-border)] peer-checked:border-[var(--adhd-accent)] peer-checked:ring-2 ring-[var(--adhd-accent)] ring-offset-2"
                        style={{ backgroundColor: value || 'var(--adhd-surface)' }}
                        title={label}
                      />
                      <span className="text-sm text-[var(--adhd-text)]">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {checklists.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-[var(--adhd-text-muted)] mb-1">Connect this event to a checklist</label>
                  <input type="hidden" name="checklist" value={checklistConnectId} />
                  <input
                    type="text"
                    value={checklistSearchQuery}
                    onChange={(e) => setChecklistSearchQuery(e.target.value)}
                    placeholder="Search checklists..."
                    className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)] placeholder:text-[var(--adhd-text-muted)] focus:border-[var(--adhd-accent)] focus:outline-none mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)]">
                    <button
                      type="button"
                      onClick={() => setChecklistConnectId('')}
                      className={`block w-full text-left px-4 py-2.5 text-base ${!checklistConnectId ? 'bg-[var(--adhd-accent-soft)] font-semibold text-[var(--adhd-accent)]' : 'text-[var(--adhd-text-muted)] hover:bg-[var(--adhd-surface)]'}`}
                    >
                      None (use default)
                    </button>
                    {checklists
                      .filter((c) => !checklistSearchQuery.trim() || c.name.toLowerCase().includes(checklistSearchQuery.trim().toLowerCase()))
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setChecklistConnectId(c.id)}
                          className={`block w-full text-left px-4 py-2.5 text-base border-t border-[var(--adhd-border)] ${checklistConnectId === c.id ? 'bg-[var(--adhd-accent-soft)] font-semibold text-[var(--adhd-accent)]' : 'text-[var(--adhd-text)] hover:bg-[var(--adhd-surface)]'}`}
                        >
                          {c.name}
                        </button>
                      ))}
                  </div>
                  <p className="text-xs text-[var(--adhd-text-muted)] mt-1">When this block is Now, this checklist will show so you can run through it.</p>
                </div>
              )}
              <textarea name="description" placeholder="Description (optional)" rows={2} className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" />
              <div className="flex gap-3 pt-2">
                <button type="submit" className="rounded-xl bg-[var(--adhd-accent)] px-5 py-3 text-base font-bold text-white hover:opacity-90">Add event</button>
                <button type="button" onClick={() => setNewEventRange(null)} className="rounded-xl border-2 border-[var(--adhd-border)] px-5 py-3 text-base font-semibold text-[var(--adhd-text-muted)] hover:bg-[var(--adhd-bg)]">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setSelectedEvent(null)}>
          <div className="w-full max-w-lg rounded-2xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)] p-6 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-[var(--adhd-text)]">{selectedEventReadOnly ? 'Event (from Google)' : 'Edit event'}</h3>
            {selectedEventReadOnly ? (
              <div className="mt-4 space-y-3">
                <p className="text-base font-medium text-[var(--adhd-text)]">{selectedEvent.title}</p>
                <p className="text-sm text-[var(--adhd-text-muted)]">{formatDateTime(selectedEvent.start)} – {formatDateTime(selectedEvent.end)}</p>
                {selectedEvent.location && <p className="text-sm text-[var(--adhd-text-muted)]">📍 {selectedEvent.location}</p>}
                {selectedEvent.description && <p className="text-sm text-[var(--adhd-text)] whitespace-pre-wrap">{selectedEvent.description}</p>}
                <p className="text-xs text-[var(--adhd-text-muted)]">Edit or delete this event in Google Calendar, then Sync again here.</p>
                <button type="button" onClick={() => setSelectedEvent(null)} className="mt-2 rounded-xl border-2 border-[var(--adhd-border)] px-5 py-3 text-base font-semibold text-[var(--adhd-text-muted)] hover:bg-[var(--adhd-bg)]">Close</button>
              </div>
            ) : (
            <form onSubmit={handleUpdateEvent} className="mt-4 space-y-4">
              <input name="title" type="text" defaultValue={selectedEvent.title} required className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" />
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm font-semibold text-[var(--adhd-text-muted)]">Start</label>
                <label className="text-sm font-semibold text-[var(--adhd-text-muted)]">End</label>
                <input name="start" type="datetime-local" defaultValue={formatDateTime(selectedEvent.start)} className="rounded-xl border-2 border-[var(--adhd-border)] px-3 py-2.5 text-base text-[var(--adhd-text)]" />
                <input name="end" type="datetime-local" defaultValue={formatDateTime(selectedEvent.end)} className="rounded-xl border-2 border-[var(--adhd-border)] px-3 py-2.5 text-base text-[var(--adhd-text)]" />
              </div>
              <input name="location" type="text" placeholder="Location" defaultValue={selectedEvent.location} className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" />
              <div>
                <label className="block text-sm font-semibold text-[var(--adhd-text-muted)] mb-1">Repeats</label>
                <select name="recurrence" defaultValue={selectedEvent.recurrence ?? ''} className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)]">
                  <option value="">None</option>
                  <option value="daily">Daily</option>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
              {!selectedEvent.allDay && (
                <div>
                  <label className="block text-sm font-semibold text-[var(--adhd-text-muted)] mb-1">Remind me</label>
                  <select name="remind" defaultValue={selectedEvent.remindMinutesBefore ?? ''} className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)]">
                    <option value="">Off</option>
                    {REMIND_OPTIONS.map((m) => (
                      <option key={m} value={m}>{m === 0 ? 'At start' : `${m} min before`}</option>
                    ))}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-[var(--adhd-text-muted)] mb-1">Color</label>
                <div className="flex flex-wrap gap-2">
                  {EVENT_COLORS.map(({ value, label }) => (
                    <label key={value || 'default'} className="flex items-center gap-2 cursor-pointer">
                      <input type="radio" name="color" value={value} defaultChecked={(selectedEvent.color ?? '') === value} className="sr-only peer" />
                      <span
                        className="inline-block w-6 h-6 rounded-full border-2 border-[var(--adhd-border)] peer-checked:border-[var(--adhd-accent)] peer-checked:ring-2 ring-[var(--adhd-accent)] ring-offset-2"
                        style={{ backgroundColor: value || 'var(--adhd-surface)' }}
                        title={label}
                      />
                      <span className="text-sm text-[var(--adhd-text)]">{label}</span>
                    </label>
                  ))}
                </div>
              </div>
              {checklists.length > 0 && (
                <div>
                  <label className="block text-sm font-semibold text-[var(--adhd-text-muted)] mb-1">Connect this event to a checklist</label>
                  <input type="hidden" name="checklist" value={checklistConnectId} />
                  <input
                    type="text"
                    value={checklistSearchQuery}
                    onChange={(e) => setChecklistSearchQuery(e.target.value)}
                    placeholder="Search checklists..."
                    className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)] placeholder:text-[var(--adhd-text-muted)] focus:border-[var(--adhd-accent)] focus:outline-none mb-2"
                  />
                  <div className="max-h-40 overflow-y-auto rounded-xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-bg)]">
                    <button
                      type="button"
                      onClick={() => setChecklistConnectId('')}
                      className={`block w-full text-left px-4 py-2.5 text-base ${!checklistConnectId ? 'bg-[var(--adhd-accent-soft)] font-semibold text-[var(--adhd-accent)]' : 'text-[var(--adhd-text-muted)] hover:bg-[var(--adhd-surface)]'}`}
                    >
                      None (use default)
                    </button>
                    {checklists
                      .filter((c) => !checklistSearchQuery.trim() || c.name.toLowerCase().includes(checklistSearchQuery.trim().toLowerCase()))
                      .map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setChecklistConnectId(c.id)}
                          className={`block w-full text-left px-4 py-2.5 text-base border-t border-[var(--adhd-border)] ${checklistConnectId === c.id ? 'bg-[var(--adhd-accent-soft)] font-semibold text-[var(--adhd-accent)]' : 'text-[var(--adhd-text)] hover:bg-[var(--adhd-surface)]'}`}
                        >
                          {c.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}
              <textarea name="description" placeholder="Description" rows={2} defaultValue={selectedEvent.description} className="w-full rounded-xl border-2 border-[var(--adhd-border)] px-4 py-3 text-base text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" />
              <div className="flex flex-wrap gap-3 pt-2">
                <button type="submit" className="rounded-xl bg-[var(--adhd-success)] px-5 py-3 text-base font-bold text-white hover:opacity-90">Save</button>
                <button type="button" onClick={() => { onRemoveEvent(selectedEvent.id); setSelectedEvent(null); }} className="rounded-xl bg-red-600 px-5 py-3 text-base font-bold text-white hover:bg-red-700">Delete</button>
                <button type="button" onClick={() => setSelectedEvent(null)} className="rounded-xl border-2 border-[var(--adhd-border)] px-5 py-3 text-base font-semibold text-[var(--adhd-text-muted)] hover:bg-[var(--adhd-bg)]">Cancel</button>
              </div>
            </form>
            )}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

// ---- Daily Recurring Items Section (shown in day view side panel) ----
function DailyItemsSection({
  items,
  date,
  getDailyLog,
  onToggleLog,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
}: {
  items: DailyRecurringItem[];
  date: string;
  getDailyLog: (dailyItemId: string, date: string) => DailyItemLog | undefined;
  onToggleLog: (dailyItemId: string, date: string) => void;
  onAddItem: (title: string) => void;
  onUpdateItem?: (id: string, patch: Partial<DailyRecurringItem>) => void;
  onRemoveItem?: (id: string) => void;
}) {
  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const sorted = useMemo(() => [...items].sort((a, b) => a.order - b.order), [items]);

  return (
    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <span className="text-sm font-bold uppercase tracking-wide text-amber-700">Daily Items</span>
      <p className="mt-0.5 text-xs text-amber-600">Recurring every day — check off as you go</p>
      <ul className="mt-3 space-y-2">
        {sorted.map((item) => {
          const log = getDailyLog(item.id, date);
          const done = log?.done ?? false;
          return (
            <li key={item.id} className="group flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-amber-100/60">
              <input
                type="checkbox"
                checked={done}
                onChange={() => onToggleLog(item.id, date)}
                className="h-5 w-5 shrink-0 rounded accent-[var(--adhd-success)]"
              />
              {editingId === item.id && onUpdateItem ? (
                <input
                  type="text"
                  defaultValue={item.title}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const v = (e.target as HTMLInputElement).value.trim();
                      if (v) onUpdateItem(item.id, { title: v });
                      setEditingId(null);
                    }
                    if (e.key === 'Escape') setEditingId(null);
                  }}
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (v) onUpdateItem(item.id, { title: v });
                    setEditingId(null);
                  }}
                  className="flex-1 min-w-0 rounded border border-amber-300 px-2 py-1 text-sm focus:outline-none focus:border-amber-500"
                  autoFocus
                />
              ) : (
                <span className={`flex-1 min-w-0 text-sm font-medium ${done ? 'text-stone-400 line-through' : 'text-stone-800'}`}>{item.title}</span>
              )}
              {onUpdateItem && editingId !== item.id && (
                <button type="button" onClick={() => setEditingId(item.id)} className="text-xs text-stone-500 opacity-0 group-hover:opacity-100 hover:text-stone-700">Edit</button>
              )}
              {onRemoveItem && (
                <button type="button" onClick={() => onRemoveItem(item.id)} className="text-xs text-red-500 opacity-0 group-hover:opacity-100 hover:text-red-700">Del</button>
              )}
            </li>
          );
        })}
      </ul>
      <form
        className="mt-3 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (newTitle.trim()) {
            onAddItem(newTitle.trim());
            setNewTitle('');
          }
        }}
      >
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="Add daily item..."
          className="flex-1 min-w-0 rounded-lg border-2 border-amber-200 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-amber-400 focus:outline-none"
        />
        <button type="submit" className="shrink-0 rounded-lg bg-amber-500 px-4 py-2 text-sm font-bold text-white hover:bg-amber-600">Add</button>
      </form>
    </div>
  );
}
