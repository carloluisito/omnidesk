import { useMemo, useState, useCallback } from 'react';
import { useTasks } from '../hooks/useTasks';
import { useDrag } from '../hooks/useDrag';
import { PanelShell, PanelSection, PanelEmpty, PanelLoading, PanelError, StatusPill } from './ui';
import type { Task } from '../../shared/types/task-types';

interface TaskPanelProps {
  repoPath: string | null;
}

// ─── V2 TaskPanel ─────────────────────────────────────────────────────────────

function TaskRowV2({
  task,
  onToggle,
  onEdit,
  onRemove,
}: {
  task: Task;
  onToggle: (id: string) => void;
  onEdit: (id: string, c: { title?: string; notes?: string }) => void;
  onRemove: (id: string) => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      className={hovered ? 'anim-lift' : undefined}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        8,
        padding:    '5px 8px',
        borderRadius: 'var(--radius-md, 6px)',
        background: hovered ? 'var(--v2-surface-mid)' : 'transparent',
        transition: 'background 120ms ease',
        cursor:     'default',
      }}
    >
      {/* Live dot for in-progress tasks (not done) */}
      {!task.done && (
        <StatusPill variant="live" pulse aria-label="In progress" />
      )}

      {/* Checkbox */}
      <input
        type="checkbox"
        checked={task.done}
        onChange={() => onToggle(task.id)}
        style={{ flexShrink: 0 }}
        aria-label={`Mark "${task.title}" as ${task.done ? 'not done' : 'done'}`}
      />

      {/* Title */}
      <EditableTitle
        value={task.title}
        done={task.done}
        onSubmit={(v) => onEdit(task.id, { title: v })}
      />

      {/* Delete */}
      {hovered && (
        <button
          onClick={() => onRemove(task.id)}
          aria-label="Delete task"
          style={{
            background: 'none',
            border:     'none',
            color:      'var(--v2-text-tertiary)',
            cursor:     'pointer',
            padding:    '0 2px',
            flexShrink: 0,
            fontSize:   14,
          }}
        >
          ×
        </button>
      )}
    </div>
  );
}

function V2TaskPanel({ repoPath }: TaskPanelProps) {
  const { tasks, add, toggle, edit, remove, isLoading, error } = useTasks(repoPath);
  const [draft, setDraft] = useState('');

  const { inProgress, pending, done } = useMemo(() => {
    // In-progress: open tasks (not done)
    const ip = tasks.filter(t => !t.done);
    // Done
    const d  = tasks.filter(t => t.done);
    // Split open by position: first half "In Progress", rest "Pending"
    // (Task domain has no explicit status field — approximate split)
    const mid = Math.ceil(ip.length / 2);
    return {
      inProgress: ip.slice(0, mid),
      pending:    ip.slice(mid),
      done:       d,
    };
  }, [tasks]);

  // Drag-to-reorder for open tasks (inProgress + pending combined into one ordered list)
  // Persistence: task IPC doesn't expose reorder; use setSettings as fallback ordering store.
  const openTasks = useMemo(() => [...inProgress, ...pending], [inProgress, pending]);

  const handleTaskReorder = useCallback((from: number, to: number) => {
    // Store the reorder preference in settings (best-effort — no task IPC reorder method)
    if (typeof window.electronAPI?.setSettings === 'function') {
      const reordered = [...openTasks];
      const [moved] = reordered.splice(from, 1);
      reordered.splice(to, 0, moved);
      (window.electronAPI.setSettings as (s: Record<string, unknown>) => Promise<unknown>)({
        'tasks.order': reordered.map(t => t.id),
      }).catch(() => {});
    }
  }, [openTasks]);

  const { dragState: taskDragState, dragHandlers: taskDragHandlers } = useDrag({
    items: openTasks,
    onReorder: handleTaskReorder,
  });

  // No repo path — shown as PanelEmpty
  if (!repoPath) {
    return (
      <PanelShell
        title="Tasks"
        icon={<TaskIcon />}
      >
        <PanelEmpty
          icon={<TaskIcon size={26} />}
          title="No active repo"
          body="Open a repository to use tasks. Tasks are stored in .omnidesk/tasks.md."
        />
      </PanelShell>
    );
  }

  // Loading state
  if (isLoading && tasks.length === 0) {
    return (
      <PanelShell
        title="Tasks"
        icon={<TaskIcon />}
        count="—"
      >
        <PanelLoading rows={3} />
      </PanelShell>
    );
  }

  // Error state
  if (error) {
    return (
      <PanelShell
        title="Tasks"
        icon={<TaskIcon />}
      >
        <PanelError
          message={error}
          recover={{ label: 'Retry', onClick: () => window.location.reload() }}
        />
      </PanelShell>
    );
  }

  const openCount = inProgress.length + pending.length;
  const totalCount = tasks.length;

  const onSubmitDraft = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && draft.trim()) {
      const v = draft;
      setDraft('');
      await add(v);
    }
  };

  // Add-task footer
  const footer = (
    <input
      placeholder="Add a task… (Enter to save)"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={onSubmitDraft}
      style={{
        width:        '100%',
        padding:      '6px 8px',
        background:   'var(--v2-surface-mid)',
        color:        'var(--v2-text-primary)',
        border:       '1px solid var(--v2-border-default)',
        borderRadius: 'var(--radius-md, 6px)',
        fontFamily:   'inherit',
        fontSize:     'var(--text-sm, 12px)',
        boxSizing:    'border-box',
        outline:      'none',
      }}
      aria-label="Add a task"
    />
  );

  return (
    <PanelShell
      title="Tasks"
      icon={<TaskIcon />}
      count={`${openCount} open · ${totalCount} total`}
      footer={footer}
    >
      {/* Empty state */}
      {tasks.length === 0 && (
        <PanelEmpty
          icon={<TaskIcon size={26} />}
          title="No tasks yet"
          body="Add a task below, or ask the active session to write to .omnidesk/tasks.md."
        />
      )}

      {/* In Progress section */}
      {inProgress.length > 0 && (
        <PanelSection title="In Progress" count={inProgress.length} defaultOpen>
          {inProgress.map((t, sectionIdx) => {
            const globalIdx = sectionIdx; // inProgress starts at 0
            const isDragging = taskDragState.activeIndex === globalIdx;
            const isDropTarget = taskDragState.overIndex === globalIdx && taskDragState.activeIndex !== globalIdx;
            return (
            <div
              key={t.id}
              style={{
                opacity:    isDragging ? 0.5 : 1,
                borderLeft: isDropTarget ? '2px solid var(--v2-accent, #00C9A7)' : '2px solid transparent',
                cursor:     'grab',
                transition: 'border-color 80ms ease, opacity 80ms ease',
              }}
              {...taskDragHandlers(globalIdx)}
            >
            <TaskRowV2
              task={t}
              onToggle={toggle}
              onEdit={edit}
              onRemove={remove}
            />
            </div>
            );
          })}
        </PanelSection>
      )}

      {/* Pending section */}
      {pending.length > 0 && (
        <PanelSection title="Pending" count={pending.length} defaultOpen>
          {pending.map((t, sectionIdx) => {
            const globalIdx = inProgress.length + sectionIdx;
            const isDragging = taskDragState.activeIndex === globalIdx;
            const isDropTarget = taskDragState.overIndex === globalIdx && taskDragState.activeIndex !== globalIdx;
            return (
            <div
              key={t.id}
              style={{
                opacity:    isDragging ? 0.5 : 1,
                borderLeft: isDropTarget ? '2px solid var(--v2-accent, #00C9A7)' : '2px solid transparent',
                cursor:     'grab',
                transition: 'border-color 80ms ease, opacity 80ms ease',
              }}
              {...taskDragHandlers(globalIdx)}
            >
            <TaskRowV2
              task={t}
              onToggle={toggle}
              onEdit={edit}
              onRemove={remove}
            />
            </div>
            );
          })}
        </PanelSection>
      )}

      {/* Done section */}
      {done.length > 0 && (
        <PanelSection title="Done" count={done.length} defaultOpen={false}>
          {done.map(t => (
            <TaskRowV2
              key={t.id}
              task={t}
              onToggle={toggle}
              onEdit={edit}
              onRemove={remove}
            />
          ))}
        </PanelSection>
      )}

      {/* Bottom padding */}
      <div style={{ height: 12 }} />
    </PanelShell>
  );
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function TaskIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" />
    </svg>
  );
}


function EditableTitle({
  value,
  done,
  onSubmit,
}: {
  value: string;
  done?: boolean;
  onSubmit: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  if (!editing) {
    return (
      <span
        onDoubleClick={() => { setDraft(value); setEditing(true); }}
        style={{
          flex:           1,
          fontSize:       'var(--text-sm, 12px)',
          fontFamily:     'var(--font-mono, JetBrains Mono, monospace)',
          color:          done ? 'var(--v2-text-tertiary)' : 'var(--v2-text-primary)',
          textDecoration: done ? 'line-through' : 'none',
          cursor:         'text',
        }}
      >
        {value}
      </span>
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
        flex:         1,
        background:   'var(--v2-surface-mid)',
        color:        'var(--v2-text-primary)',
        border:       '1px solid var(--v2-border-default)',
        borderRadius: 4,
        padding:      '2px 4px',
        fontFamily:   'var(--font-mono, monospace)',
        fontSize:     'var(--text-sm, 12px)',
      }}
    />
  );
}

// ─── Public export — flag dispatcher ─────────────────────────────────────────

export function TaskPanel({ repoPath }: TaskPanelProps) {
  return <V2TaskPanel repoPath={repoPath} />;
}
