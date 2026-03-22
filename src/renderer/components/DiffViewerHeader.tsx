import type { GitFileEntry } from '../../shared/types/git-types';

interface DiffViewerHeaderProps {
  file: GitFileEntry | null;
  onStage: () => void;
  onUnstage: () => void;
  onDiscard: () => void;
  onClose: () => void;
}

export function DiffViewerHeader({
  file,
  onStage,
  onUnstage,
  onDiscard,
  onClose,
}: DiffViewerHeaderProps) {
  if (!file) return null;

  const status = file.area === 'staged' ? file.indexStatus : file.workTreeStatus;
  const isStaged = file.area === 'staged';
  const isUntracked = file.area === 'untracked';
  const isDeleted = status === 'deleted';
  const isRenamed = status === 'renamed';

  const statusBadge = () => {
    if (isStaged) return { label: 'Staged', color: 'var(--semantic-success)', bg: 'color-mix(in srgb, var(--semantic-success) 15%, transparent)' };
    if (isUntracked) return { label: 'Untracked', color: 'var(--accent-primary)', bg: 'color-mix(in srgb, var(--term-bright-cyan) 15%, transparent)' };
    if (isDeleted) return { label: 'Deleted', color: 'var(--semantic-error)', bg: 'color-mix(in srgb, var(--semantic-error) 15%, transparent)' };
    return { label: 'Modified', color: 'var(--semantic-warning)', bg: 'color-mix(in srgb, var(--semantic-warning) 15%, transparent)' };
  };

  const badge = statusBadge();

  return (
    <div className="diff-viewer-header">
      <div className="diff-viewer-header-left">
        <span className="diff-viewer-filepath" title={file.path}>
          {isRenamed && file.originalPath
            ? <>{file.originalPath} <span style={{ color: 'var(--text-tertiary)' }}>&rarr;</span> {file.path}</>
            : file.path
          }
        </span>
        <span
          className="diff-viewer-badge"
          style={{ color: badge.color, background: badge.bg }}
        >
          {badge.label}
        </span>
      </div>
      <div className="diff-viewer-header-right">
        {isStaged && (
          <button className="diff-viewer-action-btn diff-viewer-unstage-btn" onClick={onUnstage}>
            Unstage
          </button>
        )}
        {!isStaged && !isDeleted && (
          <button className="diff-viewer-action-btn diff-viewer-stage-btn" onClick={onStage}>
            Stage
          </button>
        )}
        {file.area === 'unstaged' && (
          <button className="diff-viewer-action-btn diff-viewer-discard-btn" onClick={onDiscard}>
            Discard
          </button>
        )}
        <button className="diff-viewer-close-btn" onClick={onClose} aria-label="Close diff viewer">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      </div>
    </div>
  );
}
