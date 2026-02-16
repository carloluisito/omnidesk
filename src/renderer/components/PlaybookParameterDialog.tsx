import { useState, useEffect, useCallback, useRef } from 'react';
import type { Playbook, PlaybookVariable } from '../../shared/types/playbook-types';

interface PlaybookParameterDialogProps {
  isOpen: boolean;
  playbook: Playbook | null;
  onRun: (playbook: Playbook, variables: Record<string, string>) => void;
  onCancel: () => void;
}

export function PlaybookParameterDialog({ isOpen, playbook, onRun, onCancel }: PlaybookParameterDialogProps) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showPreview, setShowPreview] = useState(false);
  const firstInputRef = useRef<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(null);

  // Reset on open
  useEffect(() => {
    if (isOpen && playbook) {
      const defaults: Record<string, string> = {};
      for (const v of playbook.variables) {
        defaults[v.name] = v.default || '';
      }
      setValues(defaults);
      setErrors({});
      setShowPreview(false);
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [isOpen, playbook]);

  const setValue = useCallback((name: string, value: string) => {
    setValues(prev => ({ ...prev, [name]: value }));
    setErrors(prev => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const validate = useCallback((): boolean => {
    if (!playbook) return false;
    const newErrors: Record<string, string> = {};
    for (const v of playbook.variables) {
      if (v.required && !values[v.name]?.trim()) {
        newErrors[v.name] = `${v.label} is required`;
      }
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  }, [playbook, values]);

  const handleRun = useCallback(() => {
    if (!playbook) return;
    if (validate()) {
      onRun(playbook, values);
    }
  }, [playbook, values, validate, onRun]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancel();
    }
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handleRun();
    }
  }, [onCancel, handleRun]);

  const handleBrowse = useCallback(async (name: string) => {
    try {
      const dir = await window.electronAPI.browseDirectory();
      if (dir) {
        setValue(name, dir);
      }
    } catch (err) {
      console.error('Failed to browse:', err);
    }
  }, [setValue]);

  if (!isOpen || !playbook) return null;

  const renderField = (variable: PlaybookVariable, index: number) => {
    const isFirst = index === 0;
    const hasError = !!errors[variable.name];

    switch (variable.type) {
      case 'multiline':
        return (
          <div key={variable.name} className="pb-param-field">
            <label className="pb-param-label">
              {variable.label}
              {variable.required && <span className="pb-param-required">*</span>}
            </label>
            <textarea
              ref={isFirst ? firstInputRef as any : undefined}
              className={`pb-param-textarea ${hasError ? 'error' : ''}`}
              value={values[variable.name] || ''}
              onChange={e => setValue(variable.name, e.target.value)}
              placeholder={variable.placeholder}
              rows={3}
            />
            {hasError && <div className="pb-param-error">{errors[variable.name]}</div>}
          </div>
        );

      case 'select':
        return (
          <div key={variable.name} className="pb-param-field">
            <label className="pb-param-label">
              {variable.label}
              {variable.required && <span className="pb-param-required">*</span>}
            </label>
            <select
              ref={isFirst ? firstInputRef as any : undefined}
              className={`pb-param-select ${hasError ? 'error' : ''}`}
              value={values[variable.name] || ''}
              onChange={e => setValue(variable.name, e.target.value)}
            >
              <option value="">Select...</option>
              {variable.options?.map(opt => (
                <option key={opt} value={opt}>{opt}</option>
              ))}
            </select>
            {hasError && <div className="pb-param-error">{errors[variable.name]}</div>}
          </div>
        );

      case 'filepath':
        return (
          <div key={variable.name} className="pb-param-field">
            <label className="pb-param-label">
              {variable.label}
              {variable.required && <span className="pb-param-required">*</span>}
            </label>
            <div className="pb-param-filepath">
              <input
                ref={isFirst ? firstInputRef as any : undefined}
                className={`pb-param-input ${hasError ? 'error' : ''}`}
                type="text"
                value={values[variable.name] || ''}
                onChange={e => setValue(variable.name, e.target.value)}
                placeholder={variable.placeholder}
              />
              <button className="pb-param-browse" onClick={() => handleBrowse(variable.name)}>
                Browse
              </button>
            </div>
            {hasError && <div className="pb-param-error">{errors[variable.name]}</div>}
          </div>
        );

      default: // text
        return (
          <div key={variable.name} className="pb-param-field">
            <label className="pb-param-label">
              {variable.label}
              {variable.required && <span className="pb-param-required">*</span>}
            </label>
            <input
              ref={isFirst ? firstInputRef as any : undefined}
              className={`pb-param-input ${hasError ? 'error' : ''}`}
              type="text"
              value={values[variable.name] || ''}
              onChange={e => setValue(variable.name, e.target.value)}
              placeholder={variable.placeholder}
            />
            {hasError && <div className="pb-param-error">{errors[variable.name]}</div>}
          </div>
        );
    }
  };

  // Preview: resolve variables in step prompts
  const previewSteps = playbook.steps.map(step => ({
    ...step,
    resolvedPrompt: step.prompt.replace(/\{\{(\w+)\}\}/g, (_m, name) => values[name] || `{{${name}}}`),
  }));

  return (
    <div className="pb-param-overlay" onClick={onCancel}>
      <div className="pb-param-dialog" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="pb-param-header">
          <span className="pb-param-icon">{playbook.icon}</span>
          <div>
            <div className="pb-param-title">{playbook.name}</div>
            <div className="pb-param-subtitle">{playbook.description}</div>
          </div>
        </div>

        <div className="pb-param-body">
          {playbook.variables.map((v, i) => renderField(v, i))}
        </div>

        <div className="pb-param-preview-toggle">
          <button className="pb-param-preview-btn" onClick={() => setShowPreview(!showPreview)}>
            {showPreview ? 'Hide' : 'Show'} Step Preview ({playbook.steps.length} steps)
          </button>
        </div>

        {showPreview && (
          <div className="pb-param-preview">
            {previewSteps.map((step, i) => (
              <div key={step.id} className="pb-param-preview-step">
                <div className="pb-param-preview-step-header">
                  <span className="pb-param-preview-step-num">{i + 1}</span>
                  <span className="pb-param-preview-step-name">{step.name}</span>
                  {step.requireConfirmation && (
                    <span className="pb-param-preview-gate">Confirmation Gate</span>
                  )}
                </div>
                <pre className="pb-param-preview-prompt">{step.resolvedPrompt}</pre>
              </div>
            ))}
          </div>
        )}

        <div className="pb-param-footer">
          <button className="pb-param-cancel" onClick={onCancel}>Cancel</button>
          <button className="pb-param-run" onClick={handleRun}>
            Run Playbook
            <kbd>Ctrl+Enter</kbd>
          </button>
        </div>
      </div>

      <style>{dialogStyles}</style>
    </div>
  );
}

const dialogStyles = `
  .pb-param-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1001;
  }

  .pb-param-dialog {
    width: 520px;
    max-height: 80vh;
    background: #1f2335;
    border: 1px solid #292e42;
    border-radius: 12px;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.4);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .pb-param-header {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 16px 20px;
    border-bottom: 1px solid #292e42;
  }

  .pb-param-icon {
    font-size: 24px;
  }

  .pb-param-title {
    color: #c0caf5;
    font-size: 15px;
    font-weight: 600;
  }

  .pb-param-subtitle {
    color: #565f89;
    font-size: 12px;
    margin-top: 2px;
  }

  .pb-param-body {
    padding: 16px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .pb-param-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .pb-param-label {
    color: #a9b1d6;
    font-size: 12px;
    font-weight: 500;
  }

  .pb-param-required {
    color: #f7768e;
    margin-left: 2px;
  }

  .pb-param-input,
  .pb-param-textarea,
  .pb-param-select {
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #c0caf5;
    font-size: 13px;
    font-family: 'JetBrains Mono', monospace;
    padding: 8px 10px;
    outline: none;
    transition: border-color 0.15s;
  }

  .pb-param-input:focus,
  .pb-param-textarea:focus,
  .pb-param-select:focus {
    border-color: #7aa2f7;
  }

  .pb-param-input.error,
  .pb-param-textarea.error,
  .pb-param-select.error {
    border-color: #f7768e;
  }

  .pb-param-textarea {
    resize: vertical;
    min-height: 60px;
  }

  .pb-param-select option {
    background: #1a1b26;
    color: #c0caf5;
  }

  .pb-param-filepath {
    display: flex;
    gap: 8px;
  }

  .pb-param-filepath .pb-param-input {
    flex: 1;
  }

  .pb-param-browse {
    background: #292e42;
    border: 1px solid #3b4261;
    border-radius: 6px;
    color: #a9b1d6;
    font-size: 12px;
    padding: 0 12px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-param-browse:hover {
    background: #3b4261;
  }

  .pb-param-error {
    color: #f7768e;
    font-size: 11px;
  }

  .pb-param-preview-toggle {
    padding: 0 20px 8px;
  }

  .pb-param-preview-btn {
    background: transparent;
    border: none;
    color: #7aa2f7;
    font-size: 12px;
    cursor: pointer;
    padding: 4px 0;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-param-preview-btn:hover {
    text-decoration: underline;
  }

  .pb-param-preview {
    max-height: 200px;
    overflow-y: auto;
    margin: 0 20px 12px;
    border: 1px solid #292e42;
    border-radius: 8px;
    background: #1a1b26;
  }

  .pb-param-preview-step {
    padding: 8px 12px;
    border-bottom: 1px solid #292e42;
  }

  .pb-param-preview-step:last-child {
    border-bottom: none;
  }

  .pb-param-preview-step-header {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
  }

  .pb-param-preview-step-num {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #292e42;
    color: #7aa2f7;
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pb-param-preview-step-name {
    color: #a9b1d6;
    font-size: 12px;
    font-weight: 500;
  }

  .pb-param-preview-gate {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(224, 175, 104, 0.15);
    color: #e0af68;
  }

  .pb-param-preview-prompt {
    color: #565f89;
    font-size: 11px;
    white-space: pre-wrap;
    word-break: break-word;
    margin: 0;
    max-height: 60px;
    overflow: hidden;
  }

  .pb-param-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid #292e42;
  }

  .pb-param-cancel {
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #a9b1d6;
    font-size: 12px;
    padding: 6px 14px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-param-cancel:hover {
    background: #292e42;
  }

  .pb-param-run {
    background: #7aa2f7;
    border: none;
    border-radius: 6px;
    color: #1a1b26;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    cursor: pointer;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-param-run:hover {
    background: #89b4fa;
  }

  .pb-param-run kbd {
    font-size: 10px;
    padding: 1px 4px;
    background: rgba(26, 27, 38, 0.3);
    border-radius: 3px;
  }
`;
