import { useEffect, useRef } from 'react';

export interface ContextMenuPosition {
  x: number;
  y: number;
}

interface ContextMenuProps {
  position: ContextMenuPosition;
  onClose: () => void;
  onAction: (action: string) => void;
  isExited: boolean;
  isOnlyTab: boolean;
  isRightmost: boolean;
  canSplit?: boolean;
  isShared?: boolean;
  canShare?: boolean;
}

interface MenuItem {
  id: string;
  label: string;
  shortcut?: string;
  disabled?: boolean;
  danger?: boolean;
  hidden?: boolean;
}

export function ContextMenu({
  position,
  onClose,
  onAction,
  isExited,
  isOnlyTab,
  isRightmost,
  canSplit = false,
  isShared = false,
  canShare = true,
}: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [onClose]);

  // Adjust position to stay within viewport
  useEffect(() => {
    if (menuRef.current) {
      const menu = menuRef.current;
      const rect = menu.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      let x = position.x;
      let y = position.y;

      if (x + rect.width > viewportWidth) {
        x = viewportWidth - rect.width - 8;
      }
      if (y + rect.height > viewportHeight) {
        y = viewportHeight - rect.height - 8;
      }

      menu.style.left = `${x}px`;
      menu.style.top = `${y}px`;
    }
  }, [position]);

  const items: MenuItem[] = [
    { id: 'rename', label: 'Rename', shortcut: 'F2' },
    { id: 'duplicate', label: 'Duplicate', shortcut: '^D' },
    { id: 'dividerCheckpoint', label: '' },
    { id: 'createCheckpoint', label: 'Create Checkpoint', shortcut: '^⇧S' },
    { id: 'viewCheckpoints', label: 'View Checkpoints', shortcut: '^⇧C' },
    { id: 'revealInExplorer', label: 'Reveal in File Explorer' },
    { id: 'divider1', label: '', hidden: !isExited },
    { id: 'restart', label: 'Restart', shortcut: '^R', hidden: !isExited },
    { id: 'dividerSplit', label: '', hidden: !canSplit },
    { id: 'splitRight', label: 'Split Right', shortcut: '^\\', hidden: !canSplit },
    { id: 'splitDown', label: 'Split Down', shortcut: '^⇧\\', hidden: !canSplit },
    { id: 'dividerShare', label: '', hidden: !canShare && !isShared },
    { id: 'shareSession', label: 'Share Session...', hidden: !canShare || isShared || isExited },
    { id: 'stopSharing', label: 'Stop Sharing', danger: true, hidden: !isShared },
    { id: 'divider2', label: '' },
    { id: 'close', label: 'Close', shortcut: '^W', danger: true },
    { id: 'closeOthers', label: 'Close Others', disabled: isOnlyTab, danger: true },
    { id: 'closeRight', label: 'Close to Right', disabled: isRightmost, danger: true },
  ];

  const visibleItems = items.filter(item => !item.hidden);

  return (
    <div
      ref={menuRef}
      className="context-menu"
      role="menu"
      style={{ left: position.x, top: position.y }}
    >
      {visibleItems.map((item, _index) => {
        if (item.id.startsWith('divider')) {
          return <div key={item.id} className="menu-divider" />;
        }

        return (
          <button
            key={item.id}
            className={`menu-item ${item.danger ? 'danger' : ''} ${item.disabled ? 'disabled' : ''}`}
            onClick={() => !item.disabled && onAction(item.id)}
            disabled={item.disabled}
            role="menuitem"
          >
            <span className="menu-label">{item.label}</span>
            {item.shortcut && (
              <span className="menu-shortcut">{item.shortcut}</span>
            )}
          </button>
        );
      })}

      <style>{`
        .context-menu {
          position: fixed;
          min-width: 200px;
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-lg, 10px);
          padding: var(--space-1, 4px);
          box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
          z-index: 100;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          animation: menu-enter 0.12s ease-out;
        }

        @keyframes menu-enter {
          from {
            opacity: 0;
            transform: translateY(-4px) scale(0.98);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .menu-item {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
          padding: var(--space-2, 8px) var(--space-3, 12px);
          background: transparent;
          border: none;
          border-radius: var(--radius-md, 6px);
          cursor: pointer;
          transition: background var(--duration-fast, 150ms) ease;
          text-align: left;
        }

        .menu-item:hover:not(.disabled) {
          background: var(--state-hover, #FFFFFF0A);
        }

        .menu-item.danger:hover:not(.disabled) {
          background: rgba(247, 103, 142, 0.08);
        }

        .menu-item.disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .menu-label {
          font-size: var(--text-sm, 12px);
          color: var(--text-secondary, #9DA3BE);
        }

        .menu-item.danger .menu-label {
          color: var(--semantic-error, #F7678E);
        }

        .menu-shortcut {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
        }

        .menu-divider {
          height: 1px;
          background: var(--border-subtle, #1E2030);
          margin: 4px var(--space-2, 8px);
        }
      `}</style>
    </div>
  );
}
