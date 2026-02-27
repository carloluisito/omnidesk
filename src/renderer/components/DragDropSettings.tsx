import { useState, useEffect } from 'react';
import {
  DragDropSettings as DragDropSettingsType,
  DragDropInsertMode,
  PathFormat,
  MultiFileSeparator,
  FileCategory,
} from '../../shared/ipc-types';

interface DragDropSettingsProps {
  onClose: () => void;
}

const DEFAULT_SETTINGS: DragDropSettingsType = {
  defaultInsertMode: 'path',
  pathFormat: 'quoted',
  multiFileSeparator: 'space',
  maxContentSizeKB: 100,
  categoryOverrides: {},
};

export function DragDropSettings({ onClose }: DragDropSettingsProps) {
  const [settings, setSettings] = useState<DragDropSettingsType>(DEFAULT_SETTINGS);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const appSettings = await window.electronAPI.getSettings();
      if (appSettings.dragDropSettings) {
        setSettings(appSettings.dragDropSettings);
      }
    } catch (err) {
      console.error('Failed to load drag-drop settings:', err);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      // For now, settings are auto-saved through the hook
      // In a real implementation, we'd call an IPC method here
      await new Promise(resolve => setTimeout(resolve, 300));
      onClose();
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const updateSetting = <K extends keyof DragDropSettingsType>(
    key: K,
    value: DragDropSettingsType[K]
  ) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const categories: FileCategory[] = ['code', 'markup', 'document', 'image', 'binary', 'other'];

  return (
    <div className="dragdrop-settings">
      <div className="settings-section">
        <h3 className="settings-section-title">Default Behavior</h3>

        <div className="settings-field">
          <label className="settings-label">Insert Mode</label>
          <select
            className="settings-select"
            value={settings.defaultInsertMode}
            onChange={(e) => updateSetting('defaultInsertMode', e.target.value as DragDropInsertMode)}
          >
            <option value="path">Insert Path</option>
            <option value="content">Insert Content</option>
            <option value="ask">Ask on Drop</option>
          </select>
          <span className="settings-hint">
            Default action when dropping files
          </span>
        </div>

        <div className="settings-field">
          <label className="settings-label">Path Format</label>
          <select
            className="settings-select"
            value={settings.pathFormat}
            onChange={(e) => updateSetting('pathFormat', e.target.value as PathFormat)}
          >
            <option value="quoted">Quoted</option>
            <option value="unquoted">Unquoted</option>
            <option value="escaped">Escaped</option>
          </select>
          <span className="settings-hint">
            How to format file paths
          </span>
        </div>

        <div className="settings-field">
          <label className="settings-label">Multi-file Separator</label>
          <select
            className="settings-select"
            value={settings.multiFileSeparator}
            onChange={(e) => updateSetting('multiFileSeparator', e.target.value as MultiFileSeparator)}
          >
            <option value="space">Space</option>
            <option value="newline">Newline</option>
          </select>
          <span className="settings-hint">
            Separator between multiple files
          </span>
        </div>

        <div className="settings-field">
          <label className="settings-label">Max Content Size (KB)</label>
          <input
            type="number"
            className="settings-input"
            value={settings.maxContentSizeKB}
            onChange={(e) => updateSetting('maxContentSizeKB', parseInt(e.target.value) || 100)}
            min="1"
            max="10000"
          />
          <span className="settings-hint">
            Maximum file size for content insertion
          </span>
        </div>
      </div>

      <div className="settings-section">
        <h3 className="settings-section-title">Category Overrides</h3>
        <p className="settings-section-desc">
          Override behavior for specific file types
        </p>

        {categories.map((category) => {
          const override = settings.categoryOverrides[category];
          return (
            <div key={category} className="category-override">
              <div className="category-override-header">
                <span className="category-name">{category}</span>
                <label className="category-toggle">
                  <input
                    type="checkbox"
                    checked={!!override}
                    onChange={(e) => {
                      const newOverrides = { ...settings.categoryOverrides };
                      if (e.target.checked) {
                        newOverrides[category] = { insertMode: 'path' };
                      } else {
                        delete newOverrides[category];
                      }
                      updateSetting('categoryOverrides', newOverrides);
                    }}
                  />
                  <span>Override</span>
                </label>
              </div>

              {override && (
                <div className="category-override-fields">
                  <select
                    className="settings-select-sm"
                    value={override.insertMode || settings.defaultInsertMode}
                    onChange={(e) => {
                      const newOverrides = { ...settings.categoryOverrides };
                      newOverrides[category] = {
                        ...override,
                        insertMode: e.target.value as DragDropInsertMode,
                      };
                      updateSetting('categoryOverrides', newOverrides);
                    }}
                  >
                    <option value="path">Path</option>
                    <option value="content">Content</option>
                    <option value="ask">Ask</option>
                  </select>

                  <input
                    type="number"
                    className="settings-input-sm"
                    placeholder={`Max size (${settings.maxContentSizeKB} KB)`}
                    value={override.maxSizeKB || ''}
                    onChange={(e) => {
                      const newOverrides = { ...settings.categoryOverrides };
                      newOverrides[category] = {
                        ...override,
                        maxSizeKB: parseInt(e.target.value) || undefined,
                      };
                      updateSetting('categoryOverrides', newOverrides);
                    }}
                    min="1"
                    max="10000"
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="settings-actions">
        <button className="btn btn-secondary" onClick={onClose}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={handleSave} disabled={isSaving}>
          {isSaving ? 'Saving...' : 'Save'}
        </button>
      </div>

      <style>{`
        .dragdrop-settings {
          display: flex;
          flex-direction: column;
          gap: 24px;
          padding: 16px;
          max-height: 600px;
          overflow-y: auto;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
        }

        .settings-section {
          display: flex;
          flex-direction: column;
          gap: 16px;
        }

        .settings-section-title {
          font-size: 14px;
          font-weight: 600;
          color: var(--text-primary, #E2E4F0);
          margin: 0;
        }

        .settings-section-desc {
          font-size: 12px;
          color: var(--text-secondary, #9DA3BE);
          margin: -8px 0 0 0;
        }

        .settings-field {
          display: flex;
          flex-direction: column;
          gap: 6px;
        }

        .settings-label {
          font-size: 12px;
          font-weight: 500;
          color: var(--text-secondary, #9DA3BE);
        }

        .settings-hint {
          font-size: 11px;
          color: var(--text-tertiary, #5C6080);
        }

        .settings-select,
        .settings-input {
          height: 36px;
          padding: 0 12px;
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: 6px;
          color: var(--text-primary, #E2E4F0);
          font-size: 13px;
          font-family: inherit;
        }

        .settings-select:focus,
        .settings-input:focus {
          outline: none;
          border-color: var(--accent-primary, #00C9A7);
        }

        .category-override {
          padding: 12px;
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: 8px;
        }

        .category-override-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        .category-name {
          font-size: 13px;
          font-weight: 500;
          color: var(--text-primary, #E2E4F0);
          text-transform: capitalize;
        }

        .category-toggle {
          display: flex;
          align-items: center;
          gap: 6px;
          font-size: 12px;
          color: var(--text-secondary, #9DA3BE);
          cursor: pointer;
        }

        .category-toggle input[type="checkbox"] {
          cursor: pointer;
        }

        .category-override-fields {
          display: flex;
          gap: 8px;
          margin-top: 12px;
        }

        .settings-select-sm,
        .settings-input-sm {
          height: 32px;
          padding: 0 10px;
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: 6px;
          color: var(--text-primary, #E2E4F0);
          font-size: 12px;
          font-family: inherit;
        }

        .settings-select-sm {
          flex: 1;
        }

        .settings-input-sm {
          flex: 0 0 140px;
        }

        .settings-actions {
          display: flex;
          justify-content: flex-end;
          gap: 12px;
          padding-top: 16px;
          border-top: 1px solid var(--border-default, #292E44);
        }

        .btn {
          height: 38px;
          padding: 0 20px;
          font-size: 13px;
          font-weight: 500;
          font-family: inherit;
          border-radius: 8px;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: transparent;
          border: 1px solid var(--border-default, #292E44);
          color: var(--text-secondary, #9DA3BE);
        }

        .btn-secondary:hover:not(:disabled) {
          background: var(--surface-overlay, #1A1B26);
          border-color: var(--border-strong, #3D4163);
        }

        .btn-primary {
          background: var(--accent-primary, #00C9A7);
          border: none;
          color: var(--surface-overlay, #1A1B26);
        }

        .btn-primary:hover:not(:disabled) {
          background: var(--accent-primary-dim, #009E84);
        }

        .dragdrop-settings::-webkit-scrollbar {
          width: 8px;
        }

        .dragdrop-settings::-webkit-scrollbar-track {
          background: transparent;
        }

        .dragdrop-settings::-webkit-scrollbar-thumb {
          background-color: var(--border-strong, #3D4163);
          border-radius: 4px;
        }

        .dragdrop-settings::-webkit-scrollbar-thumb:hover {
          background-color: var(--text-tertiary, #5C6080);
        }
      `}</style>
    </div>
  );
}
