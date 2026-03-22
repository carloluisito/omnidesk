import { FileInfo } from '../../shared/ipc-types';

interface DragDropOverlayProps {
  isVisible: boolean;
  files: FileInfo[];
  isShiftPressed: boolean;
}

export function DragDropOverlay({ isVisible, files, isShiftPressed }: DragDropOverlayProps) {
  if (!isVisible || files.length === 0) {
    return null;
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getCategoryIcon = (category: string): string => {
    switch (category) {
      case 'code':     return '📝';
      case 'markup':   return '🔖';
      case 'document': return '📄';
      case 'image':    return '🖼️';
      case 'binary':   return '📦';
      default:         return '📁';
    }
  };

  const insertMode = isShiftPressed ? 'content' : 'path';

  return (
    <div className="dragdrop-overlay">
      <div className="dragdrop-content">
        <div className="dragdrop-mode">
          {insertMode === 'content' ? 'Insert File Content' : 'Insert File Path'}
        </div>

        <div className="dragdrop-file-info">
          {files.length === 1 ? (
            <div className="dragdrop-file-single">
              <div className="dragdrop-file-name">
                {getCategoryIcon(files[0].category)} {files[0].name}
              </div>
              <div className="dragdrop-file-meta">
                {formatFileSize(files[0].sizeBytes)} · {files[0].category}
                {files[0].isBinary && ' · binary'}
              </div>
            </div>
          ) : (
            <div className="dragdrop-file-multi">
              <div className="dragdrop-file-count">
                {files.length} files
              </div>
              <div className="dragdrop-file-list">
                {files.slice(0, 3).map((file, idx) => (
                  <div key={idx} className="dragdrop-file-item">
                    {getCategoryIcon(file.category)} {file.name}
                  </div>
                ))}
                {files.length > 3 && (
                  <div className="dragdrop-file-more">
                    +{files.length - 3} more
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="dragdrop-hint">
            {isShiftPressed ? (
              <span>Release to insert content</span>
            ) : (
              <span>Hold Shift to insert content</span>
            )}
          </div>
        </div>
      </div>

      <style>{`
        .dragdrop-overlay {
          position: absolute;
          inset: 0;
          background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 1000;
          pointer-events: none;
          animation: dragdrop-fade-in var(--duration-fast, 150ms) var(--ease-out, ease) both;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
        }

        @keyframes dragdrop-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .dragdrop-content {
          background: var(--surface-overlay);
          border: 2px dashed color-mix(in srgb, var(--accent-primary) 40%, transparent);
          border-radius: var(--radius-lg, 10px);
          padding: var(--space-8, 32px);
          min-width: 320px;
          max-width: 480px;
          box-shadow: var(--shadow-lg, 0 12px 32px #00000080);
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-4, 16px);
        }

        .dragdrop-mode {
          font-size: var(--text-base, 13px);
          font-weight: var(--weight-semibold, 600);
          color: var(--text-primary);
          letter-spacing: var(--tracking-wide, 0.04em);
        }

        .dragdrop-file-info {
          display: flex;
          flex-direction: column;
          gap: var(--space-3, 12px);
          width: 100%;
          text-align: center;
        }

        .dragdrop-file-single,
        .dragdrop-file-multi {
          display: flex;
          flex-direction: column;
          gap: var(--space-1, 4px);
        }

        .dragdrop-file-name {
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          font-size: var(--text-sm, 12px);
          color: var(--text-primary);
          font-weight: var(--weight-medium, 500);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .dragdrop-file-meta {
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          font-size: var(--text-xs, 11px);
          color: var(--text-secondary);
        }

        .dragdrop-file-count {
          font-size: var(--text-sm, 12px);
          color: var(--text-primary);
          font-weight: var(--weight-semibold, 600);
        }

        .dragdrop-file-list {
          display: flex;
          flex-direction: column;
          gap: 3px;
          max-height: 120px;
          overflow: auto;
        }

        .dragdrop-file-item {
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          font-size: var(--text-xs, 11px);
          color: var(--text-secondary);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .dragdrop-file-more {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-xs, 11px);
          color: var(--text-accent);
          font-style: italic;
        }

        .dragdrop-hint {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary);
          padding-top: var(--space-2, 8px);
          border-top: 1px solid var(--border-default);
        }

        @media (prefers-reduced-motion: reduce) {
          .dragdrop-overlay {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
