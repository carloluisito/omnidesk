import { useState } from 'react';

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
      <div className="shortcuts-overlay" onClick={onClose} />
      <div className="shortcuts-panel">
        <div className="shortcuts-header">
          <h2 className="shortcuts-title">Keyboard Shortcuts</h2>
          <div className="shortcuts-actions">
            <button className="print-btn" onClick={handlePrint} title="Print shortcuts">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 6 2 18 2 18 9" />
                <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" />
                <rect x="6" y="14" width="12" height="8" />
              </svg>
              Print
            </button>
            <button className="close-btn" onClick={onClose} aria-label="Close">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        </div>

        <div className="shortcuts-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            type="text"
            placeholder="Search shortcuts..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            autoFocus
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
                <h3 className="group-title">{group.category}</h3>
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
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(26, 27, 38, 0.8);
            backdrop-filter: blur(4px);
            z-index: 998;
            animation: overlay-fade-in 0.2s ease;
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
            width: 90%;
            max-width: 800px;
            max-height: 85vh;
            background: #1a1b26;
            border: 2px solid #3d4458;
            border-radius: 12px;
            z-index: 999;
            font-family: 'JetBrains Mono', monospace;
            display: flex;
            flex-direction: column;
            box-shadow: 0 24px 96px rgba(0, 0, 0, 0.6);
            animation: panel-slide-in 0.3s cubic-bezier(0, 0, 0.2, 1);
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
            padding: 24px;
            border-bottom: 1px solid #3d4458;
            flex-shrink: 0;
          }

          .shortcuts-title {
            font-size: 20px;
            font-weight: 600;
            color: #e9e9ea;
            margin: 0;
          }

          .shortcuts-actions {
            display: flex;
            gap: 12px;
          }

          .print-btn {
            display: flex;
            align-items: center;
            gap: 6px;
            padding: 8px 16px;
            background: #24283b;
            border: 1px solid #3d4458;
            border-radius: 6px;
            color: #a9b1d6;
            font-size: 12px;
            font-weight: 500;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .print-btn:hover {
            background: #292e42;
            border-color: #7aa2f7;
            color: #7aa2f7;
          }

          .close-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: transparent;
            border: none;
            color: #a9b1d6;
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s ease;
          }

          .close-btn:hover {
            background: #24283b;
            color: #f7768e;
          }

          .shortcuts-search {
            display: flex;
            align-items: center;
            gap: 12px;
            padding: 16px 24px;
            border-bottom: 1px solid #3d4458;
            background: #1f2335;
            flex-shrink: 0;
          }

          .shortcuts-search svg {
            color: #565f89;
            flex-shrink: 0;
          }

          .shortcuts-search input {
            flex: 1;
            background: transparent;
            border: none;
            color: #e9e9ea;
            font-size: 14px;
            font-family: inherit;
            outline: none;
          }

          .shortcuts-search input::placeholder {
            color: #565f89;
          }

          .shortcuts-content {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
          }

          .shortcuts-content::-webkit-scrollbar {
            width: 10px;
          }

          .shortcuts-content::-webkit-scrollbar-track {
            background: #1f2335;
          }

          .shortcuts-content::-webkit-scrollbar-thumb {
            background: #3d4458;
            border-radius: 5px;
          }

          .shortcuts-content::-webkit-scrollbar-thumb:hover {
            background: #565f89;
          }

          .shortcut-group {
            margin-bottom: 32px;
          }

          .shortcut-group:last-child {
            margin-bottom: 0;
          }

          .group-title {
            font-size: 14px;
            font-weight: 600;
            color: #7aa2f7;
            margin: 0 0 16px 0;
            text-transform: uppercase;
            letter-spacing: 0.5px;
          }

          .shortcuts-table {
            display: flex;
            flex-direction: column;
            gap: 12px;
          }

          .shortcut-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 12px 16px;
            background: #1f2335;
            border: 1px solid #3d4458;
            border-radius: 8px;
            transition: all 0.2s ease;
          }

          .shortcut-row:hover {
            border-color: #7aa2f7;
            transform: translateX(4px);
          }

          .shortcut-keys {
            display: flex;
            align-items: center;
            gap: 6px;
          }

          .key {
            display: inline-block;
            padding: 4px 10px;
            background: #24283b;
            border: 1px solid #3d4458;
            border-radius: 4px;
            font-size: 12px;
            font-family: inherit;
            color: #e9e9ea;
            font-weight: 500;
            box-shadow: 0 2px 0 #3d4458;
            min-width: 32px;
            text-align: center;
          }

          .key-sep {
            font-size: 12px;
            color: #565f89;
            margin: 0 2px;
          }

          .shortcut-desc {
            font-size: 13px;
            color: #a9b1d6;
          }

          .no-results {
            text-align: center;
            padding: 48px 24px;
            color: #565f89;
          }

          .no-results p {
            margin: 0;
            font-size: 14px;
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
        `}</style>
      </div>
    </>
  );
}
