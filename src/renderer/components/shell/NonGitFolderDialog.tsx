import { P4Icon } from './P4Icon';

export interface NonGitFolderDialogProps {
  /** Display name of the picked folder. */
  name: string;
  onInitGit: () => void;
  onOpenPlain: () => void;
  onCancel: () => void;
}

/**
 * Shown when the user picks a folder that has no `.git`. Offers to `git init`
 * it (recommended) or open it as a plain folder. The parent gates visibility
 * (render only when there's a pending non-git choice); this component always
 * renders its overlay when mounted.
 */
export function NonGitFolderDialog({ name, onInitGit, onOpenPlain, onCancel }: NonGitFolderDialogProps) {
  return (
    <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Folder is not a git repository" style={{ width: 480 }}>
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="folder" size={16} /></div>
          <div>
            <div className="t">Not a git repository</div>
            <div className="d">
              <code style={{ color: 'var(--text-secondary)' }}>{name}</code> has no <code>.git</code>. How do you want to open it?
            </div>
          </div>
          <button className="x" onClick={onCancel} aria-label="Cancel">
            <P4Icon name="x" size={14} />
          </button>
        </div>
        <div className="p4-sheet-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            type="button"
            className="p4-source-card on"
            style={{ textAlign: 'left' }}
            onClick={onInitGit}
          >
            <span className="src-icon" style={{ background: 'rgba(0,201,167,.12)', color: 'var(--accent)' }}>
              <P4Icon name="git" size={14} />
            </span>
            <div>
              <div className="label">Initialize git &amp; open <span style={{ color: 'var(--accent)', fontSize: 10 }}>recommended</span></div>
              <div className="sub">Runs <code>git init</code>. Unlocks worktrees, branches, and isolated sessions.</div>
            </div>
          </button>
          <button
            type="button"
            className="p4-source-card"
            style={{ textAlign: 'left' }}
            onClick={onOpenPlain}
          >
            <span className="src-icon" style={{ background: 'var(--surface-high)', color: 'var(--text-secondary)' }}>
              <P4Icon name="folder" size={14} />
            </span>
            <div>
              <div className="label">Open as plain folder</div>
              <div className="sub">No git. Sessions just run in this folder — no worktrees or branches.</div>
            </div>
          </button>
        </div>
        <div className="p4-sheet-foot">
          <button className="p4-btn ghost" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
