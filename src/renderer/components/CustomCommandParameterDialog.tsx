/**
 * CustomCommandParameterDialog — fill in parameters before invoking a custom command.
 *
 * When a command with required parameters is selected from the command palette,
 * this dialog collects the values. The resolved body text is then injected into
 * the terminal session as plain text (same mechanism as Prompt Templates).
 *
 * Usage:
 *   <CustomCommandParameterDialog
 *     isOpen={isOpen}
 *     command={selectedCommand}
 *     onInvoke={(resolvedBody) => sendToTerminal(resolvedBody)}
 *     onCancel={() => setOpen(false)}
 *   />
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CustomCommand, CommandParameter } from '../../shared/types/custom-command-types';

interface CustomCommandParameterDialogProps {
  isOpen: boolean;
  /** The command to invoke. */
  command: CustomCommand | null;
  /** Called with the resolved body text ({{param}} placeholders substituted). */
  onInvoke: (resolvedBody: string) => void;
  onCancel: () => void;
}

// ── Parameter resolution ───────────────────────────────────────────────────

function resolveBody(body: string, values: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_m, name) => values[name] ?? `{{${name}}}`);
}

// ── Dialog ─────────────────────────────────────────────────────────────────

export function CustomCommandParameterDialog({
  isOpen,
  command,
  onInvoke,
  onCancel,
}: CustomCommandParameterDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);

  // Reset form when command changes or dialog opens
  useEffect(() => {
    if (!isOpen || !command) return;

    const defaults: Record<string, string> = {};
    for (const p of command.parameters) {
      defaults[p.name] = p.default ?? '';
    }
    setValues(defaults);
    setErrors({});
    setShowPreview(false);

    // Focus first input
    setTimeout(() => firstInputRef.current?.focus(), 60);
  }, [isOpen, command]);

  const setValue = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    if (!command) return false;
    const newErrors: Record<string, string> = {};
    for (const p of command.parameters) {
      if (p.required && !values[p.name]?.trim()) {
        newErrors[p.name] = `${p.name} is required`;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [command, values]);

  const handleInvoke = useCallback(() => {
    if (!command || !validate()) return;
    const resolved = resolveBody(command.body, values);
    onInvoke(resolved);
  }, [command, values, validate, onInvoke]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onCancel(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleInvoke(); }
    },
    [onCancel, handleInvoke],
  );

  if (!isOpen || !command) return null;

  // Commands with no parameters should be invoked directly without this dialog
  const params = command.parameters;
  const resolvedPreview = resolveBody(command.body, values);

  return (
    <div className="ccpd-overlay" onClick={e => e.target === e.currentTarget && onCancel()}>
      <div className="ccpd-dialog" onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="ccpd-header">
          <div className="ccpd-header-icon">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
          </div>
          <div>
            <div className="ccpd-title">/{command.slug}</div>
            {command.description && (
              <div className="ccpd-subtitle">{command.description}</div>
            )}
          </div>
        </div>

        {/* Parameters */}
        {params.length > 0 && (
          <div className="ccpd-body">
            {params.map((param, index) => (
              <ParameterField
                key={param.name}
                param={param}
                value={values[param.name] ?? ''}
                error={errors[param.name]}
                inputRef={index === 0 ? firstInputRef : undefined}
                onChange={val => setValue(param.name, val)}
              />
            ))}
          </div>
        )}

        {/* Preview toggle */}
        <div className="ccpd-preview-toggle-row">
          <button
            className="ccpd-preview-btn"
            onClick={() => setShowPreview(v => !v)}
          >
            {showPreview ? 'Hide' : 'Show'} preview
          </button>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="ccpd-preview-wrap">
            <pre className="ccpd-preview">{resolvedPreview}</pre>
          </div>
        )}

        {/* Footer */}
        <div className="ccpd-footer">
          <button className="ccpd-cancel" onClick={onCancel}>Cancel</button>
          <button className="ccpd-invoke" onClick={handleInvoke}>
            Run command
            <kbd>Ctrl+Enter</kbd>
          </button>
        </div>
      </div>

      <style>{dialogStyles}</style>
    </div>
  );
}

// ── Parameter field ────────────────────────────────────────────────────────

interface ParameterFieldProps {
  param: CommandParameter;
  value: string;
  error?: string;
  inputRef?: React.RefObject<HTMLInputElement>;
  onChange: (value: string) => void;
}

function ParameterField({ param, value, error, inputRef, onChange }: ParameterFieldProps) {
  return (
    <div className="ccpd-field">
      <label className="ccpd-label">
        {param.name}
        {param.required && <span className="ccpd-required"> *</span>}
        {param.description && (
          <span className="ccpd-label-hint"> — {param.description}</span>
        )}
      </label>
      <input
        ref={inputRef}
        className={`ccpd-input ${error ? 'error' : ''}`}
        type="text"
        value={value}
        placeholder={param.default ?? `Enter ${param.name}…`}
        onChange={e => onChange(e.target.value)}
        spellCheck={false}
      />
      {error && <div className="ccpd-field-error">{error}</div>}
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const dialogStyles = `
  .ccpd-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1200;
  }

  .ccpd-dialog {
    width: 480px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 64px);
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: 12px;
    box-shadow: 0 16px 48px rgba(0,0,0,0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  /* Header */
  .ccpd-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .ccpd-header-icon {
    color: var(--accent-primary);
    margin-top: 2px;
    flex-shrink: 0;
  }

  .ccpd-title {
    font-size: 14px;
    font-weight: 700;
    color: var(--text-primary);
    font-family: var(--font-mono, monospace);
  }

  .ccpd-subtitle {
    font-size: 12px;
    color: var(--text-tertiary);
    margin-top: 2px;
  }

  /* Body */
  .ccpd-body {
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    overflow-y: auto;
    flex-shrink: 0;
  }

  .ccpd-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .ccpd-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .ccpd-label-hint {
    font-weight: 400;
    color: var(--text-tertiary);
  }

  .ccpd-required {
    color: var(--semantic-error);
  }

  .ccpd-input {
    background: color-mix(in srgb, var(--surface-overlay) 70%, black);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    padding: 7px 10px;
    outline: none;
    transition: border-color 0.15s;
  }

  .ccpd-input:focus { border-color: var(--accent-primary); }
  .ccpd-input.error { border-color: var(--semantic-error); }

  .ccpd-field-error {
    font-size: 11px;
    color: var(--semantic-error);
  }

  /* Preview */
  .ccpd-preview-toggle-row {
    padding: 4px 18px 8px;
    flex-shrink: 0;
  }

  .ccpd-preview-btn {
    background: transparent;
    border: none;
    color: var(--accent-primary);
    font-size: 12px;
    font-family: inherit;
    cursor: pointer;
    padding: 2px 0;
  }

  .ccpd-preview-btn:hover { text-decoration: underline; }

  .ccpd-preview-wrap {
    margin: 0 18px 12px;
    border: 1px solid var(--border-default);
    border-radius: 7px;
    overflow: hidden;
    flex-shrink: 0;
    max-height: 200px;
    overflow-y: auto;
  }

  .ccpd-preview {
    font-size: 11.5px;
    font-family: var(--font-mono, monospace);
    color: var(--text-tertiary);
    white-space: pre-wrap;
    word-break: break-word;
    padding: 10px 12px;
    margin: 0;
    line-height: 1.5;
  }

  /* Footer */
  .ccpd-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .ccpd-cancel {
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    font-family: inherit;
    padding: 6px 14px;
    cursor: pointer;
  }

  .ccpd-cancel:hover { background: var(--border-default); }

  .ccpd-invoke {
    display: flex;
    align-items: center;
    gap: 8px;
    background: var(--accent-primary);
    border: none;
    border-radius: 6px;
    color: var(--surface-overlay, #0d0e14);
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    padding: 6px 14px;
    cursor: pointer;
  }

  .ccpd-invoke:hover { opacity: 0.9; }

  .ccpd-invoke kbd {
    font-size: 10px;
    padding: 1px 4px;
    background: rgba(0,0,0,0.25);
    border-radius: 3px;
  }
`;
