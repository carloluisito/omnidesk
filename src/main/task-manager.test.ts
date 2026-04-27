import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { TaskManager } from './task-manager';

let repo: string;
let tm: TaskManager;

beforeEach(() => {
  repo = fs.mkdtempSync(path.join(os.tmpdir(), 'omnidesk-tasks-'));
  tm = new TaskManager();
});

afterEach(() => {
  tm.destroy();
  fs.rmSync(repo, { recursive: true, force: true });
});

describe('TaskManager', () => {
  it('returns empty list when no file exists', async () => {
    expect(await tm.list(repo)).toEqual([]);
  });

  it('add creates .omnidesk/tasks.md and the task is listed', async () => {
    const t = await tm.add(repo, '  hello  ');
    expect(t.title).toBe('hello');
    const filePath = path.join(repo, '.omnidesk', 'tasks.md');
    expect(fs.existsSync(filePath)).toBe(true);
    const list = await tm.list(repo);
    expect(list).toHaveLength(1);
    expect(list[0].createdAt).toBeGreaterThan(0);
  });

  it('toggle / edit / delete work', async () => {
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
    await Promise.all(
      Array.from({ length: 10 }, (_, i) => tm.add(repo, `task ${i}`)),
    );
    expect(await tm.list(repo)).toHaveLength(10);
  });

  it('stableId survives title edit so subsequent toggle/delete work', async () => {
    const t = await tm.add(repo, 'original');
    await tm.edit(repo, t.id, { title: 'renamed' });
    const toggled = await tm.toggle(repo, t.id);
    expect(toggled.done).toBe(true);
    expect(toggled.id).toBe(t.id);
    await tm.delete(repo, t.id);
    expect(await tm.list(repo)).toHaveLength(0);
  });
});
