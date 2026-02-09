import { useState, useEffect, useRef } from 'react';
import { Workspace, WorkspaceValidationResult, PermissionMode, SessionPoolSettings } from '../../../shared/ipc-types';
import { PromptTemplate } from '../../../shared/types/prompt-templates';
import { TemplateEditor } from '../TemplateEditor';
import { DragDropSettings } from '../DragDropSettings';

interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: Workspace[];
  onAddWorkspace: (name: string, path: string, permissionMode: PermissionMode) => Promise<void>;
  onUpdateWorkspace: (id: string, name?: string, path?: string, permissionMode?: PermissionMode) => Promise<void>;
  onDeleteWorkspace: (id: string) => Promise<void>;
  onValidatePath: (path: string, excludeId?: string) => Promise<WorkspaceValidationResult>;
}

type EditingState = {
  id: string;
  name: string;
  path: string;
  permissionMode: PermissionMode;
} | null;

export function SettingsDialog({
  isOpen,
  onClose,
  workspaces,
  onAddWorkspace,
  onUpdateWorkspace,
  onDeleteWorkspace,
  onValidatePath,
}: SettingsDialogProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'workspaces' | 'templates' | 'dragdrop'>('general');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editing, setEditing] = useState<EditingState>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  // Template management state
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<PromptTemplate | null>(null);
  const [deleteTemplateConfirm, setDeleteTemplateConfirm] = useState<string | null>(null);

  // Session pool state
  const [poolSettings, setPoolSettings] = useState<SessionPoolSettings>({
    enabled: true,
    poolSize: 1,
    maxIdleTimeMs: 300000,
  });
  const [poolStatus, setPoolStatus] = useState<{ idleCount: number; enabled: boolean; size: number } | null>(null);

  // Add form state
  const [newName, setNewName] = useState('');
  const [newPath, setNewPath] = useState('');
  const [newPermissionMode, setNewPermissionMode] = useState<PermissionMode>('standard');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const dialogRef = useRef<HTMLDivElement>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      setShowAddForm(false);
      setEditing(null);
      setDeleteConfirm(null);
      setError(null);
      resetAddForm();
      loadTemplates();
      loadPoolSettings();
    }
  }, [isOpen]);

  const loadTemplates = async () => {
    try {
      const userTemplates = await window.electronAPI.listUserTemplates();
      setTemplates(userTemplates);
    } catch (err) {
      console.error('Failed to load templates:', err);
    }
  };

  const loadPoolSettings = async () => {
    try {
      const settings = await window.electronAPI.getSettings();
      if (settings.sessionPoolSettings) {
        setPoolSettings(settings.sessionPoolSettings);
      }
      await loadPoolStatus();
    } catch (err) {
      console.error('Failed to load session pool settings:', err);
    }
  };

  const loadPoolStatus = async () => {
    try {
      const status = await window.electronAPI.getSessionPoolStatus();
      setPoolStatus(status);
    } catch (err) {
      console.error('Failed to load session pool status:', err);
    }
  };

  const handlePoolToggle = async (enabled: boolean) => {
    try {
      const updated = await window.electronAPI.updateSessionPoolSettings({ enabled });
      setPoolSettings(updated);
      await loadPoolStatus();
    } catch (err) {
      console.error('Failed to update pool settings:', err);
    }
  };

  const handlePoolSizeChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    try {
      const poolSize = Number(e.target.value);
      const updated = await window.electronAPI.updateSessionPoolSettings({ poolSize });
      setPoolSettings(updated);
      // Delay status refresh to let pool adjust
      setTimeout(loadPoolStatus, 500);
    } catch (err) {
      console.error('Failed to update pool size:', err);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (editing) {
          setEditing(null);
        } else if (showAddForm) {
          setShowAddForm(false);
          resetAddForm();
        } else if (deleteConfirm) {
          setDeleteConfirm(null);
        } else {
          handleClose();
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, editing, showAddForm, deleteConfirm]);

  const resetAddForm = () => {
    setNewName('');
    setNewPath('');
    setNewPermissionMode('standard');
    setError(null);
  };

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 150);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      handleClose();
    }
  };

  const handleBrowse = async (setPath: (path: string) => void) => {
    if (window.electronAPI?.browseDirectory) {
      const dir = await window.electronAPI.browseDirectory();
      if (dir) {
        setPath(dir);
        setError(null);
      }
    }
  };

  const getValidationErrorMessage = (error: string): string => {
    switch (error) {
      case 'NOT_FOUND':
        return 'Directory does not exist';
      case 'NOT_DIRECTORY':
        return 'Path is not a directory';
      case 'NO_ACCESS':
        return 'Cannot access directory';
      case 'DUPLICATE_PATH':
        return 'A workspace with this path already exists';
      default:
        return 'Invalid path';
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSubmitting) return;

    const name = newName.trim();
    const path = newPath.trim();

    if (!name) {
      setError('Workspace name is required');
      return;
    }

    if (!path) {
      setError('Directory path is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const validation = await onValidatePath(path);
      if (!validation.valid) {
        setError(getValidationErrorMessage(validation.error!));
        return;
      }

      await onAddWorkspace(name, path, newPermissionMode);
      setShowAddForm(false);
      resetAddForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing || isSubmitting) return;

    const name = editing.name.trim();
    const path = editing.path.trim();

    if (!name) {
      setError('Workspace name is required');
      return;
    }

    if (!path) {
      setError('Directory path is required');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const validation = await onValidatePath(path, editing.id);
      if (!validation.valid) {
        setError(getValidationErrorMessage(validation.error!));
        return;
      }

      await onUpdateWorkspace(editing.id, name, path, editing.permissionMode);
      setEditing(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDeleteWorkspace(id);
      setDeleteConfirm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete workspace');
    }
  };

  const startEditing = (workspace: Workspace) => {
    setEditing({
      id: workspace.id,
      name: workspace.name,
      path: workspace.path,
      permissionMode: workspace.defaultPermissionMode,
    });
    setError(null);
  };

  const handleEditTemplate = (template: PromptTemplate) => {
    setEditingTemplate(template);
    setShowTemplateEditor(true);
  };

  const handleNewTemplate = () => {
    setEditingTemplate(null);
    setShowTemplateEditor(true);
  };

  const handleSaveTemplate = async (_template: PromptTemplate) => {
    await loadTemplates();
  };

  const handleDeleteTemplate = async (id: string) => {
    try {
      await window.electronAPI.deleteTemplate(id);
      await loadTemplates();
      setDeleteTemplateConfirm(null);
    } catch (err) {
      console.error('Failed to delete template:', err);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={`settings-overlay ${isAnimating ? 'visible' : ''}`}
      onClick={handleOverlayClick}
    >
      <div
        ref={dialogRef}
        className={`settings-dialog ${isAnimating ? 'visible' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="settings-header">
          <h2 id="settings-title" className="settings-title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83 0 2 2 0 010-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 010-2.83 2 2 0 012.83 0l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 0 2 2 0 010 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z" />
            </svg>
            Settings
          </h2>
          <button className="settings-close" onClick={handleClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="settings-tabs">
          <button
            className={`settings-tab ${activeTab === 'general' ? 'active' : ''}`}
            onClick={() => setActiveTab('general')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3" />
              <path d="M12 1v6m0 6v6m4.22-13.22l-1.42 1.42M7.76 16.24l-1.42 1.42m13.9-1.42l-1.42-1.42M7.76 7.76L6.34 6.34M23 12h-6m-6 0H1" />
            </svg>
            General
          </button>
          <button
            className={`settings-tab ${activeTab === 'workspaces' ? 'active' : ''}`}
            onClick={() => setActiveTab('workspaces')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
            </svg>
            Workspaces
          </button>
          <button
            className={`settings-tab ${activeTab === 'templates' ? 'active' : ''}`}
            onClick={() => setActiveTab('templates')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
            </svg>
            Templates
          </button>
          <button
            className={`settings-tab ${activeTab === 'dragdrop' ? 'active' : ''}`}
            onClick={() => setActiveTab('dragdrop')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
              <circle cx="12" cy="12" r="9" />
            </svg>
            Drag & Drop
          </button>
        </div>

        <div className="settings-body">
          {/* General Section */}
          {activeTab === 'general' && (
          <div className="settings-section">
            <div className="section-header">
              <h3 className="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="3" />
                  <path d="M12 1v6m0 6v6m4.22-13.22l-1.42 1.42M7.76 16.24l-1.42 1.42m13.9-1.42l-1.42-1.42M7.76 7.76L6.34 6.34M23 12h-6m-6 0H1" />
                </svg>
                General Settings
              </h3>
            </div>

            {/* Session Pool Settings */}
            <div className="setting-group">
              <h4 className="setting-group-title">Session Pool</h4>
              <p className="setting-group-description">
                Pre-spawn shell processes to speed up session creation. Saves ~150-250ms per session.
              </p>

              <div className="setting-item">
                <label className="setting-checkbox">
                  <input
                    type="checkbox"
                    checked={poolSettings.enabled}
                    onChange={(e) => handlePoolToggle(e.target.checked)}
                  />
                  <span className="checkbox-indicator" />
                  <span className="checkbox-label">Enable Session Pool</span>
                </label>
              </div>

              {poolSettings.enabled && (
                <>
                  <div className="setting-item">
                    <label className="setting-label">
                      Pool Size
                      <select
                        className="setting-select"
                        value={poolSettings.poolSize}
                        onChange={handlePoolSizeChange}
                      >
                        <option value={0}>Disabled (0)</option>
                        <option value={1}>1 session (Recommended)</option>
                        <option value={2}>2 sessions</option>
                        <option value={3}>3 sessions</option>
                      </select>
                    </label>
                    <p className="setting-hint">
                      Number of pre-spawned idle shells. Higher values use more memory.
                    </p>
                  </div>

                  {poolStatus && (
                    <div className="pool-status">
                      <p className="pool-status-label">Status:</p>
                      <p className="pool-status-value">
                        {poolStatus.idleCount} / {poolStatus.size} idle sessions ready
                      </p>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
          )}

          {/* Workspaces Section */}
          {activeTab === 'workspaces' && (
          <div className="settings-section">
            <div className="section-header">
              <h3 className="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Workspaces
              </h3>
              <span className="section-count">{workspaces.length}/50</span>
            </div>
            <p className="section-description">
              Configure allowed directories for new sessions. Only these directories can be used as working directories.
            </p>

            {/* Workspace List */}
            <div className="workspace-list">
              {workspaces.length === 0 ? (
                <div className="empty-workspaces">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  <p>No workspaces configured</p>
                  <span>Add a workspace to restrict session directories</span>
                </div>
              ) : (
                workspaces.map((workspace) => (
                  <div key={workspace.id} className="workspace-item">
                    {editing?.id === workspace.id ? (
                      <form className="workspace-edit-form" onSubmit={handleEditSubmit}>
                        <div className="edit-row">
                          <input
                            type="text"
                            className="edit-input"
                            value={editing.name}
                            onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                            placeholder="Workspace name"
                            autoFocus
                          />
                        </div>
                        <div className="edit-row">
                          <input
                            type="text"
                            className="edit-input mono"
                            value={editing.path}
                            onChange={(e) => setEditing({ ...editing, path: e.target.value })}
                            placeholder="Directory path"
                          />
                          <button
                            type="button"
                            className="edit-browse-btn"
                            onClick={() => handleBrowse((path) => setEditing({ ...editing, path }))}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                            </svg>
                          </button>
                        </div>
                        <div className="edit-row permission-row">
                          <label className="mini-radio">
                            <input
                              type="radio"
                              checked={editing.permissionMode === 'standard'}
                              onChange={() => setEditing({ ...editing, permissionMode: 'standard' })}
                            />
                            <span className="mini-radio-indicator" />
                            <span>Standard</span>
                          </label>
                          <label className="mini-radio danger">
                            <input
                              type="radio"
                              checked={editing.permissionMode === 'skip-permissions'}
                              onChange={() => setEditing({ ...editing, permissionMode: 'skip-permissions' })}
                            />
                            <span className="mini-radio-indicator" />
                            <span>Skip Permissions</span>
                          </label>
                        </div>
                        <div className="edit-actions">
                          <button type="button" className="edit-cancel" onClick={() => setEditing(null)}>
                            Cancel
                          </button>
                          <button type="submit" className="edit-save" disabled={isSubmitting}>
                            {isSubmitting ? 'Saving...' : 'Save'}
                          </button>
                        </div>
                      </form>
                    ) : deleteConfirm === workspace.id ? (
                      <div className="delete-confirm">
                        <p>Delete "{workspace.name}"?</p>
                        <div className="delete-actions">
                          <button className="delete-cancel" onClick={() => setDeleteConfirm(null)}>
                            Cancel
                          </button>
                          <button className="delete-confirm-btn" onClick={() => handleDelete(workspace.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="workspace-info">
                          <div className="workspace-name">
                            {workspace.name}
                            {workspace.defaultPermissionMode === 'skip-permissions' && (
                              <span className="danger-badge" title="Skip Permissions enabled by default">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                  <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" />
                                </svg>
                              </span>
                            )}
                          </div>
                          <div className="workspace-path">{workspace.path}</div>
                        </div>
                        <div className="workspace-actions">
                          <button
                            className="workspace-action-btn"
                            onClick={() => startEditing(workspace)}
                            title="Edit workspace"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            className="workspace-action-btn danger"
                            onClick={() => setDeleteConfirm(workspace.id)}
                            title="Delete workspace"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add Workspace Form */}
            {showAddForm ? (
              <form className="add-workspace-form" onSubmit={handleAddSubmit}>
                <div className="add-form-field">
                  <label className="add-form-label">Name</label>
                  <input
                    ref={nameInputRef}
                    type="text"
                    className="add-form-input"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="My Project"
                    maxLength={50}
                    autoFocus
                  />
                </div>
                <div className="add-form-field">
                  <label className="add-form-label">Directory</label>
                  <div className="add-input-group">
                    <input
                      type="text"
                      className="add-form-input mono"
                      value={newPath}
                      onChange={(e) => {
                        setNewPath(e.target.value);
                        setError(null);
                      }}
                      placeholder="~/projects/my-project"
                    />
                    <button
                      type="button"
                      className="add-browse-btn"
                      onClick={() => handleBrowse(setNewPath)}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z" />
                      </svg>
                    </button>
                  </div>
                </div>
                <div className="add-form-field">
                  <label className="add-form-label">Default Permission Mode</label>
                  <div className="add-permission-group">
                    <label className={`add-permission-option ${newPermissionMode === 'standard' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        checked={newPermissionMode === 'standard'}
                        onChange={() => setNewPermissionMode('standard')}
                      />
                      <div className="permission-radio" />
                      <span>Standard</span>
                    </label>
                    <label className={`add-permission-option danger ${newPermissionMode === 'skip-permissions' ? 'selected' : ''}`}>
                      <input
                        type="radio"
                        checked={newPermissionMode === 'skip-permissions'}
                        onChange={() => setNewPermissionMode('skip-permissions')}
                      />
                      <div className="permission-radio" />
                      <span>Skip Permissions</span>
                    </label>
                  </div>
                </div>

                {error && (
                  <div className="add-error">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4m0 4h.01" strokeLinecap="round" />
                    </svg>
                    {error}
                  </div>
                )}

                <div className="add-form-actions">
                  <button
                    type="button"
                    className="add-cancel-btn"
                    onClick={() => {
                      setShowAddForm(false);
                      resetAddForm();
                    }}
                  >
                    Cancel
                  </button>
                  <button type="submit" className="add-submit-btn" disabled={isSubmitting}>
                    {isSubmitting ? 'Adding...' : 'Add Workspace'}
                  </button>
                </div>
              </form>
            ) : (
              <button
                className="add-workspace-btn"
                onClick={() => {
                  setShowAddForm(true);
                  setTimeout(() => nameInputRef.current?.focus(), 50);
                }}
                disabled={workspaces.length >= 50}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M7 1v12M1 7h12" strokeLinecap="round" />
                </svg>
                Add Workspace
              </button>
            )}
          </div>
          )}

          {/* Templates Section */}
          {activeTab === 'templates' && (
          <div className="settings-section">
            <div className="section-header">
              <h3 className="section-title">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
                </svg>
                Custom Templates
              </h3>
              <span className="section-count">{templates.length}/100</span>
            </div>
            <p className="section-description">
              Create custom prompt templates with variables. Use Ctrl+Shift+P to open the command palette.
            </p>

            {/* Template List */}
            <div className="workspace-list">
              {templates.length === 0 ? (
                <div className="empty-workspaces">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
                  </svg>
                  <p>No custom templates yet</p>
                  <span>Create templates to automate common prompts</span>
                </div>
              ) : (
                templates.map((template) => (
                  <div key={template.id} className="workspace-item">
                    {deleteTemplateConfirm === template.id ? (
                      <div className="delete-confirm">
                        <p>Delete "{template.name}"?</p>
                        <div className="delete-actions">
                          <button className="delete-cancel" onClick={() => setDeleteTemplateConfirm(null)}>
                            Cancel
                          </button>
                          <button className="delete-confirm-btn" onClick={() => handleDeleteTemplate(template.id)}>
                            Delete
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="workspace-info">
                          <div className="workspace-name">
                            {template.name}
                            {template.keywords.length > 0 && (
                              <span className="template-keywords">
                                {template.keywords.slice(0, 3).join(', ')}
                              </span>
                            )}
                          </div>
                          <div className="workspace-path">{template.description || 'No description'}</div>
                        </div>
                        <div className="workspace-actions">
                          <button
                            className="workspace-action-btn"
                            onClick={() => handleEditTemplate(template)}
                            title="Edit template"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                          </button>
                          <button
                            className="workspace-action-btn danger"
                            onClick={() => setDeleteTemplateConfirm(template.id)}
                            title="Delete template"
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2" />
                            </svg>
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Add Template Button */}
            <button
              className="add-workspace-btn"
              onClick={handleNewTemplate}
              disabled={templates.length >= 100}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M7 1v12M1 7h12" strokeLinecap="round" />
              </svg>
              New Template
            </button>
          </div>
          )}

          {/* Drag & Drop Section */}
          {activeTab === 'dragdrop' && (
            <DragDropSettings
              onClose={handleClose}
            />
          )}
        </div>
      </div>

      {/* Template Editor */}
      <TemplateEditor
        isOpen={showTemplateEditor}
        onClose={() => {
          setShowTemplateEditor(false);
          setEditingTemplate(null);
        }}
        onSave={handleSaveTemplate}
        editingTemplate={editingTemplate}
      />

      <style>{settingsStyles}</style>
    </div>
  );
}

const settingsStyles = `
  .settings-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    transition: background 0.15s ease;
    font-family: 'JetBrains Mono', monospace;
  }

  .settings-tabs {
    display: flex;
    gap: 8px;
    padding: 0 24px;
    border-bottom: 1px solid #292e42;
  }

  .settings-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 12px 16px;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: #565f89;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
    margin-bottom: -1px;
  }

  .settings-tab:hover {
    color: #a9b1d6;
    background: rgba(122, 162, 247, 0.05);
  }

  .settings-tab.active {
    color: #7aa2f7;
    border-bottom-color: #7aa2f7;
  }

  .settings-tab svg {
    flex-shrink: 0;
  }

  .template-keywords {
    font-size: 10px;
    color: #565f89;
    font-weight: 400;
    margin-left: 8px;
  }

  .settings-overlay.visible {
    background: rgba(0, 0, 0, 0.6);
  }

  .settings-dialog {
    width: 560px;
    max-width: calc(100vw - 48px);
    max-height: calc(100vh - 48px);
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 12px;
    box-shadow: 0 24px 64px rgba(0, 0, 0, 0.5);
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transform: scale(0.95) translateY(10px);
    opacity: 0;
    transition: all 0.15s ease;
  }

  .settings-dialog.visible {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  .settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 20px 24px;
    border-bottom: 1px solid #292e42;
  }

  .settings-title {
    font-size: 15px;
    font-weight: 600;
    color: #c0caf5;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .settings-title svg {
    color: #7aa2f7;
  }

  .settings-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .settings-close:hover {
    background: #292e42;
    color: #a9b1d6;
  }

  .settings-body {
    flex: 1;
    overflow-y: auto;
    padding: 24px;
  }

  .settings-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .section-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .section-title {
    font-size: 13px;
    font-weight: 600;
    color: #c0caf5;
    margin: 0;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .section-title svg {
    color: #565f89;
  }

  .section-count {
    font-size: 11px;
    color: #565f89;
  }

  .section-description {
    font-size: 12px;
    color: #565f89;
    margin: 0;
    line-height: 1.5;
  }

  .workspace-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-workspaces {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 32px;
    background: #16161e;
    border: 1px dashed #292e42;
    border-radius: 8px;
    text-align: center;
  }

  .empty-workspaces svg {
    color: #3b4261;
    margin-bottom: 12px;
  }

  .empty-workspaces p {
    font-size: 13px;
    color: #565f89;
    margin: 0 0 4px 0;
  }

  .empty-workspaces span {
    font-size: 11px;
    color: #3b4261;
  }

  .workspace-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    background: #16161e;
    border: 1px solid #292e42;
    border-radius: 8px;
    transition: all 0.15s ease;
  }

  .workspace-item:hover {
    border-color: #3b4261;
  }

  .workspace-info {
    flex: 1;
    min-width: 0;
  }

  .workspace-name {
    font-size: 13px;
    font-weight: 500;
    color: #c0caf5;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .danger-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 16px;
    height: 16px;
    background: rgba(224, 175, 104, 0.15);
    border-radius: 4px;
    color: #e0af68;
  }

  .workspace-path {
    font-size: 11px;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .workspace-actions {
    display: flex;
    gap: 4px;
    margin-left: 12px;
  }

  .workspace-action-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .workspace-action-btn:hover {
    background: #292e42;
    color: #a9b1d6;
  }

  .workspace-action-btn.danger:hover {
    background: rgba(247, 118, 142, 0.1);
    color: #f7768e;
  }

  /* Edit Form */
  .workspace-edit-form {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .edit-row {
    display: flex;
    gap: 8px;
  }

  .edit-input {
    flex: 1;
    height: 32px;
    padding: 0 10px;
    background: #1a1b26;
    border: 1px solid #3b4261;
    border-radius: 6px;
    color: #c0caf5;
    font-size: 12px;
    font-family: inherit;
  }

  .edit-input.mono {
    font-family: 'JetBrains Mono', monospace;
  }

  .edit-input:focus {
    outline: none;
    border-color: #7aa2f7;
  }

  .edit-browse-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #292e42;
    border: 1px solid #3b4261;
    border-radius: 6px;
    color: #a9b1d6;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .edit-browse-btn:hover {
    background: #343b58;
  }

  .permission-row {
    gap: 16px;
  }

  .mini-radio {
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    font-size: 11px;
    color: #a9b1d6;
  }

  .mini-radio input {
    display: none;
  }

  .mini-radio-indicator {
    width: 14px;
    height: 14px;
    border: 1.5px solid #3b4261;
    border-radius: 50%;
    position: relative;
    transition: all 0.15s ease;
  }

  .mini-radio input:checked + .mini-radio-indicator {
    border-color: #7aa2f7;
  }

  .mini-radio input:checked + .mini-radio-indicator::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 6px;
    height: 6px;
    background: #7aa2f7;
    border-radius: 50%;
  }

  .mini-radio.danger input:checked + .mini-radio-indicator {
    border-color: #e0af68;
  }

  .mini-radio.danger input:checked + .mini-radio-indicator::after {
    background: #e0af68;
  }

  .mini-radio.danger span {
    color: #e0af68;
  }

  .edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .edit-cancel, .edit-save {
    height: 28px;
    padding: 0 12px;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .edit-cancel {
    background: transparent;
    border: 1px solid #292e42;
    color: #a9b1d6;
  }

  .edit-cancel:hover {
    background: #1f2335;
    border-color: #3b4261;
  }

  .edit-save {
    background: #7aa2f7;
    border: none;
    color: #1a1b26;
  }

  .edit-save:hover {
    background: #89b4fa;
  }

  .edit-save:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Delete Confirm */
  .delete-confirm {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .delete-confirm p {
    font-size: 12px;
    color: #f7768e;
    margin: 0;
  }

  .delete-actions {
    display: flex;
    gap: 8px;
  }

  .delete-cancel, .delete-confirm-btn {
    height: 28px;
    padding: 0 12px;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .delete-cancel {
    background: transparent;
    border: 1px solid #292e42;
    color: #a9b1d6;
  }

  .delete-cancel:hover {
    background: #1f2335;
  }

  .delete-confirm-btn {
    background: #f7768e;
    border: none;
    color: white;
  }

  .delete-confirm-btn:hover {
    background: #ff7a90;
  }

  /* Add Workspace */
  .add-workspace-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    width: 100%;
    height: 40px;
    background: transparent;
    border: 1px dashed #3b4261;
    border-radius: 8px;
    color: #565f89;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .add-workspace-btn:hover {
    border-color: #7aa2f7;
    color: #7aa2f7;
    background: rgba(122, 162, 247, 0.05);
  }

  .add-workspace-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .add-workspace-form {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    background: #16161e;
    border: 1px solid #292e42;
    border-radius: 8px;
  }

  .add-form-field {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .add-form-label {
    font-size: 11px;
    font-weight: 500;
    color: #a9b1d6;
  }

  .add-form-input {
    height: 36px;
    padding: 0 12px;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #c0caf5;
    font-size: 12px;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  .add-form-input.mono {
    font-family: 'JetBrains Mono', monospace;
  }

  .add-form-input::placeholder {
    color: #3b4261;
  }

  .add-form-input:focus {
    outline: none;
    border-color: #7aa2f7;
  }

  .add-input-group {
    display: flex;
    gap: 8px;
  }

  .add-input-group .add-form-input {
    flex: 1;
  }

  .add-browse-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #292e42;
    border: 1px solid #3b4261;
    border-radius: 6px;
    color: #a9b1d6;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .add-browse-btn:hover {
    background: #343b58;
    border-color: #565f89;
  }

  .add-permission-group {
    display: flex;
    gap: 16px;
  }

  .add-permission-option {
    display: flex;
    align-items: center;
    gap: 8px;
    cursor: pointer;
    font-size: 12px;
    color: #a9b1d6;
  }

  .add-permission-option input {
    display: none;
  }

  .permission-radio {
    width: 16px;
    height: 16px;
    border: 2px solid #3b4261;
    border-radius: 50%;
    position: relative;
    transition: all 0.15s ease;
  }

  .add-permission-option.selected .permission-radio {
    border-color: #7aa2f7;
  }

  .add-permission-option.selected .permission-radio::after {
    content: '';
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    width: 8px;
    height: 8px;
    background: #7aa2f7;
    border-radius: 50%;
  }

  .add-permission-option.danger.selected .permission-radio {
    border-color: #e0af68;
  }

  .add-permission-option.danger.selected .permission-radio::after {
    background: #e0af68;
  }

  .add-permission-option.danger.selected span {
    color: #e0af68;
  }

  .add-error {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 12px;
    background: rgba(247, 118, 142, 0.1);
    border: 1px solid rgba(247, 118, 142, 0.2);
    border-radius: 6px;
    font-size: 11px;
    color: #f7768e;
  }

  .add-form-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
  }

  .add-cancel-btn, .add-submit-btn {
    height: 34px;
    padding: 0 16px;
    font-size: 12px;
    font-weight: 500;
    font-family: inherit;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .add-cancel-btn {
    background: transparent;
    border: 1px solid #292e42;
    color: #a9b1d6;
  }

  .add-cancel-btn:hover {
    background: #1f2335;
    border-color: #3b4261;
  }

  .add-submit-btn {
    background: #7aa2f7;
    border: none;
    color: #1a1b26;
  }

  .add-submit-btn:hover {
    background: #89b4fa;
  }

  .add-submit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
`;
