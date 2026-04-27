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
