import { useState, useEffect } from 'react';
import type { Checklist, ChecklistItem } from '../types';

interface Props {
  checklists: Checklist[];
  checklistItems: ChecklistItem[];
  onAddChecklist: (c: Omit<Checklist, 'id'>) => void;
  onUpdateChecklist: (id: string, patch: Partial<Checklist>) => void;
  onRemoveChecklist: (id: string) => void;
  onAddItem: (checklistId: string, text: string) => void;
  onUpdateItem: (itemId: string, patch: Partial<ChecklistItem>) => void;
  onRemoveItem: (checklistId: string, itemId: string) => void;
}

export default function Checklists({
  checklists,
  checklistItems,
  onAddChecklist,
  onUpdateChecklist,
  onRemoveChecklist,
  onAddItem,
  onUpdateItem,
  onRemoveItem,
}: Props) {
  const [editingItemId, setEditingItemId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [justAddedChecklistId, setJustAddedChecklistId] = useState<string | null>(null);

  const getItemsForChecklist = (c: Checklist) =>
    c.itemIds
      .map((id) => checklistItems.find((i) => i.id === id))
      .filter((i): i is ChecklistItem => i != null);

  const handleCreateChecklist = () => {
    onAddChecklist({
      name: 'New checklist',
      situationDescription: undefined,
      itemIds: [],
    });
  };

  const handleAddItem = (checklistId: string) => {
    onAddItem(checklistId, '');
    setJustAddedChecklistId(checklistId);
  };

  // After adding an item, focus the new (empty) item for editing
  useEffect(() => {
    if (!justAddedChecklistId) return;
    const c = checklists.find((x) => x.id === justAddedChecklistId);
    if (!c) return;
    const items = getItemsForChecklist(c);
    const empty = items.find((i) => i.text === '');
    if (empty) {
      setEditingItemId(empty.id);
    }
    setJustAddedChecklistId(null);
  }, [justAddedChecklistId, checklists, checklistItems]);

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-bold text-[var(--adhd-text)]">Checklists</h2>
      <p className="text-sm text-[var(--adhd-text-muted)]">
        Create checklists and add items with the + button. Connect calendar events to a checklist from the Calendar when editing an event.
      </p>

      <button
        type="button"
        onClick={handleCreateChecklist}
        className="rounded-xl bg-[var(--adhd-accent)] px-4 py-2.5 text-base font-bold text-white hover:opacity-90"
      >
        Create checklist
      </button>

      <ul className="space-y-6">
        {checklists.map((c) => {
          const items = getItemsForChecklist(c);

          return (
            <li key={c.id} className="rounded-xl border-2 border-[var(--adhd-border)] bg-[var(--adhd-surface)] overflow-hidden">
              <div className="p-4 border-b border-[var(--adhd-border)]">
                {editingNameId === c.id ? (
                  <input
                    type="text"
                    defaultValue={c.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v) onUpdateChecklist(c.id, { name: v });
                      setEditingNameId(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        const v = (e.target as HTMLInputElement).value.trim();
                        if (v) onUpdateChecklist(c.id, { name: v });
                        setEditingNameId(null);
                      }
                      if (e.key === 'Escape') setEditingNameId(null);
                    }}
                    className="w-full rounded-lg border-2 border-[var(--adhd-border)] px-3 py-2 text-base font-bold text-[var(--adhd-text)] focus:border-[var(--adhd-accent)] focus:outline-none"
                    autoFocus
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditingNameId(c.id)}
                    className="text-left w-full text-base font-bold text-[var(--adhd-text)] hover:bg-[var(--adhd-bg)] rounded-lg px-2 py-1 -mx-2 -my-1"
                  >
                    {c.name}
                  </button>
                )}
              </div>

              <div className="p-4">
                <ul className="space-y-2">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-center gap-3 rounded-xl border-2 border-transparent px-3 py-2 group hover:border-[var(--adhd-border)] hover:bg-[var(--adhd-bg)]"
                    >
                      <input
                        type="checkbox"
                        checked={item.done ?? false}
                        onChange={() => onUpdateItem(item.id, { done: !(item.done ?? false) })}
                        className="h-5 w-5 shrink-0 rounded border-2 border-[var(--adhd-border)] accent-[var(--adhd-success)]"
                      />
                      {editingItemId === item.id ? (
                        <input
                          type="text"
                          defaultValue={item.text}
                          placeholder="Item text..."
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            onUpdateItem(item.id, { text: v || 'New item' });
                            setEditingItemId(null);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const v = (e.target as HTMLInputElement).value.trim();
                              onUpdateItem(item.id, { text: v || 'New item' });
                              setEditingItemId(null);
                            }
                            if (e.key === 'Escape') setEditingItemId(null);
                          }}
                          className="min-w-0 flex-1 rounded-lg border-2 border-[var(--adhd-border)] px-3 py-2 text-base focus:border-[var(--adhd-accent)] focus:outline-none"
                          autoFocus
                        />
                      ) : (
                        <>
                          <span
                            className={`min-w-0 flex-1 text-base font-medium ${item.done ? 'text-[var(--adhd-text-muted)] line-through' : 'text-[var(--adhd-text)]'}`}
                            onClick={() => setEditingItemId(item.id)}
                          >
                            {item.text || 'New item'}
                          </span>
                          <button
                            type="button"
                            onClick={() => onRemoveItem(c.id, item.id)}
                            className="rounded-lg px-2 py-1 text-sm font-medium text-red-600 opacity-0 group-hover:opacity-100 hover:bg-red-50"
                          >
                            Delete
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-3 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleAddItem(c.id)}
                    className="flex items-center justify-center w-10 h-10 rounded-xl border-2 border-dashed border-[var(--adhd-border)] text-[var(--adhd-text-muted)] hover:border-[var(--adhd-accent)] hover:text-[var(--adhd-accent)] hover:bg-[var(--adhd-accent-soft)] text-xl font-bold"
                    title="Add item"
                  >
                    +
                  </button>
                  <span className="text-sm text-[var(--adhd-text-muted)]">Add item</span>
                </div>
              </div>

              <div className="border-t border-[var(--adhd-border)] px-4 py-2">
                <button
                  type="button"
                  onClick={() => onRemoveChecklist(c.id)}
                  className="text-sm font-medium text-red-600 hover:underline"
                >
                  Delete checklist
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      {checklists.length === 0 && (
        <p className="text-sm text-[var(--adhd-text-muted)] py-4">No checklists yet. Click &quot;Create checklist&quot; to add one.</p>
      )}
    </div>
  );
}
