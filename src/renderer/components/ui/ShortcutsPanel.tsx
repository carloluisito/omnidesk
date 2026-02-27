import { useState, useEffect, useRef } from 'react';
import { Search, Printer, X } from 'lucide-react';

interface ShortcutsPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

interface ShortcutGroup {
  category: string;
  shortcuts: Array<{
    keys: string[];
    description: string;
  }>;
}

const shortcuts: ShortcutGroup[] = [
  {
    category: 'Sessions',
    shortcuts: [
      { keys: ['Ctrl', 'T'], description: 'New Session' },
      { keys: ['Ctrl', 'W'], description: 'Close Current Session' },
      { keys: ['Ctrl', 'Tab'], description: 'Next Session' },
      { keys: ['Ctrl', 'Shift', 'Tab'], description: 'Previous Session' },
      { keys: ['Ctrl', '1-9'], description: 'Switch to Session 1-9' },
    ],
  },
  {
    category: 'Model',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'M'], description: 'Cycle Model (Haiku→Sonnet→Opus→Auto)' },
    ],
  },
  {
    category: 'View',
    shortcuts: [
      { keys: ['Ctrl', '\\'], description: 'Toggle Split View' },
      { keys: ['Ctrl', 'Shift', 'L'], description: 'Open Layout Picker' },
      { keys: ['Ctrl', 'Shift', 'W'], description: 'Close Focused Pane' },
      { keys: ['Ctrl', 'Alt', 'Arrow'], description: 'Focus Pane (Direction)' },
    ],
  },
  {
    category: 'Panels',
    shortcuts: [
      { keys: ['Ctrl', 'Shift', 'H'], description: 'Session History' },
      { keys: ['Ctrl', 'Shift', 'P'], description: 'Command Palette (Templates)' },
      { keys: ['Ctrl', 'Shift', 'A'], description: 'Repository Atlas' },
      { keys: ['Ctrl', 'Shift', 'T'], description: 'Agent Teams' },
      { keys: ['Ctrl', 'Shift', 'E'], description: 'Reveal in File Explorer' },
    ],
  },
  {
    category: 'Settings',
    shortcuts: [
      { keys: ['Ctrl', ','], description: 'Open Settings' },
      { keys: ['Ctrl', '/'], description: 'Keyboard Shortcuts (This Panel)' },
    ],
  },
  {
    category: 'Terminal',
    shortcuts: [
      { keys: ['Ctrl', 'C'], description: 'Interrupt (Shows Confirmation)' },
      { keys: ['Ctrl', 'V'], description: 'Paste' },
      { keys: ['Ctrl', 'Shift', 'C'], description: 'Copy' },
    ],
  },
];

export function ShortcutsPanel({ isOpen, onClose }: ShortcutsPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Focus search on open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchRef.current?.focus(), 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Focus trap and Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      // Basic focus trap: keep Tab within panel
      if (e.key === 'Tab' && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, input, [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const filteredShortcuts = shortcuts.map(group => ({
    ...group,
    shortcuts: group.shortcuts.filter(
      shortcut =>
        shortcut.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        shortcut.keys.join(' ').toLowerCase().includes(searchQuery.toLowerCase())
    ),
  })).filter(group => group.shortcuts.length > 0);

  const handlePrint = () => {
    window.print();
  };

  return (
    <>
      <div
        className="shortcuts-overlay"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={panelRef}
        className="shortcuts-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="shortcuts-title"
      >
        <div className="shortcuts-header">
          <h2 id="shortcuts-title" className="shortcuts-title">Keyboard Shortcuts</h2>
          <div className="shortcuts-actions">
            <button
              type="button"
              className="print-btn"
              onClick={handlePrint}
              title="Print shortcuts"
            >
              <Printer size={14} />
              Print
            </button>
            <button
              type="button"
              className="close-btn"
              onClick={onClose}
              aria-label="Close keyboard shortcuts"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="shortcuts-search">
          <Search size={14} className="search-icon" aria-hidden="true" />
          <input
            ref={searchRef}
            type="text"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="shortcuts-content">
          {filteredShortcuts.length === 0 ? (
            <div className="no-results">
              <p>No shortcuts found for "{searchQuery}"</p>
            </div>
          ) : (
            filteredShortcuts.map((group) => (
              <div key={group.category} className="shortcut-group">
                <h3 className="group-title">{group.category.toUpperCase()}</h3>
                <div className="shortcuts-table">
                  {group.shortcuts.map((shortcut, index) => (
                    <div key={index} className="shortcut-row">
                      <div className="shortcut-keys">
                        {shortcut.keys.map((key, keyIdx) => (
                          <span key={keyIdx}>
                            <kbd className="key">{key}</kbd>
                            {keyIdx < shortcut.keys.length - 1 && (
                              <span className="key-sep">+</span>
                            )}
                          </span>
                        ))}
                      </div>
                      <span className="shortcut-desc">{shortcut.description}</span>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        <style>{`
          .shortcuts-overlay {
            position: fixed;
            inset: 0;
            background: rgba(13, 14, 20, 0.85);
            backdrop-filter: blur(4px);
            z-index: var(--z-overlay, 300);
            animation: overlay-fade-in var(--duration-fast, 150ms) var(--ease-out, ease) both;
          }

          @keyframes overlay-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          .shortcuts-panel {
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            width: min(var(--dialog-width-lg, 680px), calc(100vw - 48px));
            max-height: var(--dialog-max-height, 85vh);
            background: var(--surface-overlay, #1A1B26);
            border: 1px solid var(--border-default, #292E44);
            border-radius: var(--radius-lg, 10px);
            z-index: var(--z-modal, 400);
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            display: flex;
            flex-direction: column;
            box-shadow: var(--shadow-xl, 0 24px 64px #000000A0, 0 8px 24px #00000080);
            animation: panel-slide-in var(--duration-slow, 300ms) cubic-bezier(0, 0, 0.2, 1) both;
          }

          @keyframes panel-slide-in {
            from {
              opacity: 0;
              transform: translate(-50%, -48%) scale(0.96);
            }
            to {
              opacity: 1;
              transform: translate(-50%, -50%) scale(1);
            }
          }

          .shortcuts-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-5, 20px) var(--space-6, 24px);
            border-bottom: 1px solid var(--border-subtle, #1E2030);
            flex-shrink: 0;
          }

          .shortcuts-title {
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            font-size: var(--text-lg, 16px);
            font-weight: var(--weight-semibold, 600);
            color: var(--text-primary, #E2E4F0);
            margin: 0;
          }

          .shortcuts-actions {
            display: flex;
            gap: var(--space-2, 8px);
            align-items: center;
          }

          .print-btn {
            display: flex;
            align-items: center;
            gap: var(--space-1, 4px);
            padding: var(--space-2, 8px) var(--space-3, 12px);
            background: transparent;
            border: 1px solid var(--border-default, #292E44);
            border-radius: var(--radius-md, 6px);
            color: var(--text-secondary, #9DA3BE);
            font-size: var(--text-sm, 12px);
            font-weight: var(--weight-medium, 500);
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            cursor: pointer;
            transition: border-color var(--duration-fast, 150ms) var(--ease-inout, ease),
                        color var(--duration-fast, 150ms) var(--ease-inout, ease),
                        background-color var(--duration-fast, 150ms) var(--ease-inout, ease);
          }

          .print-btn:hover {
            background: var(--state-hover, #FFFFFF0A);
            border-color: var(--border-strong, #3D4163);
            color: var(--text-primary, #E2E4F0);
          }

          .print-btn:focus-visible {
            outline: 2px solid var(--state-focus, #00C9A740);
            outline-offset: 2px;
          }

          .close-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 28px;
            height: 28px;
            background: transparent;
            border: none;
            color: var(--text-tertiary, #5C6080);
            cursor: pointer;
            border-radius: var(--radius-md, 6px);
            transition: color var(--duration-fast, 150ms) var(--ease-inout, ease),
                        background-color var(--duration-fast, 150ms) var(--ease-inout, ease);
          }

          .close-btn:hover {
            background: var(--state-hover, #FFFFFF0A);
            color: var(--text-primary, #E2E4F0);
          }

          .close-btn:focus-visible {
            outline: 2px solid var(--state-focus, #00C9A740);
            outline-offset: 2px;
          }

          .shortcuts-search {
            display: flex;
            align-items: center;
            gap: var(--space-3, 12px);
            padding: var(--space-3, 12px) var(--space-6, 24px);
            border-bottom: 1px solid var(--border-subtle, #1E2030);
            background: var(--surface-raised, #13141C);
            flex-shrink: 0;
          }

          .search-icon {
            color: var(--text-tertiary, #5C6080);
            flex-shrink: 0;
          }

          .shortcuts-search input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--text-secondary, #9DA3BE);
            font-size: var(--text-sm, 12px);
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            outline: none;
          }

          .shortcuts-search input::placeholder {
            color: var(--text-tertiary, #5C6080);
          }

          .shortcuts-search:focus-within {
            border-bottom-color: var(--border-accent, #00C9A7);
          }

          .shortcuts-content {
            flex: 1;
            overflow-y: auto;
            padding: var(--space-4, 16px) var(--space-6, 24px);
          }

          .shortcuts-content::-webkit-scrollbar {
            width: 8px;
          }

          .shortcuts-content::-webkit-scrollbar-track {
            background: var(--surface-float, #222435);
            border-radius: var(--radius-full, 9999px);
          }

          .shortcuts-content::-webkit-scrollbar-thumb {
            background: var(--border-strong, #3D4163);
            border-radius: var(--radius-full, 9999px);
          }

          .shortcuts-content::-webkit-scrollbar-thumb:hover {
            background: var(--text-tertiary, #5C6080);
          }

          .shortcut-group {
            margin-bottom: var(--space-8, 32px);
          }

          .shortcut-group:last-child {
            margin-bottom: 0;
          }

          .group-title {
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            font-size: var(--text-xs, 11px);
            font-weight: var(--weight-medium, 500);
            color: var(--text-tertiary, #5C6080);
            margin: 0 0 var(--space-2, 8px) 0;
            text-transform: uppercase;
            letter-spacing: var(--tracking-widest, 0.08em);
          }

          .shortcuts-table {
            display: flex;
            flex-direction: column;
            gap: var(--space-1, 4px);
          }

          .shortcut-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: var(--space-2, 8px) var(--space-3, 12px);
            background: transparent;
            border-radius: var(--radius-sm, 3px);
            transition: background-color var(--duration-fast, 150ms) var(--ease-inout, ease);
          }

          .shortcut-row:hover {
            background: var(--state-hover, #FFFFFF0A);
          }

          .shortcut-keys {
            display: flex;
            align-items: center;
            gap: var(--space-1, 4px);
            flex-shrink: 0;
            margin-right: var(--space-4, 16px);
          }

          .key {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            padding: 2px var(--space-2, 8px);
            background: var(--surface-high, #2A2D42);
            border: 1px solid var(--border-default, #292E44);
            border-radius: var(--radius-sm, 3px);
            font-size: var(--text-xs, 11px);
            font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
            color: var(--text-secondary, #9DA3BE);
            font-weight: var(--weight-medium, 500);
            min-width: 28px;
            text-align: center;
            box-shadow: 0 1px 0 var(--border-strong, #3D4163);
          }

          .key-sep {
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            font-size: var(--text-xs, 11px);
            color: var(--text-tertiary, #5C6080);
            margin: 0 1px;
          }

          .shortcut-desc {
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            font-size: var(--text-sm, 12px);
            color: var(--text-secondary, #9DA3BE);
            flex: 1;
          }

          .no-results {
            text-align: center;
            padding: var(--space-12, 48px) var(--space-6, 24px);
            color: var(--text-tertiary, #5C6080);
          }

          .no-results p {
            margin: 0;
            font-size: var(--text-sm, 12px);
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          }

          @media print {
            .shortcuts-overlay {
              display: none;
            }

            .shortcuts-panel {
              position: static;
              transform: none;
              max-width: none;
              max-height: none;
              border: none;
              box-shadow: none;
            }

            .shortcuts-header {
              border-bottom: 2px solid #000;
            }

            .shortcuts-actions {
              display: none;
            }

            .shortcuts-search {
              display: none;
            }

            .shortcut-row {
              page-break-inside: avoid;
            }
          }

          @media (prefers-reduced-motion: reduce) {
            .shortcuts-overlay,
            .shortcuts-panel {
              animation: none;
            }
          }
        `}</style>
      </div>
    </>
  );
}
