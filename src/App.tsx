import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { GoogleOAuthProvider } from '@react-oauth/google';
import { useStore, useGoals, useObjectives, useChecklists, useTrackedGoals, useJournals, useCalendarEvents, useCalendarPeriods, useMyListItems, useGoogleCalendar, useDailyRecurring, useWeeklyRecurring, useMonthlyRecurring, useEventCompletions, useReflections, useEventFocusSessions } from './useStore';
import Auth from './components/Auth';
import Checklists from './components/Checklists';
import GoalTracker from './components/GoalTracker';
import Journals from './components/Journals';
import MyList from './components/MyList';
import Calendar from './components/Calendar';
import Analytics from './components/Analytics';
import Insights from './components/Insights';
import { getDeadlineFromPeriodKey, getWeekStart, yesterdayStr, todayStr } from './lib/date';

type Tab = 'myList' | 'checklist' | 'goalTracker' | 'journals' | 'calendar' | 'analytics' | 'insights';

export default function App() {
  const [state, dispatch] = useStore();
  const [tab, setTab] = useState<Tab>('calendar');
  const [demoMode, setDemoMode] = useState(false);
  /** Hourly reminder: incomplete daily to-dos. null = not showing, [] = nothing to do, non-empty = show modal with these. */
  const [dailyReminderIncomplete, setDailyReminderIncomplete] = useState<{ id: string; title: string }[] | null>(null);
  const stateRef = useRef(state);
  stateRef.current = state;
  const demoModeRef = useRef(demoMode);
  demoModeRef.current = demoMode;

  const goals = useGoals(state, dispatch);
  const objectivesHook = useObjectives(state, dispatch);
  const checklists = useChecklists(state, dispatch);
  const trackedGoals = useTrackedGoals(state, dispatch);
  const journals = useJournals(state, dispatch);
  const calendar = useCalendarEvents(state, dispatch);
  const calendarPeriods = useCalendarPeriods(state, dispatch);
  const googleCal = useGoogleCalendar(state, dispatch);
  const myList = useMyListItems(state, dispatch);
  const dailyRecurring = useDailyRecurring(state, dispatch);
  const weeklyRecurring = useWeeklyRecurring(state, dispatch);
  const monthlyRecurring = useMonthlyRecurring(state, dispatch);
  const eventCompletions = useEventCompletions(state, dispatch);
  const reflections = useReflections(state, dispatch);
  const focusSessions = useEventFocusSessions(state, dispatch);

  // On app load, ensure yesterday's daily items all have logs (creates "not done" for unchecked)
  const logInitDone = useRef(false);
  useEffect(() => {
    if (logInitDone.current || dailyRecurring.items.length === 0) return;
    logInitDone.current = true;
    dailyRecurring.ensureLogsForDate(yesterdayStr());
  }, [dailyRecurring.items.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hourly pop-up: remind about incomplete daily recurring items (first check after 1 min, then every 1 hour)
  useEffect(() => {
    function checkIncomplete() {
      if (demoModeRef.current) return;
      const s = stateRef.current;
      const items = s.dailyRecurringItems ?? [];
      const logs = s.dailyItemLogs ?? [];
      if (items.length === 0) return;
      const today = todayStr();
      const incomplete: { id: string; title: string }[] = [];
      for (const item of items) {
        const log = logs.find((l) => l.dailyItemId === item.id && l.date === today);
        if (!log || !log.done) incomplete.push({ id: item.id, title: item.title });
      }
      if (incomplete.length > 0) setDailyReminderIncomplete(incomplete);
    }
    const first = window.setTimeout(checkIncomplete, 60 * 1000);
    const interval = window.setInterval(checkIncomplete, 60 * 60 * 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(interval);
    };
  }, []);

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

  const nav: { id: Tab; label: string }[] = [
    { id: 'myList', label: 'My list' },
    { id: 'calendar', label: 'Calendar' },
    { id: 'checklist', label: 'Checklist' },
    { id: 'goalTracker', label: 'Goal Tracker' },
    { id: 'journals', label: 'Journals' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'insights', label: 'Insights' },
  ];

  const mainMaxWidth = tab === 'calendar' ? 'max-w-[1600px]' : tab === 'myList' ? 'max-w-[1600px]' : tab === 'analytics' || tab === 'insights' ? 'max-w-5xl' : 'max-w-4xl';

  return (
    <GoogleOAuthProvider clientId={state.googleClientId || 'placeholder.apps.googleusercontent.com'}>
    <div className={`min-h-screen bg-[var(--adhd-bg)] text-[var(--adhd-text)] ${demoMode ? 'demo-mode' : ''}`}>
      <header className="border-b-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)]">
        <div className={`mx-auto ${tab === 'calendar' ? 'max-w-[1600px]' : tab === 'myList' ? 'max-w-[1600px]' : tab === 'analytics' || tab === 'insights' ? 'max-w-5xl' : 'max-w-4xl'} px-4 py-4`}>
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

      {/* Hourly reminder: incomplete daily to-dos — big, attention-grabbing modal */}
      {dailyReminderIncomplete != null && dailyReminderIncomplete.length > 0 && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4"
          role="alertdialog"
          aria-labelledby="daily-reminder-title"
          aria-modal="true"
          onClick={() => setDailyReminderIncomplete(null)}
        >
          <div
            className="w-full max-w-lg rounded-2xl border-4 border-amber-400 bg-amber-50 shadow-2xl p-8"
            style={{ boxShadow: '0 0 0 4px var(--adhd-accent), 0 25px 50px -12px rgba(0,0,0,0.4)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h2
              id="daily-reminder-title"
              className="text-2xl md:text-3xl font-bold text-amber-900 mb-2"
            >
              Complete your daily to-do
            </h2>
            <p className="text-base text-amber-800 mb-6">
              You still have {dailyReminderIncomplete.length} item{dailyReminderIncomplete.length !== 1 ? 's' : ''} left for today:
            </p>
            <ul className="list-none space-y-3 mb-8">
              {dailyReminderIncomplete.map(({ id, title }) => (
                <li key={id} className="flex items-center gap-3 text-lg font-medium text-amber-900 bg-amber-100/80 rounded-xl px-4 py-3 border border-amber-200">
                  <span className="text-amber-600 shrink-0" aria-hidden>☐</span>
                  <span>{title || 'Untitled item'}</span>
                </li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => { setTab('calendar'); setDailyReminderIncomplete(null); }}
                className="flex-1 min-w-[140px] rounded-xl bg-[var(--adhd-accent)] px-5 py-3 text-lg font-semibold text-white shadow-md hover:opacity-90 transition-opacity"
              >
                Go to Calendar
              </button>
              <button
                type="button"
                onClick={() => setDailyReminderIncomplete(null)}
                className="flex-1 min-w-[140px] rounded-xl bg-amber-200 px-5 py-3 text-lg font-semibold text-amber-900 hover:bg-amber-300 transition-colors"
              >
                Dismiss
              </button>
            </div>
          </div>
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
            objectives={objectivesHook.objectives}
            onAddObjective={objectivesHook.addObjective}
            onUpdateObjective={objectivesHook.updateObjective}
            onRemoveObjective={objectivesHook.removeObjective}
            onToggleMilestoneStep={trackedGoals.toggleMilestoneStep}
            onAddMilestoneStep={trackedGoals.addMilestoneStep}
            onRemoveMilestoneStep={trackedGoals.removeMilestoneStep}
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
            weeklyRecurringItems={weeklyRecurring.items}
            weeklyItemLogs={weeklyRecurring.logs}
            onAddWeeklyItem={weeklyRecurring.addItem}
            onUpdateWeeklyItem={weeklyRecurring.updateItem}
            onRemoveWeeklyItem={weeklyRecurring.removeItem}
            onToggleWeeklyLog={weeklyRecurring.toggleLog}
            getWeeklyLog={weeklyRecurring.getLog}
            monthlyRecurringItems={monthlyRecurring.items}
            monthlyItemLogs={monthlyRecurring.logs}
            onAddMonthlyItem={monthlyRecurring.addItem}
            onUpdateMonthlyItem={monthlyRecurring.updateItem}
            onRemoveMonthlyItem={monthlyRecurring.removeItem}
            onToggleMonthlyLog={monthlyRecurring.toggleLog}
            getMonthlyLog={monthlyRecurring.getLog}
            getEventCompletion={eventCompletions.getCompletion}
            setEventCompletion={eventCompletions.setCompletion}
            focusSessions={focusSessions.sessions}
            onStartFocusSession={focusSessions.startSession}
            onEndFocusSession={focusSessions.endSession}
            onUpdateFocusSession={focusSessions.updateSession}
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
        {tab === 'insights' && (
          <Insights
            state={state}
            setDailyReflection={reflections.setDailyReflection}
            setWeeklyReflection={reflections.setWeeklyReflection}
            getDailyReflection={reflections.getDailyReflection}
            getWeeklyReflection={reflections.getWeeklyReflection}
            getEventCompletion={eventCompletions.getCompletion}
          />
        )}
      </main>
    </div>
    </GoogleOAuthProvider>
  );
}
