import { useState } from 'react';
import type { JournalEntry } from '../types';
import { exportAsMarkdown, exportAsJson, downloadFile } from '../lib/journalExport';

interface Props {
  journalEntries: JournalEntry[];
  onAddEntry: (e: Omit<JournalEntry, 'id' | 'createdAt'>) => void;
  onUpdateEntry: (id: string, patch: Partial<Pick<JournalEntry, 'content' | 'mood' | 'tags'>>) => void;
  onRemoveEntry: (id: string) => void;
}

function formatEntryDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function Journals({
  journalEntries,
  onAddEntry,
  onUpdateEntry,
  onRemoveEntry,
}: Props) {
  const [content, setContent] = useState('');
  const [mood, setMood] = useState('');
  const [tagsStr, setTagsStr] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [editMood, setEditMood] = useState('');
  const [editTagsStr, setEditTagsStr] = useState('');

  const sortedEntries = [...journalEntries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;
    onAddEntry({
      content: content.trim(),
      mood: mood.trim() || undefined,
      tags: tagsStr.trim() ? tagsStr.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    });
    setContent('');
    setMood('');
    setTagsStr('');
  };

  const startEdit = (entry: JournalEntry) => {
    setEditingId(entry.id);
    setEditContent(entry.content);
    setEditMood(entry.mood ?? '');
    setEditTagsStr(entry.tags?.join(', ') ?? '');
  };

  const saveEdit = () => {
    if (editingId == null) return;
    onUpdateEntry(editingId, {
      content: editContent.trim(),
      mood: editMood.trim() || undefined,
      tags: editTagsStr.trim() ? editTagsStr.split(',').map((t) => t.trim()).filter(Boolean) : undefined,
    });
    setEditingId(null);
  };

  const handleDownloadMarkdown = () => {
    const md = exportAsMarkdown(journalEntries);
    const name = `journal-export-${new Date().toISOString().slice(0, 10)}.md`;
    downloadFile(md, name, 'text/markdown;charset=utf-8');
  };

  const handleDownloadJson = () => {
    const json = exportAsJson(journalEntries);
    const name = `journal-export-${new Date().toISOString().slice(0, 10)}.json`;
    downloadFile(json, name, 'application/json;charset=utf-8');
  };

  return (
    <div className="space-y-6 max-w-2xl">
      <h2 className="text-lg font-semibold text-stone-800">Journals</h2>
      <p className="text-sm text-stone-600">
        Write entries with optional mood and tags. Download as Markdown or JSON so you or an AI can analyse patterns and help you improve.
      </p>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={handleDownloadMarkdown}
          disabled={journalEntries.length === 0}
          className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Download as Markdown
        </button>
        <button
          type="button"
          onClick={handleDownloadJson}
          disabled={journalEntries.length === 0}
          className="rounded border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
        >
          Download as JSON
        </button>
      </div>
      <p className="text-xs text-stone-500">
        Exports include timestamps (created/updated), mood, tags, and word count so AI can identify patterns.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 rounded-lg border border-stone-200 bg-stone-50 p-4">
        <div>
          <label className="block text-xs font-medium text-stone-500 mb-1">Entry</label>
          <textarea
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's on your mind?"
            rows={4}
            className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900 resize-y"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-stone-500 mb-0.5">Mood (optional)</label>
            <input
              type="text"
              value={mood}
              onChange={(e) => setMood(e.target.value)}
              placeholder="e.g. calm, anxious, focused"
              className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            />
          </div>
          <div>
            <label className="block text-xs text-stone-500 mb-0.5">Tags (optional, comma-separated)</label>
            <input
              type="text"
              value={tagsStr}
              onChange={(e) => setTagsStr(e.target.value)}
              placeholder="e.g. work, sleep, reflection"
              className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900"
            />
          </div>
        </div>
        <button
          type="submit"
          className="rounded bg-stone-800 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
        >
          Add entry
        </button>
      </form>

      <ul className="space-y-4">
        {sortedEntries.map((entry) => (
          <li key={entry.id} className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <span className="text-xs text-stone-500">
                {formatEntryDate(entry.createdAt)}
                {entry.updatedAt && (
                  <span className="ml-2">(edited {formatEntryDate(entry.updatedAt)})</span>
                )}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => startEdit(entry)}
                  className="text-xs text-stone-500 hover:underline"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => onRemoveEntry(entry.id)}
                  className="text-xs text-rose-600 hover:underline"
                >
                  Delete
                </button>
              </div>
            </div>
            {editingId === entry.id ? (
              <div className="space-y-2">
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={4}
                  className="w-full rounded border border-stone-300 px-3 py-2 text-stone-900 resize-y"
                />
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={editMood}
                    onChange={(e) => setEditMood(e.target.value)}
                    placeholder="Mood"
                    className="rounded border border-stone-300 px-2 py-1 text-sm w-32"
                  />
                  <input
                    type="text"
                    value={editTagsStr}
                    onChange={(e) => setEditTagsStr(e.target.value)}
                    placeholder="Tags (comma-separated)"
                    className="flex-1 rounded border border-stone-300 px-2 py-1 text-sm"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={saveEdit}
                    className="rounded bg-stone-700 px-3 py-1.5 text-sm text-white hover:bg-stone-600"
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditingId(null)}
                    className="rounded border border-stone-300 px-3 py-1.5 text-sm text-stone-600"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <>
                {(entry.mood || (entry.tags?.length ?? 0) > 0) && (
                  <div className="flex flex-wrap gap-2 text-xs text-stone-500 mb-2">
                    {entry.mood && <span>Mood: {entry.mood}</span>}
                    {entry.tags?.length ? (
                      <span>Tags: {entry.tags.join(', ')}</span>
                    ) : null}
                  </div>
                )}
                <p className="text-stone-800 whitespace-pre-wrap">{entry.content || '(no content)'}</p>
              </>
            )}
          </li>
        ))}
      </ul>

      {journalEntries.length === 0 && (
        <p className="text-sm text-stone-500 py-6">No entries yet. Add one above; then download to share with an AI for analysis.</p>
      )}
    </div>
  );
}
