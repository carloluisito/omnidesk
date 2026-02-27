import { useState, useRef, useEffect } from 'react';
import type { ClaudeModel } from '../../../shared/ipc-types';
import type { ProviderId } from '../../../shared/types/provider-types';

interface ModelSwitcherProps {
  currentModel: ClaudeModel | null;
  onSwitch: (model: ClaudeModel) => Promise<void>;
  disabled?: boolean;
  providerId?: ProviderId;
}

const MODELS: Array<{ id: ClaudeModel; label: string; tier: string }> = [
  { id: 'haiku', label: 'Haiku', tier: 'Fast & cheap' },
  { id: 'sonnet', label: 'Sonnet', tier: 'Balanced' },
  { id: 'opus', label: 'Opus', tier: 'Powerful' },
  { id: 'auto', label: 'Auto', tier: 'CLI default' },
];

export function ModelSwitcher({ currentModel, onSwitch, disabled, providerId }: ModelSwitcherProps) {
  // Hide when provider is not Claude (Claude-specific feature)
  if (providerId && providerId !== 'claude') return null;
  const [isOpen, setIsOpen] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const currentLabel = MODELS.find(m => m.id === currentModel)?.label || 'Unknown';

  // Close on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  async function handleSelect(model: ClaudeModel) {
    if (model === currentModel) {
      setIsOpen(false);
      return;
    }

    setIsSwitching(true);
    setIsOpen(false);

    try {
      await onSwitch(model);
      // Badge updates automatically when model detection fires
      // Reset switching state after timeout (fallback)
      setTimeout(() => setIsSwitching(false), 3000);
    } catch (error) {
      setIsSwitching(false);
      console.error('Model switch failed:', error);
    }
  }

  return (
    <div className="model-switcher" ref={dropdownRef}>
      <button
        ref={buttonRef}
        className="switcher-button"
        onClick={() => {
          if (!isOpen && buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setMenuPos({ top: rect.bottom + 4, left: rect.left });
          }
          setIsOpen(!isOpen);
        }}
        disabled={disabled || isSwitching}
      >
        <span>{currentLabel}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={isSwitching ? 'switcher-spin' : ''}
        >
          {isSwitching ? (
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          ) : (
            <polyline points="6 9 12 15 18 9" />
          )}
        </svg>
      </button>

      {isOpen && (
        <div
          className="switcher-menu"
          style={{
            position: 'fixed',
            top: menuPos.top,
            left: menuPos.left,
            zIndex: 10000,
          }}
        >
          {MODELS.map((model) => (
            <button
              key={model.id}
              type="button"
              className={`menu-option${model.id === currentModel ? ' menu-option-active' : ''}`}
              onClick={() => handleSelect(model.id)}
            >
              <span className="menu-option-label">{model.label}</span>
              <span className="menu-option-tier">{model.tier}</span>
              {model.id === currentModel && (
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="menu-option-check">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}

      <style>{`
        @keyframes switcher-spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .model-switcher {
          position: relative;
        }

        .switcher-button {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 3px var(--space-2, 8px);
          height: 22px;
          background: var(--surface-float, #222435);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          color: var(--text-secondary, #9DA3BE);
          font-size: var(--text-xs, 11px);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          cursor: pointer;
          transition:
            background-color var(--duration-fast, 150ms) var(--ease-inout, ease),
            border-color var(--duration-fast, 150ms) var(--ease-inout, ease),
            color var(--duration-fast, 150ms) var(--ease-inout, ease);
        }

        .switcher-button:hover:not(:disabled) {
          background: var(--state-hover, #FFFFFF0A);
          border-color: var(--border-strong, #3D4163);
          color: var(--text-primary, #E2E4F0);
        }

        .switcher-button:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .switcher-button:focus-visible {
          outline: 2px solid var(--state-focus, #00C9A740);
          outline-offset: 2px;
        }

        .switcher-spin {
          animation: switcher-spin 1s linear infinite;
        }

        .switcher-menu {
          min-width: 180px;
          background: var(--surface-float, #222435);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          box-shadow: var(--shadow-lg, 0 12px 32px #00000080);
          overflow: hidden;
          padding: var(--space-1, 4px);
        }

        .menu-option {
          display: flex;
          align-items: center;
          gap: var(--space-2, 8px);
          padding: var(--space-2, 8px) var(--space-3, 12px);
          width: 100%;
          background: transparent;
          border: none;
          border-radius: var(--radius-sm, 3px);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          font-size: var(--text-sm, 12px);
          color: var(--text-secondary, #9DA3BE);
          text-align: left;
          cursor: pointer;
          transition: background-color var(--duration-fast, 150ms) var(--ease-inout, ease),
                      color var(--duration-fast, 150ms) var(--ease-inout, ease);
        }

        .menu-option:hover {
          background: var(--state-hover, #FFFFFF0A);
          color: var(--text-primary, #E2E4F0);
        }

        .menu-option-active {
          background: var(--accent-primary-muted, #00C9A714);
          color: var(--text-accent, #00C9A7);
        }

        .menu-option-active:hover {
          background: var(--accent-primary-muted, #00C9A714);
          color: var(--text-accent, #00C9A7);
        }

        .menu-option-label {
          flex: 1;
          font-weight: var(--weight-semibold, 600);
        }

        .menu-option-tier {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
        }

        .menu-option-active .menu-option-tier {
          color: var(--text-accent, #00C9A7);
          opacity: 0.7;
        }

        .menu-option-check {
          color: var(--text-accent, #00C9A7);
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}
