/**
 * CustomCommandDialog — create or edit a custom slash command.
 *
 * Fields:
 *   - Name (auto-generates the slug, locked in edit mode)
 *   - Scope (project / user / session)
 *   - Description (shown in command palette)
 *   - Body (Markdown instruction text sent to Claude)
 *   - Parameters (name, description, required, default)
 *   - Tags (comma-separated)
 *   - Icon (Lucide icon name)
 *
 * Validates name/slug uniqueness via `command:validate` IPC before saving.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { CustomCommand, CommandParameter } from '../../shared/types/custom-command-types';
import { slugifyCommandName } from '../../shared/types/custom-command-types';

// ── Types ──────────────────────────────────────────────────────────────────

type Scope = 'project' | 'user' | 'session';

interface SaveData {
  name: string;
  description: string;
  body: string;
  scope: Scope;
  parameters: CommandParameter[];
  tags: string[];
  icon: string;
}

interface CustomCommandDialogProps {
  isOpen: boolean;
  /** If provided, the dialog is in edit mode. */
  editingCommand: CustomCommand | null;
  /** Default scope for the "scope" dropdown in create mode. */
  defaultScope: Scope;
  onSave: (data: SaveData) => Promise<void>;
  onClose: () => void;
  /** Required for project-scope option. */
  projectDir?: string;
  /** Required for session-scope option. */
  sessionId?: string;
}

// ── Parameter row ──────────────────────────────────────────────────────────

interface ParamRowProps {
  param: CommandParameter;
  index: number;
  onChange: (index: number, updated: CommandParameter) => void;
  onRemove: (index: number) => void;
}

function ParamRow({ param, index, onChange, onRemove }: ParamRowProps) {
  const update = (field: keyof CommandParameter, value: string | boolean) =>
    onChange(index, { ...param, [field]: value });

  return (
    <div className="ccd-param-row">
      <div className="ccd-param-row-top">
        <input
          className="ccd-input ccd-param-name"
          type="text"
          placeholder="name"
          value={param.name}
          onChange={e => update('name', e.target.value.replace(/[^a-z0-9_]/g, ''))}
          spellCheck={false}
        />
        <input
          className="ccd-input ccd-param-desc"
          type="text"
          placeholder="description shown to user"
          value={param.description}
          onChange={e => update('description', e.target.value)}
        />
        <label className="ccd-param-required">
          <input
            type="checkbox"
            checked={param.required}
            onChange={e => update('required', e.target.checked)}
          />
          <span>Required</span>
        </label>
        <button className="ccd-param-remove" onClick={() => onRemove(index)} title="Remove parameter">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
          </svg>
        </button>
      </div>
      <div className="ccd-param-row-bottom">
        <span className="ccd-param-default-label">Default:</span>
        <input
          className="ccd-input ccd-param-default"
          type="text"
          placeholder="(optional default value)"
          value={param.default ?? ''}
          onChange={e => update('default', e.target.value)}
        />
        <span className="ccd-param-placeholder-hint">
          Use <code>{'{{' + param.name + '}}'}</code> in body
        </span>
      </div>
    </div>
  );
}

// ── Dialog ─────────────────────────────────────────────────────────────────

export function CustomCommandDialog({
  isOpen,
  editingCommand,
  defaultScope,
  onSave,
  onClose,
  projectDir,
  sessionId,
}: CustomCommandDialogProps) {
  const isEditing = editingCommand !== null;

  // Form state
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [scope, setScope] = useState<Scope>(defaultScope);
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [parameters, setParameters] = useState<CommandParameter[]>([]);
  const [tagsRaw, setTagsRaw] = useState('');
  const [icon, setIcon] = useState('Terminal');

  // Validation
  const [nameError, setNameError] = useState('');
  const [descError, setDescError] = useState('');
  const [bodyError, setBodyError] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showPreview, setShowPreview] = useState(false);

  const nameInputRef = useRef<HTMLInputElement>(null);

  // ── Initialize / reset on open ─────────────────────────────────────────

  useEffect(() => {
    if (!isOpen) return;

    if (editingCommand) {
      setName(editingCommand.slug); // slug is immutable in edit mode
      setSlug(editingCommand.slug);
      setScope(editingCommand.scope as Scope);
      setDescription(editingCommand.description);
      setBody(editingCommand.body);
      setParameters(editingCommand.parameters.map(p => ({ ...p })));
      setTagsRaw(editingCommand.tags.join(', '));
      setIcon(editingCommand.icon || 'Terminal');
    } else {
      setName('');
      setSlug('');
      setScope(defaultScope);
      setDescription('');
      setBody('');
      setParameters([]);
      setTagsRaw('');
      setIcon('Terminal');
    }

    setNameError('');
    setDescError('');
    setBodyError('');
    setSaveError('');
    setShowPreview(false);
    setIsSaving(false);

    // Auto-focus name on open
    setTimeout(() => nameInputRef.current?.focus(), 50);
  }, [isOpen, editingCommand, defaultScope]);

  // ── Slug derivation (create mode only) ────────────────────────────────

  const handleNameChange = useCallback((value: string) => {
    setName(value);
    setSlug(slugifyCommandName(value));
    setNameError('');
  }, []);

  // ── Validate name (debounced, create mode only) ────────────────────────

  useEffect(() => {
    if (isEditing || !slug) return;

    const timer = setTimeout(async () => {
      setIsValidating(true);
      try {
        const result = await window.electronAPI.validateCommandName(
          slug,
          scope,
          scope === 'project' ? projectDir : undefined,
        );
        if (!result.valid) {
          setNameError(result.errors.join('. '));
        } else {
          setNameError('');
        }
      } catch {
        // Non-blocking: validation failure doesn't prevent saving
      } finally {
        setIsValidating(false);
      }
    }, 400);

    return () => clearTimeout(timer);
  }, [slug, scope, isEditing, projectDir]);

  // ── Parameters ─────────────────────────────────────────────────────────

  const addParameter = useCallback(() => {
    setParameters(prev => [
      ...prev,
      { name: '', description: '', required: false, default: undefined },
    ]);
  }, []);

  const updateParameter = useCallback((index: number, updated: CommandParameter) => {
    setParameters(prev => prev.map((p, i) => (i === index ? updated : p)));
  }, []);

  const removeParameter = useCallback((index: number) => {
    setParameters(prev => prev.filter((_, i) => i !== index));
  }, []);

  // ── Body preview (resolve {{param}} placeholders) ──────────────────────

  const previewBody = body.replace(/\{\{(\w+)\}\}/g, (_m, pName) => {
    const param = parameters.find(p => p.name === pName);
    return param?.default || `<${pName}>`;
  });

  // ── Submit ─────────────────────────────────────────────────────────────

  const handleSave = useCallback(async () => {
    // Local validation
    let hasError = false;

    if (!isEditing && !slug) {
      setNameError('Command name is required');
      hasError = true;
    }
    if (!description.trim()) {
      setDescError('Description is required');
      hasError = true;
    }
    if (!body.trim()) {
      setBodyError('Body is required');
      hasError = true;
    }

    // Validate parameters
    const validParams = parameters.filter(p => p.name.trim() !== '');
    const invalidParam = validParams.find(p => !/^[a-z0-9_]+$/.test(p.name));
    if (invalidParam) {
      setSaveError(`Parameter name "${invalidParam.name}" must be lowercase letters, digits, or underscores`);
      hasError = true;
    }

    if (hasError || nameError) return;

    const tags = tagsRaw
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    setIsSaving(true);
    setSaveError('');

    try {
      await onSave({
        name: isEditing ? editingCommand!.slug : slug,
        description: description.trim(),
        body: body.trim(),
        scope,
        parameters: validParams,
        tags,
        icon,
      });
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save command');
    } finally {
      setIsSaving(false);
    }
  }, [
    isEditing,
    editingCommand,
    slug,
    description,
    body,
    scope,
    parameters,
    tagsRaw,
    icon,
    nameError,
    onSave,
  ]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onClose(); }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); handleSave(); }
    },
    [onClose, handleSave],
  );

  if (!isOpen) return null;

  return (
    <div className="ccd-overlay" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="ccd-dialog" onKeyDown={handleKeyDown}>
        {/* Header */}
        <div className="ccd-header">
          <div className="ccd-header-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 18 22 12 16 6" />
              <polyline points="8 6 2 12 8 18" />
            </svg>
            <span className="ccd-title">
              {isEditing ? `Edit /${editingCommand!.slug}` : 'New Custom Command'}
            </span>
          </div>
          <button className="ccd-close" onClick={onClose} aria-label="Close">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="ccd-body">
          {/* Name (create only) */}
          {!isEditing && (
            <div className="ccd-field">
              <label className="ccd-label">
                Name <span className="ccd-required">*</span>
              </label>
              <div className="ccd-name-row">
                <span className="ccd-name-slash">/</span>
                <input
                  ref={nameInputRef}
                  className={`ccd-input ccd-name-input ${nameError ? 'error' : ''}`}
                  type="text"
                  placeholder="my-command"
                  value={name}
                  onChange={e => handleNameChange(e.target.value)}
                  spellCheck={false}
                  autoComplete="off"
                />
                {isValidating && <div className="ccd-validating" />}
              </div>
              {slug && slug !== name && (
                <div className="ccd-slug-preview">slug: <code>/{slug}</code></div>
              )}
              {nameError && <div className="ccd-field-error">{nameError}</div>}
            </div>
          )}

          {/* Scope */}
          <div className="ccd-field">
            <label className="ccd-label">Scope</label>
            <div className="ccd-scope-options">
              <label className={`ccd-scope-option ${scope === 'user' ? 'selected' : ''}`}>
                <input
                  type="radio"
                  name="scope"
                  value="user"
                  checked={scope === 'user'}
                  onChange={() => setScope('user')}
                  disabled={isEditing}
                />
                <div>
                  <div className="ccd-scope-label">User</div>
                  <div className="ccd-scope-hint">~/.claude/commands/ · all projects</div>
                </div>
              </label>
              {projectDir && (
                <label className={`ccd-scope-option ${scope === 'project' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="scope"
                    value="project"
                    checked={scope === 'project'}
                    onChange={() => setScope('project')}
                    disabled={isEditing}
                  />
                  <div>
                    <div className="ccd-scope-label">Project</div>
                    <div className="ccd-scope-hint">.claude/commands/ · git-shareable</div>
                  </div>
                </label>
              )}
              {sessionId && (
                <label className={`ccd-scope-option ${scope === 'session' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    name="scope"
                    value="session"
                    checked={scope === 'session'}
                    onChange={() => setScope('session')}
                    disabled={isEditing}
                  />
                  <div>
                    <div className="ccd-scope-label">Session</div>
                    <div className="ccd-scope-hint">in-memory · not saved to disk</div>
                  </div>
                </label>
              )}
            </div>
          </div>

          {/* Description */}
          <div className="ccd-field">
            <label className="ccd-label">
              Description <span className="ccd-required">*</span>
            </label>
            <input
              className={`ccd-input ${descError ? 'error' : ''}`}
              type="text"
              placeholder="What does this command do?"
              value={description}
              onChange={e => { setDescription(e.target.value); setDescError(''); }}
              maxLength={200}
            />
            {descError && <div className="ccd-field-error">{descError}</div>}
          </div>

          {/* Body */}
          <div className="ccd-field ccd-body-field">
            <div className="ccd-body-header">
              <label className="ccd-label">
                Body <span className="ccd-required">*</span>
                <span className="ccd-label-hint">· Markdown instruction text sent to Claude</span>
              </label>
              <button
                className="ccd-preview-toggle"
                onClick={() => setShowPreview(v => !v)}
              >
                {showPreview ? 'Edit' : 'Preview'}
              </button>
            </div>
            {showPreview ? (
              <pre className="ccd-preview">{previewBody || <em>(empty)</em>}</pre>
            ) : (
              <textarea
                className={`ccd-textarea ${bodyError ? 'error' : ''}`}
                rows={6}
                placeholder="Describe what you want Claude to do…&#10;&#10;Use {{paramName}} to reference parameters."
                value={body}
                onChange={e => { setBody(e.target.value); setBodyError(''); }}
                spellCheck={false}
              />
            )}
            {bodyError && <div className="ccd-field-error">{bodyError}</div>}
          </div>

          {/* Parameters */}
          <div className="ccd-field">
            <div className="ccd-params-header">
              <label className="ccd-label">Parameters</label>
              <button className="ccd-btn-add-param" onClick={addParameter}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                </svg>
                Add parameter
              </button>
            </div>
            {parameters.length === 0 ? (
              <div className="ccd-params-empty">
                No parameters — command runs immediately without user input.
              </div>
            ) : (
              <div className="ccd-params-list">
                {parameters.map((p, i) => (
                  <ParamRow
                    key={i}
                    param={p}
                    index={i}
                    onChange={updateParameter}
                    onRemove={removeParameter}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Tags */}
          <div className="ccd-field">
            <label className="ccd-label">
              Tags
              <span className="ccd-label-hint"> · comma-separated, for search</span>
            </label>
            <input
              className="ccd-input"
              type="text"
              placeholder="deploy, git, testing"
              value={tagsRaw}
              onChange={e => setTagsRaw(e.target.value)}
            />
          </div>

          {/* Save error */}
          {saveError && (
            <div className="ccd-save-error">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              {saveError}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="ccd-footer">
          <button className="ccd-btn-cancel" onClick={onClose} disabled={isSaving}>
            Cancel
          </button>
          <button
            className="ccd-btn-save"
            onClick={handleSave}
            disabled={isSaving || isValidating || !!nameError}
          >
            {isSaving ? 'Saving…' : isEditing ? 'Save changes' : 'Create command'}
            {!isSaving && <kbd>Ctrl+Enter</kbd>}
          </button>
        </div>
      </div>

      <style>{dialogStyles}</style>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const dialogStyles = `
  .ccd-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0,0,0,0.55);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1100;
  }

  .ccd-dialog {
    width: 600px;
    max-width: calc(100vw - 32px);
    max-height: calc(100vh - 48px);
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: 12px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.5);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  /* Header */
  .ccd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 18px;
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .ccd-header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    color: var(--accent-primary);
  }

  .ccd-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
  }

  .ccd-close {
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    padding: 4px;
    display: flex;
    align-items: center;
    border-radius: 4px;
  }

  .ccd-close:hover { color: var(--text-secondary); background: var(--border-default); }

  /* Body */
  .ccd-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .ccd-field {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ccd-label {
    font-size: 12px;
    font-weight: 500;
    color: var(--text-secondary);
  }

  .ccd-label-hint {
    font-weight: 400;
    color: var(--text-tertiary);
  }

  .ccd-required {
    color: var(--semantic-error);
    margin-left: 2px;
  }

  .ccd-input {
    background: color-mix(in srgb, var(--surface-overlay) 80%, black);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 13px;
    font-family: inherit;
    padding: 7px 10px;
    outline: none;
    transition: border-color 0.15s;
  }

  .ccd-input:focus { border-color: var(--accent-primary); }
  .ccd-input.error { border-color: var(--semantic-error); }

  .ccd-field-error {
    font-size: 11px;
    color: var(--semantic-error);
  }

  /* Name row */
  .ccd-name-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .ccd-name-slash {
    font-size: 16px;
    font-weight: 700;
    color: var(--accent-primary);
    font-family: var(--font-mono, monospace);
    line-height: 1;
  }

  .ccd-name-input {
    flex: 1;
    font-family: var(--font-mono, monospace) !important;
  }

  .ccd-validating {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: ccd-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes ccd-spin { to { transform: rotate(360deg); } }

  .ccd-slug-preview {
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .ccd-slug-preview code {
    font-family: var(--font-mono, monospace);
    color: var(--accent-primary);
  }

  /* Scope */
  .ccd-scope-options {
    display: flex;
    gap: 8px;
  }

  .ccd-scope-option {
    flex: 1;
    display: flex;
    align-items: flex-start;
    gap: 8px;
    padding: 10px 12px;
    border: 1px solid var(--border-default);
    border-radius: 7px;
    cursor: pointer;
    transition: all 0.12s;
  }

  .ccd-scope-option input[type="radio"] { margin-top: 3px; flex-shrink: 0; accent-color: var(--accent-primary); }
  .ccd-scope-option.selected { border-color: var(--accent-primary); background: color-mix(in srgb, var(--accent-primary) 8%, transparent); }
  .ccd-scope-option:has(input:disabled) { opacity: 0.5; cursor: default; }

  .ccd-scope-label { font-size: 12px; font-weight: 600; color: var(--text-primary); }
  .ccd-scope-hint { font-size: 10.5px; color: var(--text-tertiary); margin-top: 1px; font-family: var(--font-mono, monospace); }

  /* Body field */
  .ccd-body-field { gap: 6px; }

  .ccd-body-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ccd-preview-toggle {
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: 5px;
    color: var(--text-tertiary);
    font-size: 11px;
    font-family: inherit;
    padding: 3px 8px;
    cursor: pointer;
  }

  .ccd-preview-toggle:hover { color: var(--text-secondary); }

  .ccd-textarea {
    background: color-mix(in srgb, var(--surface-overlay) 80%, black);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 13px;
    font-family: var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace);
    padding: 8px 10px;
    outline: none;
    resize: vertical;
    min-height: 100px;
    transition: border-color 0.15s;
    line-height: 1.5;
  }

  .ccd-textarea:focus { border-color: var(--accent-primary); }
  .ccd-textarea.error { border-color: var(--semantic-error); }

  .ccd-preview {
    background: color-mix(in srgb, var(--surface-overlay) 80%, black);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-tertiary);
    font-size: 12px;
    font-family: var(--font-mono, monospace);
    padding: 8px 10px;
    min-height: 80px;
    max-height: 240px;
    overflow-y: auto;
    white-space: pre-wrap;
    word-break: break-word;
    line-height: 1.5;
    margin: 0;
  }

  /* Parameters */
  .ccd-params-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .ccd-btn-add-param {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: 5px;
    color: var(--text-tertiary);
    font-size: 11px;
    font-family: inherit;
    padding: 4px 9px;
    cursor: pointer;
  }

  .ccd-btn-add-param:hover { color: var(--accent-primary); border-color: var(--accent-primary); }

  .ccd-params-empty {
    font-size: 12px;
    color: var(--text-tertiary);
    padding: 8px 0;
  }

  .ccd-params-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .ccd-param-row {
    background: color-mix(in srgb, var(--surface-overlay) 70%, black);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .ccd-param-row-top {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .ccd-param-name {
    width: 120px;
    flex-shrink: 0;
    font-family: var(--font-mono, monospace) !important;
    font-size: 12px !important;
  }

  .ccd-param-desc { flex: 1; font-size: 12px !important; }

  .ccd-param-required {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-tertiary);
    cursor: pointer;
    white-space: nowrap;
  }

  .ccd-param-required input { accent-color: var(--accent-primary); }

  .ccd-param-remove {
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    padding: 3px;
    display: flex;
    align-items: center;
    border-radius: 3px;
  }

  .ccd-param-remove:hover { color: var(--semantic-error); background: color-mix(in srgb, var(--semantic-error) 10%, transparent); }

  .ccd-param-row-bottom {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .ccd-param-default-label {
    font-size: 11px;
    color: var(--text-tertiary);
    white-space: nowrap;
  }

  .ccd-param-default { font-size: 12px !important; max-width: 160px; }

  .ccd-param-placeholder-hint {
    font-size: 10.5px;
    color: var(--text-tertiary);
    font-family: var(--font-mono, monospace);
  }

  /* Save error */
  .ccd-save-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error) 30%, transparent);
    border-radius: 6px;
    color: var(--semantic-error);
    font-size: 12px;
  }

  /* Footer */
  .ccd-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 18px;
    border-top: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .ccd-btn-cancel {
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-secondary);
    font-size: 12px;
    font-family: inherit;
    padding: 6px 14px;
    cursor: pointer;
  }

  .ccd-btn-cancel:hover { background: var(--border-default); }
  .ccd-btn-cancel:disabled { opacity: 0.5; cursor: default; }

  .ccd-btn-save {
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

  .ccd-btn-save:hover { opacity: 0.9; }
  .ccd-btn-save:disabled { opacity: 0.5; cursor: default; }

  .ccd-btn-save kbd {
    font-size: 10px;
    padding: 1px 4px;
    background: rgba(0,0,0,0.25);
    border-radius: 3px;
  }
`;
