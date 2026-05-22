// @atlas-entrypoint: Close-session confirmation with opt-in destructive actions.
// The default close just stops the CLI — the worktree dir and branch are
// preserved so the user can pick up tomorrow. Removing either requires an
// explicit checkbox.
import { useEffect, useState } from 'react';
import { P4Icon } from './P4Icon';

interface CloseSessionDialogProps {
  /** Session name, shown in the title. */
  name: string;
  /** Whether the underlying CLI process is currently running. */
  isRunning: boolean;
  /** Whether this session has a worktree dir OmniDesk can remove. */
  hasWorktree: boolean;
  /** The branch name (shown next to the "Also delete branch" checkbox). */
  branchName?: string | null;
  onConfirm: (opts: { removeWorktree: boolean; removeBranch: boolean }) => void;
  onCancel: () => void;
}

export function CloseSessionDialog({
  name, isRunning, hasWorktree, branchName, onConfirm, onCancel,
}: CloseSessionDialogProps) {
  const [removeWorktree, setRemoveWorktree] = useState(false);
  const [removeBranch, setRemoveBranch] = useState(false);

  // Deleting a branch only makes sense if we also remove the worktree
  // (git refuses to delete a branch that's checked out in a worktree).
  // Auto-couple: ticking branch implicitly ticks worktree.
  useEffect(() => {
    if (removeBranch && !removeWorktree) setRemoveWorktree(true);
  }, [removeBranch, removeWorktree]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  const dangerous = removeWorktree || removeBranch || isRunning;

  return (
    <div
      className="p4-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Close session" style={{ width: 460 }}>
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="x" size={16} /></div>
          <div>
            <div className="t">Close “{name}”?</div>
            <div className="d">
              {isRunning
                ? 'The CLI process will be terminated. Everything else is kept by default.'
                : 'Session is no longer running. Closing just hides it from the rail.'}
            </div>
          </div>
          <button className="x" onClick={onCancel} aria-label="Cancel">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {hasWorktree && (
            <CheckRow
              checked={removeWorktree}
              onChange={setRemoveWorktree}
              label="Also remove the worktree directory"
              hint="Deletes the linked worktree from disk. Your branch is unaffected; you can re-attach it later via 'Existing'."
            />
          )}
          {hasWorktree && branchName && (
            <CheckRow
              checked={removeBranch}
              onChange={setRemoveBranch}
              label={<>Also delete branch <code style={{ color: 'var(--error)' }}>{branchName}</code></>}
              hint="git branch -D — destructive. Use only for scratch branches you're done with."
              danger
            />
          )}
          {!hasWorktree && (
            <div className="help" style={{ marginTop: 0, color: 'var(--text-tertiary)' }}>
              This session has no worktree, so there's nothing else to clean up.
            </div>
          )}
        </div>

        <div className="p4-sheet-foot">
          <button className="p4-btn ghost" onClick={onCancel}>Cancel</button>
          <button
            className={'p4-btn ' + (dangerous ? 'danger' : 'primary')}
            onClick={() => onConfirm({ removeWorktree, removeBranch })}
            style={dangerous ? { background: 'var(--error)', color: 'var(--text-inverse)' } : undefined}
          >
            {removeBranch ? 'Close & delete branch'
              : removeWorktree ? 'Close & remove worktree'
              : 'Close session'}
          </button>
        </div>
      </div>
    </div>
  );
}

interface CheckRowProps {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: React.ReactNode;
  hint?: string;
  danger?: boolean;
}

function CheckRow({ checked, onChange, label, hint, danger }: CheckRowProps) {
  return (
    <label
      style={{
        display: 'flex', gap: 10,
        padding: '8px 10px',
        background: checked
          ? (danger ? 'rgba(247,103,142,.08)' : 'var(--surface-mid)')
          : 'var(--surface-mid)',
        border: `1px solid ${checked ? (danger ? 'rgba(247,103,142,.30)' : 'var(--border-default)') : 'var(--border-subtle)'}`,
        borderRadius: 'var(--radius-md)',
        cursor: 'pointer',
        alignItems: 'flex-start',
      }}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ marginTop: 2, accentColor: danger ? 'var(--error)' : 'var(--accent)' }}
      />
      <div style={{ flex: 1 }}>
        <div style={{ color: danger && checked ? 'var(--error)' : 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
          {label}
        </div>
        {hint && (
          <div style={{
            color: 'var(--text-tertiary)', fontSize: 'var(--text-xs)',
            marginTop: 3, lineHeight: 1.5,
          }}>{hint}</div>
        )}
      </div>
    </label>
  );
}
