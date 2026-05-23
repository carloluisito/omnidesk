// @atlas-entrypoint: Lightweight context menu for the shell.
// Positions itself at a click coordinate. Closes on outside-click / Escape.
import { useEffect, useRef } from 'react';
import { P4Icon, type P4IconName } from './P4Icon';

export interface ContextMenuItem {
  label: string;
  icon?: P4IconName;
  /** Optional shortcut hint shown on the right. */
  shortcut?: string;
  /** Visual emphasis. */
  variant?: 'default' | 'danger';
  /** Disabled rows are shown but not clickable. */
  disabled?: boolean;
  onSelect: () => void;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);

  // Outside click + Escape close it. Defer the document listener one tick so
  // the opening click doesn't immediately fire it.
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    const t = window.setTimeout(() => {
      document.addEventListener('mousedown', onDoc);
      document.addEventListener('contextmenu', onDoc);
    }, 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('contextmenu', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  // Clamp so the menu never spills off the viewport.
  const style: React.CSSProperties = {
    position: 'fixed',
    top: Math.min(y, window.innerHeight - 8 - items.length * 32),
    left: Math.min(x, window.innerWidth - 200),
    zIndex: 200,
  };

  return (
    <div ref={ref} className="p4-context-menu" role="menu" style={style}>
      {items.map((item, i) => (
        <button
          key={i}
          type="button"
          role="menuitem"
          className={'p4-context-menu-item' + (item.variant === 'danger' ? ' danger' : '')}
          disabled={item.disabled}
          onClick={(e) => {
            e.stopPropagation();
            if (item.disabled) return;
            item.onSelect();
            onClose();
          }}
        >
          {item.icon && (
            <span className="p4-context-menu-icon"><P4Icon name={item.icon} size={12} /></span>
          )}
          <span className="p4-context-menu-label">{item.label}</span>
          {item.shortcut && (
            <span className="p4-context-menu-shortcut">{item.shortcut}</span>
          )}
        </button>
      ))}
    </div>
  );
}
