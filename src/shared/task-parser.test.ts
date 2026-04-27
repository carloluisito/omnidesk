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
