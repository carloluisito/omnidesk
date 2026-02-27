import { useState, useRef, useEffect, ReactNode } from 'react';

export interface DropdownItem {
  id: string;
  label: string;
  icon: ReactNode;
  onClick: () => void;
  badge?: string | number;
  shortcut?: string;
  disabled?: boolean;
}

interface ToolbarDropdownProps {
  icon: ReactNode;
  label: string;
  items: DropdownItem[];
  title?: string;
}

export function ToolbarDropdown({ icon, label, items, title }: ToolbarDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const handleItemClick = (item: DropdownItem) => {
    if (item.disabled) return;
    item.onClick();
    setIsOpen(false);
  };

  return (
    <div className="toolbar-dropdown" ref={dropdownRef}>
      <button
        className={`toolbar-dropdown-trigger ${isOpen ? 'active' : ''}`}
        onClick={() => setIsOpen(!isOpen)}
        title={title || label}
        aria-label={label}
        aria-expanded={isOpen}
      >
        <span className="trigger-icon">{icon}</span>
        <span className="trigger-label">{label}</span>
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          className={`trigger-arrow ${isOpen ? 'open' : ''}`}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {isOpen && (
        <div className="toolbar-dropdown-menu">
          {items.map((item) => (
            <button
              key={item.id}
              className={`dropdown-menu-item ${item.disabled ? 'disabled' : ''}`}
              onClick={() => handleItemClick(item)}
              disabled={item.disabled}
            >
              <span className="menu-item-icon">{item.icon}</span>
              <span className="menu-item-label">{item.label}</span>
              {item.shortcut && (
                <span className="menu-item-shortcut">{item.shortcut}</span>
              )}
              {item.badge && (
                <span className="menu-item-badge">{item.badge}</span>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        .toolbar-dropdown {
          position: relative;
          display: inline-block;
        }

        .toolbar-dropdown-trigger {
          display: flex;
          align-items: center;
          gap: 6px;
          height: 32px;
          padding: 0 var(--space-3, 12px);
          background: var(--surface-float, #222435);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          color: var(--text-secondary, #9DA3BE);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-medium, 500);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          cursor: pointer;
          transition: border-color var(--duration-fast, 150ms) ease,
                      color var(--duration-fast, 150ms) ease,
                      background var(--duration-fast, 150ms) ease;
        }

        .toolbar-dropdown-trigger:hover {
          background: var(--state-hover, #FFFFFF0A);
          border-color: var(--border-accent, #00C9A7);
          color: var(--text-accent, #00C9A7);
        }

        .toolbar-dropdown-trigger.active {
          background: var(--state-hover, #FFFFFF0A);
          border-color: var(--border-accent, #00C9A7);
          color: var(--text-accent, #00C9A7);
        }

        .trigger-icon {
          display: flex;
          align-items: center;
        }

        .trigger-label {
          font-weight: var(--weight-medium, 500);
        }

        .trigger-arrow {
          transition: transform 0.2s ease;
        }

        .trigger-arrow.open {
          transform: rotate(180deg);
        }

        .toolbar-dropdown-menu {
          position: absolute;
          top: calc(100% + 8px);
          left: 0;
          min-width: 200px;
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
          z-index: 1000;
          overflow: hidden;
          animation: dropdown-slide-in 0.2s cubic-bezier(0, 0, 0.2, 1);
        }

        @keyframes dropdown-slide-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .dropdown-menu-item {
          display: flex;
          align-items: center;
          gap: 10px;
          width: 100%;
          padding: var(--space-2, 8px) var(--space-4, 16px);
          background: transparent;
          border: none;
          border-bottom: 1px solid var(--border-subtle, #1E2030);
          color: var(--text-secondary, #9DA3BE);
          font-size: var(--text-sm, 12px);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          cursor: pointer;
          text-align: left;
          transition: background var(--duration-fast, 150ms) ease,
                      color var(--duration-fast, 150ms) ease;
        }

        .dropdown-menu-item:last-child {
          border-bottom: none;
        }

        .dropdown-menu-item:hover:not(.disabled) {
          background: var(--state-hover, #FFFFFF0A);
          color: var(--text-primary, #E2E4F0);
        }

        .dropdown-menu-item.disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .menu-item-icon {
          display: flex;
          align-items: center;
          color: var(--text-accent, #00C9A7);
        }

        .menu-item-label {
          flex: 1;
        }

        .menu-item-shortcut {
          font-size: 10px;
          color: var(--text-tertiary, #5C6080);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
        }

        .menu-item-badge {
          padding: 2px 6px;
          background: var(--accent-primary, #00C9A7);
          color: var(--text-inverse, #0D0E14);
          font-size: 10px;
          font-weight: var(--weight-semibold, 600);
          border-radius: var(--radius-full, 9999px);
          min-width: 18px;
          text-align: center;
        }
      `}</style>
    </div>
  );
}
