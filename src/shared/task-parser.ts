import type { Task } from './types/task-types';

const TASK_RE = /^- \[( |x)\] (.+)$/;

export interface ParsedTasks {
  tasks: Task[];
  /** Original lines, for byte-stable round-trip. */
  lines: string[];
  /** Map from task id -> { startLine, endLine } (inclusive). */
  taskRanges: Record<string, { start: number; end: number }>;
}

function makeId(index: number, title: string): string {
  // Cheap deterministic hash; no crypto dep.
  let h = 2166136261 >>> 0;
  const s = `${index}:${title}`;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  }
  return `t_${(h >>> 0).toString(36)}`;
}

export function parseTasksMarkdown(md: string): ParsedTasks {
  const hadTrailingNewline = md.length > 0 && md.endsWith('\n');
  const body = hadTrailingNewline ? md.slice(0, -1) : md;
  const lines = body.length === 0 ? [] : body.split('\n');
  const tasks: Task[] = [];
  const taskRanges: Record<string, { start: number; end: number }> = {};

  let index = 0;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(TASK_RE);
    if (!m) continue;
    const done = m[1] === 'x';
    const title = m[2].trim();
    // Notes: subsequent lines that start with two spaces.
    const noteLines: string[] = [];
    let j = i + 1;
    while (j < lines.length && /^ {2,}\S/.test(lines[j])) {
      noteLines.push(lines[j].replace(/^ {2}/, ''));
      j++;
    }
    const id = makeId(index, title);
    tasks.push({
      id,
      title,
      done,
      notes: noteLines.length ? noteLines.join('\n') : undefined,
      createdAt: 0, // filled in by manager from sidecar
    });
    taskRanges[id] = { start: i, end: j - 1 };
    index++;
    i = j - 1;
  }

  // Re-append the trailing newline marker as a sentinel empty line so
  // serialization can reconstruct exactly.
  if (hadTrailingNewline) lines.push('');
  return { tasks, lines, taskRanges };
}

export function serializeTasksMarkdown(parsed: ParsedTasks): string {
  return parsed.lines.join('\n');
}

export function addTask(md: string, title: string): string {
  const cleanTitle = title.trim();
  if (!cleanTitle) return md;
  const newLine = `- [ ] ${cleanTitle}`;
  if (md.length === 0) return `${newLine}\n`;
  const trailing = md.endsWith('\n') ? '' : '\n';
  return `${md}${trailing}${newLine}\n`;
}

export function toggleTask(md: string, id: string): string {
  const parsed = parseTasksMarkdown(md);
  const range = parsed.taskRanges[id];
  if (!range) return md;
  const line = parsed.lines[range.start];
  const toggled = line.startsWith('- [ ]')
    ? line.replace('- [ ]', '- [x]')
    : line.replace('- [x]', '- [ ]');
  parsed.lines[range.start] = toggled;
  return serializeTasksMarkdown(parsed);
}

export function editTask(
  md: string,
  id: string,
  changes: { title?: string; notes?: string },
): string {
  const parsed = parseTasksMarkdown(md);
  const range = parsed.taskRanges[id];
  if (!range) return md;

  if (changes.title !== undefined) {
    const m = parsed.lines[range.start].match(TASK_RE);
    if (m) {
      const box = m[1] === 'x' ? '- [x]' : '- [ ]';
      parsed.lines[range.start] = `${box} ${changes.title.trim()}`;
    }
  }

  if (changes.notes !== undefined) {
    const noteLines = changes.notes
      .split('\n')
      .filter(l => l.length > 0)
      .map(l => `  ${l}`);
    // Replace existing notes (range.start+1 .. range.end) with new ones.
    parsed.lines.splice(range.start + 1, range.end - range.start, ...noteLines);
  }

  return serializeTasksMarkdown(parsed);
}

export function deleteTask(md: string, id: string): string {
  const parsed = parseTasksMarkdown(md);
  const range = parsed.taskRanges[id];
  if (!range) return md;
  parsed.lines.splice(range.start, range.end - range.start + 1);
  return serializeTasksMarkdown(parsed);
}
