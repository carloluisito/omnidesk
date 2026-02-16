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
    if (isStaged) return { label: 'Staged', color: '#9ece6a', bg: 'rgba(158,206,106,0.15)' };
    if (isUntracked) return { label: 'Untracked', color: '#7dcfff', bg: 'rgba(125,207,255,0.15)' };
    if (isDeleted) return { label: 'Deleted', color: '#f7768e', bg: 'rgba(247,118,142,0.15)' };
    return { label: 'Modified', color: '#e0af68', bg: 'rgba(224,175,104,0.15)' };
  };

  const badge = statusBadge();

  return (
    <div className="diff-viewer-header">
      <div className="diff-viewer-header-left">
        <span className="diff-viewer-filepath" title={file.path}>
          {isRenamed && file.originalPath
            ? <>{file.originalPath} <span style={{ color: '#565f89' }}>&rarr;</span> {file.path}</>
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
