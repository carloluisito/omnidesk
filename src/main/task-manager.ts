import * as fs from 'fs';
import * as path from 'path';
import { randomUUID } from 'crypto';
import { BrowserWindow } from 'electron';
import { IPCEmitter } from './ipc-emitter';
import {
  parseTasksMarkdown,
  addTask as mdAdd,
  toggleTask as mdToggle,
  editTask as mdEdit,
  deleteTask as mdDelete,
} from '../shared/task-parser';
import type { Task } from '../shared/types/task-types';

const DEBOUNCE_MS = 200;

interface SidecarEntry {
  /** Stable per-task UUID exposed as Task.id to callers. */
  stableId: string;
  /** Parser-computed id (based on index+title). Updated on title edits. */
  parserTaskId: string;
  /** Unix ms creation timestamp. */
  createdAt: number;
}

interface SidecarShape {
  /** Keyed by stableId. */
  [stableId: string]: SidecarEntry;
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

  async toggle(repoPath: string, stableId: string): Promise<Task> {
    return this.withMutex(repoPath, async () => {
      const parserTaskId = this.resolveParserTaskId(repoPath, stableId);
      const md = this.readFileOrEmpty(repoPath);
      this.writeFile(repoPath, mdToggle(md, parserTaskId));
      const tasks = await this.readTasks(repoPath);
      return tasks.find(x => x.id === stableId) ?? tasks[tasks.length - 1];
    });
  }

  async edit(
    repoPath: string,
    stableId: string,
    changes: { title?: string; notes?: string },
  ): Promise<Task> {
    return this.withMutex(repoPath, async () => {
      const parserTaskId = this.resolveParserTaskId(repoPath, stableId);
      const md = this.readFileOrEmpty(repoPath);
      this.writeFile(repoPath, mdEdit(md, parserTaskId, changes));
      // If title changed, update the sidecar so future ops find the right parserTaskId.
      if (changes.title !== undefined) {
        this.updateParserTaskIdAfterTitleEdit(repoPath, stableId, changes.title.trim());
      }
      const tasks = await this.readTasks(repoPath);
      return tasks.find(x => x.id === stableId) ?? tasks[tasks.length - 1];
    });
  }

  async delete(repoPath: string, stableId: string): Promise<void> {
    await this.withMutex(repoPath, async () => {
      const parserTaskId = this.resolveParserTaskId(repoPath, stableId);
      const md = this.readFileOrEmpty(repoPath);
      this.writeFile(repoPath, mdDelete(md, parserTaskId));
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

  /**
   * Resolve a stableId to the current parser-computed task id.
   * Falls back to the stableId itself (for external edits not tracked in sidecar).
   */
  private resolveParserTaskId(repoPath: string, stableId: string): string {
    const sidecar = this.readSidecar(repoPath);
    return sidecar[stableId]?.parserTaskId ?? stableId;
  }

  /**
   * After a title edit the parser will recompute a new id for the task.
   * We need to update the sidecar so future ops with the same stableId
   * resolve to the new parserTaskId.
   */
  private updateParserTaskIdAfterTitleEdit(
    repoPath: string,
    stableId: string,
    newTitle: string,
  ): void {
    // Re-read the file (already written) to get the new parserTaskId.
    const md = this.readFileOrEmpty(repoPath);
    const { tasks } = parseTasksMarkdown(md);
    const newParserTask = tasks.find(t => t.title === newTitle);
    if (!newParserTask) return;

    const sidecar = this.readSidecar(repoPath);
    if (sidecar[stableId]) {
      sidecar[stableId] = { ...sidecar[stableId], parserTaskId: newParserTask.id };
      this.writeSidecar(repoPath, sidecar);
    }
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
    const { tasks: parserTasks } = parseTasksMarkdown(md);
    const sidecar = this.readSidecar(repoPath);
    const fileMtime = fs.existsSync(this.taskFile(repoPath))
      ? fs.statSync(this.taskFile(repoPath)).mtimeMs
      : Date.now();

    // Build a lookup from parserTaskId → sidecar entry.
    const byParserTaskId = new Map<string, SidecarEntry>();
    for (const entry of Object.values(sidecar)) {
      byParserTaskId.set(entry.parserTaskId, entry);
    }

    const updatedSidecar: SidecarShape = {};
    const enriched: Task[] = parserTasks.map(pt => {
      const existing = byParserTaskId.get(pt.id);
      if (existing) {
        // Known task — keep its stableId and createdAt.
        updatedSidecar[existing.stableId] = {
          stableId: existing.stableId,
          parserTaskId: pt.id,
          createdAt: existing.createdAt,
        };
        return { ...pt, id: existing.stableId, createdAt: existing.createdAt };
      }
      // New task (external edit / first add) — mint a fresh stableId.
      const stableId = randomUUID();
      const createdAt = fileMtime;
      updatedSidecar[stableId] = { stableId, parserTaskId: pt.id, createdAt };
      return { ...pt, id: stableId, createdAt };
    });

    // GC: only keep sidecar entries for tasks that still exist.
    if (JSON.stringify(updatedSidecar) !== JSON.stringify(sidecar)) {
      this.writeSidecar(repoPath, updatedSidecar);
    }
    return enriched;
  }

  private startWatching(repoPath: string): void {
    if (this.watchers.has(repoPath)) return;
    this.ensureDir(repoPath);
    const dir = path.join(repoPath, '.omnidesk');
    try {
      const w = fs.watch(dir, (_event, filename) => {
        // On Windows, filename can be null; accept that too.
        if (filename !== null && filename !== 'tasks.md') return;
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
      // task:changed will be added to the IPC contract in Task 4.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (this.emitter as any).emit('task:changed', { repoPath, tasks });
    }
  }
}
