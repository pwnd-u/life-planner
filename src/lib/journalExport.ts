import type { JournalEntry } from '../types';

/** Entry with derived fields useful for AI analysis. */
export interface JournalEntryForExport extends JournalEntry {
  wordCount: number;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
}

function toExportEntry(entry: JournalEntry): JournalEntryForExport {
  const d = new Date(entry.createdAt);
  const date = d.toISOString().slice(0, 10);
  const time = d.toTimeString().slice(0, 5);
  const wordCount = entry.content.trim() ? entry.content.trim().split(/\s+/).length : 0;
  return {
    ...entry,
    wordCount,
    date,
    time,
  };
}

/** Export all entries as Markdown with metadata for AI analysis. */
export function exportAsMarkdown(entries: JournalEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const lines: string[] = [
    '# Journal Export',
    '',
    `Export date: ${new Date().toISOString()}`,
    `Total entries: ${sorted.length}`,
    '',
    '---',
    '',
  ];
  for (const entry of sorted) {
    const e = toExportEntry(entry);
    lines.push(`## ${e.date} ${e.time} (UTC)`);
    lines.push('');
    lines.push('```yaml');
    lines.push(`id: ${entry.id}`);
    lines.push(`created_at: ${entry.createdAt}`);
    if (entry.updatedAt) lines.push(`updated_at: ${entry.updatedAt}`);
    if (entry.mood) lines.push(`mood: ${entry.mood}`);
    if (entry.tags?.length) lines.push(`tags: [${entry.tags.join(', ')}]`);
    lines.push(`word_count: ${e.wordCount}`);
    lines.push('```');
    lines.push('');
    lines.push(entry.content.trim() || '(no content)');
    lines.push('');
    lines.push('---');
    lines.push('');
  }
  return lines.join('\n');
}

/** Export all entries as JSON for programmatic / AI analysis. */
export function exportAsJson(entries: JournalEntry[]): string {
  const sorted = [...entries].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  const forExport: JournalEntryForExport[] = sorted.map(toExportEntry);
  return JSON.stringify(
    {
      exportDate: new Date().toISOString(),
      totalEntries: forExport.length,
      entries: forExport,
    },
    null,
    2
  );
}

/** Trigger browser download of a text file. */
export function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
