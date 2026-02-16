import { useState, useEffect, useCallback } from 'react';
import type {
  Playbook,
  PlaybookVariable,
  PlaybookVariableType,
  PlaybookCreateRequest,
  PlaybookUpdateRequest,
} from '../../shared/types/playbook-types';

interface PlaybookEditorProps {
  isOpen: boolean;
  playbook: Playbook | null; // null = create mode
  onSave: (request: PlaybookCreateRequest | PlaybookUpdateRequest) => Promise<void>;
  onClose: () => void;
}

interface StepDraft {
  name: string;
  prompt: string;
  requireConfirmation: boolean;
  timeoutMs?: number;
  silenceThresholdMs?: number;
}

interface VarDraft {
  name: string;
  label: string;
  type: PlaybookVariableType;
  required: boolean;
  default: string;
  options: string;
  placeholder: string;
}

const EMPTY_STEP: StepDraft = { name: '', prompt: '', requireConfirmation: false };
const EMPTY_VAR: VarDraft = { name: '', label: '', type: 'text', required: true, default: '', options: '', placeholder: '' };

const CATEGORIES = ['Backend', 'Frontend', 'Debugging', 'Quality', 'Refactoring', 'DevOps', 'Testing', 'Custom'];
const ICONS = ['\u{1F4CB}', '\u{1F310}', '\u{1F41B}', '\u{1F50D}', '\u{1F9E9}', '\u{1F504}', '\u{1F6E0}', '\u{2699}', '\u{1F680}', '\u{1F4A1}', '\u{1F50C}', '\u{1F3AF}'];

export function PlaybookEditor({ isOpen, playbook, onSave, onClose }: PlaybookEditorProps) {
  const [activeTab, setActiveTab] = useState<'details' | 'params' | 'steps'>('details');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [icon, setIcon] = useState('\u{1F4CB}');
  const [category, setCategory] = useState('Custom');
  const [keywords, setKeywords] = useState('');
  const [steps, setSteps] = useState<StepDraft[]>([{ ...EMPTY_STEP }]);
  const [variables, setVariables] = useState<VarDraft[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const isEdit = !!playbook;

  // Initialize from playbook
  useEffect(() => {
    if (isOpen) {
      if (playbook) {
        setName(playbook.name);
        setDescription(playbook.description);
        setIcon(playbook.icon);
        setCategory(playbook.category);
        setKeywords(playbook.keywords.join(', '));
        setSteps(playbook.steps.map(s => ({
          name: s.name,
          prompt: s.prompt,
          requireConfirmation: s.requireConfirmation,
          timeoutMs: s.timeoutMs,
          silenceThresholdMs: s.silenceThresholdMs,
        })));
        setVariables(playbook.variables.map(v => ({
          name: v.name,
          label: v.label,
          type: v.type,
          required: v.required,
          default: v.default || '',
          options: v.options?.join(', ') || '',
          placeholder: v.placeholder || '',
        })));
      } else {
        setName('');
        setDescription('');
        setIcon('\u{1F4CB}');
        setCategory('Custom');
        setKeywords('');
        setSteps([{ ...EMPTY_STEP }]);
        setVariables([]);
      }
      setActiveTab('details');
      setErrors([]);
    }
  }, [isOpen, playbook]);

  const validate = useCallback((): string[] => {
    const errs: string[] = [];
    if (!name.trim()) errs.push('Name is required');
    if (steps.length === 0) errs.push('At least one step is required');
    for (let i = 0; i < steps.length; i++) {
      if (!steps[i].name.trim()) errs.push(`Step ${i + 1}: name is required`);
      if (!steps[i].prompt.trim()) errs.push(`Step ${i + 1}: prompt is required`);
    }
    const varNames = new Set<string>();
    for (let i = 0; i < variables.length; i++) {
      const v = variables[i];
      if (!v.name.trim()) errs.push(`Parameter ${i + 1}: name is required`);
      else if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.name)) errs.push(`Parameter "${v.name}": must be alphanumeric + underscore`);
      if (!v.label.trim()) errs.push(`Parameter ${i + 1}: label is required`);
      if (varNames.has(v.name)) errs.push(`Duplicate parameter name: "${v.name}"`);
      varNames.add(v.name);
      if (v.type === 'select' && !v.options.trim()) errs.push(`Parameter "${v.name}": select type requires options`);
    }
    return errs;
  }, [name, steps, variables]);

  const handleSave = useCallback(async () => {
    const errs = validate();
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }

    setSaving(true);
    try {
      const parsedVars: PlaybookVariable[] = variables.map(v => ({
        name: v.name.trim(),
        label: v.label.trim(),
        type: v.type,
        required: v.required,
        default: v.default || undefined,
        options: v.type === 'select' ? v.options.split(',').map(o => o.trim()).filter(Boolean) : undefined,
        placeholder: v.placeholder || undefined,
      }));

      const parsedSteps = steps.map(s => ({
        name: s.name.trim(),
        prompt: s.prompt.trim(),
        requireConfirmation: s.requireConfirmation,
        timeoutMs: s.timeoutMs,
        silenceThresholdMs: s.silenceThresholdMs,
      }));

      if (isEdit && playbook) {
        await onSave({
          id: playbook.id,
          name: name.trim(),
          description: description.trim(),
          icon,
          category,
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
          variables: parsedVars,
          steps: parsedSteps,
        } as PlaybookUpdateRequest);
      } else {
        await onSave({
          name: name.trim(),
          description: description.trim(),
          icon,
          category,
          keywords: keywords.split(',').map(k => k.trim()).filter(Boolean),
          variables: parsedVars,
          steps: parsedSteps,
        } as PlaybookCreateRequest);
      }
      onClose();
    } catch (err) {
      setErrors([err instanceof Error ? err.message : 'Failed to save']);
    } finally {
      setSaving(false);
    }
  }, [validate, variables, steps, name, description, icon, category, keywords, isEdit, playbook, onSave, onClose]);

  // Step helpers
  const addStep = () => setSteps(prev => [...prev, { ...EMPTY_STEP }]);
  const removeStep = (i: number) => setSteps(prev => prev.filter((_, idx) => idx !== i));
  const moveStep = (i: number, dir: -1 | 1) => {
    setSteps(prev => {
      const next = [...prev];
      const target = i + dir;
      if (target < 0 || target >= next.length) return next;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  };
  const updateStep = (i: number, field: keyof StepDraft, value: any) => {
    setSteps(prev => prev.map((s, idx) => idx === i ? { ...s, [field]: value } : s));
  };

  // Variable helpers
  const addVar = () => setVariables(prev => [...prev, { ...EMPTY_VAR }]);
  const removeVar = (i: number) => setVariables(prev => prev.filter((_, idx) => idx !== i));
  const moveVar = (i: number, dir: -1 | 1) => {
    setVariables(prev => {
      const next = [...prev];
      const target = i + dir;
      if (target < 0 || target >= next.length) return next;
      [next[i], next[target]] = [next[target], next[i]];
      return next;
    });
  };
  const updateVar = (i: number, field: keyof VarDraft, value: any) => {
    setVariables(prev => prev.map((v, idx) => idx === i ? { ...v, [field]: value } : v));
  };

  // Insert variable placeholder into step prompt
  const insertVariable = (stepIndex: number, varName: string) => {
    const step = steps[stepIndex];
    updateStep(stepIndex, 'prompt', step.prompt + `{{${varName}}}`);
  };

  if (!isOpen) return null;

  return (
    <div className="pb-editor-overlay" onClick={onClose}>
      <div className="pb-editor" onClick={e => e.stopPropagation()}>
        <div className="pb-editor-header">
          <h2>{isEdit ? 'Edit Playbook' : 'Create Playbook'}</h2>
          <button className="pb-editor-close" onClick={onClose}>&times;</button>
        </div>

        <div className="pb-editor-tabs">
          {(['details', 'params', 'steps'] as const).map(tab => (
            <button
              key={tab}
              className={`pb-editor-tab ${activeTab === tab ? 'active' : ''}`}
              onClick={() => setActiveTab(tab)}
            >
              {tab === 'details' ? 'Details' : tab === 'params' ? `Parameters (${variables.length})` : `Steps (${steps.length})`}
            </button>
          ))}
        </div>

        <div className="pb-editor-body">
          {/* Details Tab */}
          {activeTab === 'details' && (
            <div className="pb-editor-section">
              <div className="pb-editor-field">
                <label>Name *</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="My Playbook" maxLength={100} />
              </div>
              <div className="pb-editor-field">
                <label>Description</label>
                <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder="What does this playbook do?" rows={2} />
              </div>
              <div className="pb-editor-row">
                <div className="pb-editor-field" style={{ flex: 0 }}>
                  <label>Icon</label>
                  <div className="pb-editor-icon-grid">
                    {ICONS.map(ic => (
                      <button key={ic} className={`pb-editor-icon-btn ${icon === ic ? 'selected' : ''}`} onClick={() => setIcon(ic)}>{ic}</button>
                    ))}
                  </div>
                </div>
                <div className="pb-editor-field" style={{ flex: 1 }}>
                  <label>Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}>
                    {CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              </div>
              <div className="pb-editor-field">
                <label>Keywords (comma-separated)</label>
                <input type="text" value={keywords} onChange={e => setKeywords(e.target.value)} placeholder="api, endpoint, scaffold" />
              </div>
            </div>
          )}

          {/* Parameters Tab */}
          {activeTab === 'params' && (
            <div className="pb-editor-section">
              {variables.map((v, i) => (
                <div key={i} className="pb-editor-card">
                  <div className="pb-editor-card-header">
                    <span className="pb-editor-card-num">{i + 1}</span>
                    <span className="pb-editor-card-tag">{`{{${v.name || '...'}}}`}</span>
                    <div className="pb-editor-card-controls">
                      <button onClick={() => moveVar(i, -1)} disabled={i === 0}>&uarr;</button>
                      <button onClick={() => moveVar(i, 1)} disabled={i === variables.length - 1}>&darr;</button>
                      <button className="danger" onClick={() => removeVar(i)}>&times;</button>
                    </div>
                  </div>
                  <div className="pb-editor-card-body">
                    <div className="pb-editor-row">
                      <div className="pb-editor-field">
                        <label>Name *</label>
                        <input type="text" value={v.name} onChange={e => updateVar(i, 'name', e.target.value)} placeholder="variable_name" />
                      </div>
                      <div className="pb-editor-field">
                        <label>Label *</label>
                        <input type="text" value={v.label} onChange={e => updateVar(i, 'label', e.target.value)} placeholder="Display Label" />
                      </div>
                    </div>
                    <div className="pb-editor-row">
                      <div className="pb-editor-field">
                        <label>Type</label>
                        <select value={v.type} onChange={e => updateVar(i, 'type', e.target.value)}>
                          <option value="text">Text</option>
                          <option value="multiline">Multiline</option>
                          <option value="select">Select</option>
                          <option value="filepath">File Path</option>
                        </select>
                      </div>
                      <div className="pb-editor-field">
                        <label>Default</label>
                        <input type="text" value={v.default} onChange={e => updateVar(i, 'default', e.target.value)} />
                      </div>
                    </div>
                    {v.type === 'select' && (
                      <div className="pb-editor-field">
                        <label>Options (comma-separated) *</label>
                        <input type="text" value={v.options} onChange={e => updateVar(i, 'options', e.target.value)} placeholder="GET, POST, PUT" />
                      </div>
                    )}
                    <div className="pb-editor-row">
                      <label className="pb-editor-checkbox">
                        <input type="checkbox" checked={v.required} onChange={e => updateVar(i, 'required', e.target.checked)} />
                        Required
                      </label>
                    </div>
                  </div>
                </div>
              ))}
              <button className="pb-editor-add-btn" onClick={addVar}>+ Add Parameter</button>
            </div>
          )}

          {/* Steps Tab */}
          {activeTab === 'steps' && (
            <div className="pb-editor-section">
              {steps.map((step, i) => (
                <div key={i} className="pb-editor-card">
                  <div className="pb-editor-card-header">
                    <span className="pb-editor-card-num">{i + 1}</span>
                    <input
                      className="pb-editor-step-name"
                      value={step.name}
                      onChange={e => updateStep(i, 'name', e.target.value)}
                      placeholder="Step name"
                    />
                    <div className="pb-editor-card-controls">
                      <button onClick={() => moveStep(i, -1)} disabled={i === 0}>&uarr;</button>
                      <button onClick={() => moveStep(i, 1)} disabled={i === steps.length - 1}>&darr;</button>
                      <button className="danger" onClick={() => removeStep(i)} disabled={steps.length <= 1}>&times;</button>
                    </div>
                  </div>
                  <div className="pb-editor-card-body">
                    <div className="pb-editor-field">
                      <div className="pb-editor-prompt-header">
                        <label>Prompt *</label>
                        {variables.length > 0 && (
                          <div className="pb-editor-var-inserter">
                            {variables.map(v => (
                              <button
                                key={v.name}
                                className="pb-editor-var-chip"
                                onClick={() => insertVariable(i, v.name)}
                                title={`Insert {{${v.name}}}`}
                              >
                                {`{{${v.name}}}`}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                      <textarea
                        value={step.prompt}
                        onChange={e => updateStep(i, 'prompt', e.target.value)}
                        placeholder="Write the prompt that will be sent to Claude..."
                        rows={4}
                      />
                    </div>
                    <label className="pb-editor-checkbox">
                      <input
                        type="checkbox"
                        checked={step.requireConfirmation}
                        onChange={e => updateStep(i, 'requireConfirmation', e.target.checked)}
                      />
                      Require confirmation before this step
                    </label>
                  </div>
                </div>
              ))}
              <button className="pb-editor-add-btn" onClick={addStep}>+ Add Step</button>
            </div>
          )}
        </div>

        {errors.length > 0 && (
          <div className="pb-editor-errors">
            {errors.map((err, i) => <div key={i}>{err}</div>)}
          </div>
        )}

        <div className="pb-editor-footer">
          <button className="pb-editor-cancel" onClick={onClose}>Cancel</button>
          <button className="pb-editor-save" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save Changes' : 'Create Playbook'}
          </button>
        </div>
      </div>

      <style>{editorStyles}</style>
    </div>
  );
}

const editorStyles = `
  .pb-editor-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 950;
  }

  .pb-editor {
    position: fixed;
    top: 36px;
    right: 0;
    bottom: 0;
    width: 560px;
    background: #1f2335;
    border-left: 1px solid #292e42;
    display: flex;
    flex-direction: column;
    z-index: 951;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
  }

  .pb-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #292e42;
  }

  .pb-editor-header h2 {
    color: #c0caf5;
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  .pb-editor-close {
    background: none;
    border: none;
    color: #565f89;
    font-size: 20px;
    cursor: pointer;
    line-height: 1;
  }

  .pb-editor-tabs {
    display: flex;
    border-bottom: 1px solid #292e42;
    padding: 0 20px;
  }

  .pb-editor-tab {
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #565f89;
    font-size: 12px;
    padding: 10px 16px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-editor-tab.active {
    color: #7aa2f7;
    border-bottom-color: #7aa2f7;
  }

  .pb-editor-tab:hover:not(.active) {
    color: #a9b1d6;
  }

  .pb-editor-body {
    flex: 1;
    overflow-y: auto;
    padding: 16px 20px;
  }

  .pb-editor-section {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .pb-editor-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .pb-editor-field label {
    color: #a9b1d6;
    font-size: 11px;
    font-weight: 500;
  }

  .pb-editor-field input,
  .pb-editor-field textarea,
  .pb-editor-field select {
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #c0caf5;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    padding: 6px 10px;
    outline: none;
  }

  .pb-editor-field input:focus,
  .pb-editor-field textarea:focus,
  .pb-editor-field select:focus {
    border-color: #7aa2f7;
  }

  .pb-editor-field textarea {
    resize: vertical;
    min-height: 50px;
  }

  .pb-editor-row {
    display: flex;
    gap: 12px;
  }

  .pb-editor-icon-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .pb-editor-icon-btn {
    width: 32px;
    height: 32px;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 6px;
    cursor: pointer;
    font-size: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pb-editor-icon-btn.selected {
    border-color: #7aa2f7;
    background: rgba(122, 162, 247, 0.1);
  }

  .pb-editor-card {
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 8px;
    overflow: hidden;
  }

  .pb-editor-card-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: #16161e;
    border-bottom: 1px solid #292e42;
  }

  .pb-editor-card-num {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: #292e42;
    color: #7aa2f7;
    font-size: 11px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .pb-editor-card-tag {
    font-size: 11px;
    color: #bb9af7;
    flex: 1;
  }

  .pb-editor-step-name {
    flex: 1;
    background: transparent;
    border: none;
    color: #c0caf5;
    font-size: 12px;
    font-family: 'JetBrains Mono', monospace;
    outline: none;
    padding: 2px 0;
  }

  .pb-editor-card-controls {
    display: flex;
    gap: 2px;
  }

  .pb-editor-card-controls button {
    background: transparent;
    border: none;
    color: #565f89;
    cursor: pointer;
    font-size: 14px;
    padding: 2px 6px;
    border-radius: 3px;
  }

  .pb-editor-card-controls button:hover:not(:disabled) {
    color: #c0caf5;
    background: #292e42;
  }

  .pb-editor-card-controls button:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .pb-editor-card-controls button.danger:hover:not(:disabled) {
    color: #f7768e;
  }

  .pb-editor-card-body {
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pb-editor-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    color: #a9b1d6;
    font-size: 11px;
    cursor: pointer;
  }

  .pb-editor-checkbox input {
    accent-color: #7aa2f7;
  }

  .pb-editor-prompt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pb-editor-var-inserter {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .pb-editor-var-chip {
    background: rgba(187, 154, 247, 0.1);
    border: 1px solid rgba(187, 154, 247, 0.3);
    border-radius: 4px;
    color: #bb9af7;
    font-size: 10px;
    padding: 1px 6px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-editor-var-chip:hover {
    background: rgba(187, 154, 247, 0.2);
  }

  .pb-editor-add-btn {
    background: transparent;
    border: 1px dashed #3b4261;
    border-radius: 6px;
    color: #7aa2f7;
    font-size: 12px;
    padding: 8px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    text-align: center;
  }

  .pb-editor-add-btn:hover {
    background: rgba(122, 162, 247, 0.05);
    border-color: #7aa2f7;
  }

  .pb-editor-errors {
    padding: 8px 20px;
    background: rgba(247, 118, 142, 0.1);
    border-top: 1px solid rgba(247, 118, 142, 0.2);
    max-height: 100px;
    overflow-y: auto;
  }

  .pb-editor-errors div {
    color: #f7768e;
    font-size: 11px;
    padding: 2px 0;
  }

  .pb-editor-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 8px;
    padding: 12px 20px;
    border-top: 1px solid #292e42;
  }

  .pb-editor-cancel {
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #a9b1d6;
    font-size: 12px;
    padding: 6px 14px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-editor-save {
    background: #7aa2f7;
    border: none;
    border-radius: 6px;
    color: #1a1b26;
    font-size: 12px;
    font-weight: 600;
    padding: 6px 14px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-editor-save:hover:not(:disabled) {
    background: #89b4fa;
  }

  .pb-editor-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
