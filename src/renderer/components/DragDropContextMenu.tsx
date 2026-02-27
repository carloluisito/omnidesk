import { useEffect, useRef } from 'react';
import { FileInfo } from '../../shared/ipc-types';

interface DragDropContextMenuProps {
  isOpen: boolean;
  position: { x: number; y: number };
  files: FileInfo[];
  onInsertPath: () => void;
  onInsertContent: () => void;
  onCancel: () => void;
}

export function DragDropContextMenu({
  isOpen,
  position,
  files,
  onInsertPath,
  onInsertContent,
  onCancel,
}: DragDropContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCancel();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onCancel]);

  // Adjust position to keep menu in viewport
  useEffect(() => {
    if (!isOpen || !menuRef.current) return;

    const menu = menuRef.current;
    const rect = menu.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let adjustedX = position.x;
    let adjustedY = position.y;

    if (position.x + rect.width > viewportWidth) {
      adjustedX = viewportWidth - rect.width - 8;
    }

    if (position.y + rect.height > viewportHeight) {
      adjustedY = viewportHeight - rect.height - 8;
    }

    menu.style.left = `${adjustedX}px`;
    menu.style.top = `${adjustedY}px`;
  }, [isOpen, position]);

  if (!isOpen) return null;

  const hasTextFiles = files.some(f => !f.isBinary);

  return (
    <>
      <div className="dragdrop-menu-overlay" onClick={onCancel} />
      <div
        ref={menuRef}
        className="dragdrop-menu"
        style={{ left: position.x, top: position.y }}
        role="menu"
      >
        <div className="dragdrop-menu-header">
          <span className="dragdrop-menu-title">
            {files.length === 1 ? 'Insert file as...' : `Insert ${files.length} files as...`}
          </span>
        </div>

        <div className="dragdrop-menu-items">
          <button
            type="button"
            className="dragdrop-menu-item"
            onClick={onInsertPath}
            role="menuitem"
          >
            <div className="dragdrop-menu-item-content">
              <span className="dragdrop-menu-item-label">File Path</span>
              <span className="dragdrop-menu-item-hint">Insert quoted path(s)</span>
            </div>
          </button>

          <button
            type="button"
            className="dragdrop-menu-item"
            onClick={onInsertContent}
            disabled={!hasTextFiles}
            role="menuitem"
          >
            <div className="dragdrop-menu-item-content">
              <span className="dragdrop-menu-item-label">File Content</span>
              <span className="dragdrop-menu-item-hint">
                {hasTextFiles ? 'Insert file content' : 'No text files'}
              </span>
            </div>
          </button>

          <div className="dragdrop-menu-divider" role="separator" />

          <button
            type="button"
            className="dragdrop-menu-item"
            onClick={onCancel}
            role="menuitem"
          >
            <div className="dragdrop-menu-item-content">
              <span className="dragdrop-menu-item-label">Cancel</span>
            </div>
          </button>
        </div>
      </div>

      <style>{`
        .dragdrop-menu-overlay {
          position: fixed;
          inset: 0;
          z-index: 1099;
        }

        .dragdrop-menu {
          position: fixed;
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
          min-width: 240px;
          z-index: 1100;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          animation: menu-enter var(--duration-fast, 150ms) var(--ease-out, ease) both;
          overflow: hidden;
        }

        @keyframes menu-enter {
          from {
            opacity: 0;
            transform: scale(0.96) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }

        .dragdrop-menu-header {
          padding: var(--space-2, 8px) var(--space-3, 12px);
          border-bottom: 1px solid var(--border-subtle, #1E2030);
        }

        .dragdrop-menu-title {
          font-size: var(--text-xs, 11px);
          font-weight: var(--weight-medium, 500);
          color: var(--text-tertiary, #5C6080);
          text-transform: uppercase;
          letter-spacing: var(--tracking-widest, 0.08em);
        }

        .dragdrop-menu-items {
          padding: var(--space-1, 4px);
        }

        .dragdrop-menu-item {
          display: flex;
          align-items: center;
          width: 100%;
          padding: var(--space-2, 8px) var(--space-3, 12px);
          background: transparent;
          border: none;
          border-radius: var(--radius-sm, 3px);
          cursor: pointer;
          transition: background-color var(--duration-fast, 150ms) var(--ease-inout, ease);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
        }

        .dragdrop-menu-item:hover:not(:disabled) {
          background: var(--state-hover, #FFFFFF0A);
        }

        .dragdrop-menu-item:focus-visible {
          outline: 2px solid var(--state-focus, #00C9A740);
          outline-offset: -2px;
        }

        .dragdrop-menu-item:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .dragdrop-menu-item-content {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 2px;
          flex: 1;
        }

        .dragdrop-menu-item-label {
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-medium, 500);
          color: var(--text-secondary, #9DA3BE);
        }

        .dragdrop-menu-item:hover:not(:disabled) .dragdrop-menu-item-label {
          color: var(--text-primary, #E2E4F0);
        }

        .dragdrop-menu-item-hint {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
        }

        .dragdrop-menu-divider {
          height: 1px;
          background: var(--border-subtle, #1E2030);
          margin: var(--space-1, 4px) 0;
        }

        @media (prefers-reduced-motion: reduce) {
          .dragdrop-menu {
            animation: none;
          }
        }
      `}</style>
    </>
  );
}
