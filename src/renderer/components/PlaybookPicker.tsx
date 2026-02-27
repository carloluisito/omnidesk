import { useState, useEffect, useRef, useMemo } from 'react';
import type { Playbook } from '../../shared/types/playbook-types';

interface PlaybookPickerProps {
  isOpen: boolean;
  playbooks: Playbook[];
  onSelect: (playbook: Playbook) => void;
  onClose: () => void;
  onManagePlaybooks: () => void;
}

export function PlaybookPicker({ isOpen, playbooks, onSelect, onClose, onManagePlaybooks }: PlaybookPickerProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Fuzzy filter
  const filtered = useMemo(() => {
    if (!query.trim()) return playbooks;
    const q = query.toLowerCase();
    return playbooks.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q) ||
      p.keywords.some(k => k.includes(q))
    );
  }, [playbooks, query]);

  // Clamp selection
  useEffect(() => {
    if (selectedIndex >= filtered.length) {
      setSelectedIndex(Math.max(0, filtered.length - 1));
    }
  }, [filtered.length, selectedIndex]);

  // Scroll into view
  useEffect(() => {
    const item = listRef.current?.children[selectedIndex] as HTMLElement;
    item?.scrollIntoView({ block: 'nearest' });
  }, [selectedIndex]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, filtered.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (filtered[selectedIndex]) {
          onSelect(filtered[selectedIndex]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
    }
  };

  if (!isOpen) return null;

  return (
    <div className="playbook-picker-overlay" onClick={onClose}>
      <div className="playbook-picker" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="playbook-picker-search">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary, #5C6080)" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            placeholder="Search playbooks..."
            value={query}
            onChange={e => { setQuery(e.target.value); setSelectedIndex(0); }}
          />
        </div>

        <div className="playbook-picker-list" ref={listRef}>
          {filtered.length === 0 ? (
            <div className="playbook-picker-empty">No playbooks found</div>
          ) : (
            filtered.map((playbook, index) => (
              <div
                key={playbook.id}
                className={`playbook-picker-item ${index === selectedIndex ? 'selected' : ''}`}
                onClick={() => onSelect(playbook)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <span className="playbook-picker-icon">{playbook.icon}</span>
                <div className="playbook-picker-info">
                  <div className="playbook-picker-name">
                    {playbook.name}
                    <span className={`playbook-picker-badge ${playbook.type}`}>
                      {playbook.type === 'built-in' ? 'Built-in' : 'Custom'}
                    </span>
                  </div>
                  <div className="playbook-picker-desc">{playbook.description}</div>
                </div>
                <div className="playbook-picker-meta">
                  <span className="playbook-picker-category">{playbook.category}</span>
                  <span className="playbook-picker-steps">{playbook.steps.length} steps</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="playbook-picker-footer">
          <button className="playbook-picker-manage" onClick={() => { onClose(); onManagePlaybooks(); }}>
            Manage Playbooks
          </button>
          <span className="playbook-picker-hint">
            <kbd>&uarr;</kbd><kbd>&darr;</kbd> navigate <kbd>Enter</kbd> select <kbd>Esc</kbd> close
          </span>
        </div>
      </div>

      <style>{pickerStyles}</style>
    </div>
  );
}

const pickerStyles = `
  .playbook-picker-overlay {
    position: fixed;
    inset: 0;
    background: rgba(13, 14, 20, 0.7);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: flex-start;
    justify-content: center;
    padding-top: 15vh;
    z-index: 1000;
  }

  .playbook-picker {
    width: 560px;
    max-height: 480px;
    background: var(--surface-overlay, #1A1B26);
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-lg, 10px);
    box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .playbook-picker-search {
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
    padding: var(--space-3, 12px) var(--space-4, 16px);
    border-bottom: 1px solid var(--border-subtle, #1E2030);
  }

  .playbook-picker-search input {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: var(--text-primary, #E2E4F0);
    font-size: var(--text-sm, 12px);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .playbook-picker-search input::placeholder {
    color: var(--text-tertiary, #5C6080);
  }

  .playbook-picker-list {
    flex: 1;
    overflow-y: auto;
    padding: 4px;
  }

  .playbook-picker-empty {
    padding: 24px;
    text-align: center;
    color: var(--text-tertiary, #5C6080);
    font-size: var(--text-sm, 12px);
  }

  .playbook-picker-item {
    display: flex;
    align-items: center;
    gap: var(--space-3, 12px);
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: background var(--duration-fast, 150ms) ease;
  }

  .playbook-picker-item:hover,
  .playbook-picker-item.selected {
    background: var(--state-hover, #FFFFFF0A);
  }

  .playbook-picker-icon {
    font-size: 20px;
    width: 32px;
    text-align: center;
    flex-shrink: 0;
  }

  .playbook-picker-info {
    flex: 1;
    min-width: 0;
  }

  .playbook-picker-name {
    color: var(--text-primary, #E2E4F0);
    font-size: var(--text-sm, 12px);
    font-weight: var(--weight-medium, 500);
    display: flex;
    align-items: center;
    gap: var(--space-2, 8px);
  }

  .playbook-picker-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-sm, 3px);
    font-weight: 400;
  }

  .playbook-picker-badge.built-in {
    background: var(--accent-primary-muted, #00C9A714);
    color: var(--text-accent, #00C9A7);
  }

  .playbook-picker-badge.user {
    background: rgba(61, 214, 140, 0.1);
    color: var(--semantic-success, #3DD68C);
  }

  .playbook-picker-desc {
    color: var(--text-tertiary, #5C6080);
    font-size: var(--text-xs, 11px);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    margin-top: 2px;
  }

  .playbook-picker-meta {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 2px;
    flex-shrink: 0;
  }

  .playbook-picker-category {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: var(--radius-sm, 3px);
    background: var(--surface-high, #2A2C3D);
    color: var(--text-secondary, #9DA3BE);
  }

  .playbook-picker-steps {
    font-size: 10px;
    color: var(--text-tertiary, #5C6080);
  }

  .playbook-picker-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: var(--space-2, 8px) var(--space-3, 12px);
    border-top: 1px solid var(--border-subtle, #1E2030);
  }

  .playbook-picker-manage {
    background: transparent;
    border: none;
    color: var(--text-accent, #00C9A7);
    font-size: var(--text-xs, 11px);
    cursor: pointer;
    padding: 4px var(--space-2, 8px);
    border-radius: var(--radius-sm, 3px);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    transition: background var(--duration-fast, 150ms) ease;
  }

  .playbook-picker-manage:hover {
    background: var(--accent-primary-muted, #00C9A714);
  }

  .playbook-picker-hint {
    color: var(--text-tertiary, #5C6080);
    font-size: var(--text-xs, 11px);
  }

  .playbook-picker-hint kbd {
    display: inline-block;
    padding: 1px 4px;
    background: var(--surface-high, #2A2C3D);
    border-radius: var(--radius-sm, 3px);
    font-size: 10px;
    margin: 0 2px;
    color: var(--text-secondary, #9DA3BE);
    font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
  }
`;
