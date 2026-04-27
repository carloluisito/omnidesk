# Repo-Scoped Task Manager Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a per-repo personal todo list backed by `.omnidesk/tasks.md`, with a side panel and a `Ctrl/Cmd+Shift+T` quick-capture overlay. The active AI session edits the markdown file directly; OmniDesk watches and re-renders.

**Architecture:** New "Tasks" domain following the standard 3-layer pattern (Manager in main, hook in renderer, components in renderer). The single source of truth is the markdown file — OmniDesk's manager parses, writes, and watches it; AI edits flow back through the watcher.

**Tech Stack:** TypeScript, Electron 28, React 18, Vitest 4, `chokidar`-style `fs.watch` (matching `AgentTeamManager`'s pattern), Tailwind/CSS variables from `tokens.css`.

**Spec:** `docs/superpowers/specs/2026-04-27-repo-task-manager-design.md`

---

## File Structure

**Create:**
- `src/shared/types/task-types.ts` — `Task` interface, IPC payload shapes, `TaskChangedEvent`.
- `src/shared/task-parser.ts` — pure parse/serialize functions for `.omnidesk/tasks.md`. Lives in `shared` so renderer tests can use it too.
- `src/shared/task-parser.test.ts` — round-trip + edge-case tests for the parser.
- `src/main/task-manager.ts` — owns the file, sidecar metadata, watcher, per-repo mutex, IPC emission.
- `src/main/task-manager.test.ts` — manager I/O + watcher tests.
- `src/renderer/hooks/useTasks.ts` — hook bound to a repo path, subscribes to changes.
- `src/renderer/hooks/useTasks.test.ts` — hook behavior under change events.
- `src/renderer/components/TaskPanel.tsx` — sidebar panel UI.
- `src/renderer/components/TaskPanel.test.tsx` — panel render/interaction tests.
- `src/renderer/components/TaskQuickCapture.tsx` — overlay (modeled on `CommandPalette`).
- `src/renderer/components/TaskQuickCapture.test.tsx` — overlay interaction tests.

**Modify:**
- `src/shared/ipc-contract.ts` — add `task:*` invoke + event entries.
- `src/main/ipc-handlers.ts` — add `taskManager` parameter and register `task:*` handlers.
- `src/main/index.ts` — instantiate `TaskManager`, pass to `setupIPCHandlers`, destroy on quit.
- `src/renderer/index.tsx` (or wherever the app shell is) — render `TaskPanel` and `TaskQuickCapture`, register the global shortcut.
- `docs/repo-index.md` — add Tasks domain row.
- `CLAUDE.md` — add Tasks row to the Domain Map and a one-line bullet under Critical Implementation Patterns.

---

## Task 1: Shared types

**Files:**
- Create: `src/shared/types/task-types.ts`

- [ ] **Step 1: Write the type file**

```ts
// src/shared/types/task-types.ts

/**
 * A task in a repo's .omnidesk/tasks.md.
 * The markdown file is the source of truth for title/done/notes.
 * createdAt comes from the sidecar (.omnidesk/tasks.meta.json).
 */
export interface Task {
  /** Stable id derived from (file index, title). Recomputed on every parse. */
  id: string;
  title: string;
  done: boolean;
  notes?: string;
  /** Unix ms. From sidecar; falls back to file mtime if missing. */
  createdAt: number;
}

export interface TaskAddRequest {
  repoPath: string;
  title: string;
}

export interface TaskEditRequest {
  repoPath: string;
  id: string;
  title?: string;
  notes?: string;
}

export interface TasksChangedEvent {
  repoPath: string;
  tasks: Task[];
}
```

- [ ] **Step 2: Type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors related to the new file.

- [ ] **Step 3: Commit**

```bash
git add src/shared/types/task-types.ts
git commit -m "feat(tasks): add shared Task types"
```

---

## Task 2: Markdown parser — round-trip tests first

**Files:**
- Create: `src/shared/task-parser.ts`
- Create: `src/shared/task-parser.test.ts`

- [ ] **Step 1: Write the failing tests**

```ts
// src/shared/task-parser.test.ts
import { describe, it, expect } from 'vitest';
import { parseTasksMarkdown, serializeTasksMarkdown } from './task-parser';

const SAMPLE = `# Tasks

- [ ] Fix race condition in session pool warmup
  Repro: open 4 sessions fast, second one hangs ~2s.
- [ ] Add Codex provider model detection
- [x] Wire up quick-capture shortcut
`;

describe('task-parser', () => {
  it('parses checkboxes, titles, notes, done flag', () => {
    const { tasks } = parseTasksMarkdown(SAMPLE);
    expect(tasks).toHaveLength(3);
    expect(tasks[0]).toMatchObject({
      title: 'Fix race condition in session pool warmup',
      done: false,
      notes: 'Repro: open 4 sessions fast, second one hangs ~2s.',
    });
    expect(tasks[1].notes).toBeUndefined();
    expect(tasks[2].done).toBe(true);
  });

  it('round-trips byte-stable markdown', () => {
    const parsed = parseTasksMarkdown(SAMPLE);
    const out = serializeTasksMarkdown(parsed);
    expect(out).toBe(SAMPLE);
  });

  it('preserves non-task content (headings, prose) on round-trip', () => {
    const input = `# Tasks\n\nSome notes here.\n\n- [ ] one\n\n## Later\n- [ ] two\n`;
    const out = serializeTasksMarkdown(parseTasksMarkdown(input));
    expect(out).toBe(input);
  });

  it('treats a task as ending at the next task line or blank line + new task', () => {
    const input = `- [ ] a\n  note for a\n- [ ] b\n`;
    const { tasks } = parseTasksMarkdown(input);
    expect(tasks[0].notes).toBe('note for a');
    expect(tasks[1].notes).toBeUndefined();
  });

  it('handles an empty file', () => {
    const { tasks } = parseTasksMarkdown('');
    expect(tasks).toEqual([]);
  });

  it('produces stable ids for the same (index, title)', () => {
    const a = parseTasksMarkdown(SAMPLE).tasks.map(t => t.id);
    const b = parseTasksMarkdown(SAMPLE).tasks.map(t => t.id);
    expect(a).toEqual(b);
  });

  it('mutating helpers add/toggle/edit/delete', async () => {
    const { addTask, toggleTask, editTask, deleteTask } = await import('./task-parser');
    let md = '';
    md = addTask(md, 'first');
    md = addTask(md, 'second');
    expect(parseTasksMarkdown(md).tasks).toHaveLength(2);

    const ids = parseTasksMarkdown(md).tasks.map(t => t.id);
    md = toggleTask(md, ids[0]);
    expect(parseTasksMarkdown(md).tasks[0].done).toBe(true);

    md = editTask(md, ids[1], { title: 'second updated', notes: 'with note' });
    const t1 = parseTasksMarkdown(md).tasks[1];
    expect(t1.title).toBe('second updated');
    expect(t1.notes).toBe('with note');

    md = deleteTask(md, parseTasksMarkdown(md).tasks[0].id);
    expect(parseTasksMarkdown(md).tasks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/shared/task-parser.test.ts --config vitest.workspace.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the parser**

```ts
// src/shared/task-parser.ts
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/shared/task-parser.test.ts --config vitest.workspace.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/shared/task-parser.ts src/shared/task-parser.test.ts
git commit -m "feat(tasks): add markdown parser with byte-stable round-trip"
```

---

## Task 3: TaskManager (main process) — file I/O + watcher

**Files:**
- Create: `src/main/task-manager.ts`
- Create: `src/main/task-manager.test.ts`

- [ ] **Step 1: Write the failing manager tests**

```ts
// src/main/task-manager.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TaskManager } from './task-manager';

let repo: string;

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'omnidesk-tasks-'));
});

afterEach(() => {
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('TaskManager', () => {
  it('returns empty list when no file exists', async () => {
    const tm = new TaskManager();
    expect(await tm.list(repo)).toEqual([]);
  });

  it('add creates .omnidesk/tasks.md and the task is listed', async () => {
    const tm = new TaskManager();
    const t = await tm.add(repo, '  hello  ');
    expect(t.title).toBe('hello');
    const filePath = path.join(repo, '.omnidesk', 'tasks.md');
    expect(fs.existsSync(filePath)).toBe(true);
    const list = await tm.list(repo);
    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBeGreaterThan(0);
  });

  it('toggle / edit / delete work', async () => {
    const tm = new TaskManager();
    const a = await tm.add(repo, 'one');
    await tm.add(repo, 'two');
    const toggled = await tm.toggle(repo, a.id);
    expect(toggled.done).toBe(true);
    const edited = await tm.edit(repo, a.id, { title: 'one updated', notes: 'note' });
    expect(edited.title).toBe('one updated');
    expect(edited.notes).toBe('note');
    await tm.delete(repo, a.id);
    expect(await tm.list(repo)).toHaveLength(1);
  });

  it('garbage-collects sidecar entries for tasks no longer in the md', async () => {
    const tm = new TaskManager();
    await tm.add(repo, 'one');
    const meta = path.join(repo, '.omnidesk', 'tasks.meta.json');
    fs.writeFileSync(
      meta,
      JSON.stringify({ stale_id: { createdAt: 123 } }),
    );
    await tm.list(repo); // triggers GC
    const after = JSON.parse(fs.readFileSync(meta, 'utf8'));
    expect(after.stale_id).toBeUndefined();
  });

  it('emits change events when the file is edited externally', async () => {
    const tm = new TaskManager();
    await tm.add(repo, 'first');
    const events: any[] = [];
    tm.onChange(repo, (tasks) => events.push(tasks));

    // Simulate an external edit (e.g., by the AI session).
    const filePath = path.join(repo, '.omnidesk', 'tasks.md');
    const current = fs.readFileSync(filePath, 'utf8');
    fs.writeFileSync(filePath, `${current}- [ ] from-AI\n`);

    await new Promise(r => setTimeout(r, 400)); // > debounce
    expect(events.length).toBeGreaterThan(0);
    const last = events[events.length - 1];
    expect(last.map((t: any) => t.title)).toContain('from-AI');
    tm.unwatch(repo);
  });

  it('serializes concurrent writes via per-repo mutex', async () => {
    const tm = new TaskManager();
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => tm.add(repo, `task ${i}`)),
    );
    expect(await tm.list(repo)).toHaveLength(10);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/main/task-manager.test.ts --config vitest.workspace.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TaskManager**

```ts
// src/main/task-manager.ts
import * as fs from 'fs';
import * as path from 'path';
import { BrowserWindow } from 'electron';
import { IPCEmitter } from './ipc-emitter';
import {
  parseTasksMarkdown,
  serializeTasksMarkdown,
  addTask as mdAdd,
  toggleTask as mdToggle,
  editTask as mdEdit,
  deleteTask as mdDelete,
} from '../shared/task-parser';
import type { Task } from '../shared/types/task-types';

const DEBOUNCE_MS = 200;

interface SidecarShape {
  [taskId: string]: { createdAt: number };
}

export class TaskManager {
  private emitter: IPCEmitter | null = null;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private listeners: Map<string, Set<(tasks: Task[]) => void>> = new Map();
  private mutexes: Map<string, Promise<unknown>> = new Map();

  setMainWindow(window: BrowserWindow): void {
    this.emitter = new IPCEmitter(window);
  }

  destroy(): void {
    for (const w of this.watchers.values()) w.close();
    this.watchers.clear();
    for (const t of this.debounceTimers.values()) clearTimeout(t);
    this.debounceTimers.clear();
    this.listeners.clear();
  }

  async list(repoPath: string): Promise<Task[]> {
    return this.withMutex(repoPath, async () => this.readTasks(repoPath));
  }

  async add(repoPath: string, title: string): Promise<Task> {
    return this.withMutex(repoPath, async () => {
      const md = this.readFileOrEmpty(repoPath);
      const next = mdAdd(md, title);
      this.writeFile(repoPath, next);
      const tasks = await this.readTasks(repoPath);
      const created = tasks.find(t => t.title === title.trim());
      if (!created) throw new Error('Task add failed');
      this.startWatching(repoPath);
      return created;
    });
  }

  async toggle(repoPath: string, id: string): Promise<Task> {
    return this.mutate(repoPath, md => mdToggle(md, id), id);
  }

  async edit(
    repoPath: string,
    id: string,
    changes: { title?: string; notes?: string },
  ): Promise<Task> {
    return this.mutate(repoPath, md => mdEdit(md, id, changes), id);
  }

  async delete(repoPath: string, id: string): Promise<void> {
    await this.withMutex(repoPath, async () => {
      const md = this.readFileOrEmpty(repoPath);
      this.writeFile(repoPath, mdDelete(md, id));
    });
  }

  onChange(repoPath: string, fn: (tasks: Task[]) => void): () => void {
    let set = this.listeners.get(repoPath);
    if (!set) {
      set = new Set();
      this.listeners.set(repoPath, set);
    }
    set.add(fn);
    this.startWatching(repoPath);
    return () => set!.delete(fn);
  }

  unwatch(repoPath: string): void {
    const w = this.watchers.get(repoPath);
    if (w) {
      w.close();
      this.watchers.delete(repoPath);
    }
    this.listeners.delete(repoPath);
  }

  // ── internals ──────────────────────────────────────────────────

  private async mutate(
    repoPath: string,
    transform: (md: string) => string,
    id: string,
  ): Promise<Task> {
    return this.withMutex(repoPath, async () => {
      const md = this.readFileOrEmpty(repoPath);
      this.writeFile(repoPath, transform(md));
      const tasks = await this.readTasks(repoPath);
      const t = tasks.find(x => x.id === id);
      if (!t) {
        // id may have shifted post-edit — pick the closest by title heuristic isn't reliable.
        // Caller refreshes via list() if needed.
        return tasks[tasks.length - 1];
      }
      return t;
    });
  }

  private withMutex<T>(repoPath: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.mutexes.get(repoPath) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.mutexes.set(
      repoPath,
      next.catch(() => {}),
    );
    return next;
  }

  private taskFile(repoPath: string): string {
    return path.join(repoPath, '.omnidesk', 'tasks.md');
  }

  private metaFile(repoPath: string): string {
    return path.join(repoPath, '.omnidesk', 'tasks.meta.json');
  }

  private ensureDir(repoPath: string): void {
    fs.mkdirSync(path.join(repoPath, '.omnidesk'), { recursive: true });
  }

  private readFileOrEmpty(repoPath: string): string {
    const fp = this.taskFile(repoPath);
    return fs.existsSync(fp) ? fs.readFileSync(fp, 'utf8') : '';
  }

  private writeFile(repoPath: string, content: string): void {
    this.ensureDir(repoPath);
    fs.writeFileSync(this.taskFile(repoPath), content, 'utf8');
  }

  private readSidecar(repoPath: string): SidecarShape {
    const fp = this.metaFile(repoPath);
    if (!fs.existsSync(fp)) return {};
    try {
      return JSON.parse(fs.readFileSync(fp, 'utf8')) as SidecarShape;
    } catch {
      return {};
    }
  }

  private writeSidecar(repoPath: string, data: SidecarShape): void {
    this.ensureDir(repoPath);
    fs.writeFileSync(this.metaFile(repoPath), JSON.stringify(data, null, 2), 'utf8');
  }

  private async readTasks(repoPath: string): Promise<Task[]> {
    const md = this.readFileOrEmpty(repoPath);
    const { tasks } = parseTasksMarkdown(md);
    const meta = this.readSidecar(repoPath);
    const fileMtime = fs.existsSync(this.taskFile(repoPath))
      ? fs.statSync(this.taskFile(repoPath)).mtimeMs
      : Date.now();

    const updatedMeta: SidecarShape = {};
    const enriched = tasks.map(t => {
      const m = meta[t.id];
      const createdAt = m?.createdAt ?? Date.now();
      updatedMeta[t.id] = { createdAt };
      return { ...t, createdAt: m?.createdAt ?? fileMtime };
    });

    // GC: only keep meta for ids that still exist.
    if (JSON.stringify(updatedMeta) !== JSON.stringify(meta)) {
      this.writeSidecar(repoPath, updatedMeta);
    }
    return enriched;
  }

  private startWatching(repoPath: string): void {
    if (this.watchers.has(repoPath)) return;
    this.ensureDir(repoPath);
    const dir = path.join(repoPath, '.omnidesk');
    try {
      const w = fs.watch(dir, (_event, filename) => {
        if (filename !== 'tasks.md') return;
        const existing = this.debounceTimers.get(repoPath);
        if (existing) clearTimeout(existing);
        const t = setTimeout(() => {
          this.debounceTimers.delete(repoPath);
          this.fireChange(repoPath);
        }, DEBOUNCE_MS);
        this.debounceTimers.set(repoPath, t);
      });
      this.watchers.set(repoPath, w);
    } catch (err) {
      console.error('TaskManager: watcher failed for', dir, err);
    }
  }

  private async fireChange(repoPath: string): Promise<void> {
    const tasks = await this.readTasks(repoPath);
    const set = this.listeners.get(repoPath);
    if (set) {
      for (const fn of set) fn(tasks);
    }
    if (this.emitter) {
      this.emitter.emit('task:changed', { repoPath, tasks });
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/main/task-manager.test.ts --config vitest.workspace.ts`
Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/main/task-manager.ts src/main/task-manager.test.ts
git commit -m "feat(tasks): add TaskManager with file watcher + per-repo mutex"
```

---

## Task 4: IPC contract entries

**Files:**
- Modify: `src/shared/ipc-contract.ts`

- [ ] **Step 1: Add task types import near the other type imports**

Add this block alongside the other `import type` blocks (e.g., after the checkpoint types import around line ~55):

```ts
import type {
  Task,
  TaskAddRequest,
  TaskEditRequest,
  TasksChangedEvent,
} from './types/task-types';
```

- [ ] **Step 2: Add invoke + event entries in `IPCContractMap`**

Add this block to `IPCContractMap` (the interface with all the invoke/event entries — find the section after Playbooks events, follow that style):

```ts
  // ── Tasks (invoke) ──
  listTasks:           InvokeContract<'task:list',     [string],            Task[]>;
  addTask:             InvokeContract<'task:add',      [TaskAddRequest],    Task>;
  toggleTask:          InvokeContract<'task:toggle',   [string, string],    Task>;
  editTask:            InvokeContract<'task:edit',     [TaskEditRequest],   Task>;
  deleteTask:          InvokeContract<'task:delete',   [string, string],    boolean>;

  // ── Tasks events (main→renderer) ──
  onTasksChanged:      EventContract<'task:changed',   TasksChangedEvent>;
```

- [ ] **Step 3: Add the channel constants in the `IPC_CHANNELS` map**

Find the `IPC_CHANNELS` mapping (near line 540+) and add a section matching the style:

```ts
  // ── Tasks ──
  listTasks:           'task:list',
  addTask:             'task:add',
  toggleTask:          'task:toggle',
  editTask:            'task:edit',
  deleteTask:          'task:delete',
  onTasksChanged:      'task:changed',
```

> If `addTask` already exists for templates or something else, rename ours to `addRepoTask` etc. Verify before pasting. As of this plan, `addTask` is unused — `addTemplate`/`addPlaybook` are the existing patterns.

- [ ] **Step 4: Type-check passes**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/shared/ipc-contract.ts
git commit -m "feat(tasks): wire task:* into IPC contract"
```

---

## Task 5: Wire TaskManager into main process

**Files:**
- Modify: `src/main/ipc-handlers.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add `TaskManager` import + parameter to `setupIPCHandlers`**

In `src/main/ipc-handlers.ts`:

```ts
// Add near the other manager imports at top of file
import { TaskManager } from './task-manager';
```

Add `taskManager: TaskManager` as a new parameter to `setupIPCHandlers` (place at the end of the parameter list, mirroring how `customCommandManager` was added).

- [ ] **Step 2: Register handlers**

Inside `setupIPCHandlers`, after the existing custom-commands or playbook handler block, add:

```ts
  // ── Tasks ──
  taskManager.setMainWindow(mainWindow);

  registry.handle('listTasks', async (_e, repoPath) => {
    return taskManager.list(repoPath);
  });

  registry.handle('addTask', async (_e, req) => {
    return taskManager.add(req.repoPath, req.title);
  });

  registry.handle('toggleTask', async (_e, repoPath, id) => {
    return taskManager.toggle(repoPath, id);
  });

  registry.handle('editTask', async (_e, req) => {
    return taskManager.edit(req.repoPath, req.id, {
      title: req.title,
      notes: req.notes,
    });
  });

  registry.handle('deleteTask', async (_e, repoPath, id) => {
    await taskManager.delete(repoPath, id);
    return true;
  });

  // Subscribe to changes per repo when listTasks is called — emit via IPC.
  // (The watcher in TaskManager already calls emitter.emit on change.)
```

- [ ] **Step 3: Wire up in `src/main/index.ts`**

```ts
// Near other manager imports
import { TaskManager } from './task-manager';

// Near other module-level let-managers
let taskManager: TaskManager | null = null;

// In createWindow(), after customCommandManager init:
taskManager = new TaskManager();
taskManager.setMainWindow(mainWindow);

// Pass into setupIPCHandlers (append):
setupIPCHandlers(
  // ...existing args...
  customCommandManager,
  taskManager,
);

// In the cleanup / app quit handler near agentTeamManager.destroy():
if (taskManager) {
  taskManager.destroy();
  taskManager = null;
}
```

- [ ] **Step 4: Build the main process to verify wiring**

Run: `npm run build` (or whichever script compiles the main process — check `package.json`. If there's no main-only script, `npx tsc --noEmit` is sufficient.)
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/main/ipc-handlers.ts src/main/index.ts
git commit -m "feat(tasks): wire TaskManager and IPC handlers"
```

---

## Task 6: `useTasks` hook

**Files:**
- Create: `src/renderer/hooks/useTasks.ts`
- Create: `src/renderer/hooks/useTasks.test.ts`

- [ ] **Step 1: Write failing hook tests**

```tsx
// src/renderer/hooks/useTasks.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useTasks } from './useTasks';

const REPO = '/tmp/repo';

beforeEach(() => {
  let listeners: Array<(payload: any) => void> = [];
  (window as any).electronAPI = {
    listTasks: vi.fn(async () => [
      { id: 't_1', title: 'one', done: false, createdAt: 1 },
    ]),
    addTask: vi.fn(async ({ title }) => ({
      id: 't_2', title, done: false, createdAt: 2,
    })),
    toggleTask: vi.fn(async (_p: string, id: string) => ({
      id, title: 'one', done: true, createdAt: 1,
    })),
    editTask: vi.fn(async (req: any) => ({
      id: req.id, title: req.title ?? 'one', done: false, createdAt: 1,
    })),
    deleteTask: vi.fn(async () => true),
    onTasksChanged: vi.fn((fn: any) => {
      listeners.push(fn);
      return () => { listeners = listeners.filter(f => f !== fn); };
    }),
    __fire: (payload: any) => listeners.forEach(f => f(payload)),
  };
});

describe('useTasks', () => {
  it('loads tasks on mount', async () => {
    const { result } = renderHook(() => useTasks(REPO));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    expect(window.electronAPI.listTasks).toHaveBeenCalledWith(REPO);
  });

  it('adds a task', async () => {
    const { result } = renderHook(() => useTasks(REPO));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    await act(async () => { await result.current.add('two'); });
    expect(window.electronAPI.addTask).toHaveBeenCalledWith({ repoPath: REPO, title: 'two' });
  });

  it('reacts to onTasksChanged events for the same repo', async () => {
    const { result } = renderHook(() => useTasks(REPO));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    act(() => {
      (window as any).electronAPI.__fire({
        repoPath: REPO,
        tasks: [
          { id: 't_1', title: 'one', done: false, createdAt: 1 },
          { id: 't_2', title: 'from-AI', done: false, createdAt: 3 },
        ],
      });
    });
    await waitFor(() => expect(result.current.tasks).toHaveLength(2));
  });

  it('ignores onTasksChanged for other repos', async () => {
    const { result } = renderHook(() => useTasks(REPO));
    await waitFor(() => expect(result.current.tasks).toHaveLength(1));
    act(() => {
      (window as any).electronAPI.__fire({
        repoPath: '/other',
        tasks: [],
      });
    });
    expect(result.current.tasks).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/hooks/useTasks.test.ts --config vitest.workspace.ts`
Expected: FAIL — `useTasks` not found.

- [ ] **Step 3: Implement the hook**

```ts
// src/renderer/hooks/useTasks.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import type { Task } from '../../shared/types/task-types';

export function useTasks(repoPath: string | null) {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const repoRef = useRef(repoPath);
  repoRef.current = repoPath;

  const reload = useCallback(async () => {
    if (!repoPath) { setTasks([]); return; }
    setIsLoading(true);
    setError(null);
    try {
      const list = await window.electronAPI.listTasks(repoPath);
      if (repoRef.current === repoPath) setTasks(list);
    } catch (e) {
      console.error('useTasks: list failed', e);
      setError('Failed to load tasks');
    } finally {
      setIsLoading(false);
    }
  }, [repoPath]);

  useEffect(() => { reload(); }, [reload]);

  useEffect(() => {
    if (!repoPath) return;
    const off = window.electronAPI.onTasksChanged((evt) => {
      if (evt.repoPath !== repoRef.current) return;
      setTasks(evt.tasks);
    });
    return off;
  }, [repoPath]);

  const add = useCallback(async (title: string) => {
    if (!repoPath || !title.trim()) return;
    await window.electronAPI.addTask({ repoPath, title });
    await reload();
  }, [repoPath, reload]);

  const toggle = useCallback(async (id: string) => {
    if (!repoPath) return;
    await window.electronAPI.toggleTask(repoPath, id);
    await reload();
  }, [repoPath, reload]);

  const edit = useCallback(async (id: string, changes: { title?: string; notes?: string }) => {
    if (!repoPath) return;
    await window.electronAPI.editTask({ repoPath, id, ...changes });
    await reload();
  }, [repoPath, reload]);

  const remove = useCallback(async (id: string) => {
    if (!repoPath) return;
    await window.electronAPI.deleteTask(repoPath, id);
    await reload();
  }, [repoPath, reload]);

  return { tasks, isLoading, error, add, toggle, edit, remove, reload };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/hooks/useTasks.test.ts --config vitest.workspace.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/hooks/useTasks.ts src/renderer/hooks/useTasks.test.ts
git commit -m "feat(tasks): add useTasks hook"
```

---

## Task 7: TaskPanel component

**Files:**
- Create: `src/renderer/components/TaskPanel.tsx`
- Create: `src/renderer/components/TaskPanel.test.tsx`

- [ ] **Step 1: Write failing component tests**

```tsx
// src/renderer/components/TaskPanel.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskPanel } from './TaskPanel';

beforeEach(() => {
  (window as any).electronAPI = {
    listTasks: vi.fn(async () => [
      { id: 't_1', title: 'open task', done: false, createdAt: 1 },
      { id: 't_2', title: 'done task', done: true, createdAt: 2 },
    ]),
    addTask: vi.fn(async ({ title }) => ({ id: 't_3', title, done: false, createdAt: 3 })),
    toggleTask: vi.fn(async (_p, id) => ({ id, title: 'open task', done: true, createdAt: 1 })),
    editTask: vi.fn(),
    deleteTask: vi.fn(async () => true),
    onTasksChanged: vi.fn(() => () => {}),
  };
});

describe('TaskPanel', () => {
  it('renders empty state when no repo path', () => {
    render(<TaskPanel repoPath={null} />);
    expect(screen.getByText(/Open a repo/i)).toBeInTheDocument();
  });

  it('renders open + done tasks', async () => {
    render(<TaskPanel repoPath="/r" />);
    await waitFor(() => expect(screen.getByText('open task')).toBeInTheDocument());
    expect(screen.getByText('done task')).toBeInTheDocument();
  });

  it('shows count "1 open / 2 total"', async () => {
    render(<TaskPanel repoPath="/r" />);
    await waitFor(() => expect(screen.getByText(/1 open \/ 2 total/i)).toBeInTheDocument());
  });

  it('adds a task via the inline input', async () => {
    render(<TaskPanel repoPath="/r" />);
    const input = await screen.findByPlaceholderText(/Add a task/i);
    fireEvent.change(input, { target: { value: 'new one' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(window.electronAPI.addTask).toHaveBeenCalledWith({ repoPath: '/r', title: 'new one' }),
    );
  });

  it('toggles a task on checkbox click', async () => {
    render(<TaskPanel repoPath="/r" />);
    await waitFor(() => screen.getByText('open task'));
    const cb = screen.getAllByRole('checkbox')[0];
    fireEvent.click(cb);
    await waitFor(() =>
      expect(window.electronAPI.toggleTask).toHaveBeenCalledWith('/r', 't_1'),
    );
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/TaskPanel.test.tsx --config vitest.workspace.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TaskPanel**

```tsx
// src/renderer/components/TaskPanel.tsx
import { useMemo, useState } from 'react';
import { useTasks } from '../hooks/useTasks';
import type { Task } from '../../shared/types/task-types';

interface TaskPanelProps {
  repoPath: string | null;
}

export function TaskPanel({ repoPath }: TaskPanelProps) {
  const { tasks, add, toggle, edit, remove } = useTasks(repoPath);
  const [draft, setDraft] = useState('');

  const { open, done, total } = useMemo(() => {
    const o = tasks.filter(t => !t.done);
    const d = tasks.filter(t => t.done);
    return { open: o, done: d, total: tasks.length };
  }, [tasks]);

  if (!repoPath) {
    return (
      <div style={{ padding: 16, color: 'var(--text-tertiary)', fontFamily: 'JetBrains Mono' }}>
        Open a repo to use tasks.
      </div>
    );
  }

  const onSubmitDraft = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && draft.trim()) {
      const v = draft;
      setDraft('');
      await add(v);
    }
  };

  return (
    <div style={{ padding: 12, fontFamily: 'JetBrains Mono', color: 'var(--text-primary)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
        <strong>Tasks</strong>
        <span style={{ color: 'var(--text-tertiary)', fontSize: 12 }}>
          {open.length} open / {total} total
        </span>
      </div>
      <input
        placeholder="Add a task… (Enter to save)"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={onSubmitDraft}
        style={{
          width: '100%', padding: '6px 8px', marginBottom: 12,
          background: 'var(--surface-base)', color: 'var(--text-primary)',
          border: '1px solid var(--border-default)', borderRadius: 4,
        }}
      />
      <TaskList tasks={open} onToggle={toggle} onEdit={edit} onRemove={remove} dim={false} />
      {done.length > 0 && (
        <div style={{ marginTop: 16, opacity: 0.6 }}>
          <TaskList tasks={done} onToggle={toggle} onEdit={edit} onRemove={remove} dim={true} />
        </div>
      )}
      {tasks.length === 0 && (
        <div style={{ color: 'var(--text-tertiary)', fontSize: 12, marginTop: 8 }}>
          Add a task, or ask the active session to write to <code>.omnidesk/tasks.md</code>.
        </div>
      )}
    </div>
  );
}

function TaskList({
  tasks, onToggle, onEdit, onRemove, dim,
}: {
  tasks: Task[];
  onToggle: (id: string) => void;
  onEdit: (id: string, c: { title?: string; notes?: string }) => void;
  onRemove: (id: string) => void;
  dim: boolean;
}) {
  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
      {tasks.map(t => (
        <li
          key={t.id}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: 8,
            padding: '4px 0',
            textDecoration: dim ? 'line-through' : 'none',
          }}
        >
          <input
            type="checkbox"
            checked={t.done}
            onChange={() => onToggle(t.id)}
            style={{ marginTop: 4 }}
          />
          <div style={{ flex: 1 }}>
            <EditableTitle value={t.title} onSubmit={(v) => onEdit(t.id, { title: v })} />
            {t.notes && (
              <div style={{ color: 'var(--text-tertiary)', fontSize: 12, whiteSpace: 'pre-wrap' }}>
                {t.notes}
              </div>
            )}
          </div>
          <button
            onClick={() => onRemove(t.id)}
            aria-label="Delete task"
            style={{ background: 'none', border: 'none', color: 'var(--text-tertiary)', cursor: 'pointer' }}
          >
            ×
          </button>
        </li>
      ))}
    </ul>
  );
}

function EditableTitle({ value, onSubmit }: { value: string; onSubmit: (v: string) => void }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <span onDoubleClick={() => { setDraft(value); setEditing(true); }}>{value}</span>
    );
  }
  return (
    <input
      autoFocus
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setEditing(false); if (draft !== value) onSubmit(draft); }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') { setEditing(false); if (draft !== value) onSubmit(draft); }
        if (e.key === 'Escape') { setEditing(false); setDraft(value); }
      }}
      style={{
        width: '100%', background: 'var(--surface-base)', color: 'var(--text-primary)',
        border: '1px solid var(--border-default)', borderRadius: 4, padding: '2px 4px',
      }}
    />
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/TaskPanel.test.tsx --config vitest.workspace.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TaskPanel.tsx src/renderer/components/TaskPanel.test.tsx
git commit -m "feat(tasks): add TaskPanel UI"
```

---

## Task 8: TaskQuickCapture overlay

**Files:**
- Create: `src/renderer/components/TaskQuickCapture.tsx`
- Create: `src/renderer/components/TaskQuickCapture.test.tsx`

- [ ] **Step 1: Write failing tests**

```tsx
// src/renderer/components/TaskQuickCapture.test.tsx
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TaskQuickCapture } from './TaskQuickCapture';

beforeEach(() => {
  (window as any).electronAPI = {
    listTasks: vi.fn(async () => []),
    addTask: vi.fn(async ({ title }) => ({ id: 't', title, done: false, createdAt: 0 })),
    onTasksChanged: vi.fn(() => () => {}),
  };
});

describe('TaskQuickCapture', () => {
  it('renders when open', () => {
    render(<TaskQuickCapture isOpen repoPath="/r" onClose={() => {}} />);
    expect(screen.getByPlaceholderText(/Add a task/i)).toBeInTheDocument();
  });

  it('does not render when closed', () => {
    render(<TaskQuickCapture isOpen={false} repoPath="/r" onClose={() => {}} />);
    expect(screen.queryByPlaceholderText(/Add a task/i)).toBeNull();
  });

  it('saves on Enter and closes', async () => {
    const onClose = vi.fn();
    render(<TaskQuickCapture isOpen repoPath="/r" onClose={onClose} />);
    const input = screen.getByPlaceholderText(/Add a task/i);
    fireEvent.change(input, { target: { value: 'quick task' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    await waitFor(() =>
      expect(window.electronAPI.addTask).toHaveBeenCalledWith({ repoPath: '/r', title: 'quick task' }),
    );
    expect(onClose).toHaveBeenCalled();
  });

  it('Esc closes without saving', () => {
    const onClose = vi.fn();
    render(<TaskQuickCapture isOpen repoPath="/r" onClose={onClose} />);
    fireEvent.keyDown(screen.getByPlaceholderText(/Add a task/i), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    expect(window.electronAPI.addTask).not.toHaveBeenCalled();
  });

  it('shows no-repo state when repoPath is null', () => {
    render(<TaskQuickCapture isOpen repoPath={null} onClose={() => {}} />);
    expect(screen.getByText(/no repo/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/renderer/components/TaskQuickCapture.test.tsx --config vitest.workspace.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement TaskQuickCapture**

```tsx
// src/renderer/components/TaskQuickCapture.tsx
import { useEffect, useRef, useState } from 'react';
import { useTasks } from '../hooks/useTasks';

interface Props {
  isOpen: boolean;
  repoPath: string | null;
  onClose: () => void;
}

export function TaskQuickCapture({ isOpen, repoPath, onClose }: Props) {
  const { tasks, add } = useTasks(repoPath);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
    else setDraft('');
  }, [isOpen]);

  if (!isOpen) return null;

  const recent = tasks.filter(t => !t.done).slice(0, 3);

  const onKeyDown = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      onClose();
      return;
    }
    if (e.key === 'Enter') {
      if (!repoPath || !draft.trim()) { onClose(); return; }
      const v = draft;
      setDraft('');
      await add(v);
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
        paddingTop: '20vh', zIndex: 1000,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 600, background: 'var(--surface-base, #0D0E14)',
          border: '1px solid var(--border-default, #292E44)', borderRadius: 8,
          fontFamily: 'JetBrains Mono', color: 'var(--text-primary)', padding: 12,
        }}
      >
        {!repoPath ? (
          <div style={{ color: 'var(--text-tertiary)' }}>no repo — open a workspace first</div>
        ) : (
          <>
            <input
              ref={inputRef}
              placeholder="Add a task… (Enter to save, Esc to cancel)"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={onKeyDown}
              style={{
                width: '100%', padding: '8px 10px',
                background: 'transparent', color: 'var(--text-primary)',
                border: 'none', outline: 'none', fontSize: 14,
              }}
            />
            {recent.length > 0 && (
              <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-tertiary)' }}>
                <div style={{ marginBottom: 4 }}>Recent:</div>
                {recent.map(r => (
                  <div key={r.id} style={{ padding: '2px 0' }}>· {r.title}</div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/renderer/components/TaskQuickCapture.test.tsx --config vitest.workspace.ts`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/renderer/components/TaskQuickCapture.tsx src/renderer/components/TaskQuickCapture.test.tsx
git commit -m "feat(tasks): add TaskQuickCapture overlay"
```

---

## Task 9: Wire panel + global shortcut into the app shell

**Files:**
- Modify: `src/renderer/App.tsx` (or wherever the side panels and command palette are mounted — locate by searching for `<HistoryPanel` or `<CommandPalette`).

- [ ] **Step 1: Locate the app shell**

Run: `grep -rn "HistoryPanel\|CommandPalette" src/renderer --include="*.tsx" -l`
Identify the component file that mounts the right-side panels and overlays. Read it to understand how panels are toggled (active panel id pattern, `useState`, etc.).

- [ ] **Step 2: Add Tasks to the side-panel switcher**

Mirror exactly how `HistoryPanel` is added (button in the sidebar, panel id, conditional render). Concretely:

1. Add a new panel id (e.g., `'tasks'`) to whatever discriminated union or string union is used for the active side panel.
2. Add a new sidebar button (use a Lucide `ListChecks` icon — already used elsewhere if available, else `CheckSquare`).
3. Render `<TaskPanel repoPath={currentRepoPath} />` when that id is active.
4. Pass the *current focused session's repo path* — the same value already used by `HistoryPanel` or `AtlasPanel` (sessions have `cwd`/`workspacePath`). Search for how those panels resolve it.

- [ ] **Step 3: Add the global quick-capture shortcut**

Add this near the existing command palette keyboard handler (where `Ctrl+P`/`Cmd+K` is handled):

```tsx
const [quickCaptureOpen, setQuickCaptureOpen] = useState(false);

useEffect(() => {
  const onKey = (e: KeyboardEvent) => {
    const mod = e.metaKey || e.ctrlKey;
    if (mod && e.shiftKey && e.key.toLowerCase() === 't') {
      e.preventDefault();
      setQuickCaptureOpen(o => !o);
    }
  };
  window.addEventListener('keydown', onKey);
  return () => window.removeEventListener('keydown', onKey);
}, []);

// ...in JSX:
<TaskQuickCapture
  isOpen={quickCaptureOpen}
  repoPath={currentRepoPath}
  onClose={() => setQuickCaptureOpen(false)}
/>
```

- [ ] **Step 4: Build + manual smoke test**

Run: `npm run dev` (or `npm start`).
Manual checks:
1. Open a repo workspace.
2. Click the new sidebar button → TaskPanel renders, empty state shows.
3. Type "smoke test", press Enter → task appears. `.omnidesk/tasks.md` exists in the repo.
4. Hit `Ctrl+Shift+T` → overlay opens. Type "from overlay", Enter → both tasks now show.
5. In the active Claude/Codex session, ask: "edit `.omnidesk/tasks.md` in this repo: change the first task title to 'smoke test (refined)'." After the AI edits the file, the panel should update within ~200ms without refresh.
6. Toggle a checkbox in the panel → file's `[ ]` flips to `[x]`.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tasks): wire TaskPanel + Ctrl+Shift+T quick capture into app shell"
```

---

## Task 10: Docs update

**Files:**
- Modify: `CLAUDE.md`
- Modify: `docs/repo-index.md`

- [ ] **Step 1: Add Tasks row to CLAUDE.md Domain Map**

In the "Domain Map" table in `CLAUDE.md`, add a new row matching the format of the others:

```
| Tasks | task-manager | useTasks, TaskPanel, TaskQuickCapture | types/task-types.ts, task-parser.ts | `task:*` |
```

Add this bullet under "Critical Implementation Patterns":

```
- **Tasks**: Per-repo todo list backed by `.omnidesk/tasks.md`. `TaskManager` uses `fs.watch` (200ms debounce) so external edits — including those by the active AI session — propagate to the UI. Mutations serialized via per-repo mutex. `createdAt` lives in `.omnidesk/tasks.meta.json` to keep the markdown clean.
```

- [ ] **Step 2: Update `docs/repo-index.md`**

Add a Tasks domain section listing the files created.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/repo-index.md
git commit -m "docs(tasks): document Tasks domain in CLAUDE.md and repo-index"
```

---

## Verification

After Task 10, run:

```bash
npm test
```

Expected: all task-related tests pass; no existing tests regress.

Run preflight before pushing:

```bash
/preflight
```
