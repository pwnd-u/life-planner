import { useState, useMemo, useRef, useEffect } from 'react';
import type { MyListItem, ListItemCategory, EnergyType } from '../types';
import { scheduleListIntoCalendar } from '../lib/scheduleFromList';
import { parseBrainDump } from '../lib/openai';
import type { AIParsedItem } from '../types';

interface Props {
  myListItems: MyListItem[];
  onAddItem: (item: Omit<MyListItem, 'id' | 'order'>) => void | string;
  onUpdateItem: (id: string, patch: Partial<MyListItem>) => void;
  onRemoveItem: (id: string) => void;
  onReorder: (items: MyListItem[]) => void;
  calendarEvents: { id: string; title: string; start: string; end: string }[];
  onAddCalendarEvents: (events: { title: string; start: string; end: string }[]) => void;
  openAiApiKey: string | undefined;
  setOpenAiApiKey: (key: string | undefined) => void;
  existingGoalNames: string[];
  onMirrorToCalendarChecklists?: (deadline: string, title: string) => void;
}

const IMPORTANCE = [1, 2, 3, 4, 5] as const;
const ENERGY: EnergyType[] = ['Deep', 'Light', 'Admin'];

const defaultItem = (parentId?: string): Omit<MyListItem, 'id' | 'order'> => ({
  title: '',
  category: 'personal',
  importance: 3,
  estimatedMinutes: 30,
  energyType: 'Light',
  deadline: undefined,
  parentId,
  completed: false,
});

function prioritizeItems(items: MyListItem[]): MyListItem[] {
  const sorted = [...items].sort((a, b) => {
    if (b.importance !== a.importance) return b.importance - a.importance;
    const aDead = a.deadline ?? '9999-12-31';
    const bDead = b.deadline ?? '9999-12-31';
    if (aDead !== bDead) return aDead.localeCompare(bDead);
    const order = { Deep: 0, Light: 1, Admin: 2 };
    return order[a.energyType] - order[b.energyType];
  });
  return sorted.map((item, i) => ({ ...item, order: i }));
}

export default function MyList({
  myListItems,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
  onReorder,
  calendarEvents,
  onAddCalendarEvents,
  openAiApiKey,
  setOpenAiApiKey,
  existingGoalNames,
  onMirrorToCalendarChecklists,
}: Props) {
  const [quickAdd, setQuickAdd] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [focusedSubtaskId, setFocusedSubtaskId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});

  const rootItems = useMemo(
    () => myListItems.filter((i) => !i.parentId).sort((a, b) => a.order - b.order),
    [myListItems]
  );
  const getChildren = (parentId: string) =>
    myListItems.filter((i) => i.parentId === parentId).sort((a, b) => a.order - b.order);

  // Every parent must have at least one subtask; ensure any root with 0 children gets one empty subtask
  useEffect(() => {
    rootItems.forEach((item) => {
      if (getChildren(item.id).length === 0) {
        onAddItem({ ...defaultItem(item.id), title: '' });
      }
    });
  }, [myListItems]); // eslint-disable-line react-hooks/exhaustive-deps -- only run when list changes; getChildren/rootItems/onAddItem are stable enough

  // On load: sync all tasks with deadlines into calendar checklists
  const mirroredOnLoad = useRef(false);
  useEffect(() => {
    if (mirroredOnLoad.current || !onMirrorToCalendarChecklists) return;
    mirroredOnLoad.current = true;
    rootItems.forEach((item) => {
      if (item.deadline && item.title) {
        onMirrorToCalendarChecklists(item.deadline, item.title);
      }
    });
  }, [rootItems, onMirrorToCalendarChecklists]);

  const handleUpdate = (id: string, patch: Partial<MyListItem>) => {
    onUpdateItem(id, patch);
    if (patch.deadline && onMirrorToCalendarChecklists) {
      const item = myListItems.find((i) => i.id === id);
      const title = patch.title ?? item?.title ?? '';
      if (title) onMirrorToCalendarChecklists(patch.deadline, title);
    }
  };

  const handleRemove = (id: string) => {
    const item = myListItems.find((i) => i.id === id);
    if (item?.parentId) {
      const children = getChildren(item.parentId);
      if (children.length === 1) {
        onUpdateItem(id, { title: '' });
        return;
      }
    }
    onRemoveItem(id);
  };

  const addOne = (title: string, parentId?: string): string | undefined => {
    if (parentId) {
      const id = onAddItem({ ...defaultItem(parentId), title: title.trim() });
      return typeof id === 'string' ? id : undefined;
    }
    const t = title.trim();
    if (!t) return undefined;
    onAddItem({ ...defaultItem(), title: t });
    return undefined;
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    addOne(quickAdd);
    setQuickAdd('');
  };

  const handlePrioritize = () => onReorder(prioritizeItems(myListItems));
  const handleAddToCalendar = () => {
    const flat = myListItems.filter((i) => !i.parentId);
    const slots = scheduleListIntoCalendar(flat, calendarEvents, { dayStart: '08:00', dayEnd: '22:00', daysAhead: 14 });
    onAddCalendarEvents(slots);
  };

  const handlePaste = () => {
    pasteText.split(/\n/).map((s) => s.trim()).filter(Boolean).forEach((line) => onAddItem({ ...defaultItem(), title: line }));
    setPasteText('');
    setPasteOpen(false);
  };

  const handleAI = async () => {
    const key = openAiApiKey?.trim();
    if (!key) { setAiError('Set API key in menu first'); return; }
    if (!pasteText.trim()) { setAiError('Paste text first'); return; }
    setAiError(null);
    setAiLoading(true);
    try {
      const { items } = await parseBrainDump(key, pasteText.trim(), existingGoalNames);
      (items as AIParsedItem[]).forEach((item) =>
        onAddItem({ title: item.title, category: 'personal', importance: 3, estimatedMinutes: item.estimatedMinutes ?? 30, energyType: item.energyType ?? 'Light' })
      );
      setPasteText('');
      setPasteOpen(false);
      if (!openAiApiKey && key) setOpenAiApiKey(key);
    } catch (e) {
      setAiError(e instanceof Error ? e.message : 'Failed');
    } finally {
      setAiLoading(false);
    }
  };

  const handleDragStart = (id: string) => setDraggingId(id);
  const handleDragEnd = () => setDraggingId(null);
  const handleDrop = (targetId: string) => {
    if (!draggingId || draggingId === targetId) return;
    const dragged = myListItems.find((i) => i.id === draggingId);
    const target = myListItems.find((i) => i.id === targetId);
    if (!dragged || !target) return;
    const parentKey = dragged.parentId ?? null;
    if ((target.parentId ?? null) !== parentKey) return;
    const siblings = myListItems.filter((i) => (i.parentId ?? null) === parentKey).sort((a, b) => a.order - b.order);
    const ids = siblings.map((i) => i.id);
    const from = ids.indexOf(draggingId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0 || from === to) return;
    ids.splice(to, 0, ids.splice(from, 1)[0]);
    onReorder(myListItems.map((i) => ((i.parentId ?? null) !== parentKey ? i : { ...i, order: ids.indexOf(i.id) })));
  };

  return (
    <div className="w-full max-w-5xl">
      <form onSubmit={handleQuickAdd} className="flex items-center gap-2 mb-4">
        <input
          type="text"
          value={quickAdd}
          onChange={(e) => setQuickAdd(e.target.value)}
          placeholder="Add a task..."
          className="flex-1 min-w-0 rounded-lg border border-[var(--adhd-border)] bg-white px-4 py-2.5 text-base text-[var(--adhd-text)] placeholder:text-[var(--adhd-text-muted)] focus:border-[var(--adhd-accent)] focus:outline-none focus:ring-1 focus:ring-[var(--adhd-accent)]"
        />
        <button type="submit" className="shrink-0 rounded-lg bg-[var(--adhd-accent)] text-white p-2.5 hover:opacity-90 text-lg leading-none" title="Add">+</button>
      </form>

      <div className="flex flex-wrap items-center gap-3 text-sm text-[var(--adhd-text-muted)] mb-3">
        <button type="button" onClick={() => setPasteOpen((v) => !v)} className="hover:text-[var(--adhd-text)]">{pasteOpen ? 'Cancel' : 'Paste list'}</button>
        <button type="button" onClick={handlePrioritize} disabled={myListItems.length < 2} className="hover:text-[var(--adhd-text)] disabled:opacity-50">Prioritize</button>
        <button type="button" onClick={handleAddToCalendar} disabled={myListItems.length === 0} className="hover:text-[var(--adhd-text)] disabled:opacity-50">Add to calendar</button>
        {rootItems.length > 0 && (
          <>
            <span className="text-[var(--adhd-border)]">|</span>
            <button type="button" onClick={() => setExpandedIds((prev) => ({ ...prev, ...Object.fromEntries(rootItems.map((i) => [i.id, true])) }))} className="hover:text-[var(--adhd-text)]">Expand all</button>
            <button type="button" onClick={() => setExpandedIds((prev) => ({ ...prev, ...Object.fromEntries(rootItems.map((i) => [i.id, false])) }))} className="hover:text-[var(--adhd-text)]">Collapse all</button>
          </>
        )}
      </div>

      {pasteOpen && (
        <div className="mb-4 p-3 rounded-lg border border-[var(--adhd-border)] bg-[var(--adhd-bg)]">
          <textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} placeholder="Paste lines..." rows={3} className="w-full rounded border border-[var(--adhd-border)] px-2 py-1.5 text-sm mb-2" />
          <div className="flex gap-2">
            <button type="button" onClick={handlePaste} disabled={!pasteText.trim()} className="text-sm px-2 py-1 rounded bg-[var(--adhd-accent)] text-white disabled:opacity-50">Add</button>
            <button type="button" onClick={handleAI} disabled={aiLoading || !pasteText.trim()} className="text-sm px-2 py-1 rounded bg-amber-500 text-white disabled:opacity-50">{aiLoading ? '…' : 'AI'}</button>
            {aiError && <span className="text-red-600 text-sm">{aiError}</span>}
          </div>
        </div>
      )}

      <details className="mb-3 text-sm text-[var(--adhd-text-muted)]">
        <summary className="cursor-pointer hover:text-[var(--adhd-text)]">OpenAI key (for AI)</summary>
        <div className="mt-2"><input type="password" defaultValue={openAiApiKey ?? ''} placeholder="sk-..." className="flex-1 rounded border border-[var(--adhd-border)] px-2 py-1 text-sm" onBlur={(e) => setOpenAiApiKey(e.target.value.trim() || undefined)} /></div>
      </details>

      <ul className="space-y-0.5 list-none pl-0">
        {rootItems.map((item) => (
          <ParentOrStandaloneRow
            key={item.id}
            item={item}
            children={getChildren(item.id)}
            onUpdate={handleUpdate}
            onRemove={handleRemove}
            onAddSub={() => {
              const id = addOne('', item.id);
              if (id) setFocusedSubtaskId(id);
            }}
            expanded={expandedIds[item.id] ?? false}
            onSetExpanded={(v) => setExpandedIds((prev) => ({ ...prev, [item.id]: v }))}
            getChildren={getChildren}
            draggingId={draggingId}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
            onDrop={handleDrop}
            focusedSubtaskId={focusedSubtaskId}
            onClearFocusSubtask={() => setFocusedSubtaskId(null)}
          />
        ))}
      </ul>

      {myListItems.length === 0 && <p className="text-base text-[var(--adhd-text-muted)] py-8 text-center">Type above and press Enter to add a task.</p>}
    </div>
  );
}

// ----- Parent or Standalone (planning layer: title + metadata inline, optional subtasks) -----
interface ParentRowProps {
  item: MyListItem;
  children: MyListItem[];
  onUpdate: (id: string, patch: Partial<MyListItem>) => void;
  onRemove: (id: string) => void;
  onAddSub: () => void;
  expanded: boolean;
  onSetExpanded: (v: boolean) => void;
  getChildren: (parentId: string) => MyListItem[];
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string) => void;
  focusedSubtaskId: string | null;
  onClearFocusSubtask: () => void;
}

function ParentOrStandaloneRow({ item, children, onUpdate, onRemove, onAddSub, expanded, onSetExpanded, getChildren, draggingId, onDragStart, onDragEnd, onDrop, focusedSubtaskId, onClearFocusSubtask }: ParentRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const isParent = children.length > 0;
  const allSubtasksDone = isParent && children.every((c) => c.completed ?? false);
  const completed = (item.completed ?? false) || allSubtasksDone;
  const setCompleted = (value: boolean) => {
    onUpdate(item.id, { completed: value });
    if (isParent) children.forEach((c) => onUpdate(c.id, { completed: value }));
  };

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  const handleAddSub = () => {
    onAddSub();
    onSetExpanded(true);
  };

  return (
    <li className="list-none min-w-0">
      {/* Parent/standalone = one line: checkbox, title, metadata, collapse (always), ⋮ */}
      <div
        className={`group flex flex-nowrap items-center gap-2 py-1.5 px-2 rounded-lg border border-[var(--adhd-border)] min-w-0 ${draggingId === item.id ? 'bg-[var(--adhd-accent-soft)] border-[var(--adhd-accent)]' : 'bg-[var(--adhd-surface)] hover:border-[var(--adhd-accent)]/40'}`}
        draggable
        onDragStart={() => onDragStart(item.id)}
        onDragEnd={onDragEnd}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); onDrop(item.id); }}
      >
        <input
          type="checkbox"
          checked={completed}
          onChange={() => setCompleted(!completed)}
          className="h-4 w-4 shrink-0 rounded border-2 border-[var(--adhd-border)] accent-[var(--adhd-success)]"
          aria-label="Complete"
        />
        <input
          type="text"
          value={item.title}
          onChange={(e) => onUpdate(item.id, { title: e.target.value })}
          placeholder="Task or goal"
          className={`flex-1 min-w-0 bg-transparent border-none px-1 py-0.5 text-sm font-semibold text-[var(--adhd-text)] focus:outline-none focus:ring-0 placeholder:font-normal placeholder:text-[var(--adhd-text-muted)] ${completed ? 'line-through text-[var(--adhd-text-muted)]' : ''}`}
        />
        <div className="flex flex-nowrap items-center gap-1.5 shrink-0 text-xs">
          <select value={item.category} onChange={(e) => onUpdate(item.id, { category: e.target.value as ListItemCategory })} className="rounded border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-1.5 py-0.5 text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" title="Category">
            <option value="personal">Personal</option>
            <option value="work">Work</option>
          </select>
          <select value={item.importance} onChange={(e) => onUpdate(item.id, { importance: Number(e.target.value) })} className="w-8 rounded border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-1 py-0.5 text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" title="Importance">
            {IMPORTANCE.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <label className="flex items-center gap-0.5 text-[var(--adhd-text-muted)]">
            <input type="number" min={1} value={item.estimatedMinutes} onChange={(e) => onUpdate(item.id, { estimatedMinutes: Number(e.target.value) || 15 })} className="w-11 rounded border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-1 py-0.5 text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" />
            <span>m</span>
          </label>
          <select value={item.energyType} onChange={(e) => onUpdate(item.id, { energyType: e.target.value as EnergyType })} className="rounded border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-1.5 py-0.5 text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none" title="Energy">
            {ENERGY.map((e) => <option key={e} value={e}>{e}</option>)}
          </select>
          <input type="date" value={item.deadline ?? ''} onChange={(e) => onUpdate(item.id, { deadline: e.target.value.trim() || undefined })} className="rounded border border-[var(--adhd-border)] bg-[var(--adhd-bg)] px-1.5 py-0.5 text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none w-[7.5rem]" title="Deadline" />
        </div>
        {/* Every parent row has collapse/expand */}
        <button type="button" onClick={() => onSetExpanded(!expanded)} className="shrink-0 p-1 rounded text-[var(--adhd-text-muted)] hover:bg-[var(--adhd-bg)] hover:text-[var(--adhd-text)]" aria-label={expanded ? 'Collapse' : 'Expand'}>
          {expanded ? '▼' : '▶'}
        </button>
        <div className="relative shrink-0" ref={menuRef}>
          <button type="button" onClick={() => setMenuOpen((v) => !v)} className="p-1 rounded text-[var(--adhd-text-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--adhd-bg)] hover:text-[var(--adhd-text)]" aria-label="Menu">⋮</button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 z-10 rounded-lg border border-[var(--adhd-border)] bg-white shadow-lg py-1 min-w-[160px]">
              <button type="button" onClick={() => { handleAddSub(); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm hover:bg-[var(--adhd-bg)]">Add subtask</button>
              <button type="button" onClick={() => { onRemove(item.id); setMenuOpen(false); }} className="block w-full text-left px-4 py-2 text-sm text-red-600 hover:bg-red-50">Delete</button>
            </div>
          )}
        </div>
      </div>

      {expanded && (
        <ul className="pl-8 border-l-2 border-[var(--adhd-border)] ml-3 my-2 space-y-1 list-none">
          {children.map((child) => (
            <SubtaskRow
              key={child.id}
              item={child}
              onUpdate={onUpdate}
              onRemove={onRemove}
              draggingId={draggingId}
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
              onDrop={onDrop}
              focusWhenMounted={child.id === focusedSubtaskId}
              onClearFocus={onClearFocusSubtask}
            />
          ))}
          <li className="list-none">
            <button type="button" onClick={handleAddSub} className="text-sm font-medium text-[var(--adhd-accent)] hover:underline py-1.5 px-0">+ Add subtask</button>
          </li>
        </ul>
      )}
    </li>
  );
}

// ----- Subtask (execution layer: checkbox + title only, no metadata) -----
interface SubtaskRowProps {
  item: MyListItem;
  onUpdate: (id: string, patch: Partial<MyListItem>) => void;
  onRemove: (id: string) => void;
  draggingId: string | null;
  onDragStart: (id: string) => void;
  onDragEnd: () => void;
  onDrop: (targetId: string) => void;
  focusWhenMounted?: boolean;
  onClearFocus?: () => void;
}

function SubtaskRow({ item, onUpdate, onRemove, draggingId, onDragStart, onDragEnd, onDrop, focusWhenMounted, onClearFocus }: SubtaskRowProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const completed = item.completed ?? false;

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => { if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false); };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [menuOpen]);

  useEffect(() => {
    if (!focusWhenMounted) return;
    const t = setTimeout(() => {
      inputRef.current?.focus();
      onClearFocus?.();
    }, 0);
    return () => clearTimeout(t);
  }, [focusWhenMounted, onClearFocus]);

  return (
    <li
      className={`group flex items-center gap-2 py-1.5 px-2 rounded-md list-none ${draggingId === item.id ? 'bg-[var(--adhd-accent-soft)]' : 'hover:bg-[var(--adhd-bg)]/70'}`}
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragEnd={onDragEnd}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => { e.preventDefault(); onDrop(item.id); }}
    >
      <input
        type="checkbox"
        checked={completed}
        onChange={() => onUpdate(item.id, { completed: !completed })}
        className="h-4 w-4 shrink-0 rounded border-2 border-[var(--adhd-border)] accent-[var(--adhd-success)]"
        aria-label="Complete"
      />
      <input
        ref={inputRef}
        type="text"
        value={item.title}
        onChange={(e) => onUpdate(item.id, { title: e.target.value })}
        placeholder="Step"
        className={`flex-1 min-w-0 bg-transparent border-none px-1 py-0.5 text-sm text-[var(--adhd-text)] focus:outline-none focus:ring-0 placeholder:text-[var(--adhd-text-muted)] ${completed ? 'line-through text-[var(--adhd-text-muted)]' : ''}`}
      />
      <div className="relative shrink-0" ref={menuRef}>
        <button type="button" onClick={() => setMenuOpen((v) => !v)} className="p-1 rounded text-[var(--adhd-text-muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--adhd-border)] hover:text-[var(--adhd-text)]" aria-label="Menu">⋮</button>
        {menuOpen && (
          <div className="absolute right-0 top-full mt-1 z-10 rounded-lg border border-[var(--adhd-border)] bg-white shadow py-1 min-w-[100px]">
            <button type="button" onClick={() => { onRemove(item.id); setMenuOpen(false); }} className="block w-full text-left px-3 py-2 text-sm text-red-600 hover:bg-red-50">Delete</button>
          </div>
        )}
      </div>
    </li>
  );
}
