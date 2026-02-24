import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useStore, useGoals, useTasks, useChecklists, useTrackedGoals, useJournals, useCalendarEvents, useCalendarPeriods, useMyListItems, useGoogleCalendar, useDailyRecurring } from './useStore';
import Auth from './components/Auth';
import Goals from './components/Goals';
import Tasks from './components/Tasks';
import Checklists from './components/Checklists';
import GoalTracker from './components/GoalTracker';
import Journals from './components/Journals';
import MyList from './components/MyList';
import Calendar from './components/Calendar';
import Analytics from './components/Analytics';
import { getDeadlineFromPeriodKey, getWeekStart, yesterdayStr } from './lib/date';

type Tab = 'myList' | 'goals' | 'tasks' | 'checklist' | 'goalTracker' | 'journals' | 'calendar' | 'analytics';

export default function App() {
  const [state, dispatch] = useStore();
  const [tab, setTab] = useState<Tab>('calendar');
  const [demoMode, setDemoMode] = useState(false);

  const goals = useGoals(state, dispatch);
  const tasks = useTasks(state, dispatch);
  const checklists = useChecklists(state, dispatch);
  const trackedGoals = useTrackedGoals(state, dispatch);
  const journals = useJournals(state, dispatch);
  const calendar = useCalendarEvents(state, dispatch);
  const calendarPeriods = useCalendarPeriods(state, dispatch);
  const googleCal = useGoogleCalendar(state, dispatch);
  const myList = useMyListItems(state, dispatch);
  const dailyRecurring = useDailyRecurring(state, dispatch);

  // On app load, ensure yesterday's daily items all have logs (creates "not done" for unchecked)
  const logInitDone = useRef(false);
  useEffect(() => {
    if (logInitDone.current || dailyRecurring.items.length === 0) return;
    logInitDone.current = true;
    dailyRecurring.ensureLogsForDate(yesterdayStr());
  }, [dailyRecurring.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const calendarEventsCombined = useMemo(
    () => [...calendar.calendarEvents, ...state.googleCalendarEvents],
    [calendar.calendarEvents, state.googleCalendarEvents]
  );
  const readOnlyEventIds = useMemo(() => new Set(state.googleCalendarEvents.map((e) => e.id)), [state.googleCalendarEvents]);

  const syncExistingChecklistToMyList = useCallback(() => {
    const seen = new Set(state.myListItems.map((m) => `${m.title}\0${m.deadline ?? ''}`));
    for (const [key, items] of Object.entries(state.calendarPeriodChecklists)) {
      const deadline = getDeadlineFromPeriodKey(key);
      if (!deadline) continue;
      for (const item of items) {
        const id = `${item.text}\0${deadline}`;
        if (seen.has(id)) continue;
        seen.add(id);
        myList.addItem({ title: item.text, category: 'personal', importance: 3, estimatedMinutes: 30, energyType: 'Light', deadline });
      }
    }
  }, [state.calendarPeriodChecklists, state.myListItems, myList.addItem]);

  const handleLinkTaskToChecklist = (taskId: string | undefined, checklistId: string) => {
    if (taskId) {
      tasks.setTasks(
        state.tasks.map((t) => ({
          ...t,
          checklistId: t.id === taskId ? checklistId : t.checklistId === checklistId ? undefined : t.checklistId,
        }))
      );
    } else {
      tasks.setTasks(
        state.tasks.map((t) => ({
          ...t,
          checklistId: t.checklistId === checklistId ? undefined : t.checklistId,
        }))
      );
    }
  };

  const nav: { id: Tab; label: string }[] = [
    { id: 'myList', label: 'My list' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'goals', label: 'Goals' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'goalTracker', label: 'Goal Tracker' },
    { id: 'journals', label: 'Journals' },
    { id: 'analytics', label: 'Analytics' },
  ];

  const mainMaxWidth = tab === 'calendar' ? 'max-w-[1600px]' : tab === 'myList' ? 'max-w-6xl' : tab === 'analytics' ? 'max-w-5xl' : 'max-w-4xl';

  return (
    <GoogleOAuthProvider clientId={state.googleClientId || 'placeholder.apps.googleusercontent.com'}>
    <div className={`min-h-screen bg-[var(--adhd-bg)] text-[var(--adhd-text)] ${demoMode ? 'demo-mode' : ''}`}>
      <header className="border-b-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)]">
        <div className={`mx-auto ${tab === 'calendar' ? 'max-w-[1600px]' : tab === 'myList' ? 'max-w-6xl' : tab === 'analytics' ? 'max-w-5xl' : 'max-w-4xl'} px-4 py-4`}>
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold text-[var(--adhd-text)]">Life Planner</h1>
              <p className="mt-0.5 text-sm text-[var(--adhd-text-muted)]">External executive function · &lt;5 min daily</p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDemoMode((v) => !v)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                  demoMode
                    ? 'bg-[var(--adhd-accent)] text-white shadow-sm'
                    : 'bg-[var(--adhd-bg)] text-[var(--adhd-text-muted)] hover:bg-[var(--adhd-accent-soft)] hover:text-[var(--adhd-text)]'
                }`}
                title={demoMode ? 'Exit demo mode' : 'Hide personal data for demos'}
              >
                {demoMode ? '👁️‍🗨️ Demo ON' : '🔒 Demo'}
              </button>
              <Auth />
            </div>
          </div>
          <nav className="mt-4 flex flex-wrap gap-2">
            {nav.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`rounded-xl px-4 py-2.5 text-base font-semibold transition-colors ${
                  tab === id
                    ? 'bg-[var(--adhd-accent)] text-white shadow-sm'
                    : 'bg-[var(--adhd-bg)] text-[var(--adhd-text-muted)] hover:bg-[var(--adhd-accent-soft)] hover:text-[var(--adhd-text)]'
                }`}
              >
                {label}
              </button>
            ))}
          </nav>
        </div>
      </header>

      {demoMode && (
        <div className="bg-amber-100 border-b border-amber-300 text-center py-1.5 text-sm font-medium text-amber-800">
          Demo mode active — personal data is hidden. Click the button above to disable.
        </div>
      )}

      <main className={`mx-auto ${mainMaxWidth} px-4 py-6`}>
        {tab === 'myList' && (
          <MyList
            myListItems={myList.myListItems}
            onAddItem={(item) => (item.parentId == null ? (myList.addParentWithEmptySubtask(item), undefined) : myList.addItem(item))}
            onUpdateItem={myList.updateItem}
            onRemoveItem={myList.removeItem}
            onReorder={myList.reorder}
            calendarEvents={state.calendarEvents}
            onAddCalendarEvents={(slots) => slots.forEach((s) => calendar.addEvent({ title: s.title, start: s.start, end: s.end }))}
            openAiApiKey={state.openAiApiKey}
            setOpenAiApiKey={(key) => dispatch({ type: 'setOpenAiApiKey', key })}
            existingGoalNames={goals.goals.map((g) => g.name)}
            onMirrorToCalendarChecklists={(deadline, title) => {
              const d = deadline.trim();
              if (!d) return;
              const addIfMissing = (key: string, text: string) => {
                const existing = calendarPeriods.getChecklist(key);
                if (!existing.some((it) => it.text === text)) calendarPeriods.addChecklistItem(key, text);
              };
              addIfMissing(`day:${d}`, title);
              addIfMissing(`week:${getWeekStart(d)}`, title);
            }}
          />
        )}
        {tab === 'goals' && (
          <Goals
            goals={goals.goals}
            onAdd={goals.addGoal}
            onRemove={goals.removeGoal}
          />
        )}
        {tab === 'tasks' && (
          <Tasks
            tasks={tasks.tasks}
            goals={goals.goals.map((g) => ({ id: g.id, name: g.name }))}
            onAdd={tasks.addTask}
          />
        )}
        {tab === 'checklist' && (
          <Checklists
            checklists={checklists.checklists}
            checklistItems={checklists.checklistItems}
            onAddChecklist={checklists.addChecklist}
            onUpdateChecklist={checklists.updateChecklist}
            onRemoveChecklist={checklists.removeChecklist}
            onAddItem={checklists.addItem}
            onUpdateItem={checklists.updateItem}
            onRemoveItem={checklists.removeItem}
          />
        )}
        {tab === 'goalTracker' && (
          <GoalTracker
            trackedGoals={trackedGoals.trackedGoals}
            goalLogs={trackedGoals.goalLogs}
            onAddGoal={trackedGoals.addTrackedGoal}
            onUpdateGoal={trackedGoals.updateTrackedGoal}
            onRemoveGoal={trackedGoals.removeTrackedGoal}
            onAddOrUpdateLog={trackedGoals.addOrUpdateLog}
          />
        )}
        {tab === 'journals' && (
          <Journals
            journalEntries={journals.journalEntries}
            onAddEntry={journals.addEntry}
            onUpdateEntry={journals.updateEntry}
            onRemoveEntry={journals.removeEntry}
          />
        )}
        {tab === 'calendar' && (
          <Calendar
            events={calendarEventsCombined}
            readOnlyEventIds={readOnlyEventIds}
            myListItems={myList.myListItems}
            onAddEvent={calendar.addEvent}
            onUpdateEvent={calendar.updateEvent}
            onRemoveEvent={calendar.removeEvent}
            checklists={state.checklists}
            checklistItems={state.checklistItems}
            periodActions={{
              getNote: calendarPeriods.getNote,
              setPeriodNote: calendarPeriods.setPeriodNote,
              clearPeriodNote: calendarPeriods.clearPeriodNote,
              getChecklist: calendarPeriods.getChecklist,
              addChecklistItem: calendarPeriods.addChecklistItem,
              toggleChecklistItem: calendarPeriods.toggleChecklistItem,
              updateChecklistItem: calendarPeriods.updateChecklistItem,
              removeChecklistItem: calendarPeriods.removeChecklistItem,
              moveYesterdayChecklistToToday: calendarPeriods.moveYesterdayChecklistToToday,
            }}
              onAddChecklistItemToMyList={(periodKey, title) => {
              const deadline = getDeadlineFromPeriodKey(periodKey);
              if (deadline) myList.addParentWithEmptySubtask({ title, category: 'personal', importance: 3, estimatedMinutes: 30, energyType: 'Light', deadline });
            }}
            onSyncExistingChecklistToMyList={syncExistingChecklistToMyList}
            dailyRecurringItems={dailyRecurring.items}
            dailyItemLogs={dailyRecurring.logs}
            onAddDailyItem={dailyRecurring.addItem}
            onUpdateDailyItem={dailyRecurring.updateItem}
            onRemoveDailyItem={dailyRecurring.removeItem}
            onToggleDailyLog={dailyRecurring.toggleLog}
            getDailyLog={dailyRecurring.getLog}
            googleClientId={googleCal.googleClientId}
            onSetGoogleClientId={googleCal.setGoogleClientId}
            googleCalendarEvents={googleCal.googleCalendarEvents}
            onSyncFromGoogle={googleCal.setGoogleCalendarEvents}
          />
        )}
        {tab === 'analytics' && (
          <Analytics
            dailyRecurringItems={dailyRecurring.items}
            dailyItemLogs={dailyRecurring.logs}
          />
        )}
      </main>
    </div>
    </GoogleOAuthProvider>
  );
}
