import { useState, useEffect } from 'react';
import { Workspace, PermissionMode, SubdirectoryEntry } from '../../../shared/ipc-types';
import type { WorktreeCreateRequest, GitBranchInfo } from '../../../shared/types/git-types';
import type { ProviderId } from '../../../shared/types/provider-types';
import { useProvider } from '../../hooks/useProvider';

interface NewSessionDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (name: string, workingDirectory: string, permissionMode: 'standard' | 'skip-permissions', worktree?: WorktreeCreateRequest, providerId?: ProviderId) => void;
  sessionCount: number;
  workspaces?: Workspace[];
}

export function NewSessionDialog({ isOpen, onClose, onSubmit, sessionCount, workspaces = [] }: NewSessionDialogProps) {
  const { providers, availableProviders } = useProvider();
  const [name, setName] = useState('');
  const [selectedWorkspaceId, setSelectedWorkspaceId] = useState<string | null>(null);
  const [selectedSubdirectory, setSelectedSubdirectory] = useState<string | null>(null);
  const [subdirectories, setSubdirectories] = useState<SubdirectoryEntry[]>([]);
  const [isLoadingSubdirs, setIsLoadingSubdirs] = useState(false);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>('standard');
  const [error, setError] = useState<string | null>(null);
  const [isAnimating, setIsAnimating] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [workingDirectory, setWorkingDirectory] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isCreatingFolder, setIsCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [selectedProviderId, setSelectedProviderId] = useState<ProviderId>('claude');

  // Worktree state
  const [isGitRepo, setIsGitRepo] = useState(false);
  const [worktreeEnabled, setWorktreeEnabled] = useState(false);
  const [worktreeBranchMode, setWorktreeBranchMode] = useState<'existing' | 'new'>('existing');
  const [worktreeBranch, setWorktreeBranch] = useState('');
  const [worktreeNewBranch, setWorktreeNewBranch] = useState('');
  const [worktreeBaseBranch, setWorktreeBaseBranch] = useState('');
  const [gitBranches, setGitBranches] = useState<GitBranchInfo[]>([]);
  const [worktreeBranchSearch, setWorktreeBranchSearch] = useState('');
  const [isCheckingGit, setIsCheckingGit] = useState(false);
  const [worktreeError, setWorktreeError] = useState<string | null>(null);

  const hasWorkspaces = workspaces.length > 0;

  // Filter subdirectories based on search query
  const filteredSubdirectories = subdirectories.filter(subdir =>
    subdir.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
      setName('');
      setWorkingDirectory('');
      setSelectedWorkspaceId(workspaces.length > 0 ? workspaces[0].id : null);
      setSelectedSubdirectory(null);
      setSubdirectories([]);
      setPermissionMode('standard');
      setError(null);
      setShowAdvanced(false);
      setSearchQuery('');
      setIsCreatingFolder(false);
      setNewFolderName('');
      setIsGitRepo(false);
      setWorktreeEnabled(false);
      setWorktreeBranchMode('existing');
      setWorktreeBranch('');
      setWorktreeNewBranch('');
      setWorktreeBaseBranch('');
      setGitBranches([]);
      setWorktreeBranchSearch('');
      setWorktreeError(null);
      // Default to claude if available, otherwise first available provider
      const claudeAvailable = availableProviders.some(p => p.id === 'claude');
      setSelectedProviderId(claudeAvailable || availableProviders.length === 0 ? 'claude' : availableProviders[0].id);

      // Auto-load first workspace's subdirectories
      if (workspaces.length > 0) {
        loadSubdirectories(workspaces[0]);
      }
    }
  }, [isOpen, workspaces, availableProviders]);

  const loadSubdirectories = async (workspace: Workspace): Promise<SubdirectoryEntry[]> => {
    setIsLoadingSubdirs(true);
    setPermissionMode(workspace.defaultPermissionMode);
    try {
      const subdirs = await window.electronAPI.listSubdirectories(workspace.path);
      setSubdirectories(subdirs);
      return subdirs;
    } catch (err) {
      console.error('Failed to load subdirectories:', err);
      setSubdirectories([]);
      return [];
    } finally {
      setIsLoadingSubdirs(false);
    }
  };

  const handleWorkspaceSelect = async (workspaceId: string) => {
    setSelectedWorkspaceId(workspaceId);
    setSelectedSubdirectory(null);
    setError(null);
    setSearchQuery('');

    const workspace = workspaces.find(w => w.id === workspaceId);
    if (workspace) {
      await loadSubdirectories(workspace);
    }
  };

  const checkGitRepo = async (dirPath: string) => {
    setIsCheckingGit(true);
    setIsGitRepo(false);
    setWorktreeEnabled(false);
    setGitBranches([]);
    setWorktreeError(null);
    try {
      const status = await window.electronAPI.getGitStatus(dirPath);
      if (status.isRepo) {
        setIsGitRepo(true);
        const branches = await window.electronAPI.getGitBranches(dirPath);
        setGitBranches(branches);
        const current = branches.find(b => b.isCurrent);
        if (current) setWorktreeBaseBranch(current.name);
      }
    } catch {
      setIsGitRepo(false);
    } finally {
      setIsCheckingGit(false);
    }
  };

  const handleSubdirectorySelect = (subdir: SubdirectoryEntry) => {
    setSelectedSubdirectory(subdir.path);
    setError(null);
    checkGitRepo(subdir.path);
  };

  const INVALID_FOLDER_CHARS = /[/\\:*?"<>|]/;

  const handleCreateFolder = async () => {
    const trimmed = newFolderName.trim();
    if (!trimmed) {
      setError('Folder name cannot be empty');
      return;
    }
    if (INVALID_FOLDER_CHARS.test(trimmed)) {
      setError('Folder name contains invalid characters');
      return;
    }
    const workspace = workspaces.find(w => w.id === selectedWorkspaceId);
    if (!workspace) return;

    const fullPath = workspace.path + '/' + trimmed;
    const success = await window.electronAPI.createDirectory(fullPath);
    if (success) {
      setIsCreatingFolder(false);
      setNewFolderName('');
      setError(null);
      const updatedSubdirs = await loadSubdirectories(workspace);
      const match = updatedSubdirs.find(s => s.name === trimmed);
      if (match) setSelectedSubdirectory(match.path);
    } else {
      setError('Failed to create folder — it may already exist');
    }
  };

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 150);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (sessionCount >= 10) {
      setError('Maximum 10 sessions reached');
      return;
    }

    if (hasWorkspaces) {
      if (!selectedWorkspaceId) {
        setError('Select a workspace');
        return;
      }
      if (!selectedSubdirectory) {
        setError('Select a directory');
        return;
      }
    } else {
      if (!workingDirectory.trim()) {
        setError('Working directory required');
        return;
      }
    }

    const finalPath = hasWorkspaces ? selectedSubdirectory! : workingDirectory.trim();
    const sessionName = name.trim() || `Session ${sessionCount + 1}`;

    // Build worktree request if enabled
    let worktreeRequest: WorktreeCreateRequest | undefined;
    if (worktreeEnabled && isGitRepo) {
      const branch = worktreeBranchMode === 'new' ? worktreeNewBranch.trim() : worktreeBranch;
      if (!branch) {
        setWorktreeError('Select or enter a branch name');
        return;
      }
      worktreeRequest = {
        mainRepoPath: finalPath,
        branch,
        isNewBranch: worktreeBranchMode === 'new',
        baseBranch: worktreeBranchMode === 'new' ? worktreeBaseBranch : undefined,
      };
    }

    onSubmit(sessionName, finalPath, permissionMode, worktreeRequest, selectedProviderId);
    handleClose();
  };

  const handleBrowse = async () => {
    if (window.electronAPI?.browseDirectory) {
      const dir = await window.electronAPI.browseDirectory();
      if (dir) {
        setWorkingDirectory(dir);
        setError(null);
        checkGitRepo(dir);
      }
    }
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) handleClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) handleClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className={`nsd-overlay ${isAnimating ? 'visible' : ''}`} onClick={handleOverlayClick}>
      <div className={`nsd-dialog ${isAnimating ? 'visible' : ''}`}>
        {/* Header */}
        <div className="nsd-header">
          <h2 className="nsd-title">New Session</h2>
          <button className="nsd-close" onClick={handleClose}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M2 2l10 10M12 2L2 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          {hasWorkspaces ? (
            /* Split Panel Layout */
            <div className="nsd-split">
              {/* Workspace Rail */}
              <div className="nsd-rail">
                <div className="nsd-rail-label">Workspaces</div>
                <div className="nsd-workspace-list">
                  {workspaces.map((ws) => (
                    <button
                      key={ws.id}
                      type="button"
                      className={`nsd-workspace-tab ${selectedWorkspaceId === ws.id ? 'active' : ''}`}
                      onClick={() => handleWorkspaceSelect(ws.id)}
                      title={ws.path}
                    >
                      <span className="nsd-ws-initial">{ws.name.charAt(0).toUpperCase()}</span>
                      <span className="nsd-ws-name">{ws.name}</span>
                      {ws.defaultPermissionMode === 'skip-permissions' && (
                        <span className="nsd-ws-danger">
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M12 2L1 21h22L12 2zm0 4l7.5 13h-15L12 6zm-1 5v4h2v-4h-2zm0 6v2h2v-2h-2z"/>
                          </svg>
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Directory Panel */}
              <div className="nsd-panel">
                <div className="nsd-panel-header">
                  <div className="nsd-search-row">
                    <div className="nsd-search-wrapper">
                      <svg className="nsd-search-icon" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                      </svg>
                      <input
                        type="text"
                        className="nsd-search"
                        placeholder="Search directories..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                      />
                      {searchQuery && (
                        <button
                          type="button"
                          className="nsd-search-clear"
                          onClick={() => setSearchQuery('')}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M18 6L6 18M6 6l12 12"/>
                          </svg>
                        </button>
                      )}
                    </div>
                    <button
                      type="button"
                      className="nsd-new-folder-btn"
                      title="New folder"
                      onClick={() => { setIsCreatingFolder(!isCreatingFolder); setNewFolderName(''); setError(null); }}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <path d="M12 5v14M5 12h14"/>
                      </svg>
                    </button>
                  </div>
                  {isCreatingFolder && (
                    <div className="nsd-new-folder-row">
                      <input
                        type="text"
                        className="nsd-new-folder-input"
                        placeholder="Folder name..."
                        value={newFolderName}
                        onChange={(e) => { setNewFolderName(e.target.value); setError(null); }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); handleCreateFolder(); }
                          if (e.key === 'Escape') { setIsCreatingFolder(false); setNewFolderName(''); setError(null); }
                        }}
                        autoFocus
                      />
                      <button type="button" className="nsd-new-folder-confirm" onClick={handleCreateFolder} title="Create">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <polyline points="20 6 9 17 4 12"/>
                        </svg>
                      </button>
                      <button type="button" className="nsd-new-folder-cancel" onClick={() => { setIsCreatingFolder(false); setNewFolderName(''); setError(null); }} title="Cancel">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M18 6L6 18M6 6l12 12"/>
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
                <div className="nsd-dir-list">
                  {isLoadingSubdirs ? (
                    <div className="nsd-loading">
                      <div className="nsd-spinner" />
                      <span>Loading...</span>
                    </div>
                  ) : subdirectories.length === 0 ? (
                    <div className="nsd-empty">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                      </svg>
                      <span>No directories found</span>
                    </div>
                  ) : filteredSubdirectories.length === 0 ? (
                    <div className="nsd-empty">
                      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <circle cx="11" cy="11" r="8"/>
                        <path d="M21 21l-4.35-4.35"/>
                      </svg>
                      <span>No matches for "{searchQuery}"</span>
                    </div>
                  ) : (
                    filteredSubdirectories.map((subdir) => (
                      <button
                        key={subdir.path}
                        type="button"
                        className={`nsd-dir-item ${selectedSubdirectory === subdir.path ? 'selected' : ''}`}
                        onClick={() => handleSubdirectorySelect(subdir)}
                      >
                        <svg className="nsd-dir-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                        </svg>
                        <span className="nsd-dir-name">{subdir.name}</span>
                      </button>
                    ))
                  )}
                </div>
              </div>
            </div>
          ) : (
            /* No Workspaces - Simple Input */
            <div className="nsd-simple">
              <label className="nsd-label">Working Directory</label>
              <div className="nsd-input-row">
                <input
                  type="text"
                  className="nsd-input"
                  value={workingDirectory}
                  onChange={(e) => { setWorkingDirectory(e.target.value); setError(null); }}
                  placeholder="~/projects/my-app"
                />
                <button type="button" className="nsd-browse" onClick={handleBrowse}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/>
                  </svg>
                </button>
              </div>
            </div>
          )}

          {/* Worktree Toggle */}
          {isGitRepo && !isCheckingGit && (
            <div className="nsd-worktree-section">
              <div className="nsd-worktree-header" onClick={() => setWorktreeEnabled(!worktreeEnabled)}>
                <div className="nsd-worktree-toggle">
                  <div className={`nsd-checkbox ${worktreeEnabled ? 'checked' : ''}`}>
                    {worktreeEnabled && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </div>
                  <span className="nsd-worktree-label">Create worktree for this session</span>
                </div>
                <span className="nsd-worktree-hint">Isolated working directory</span>
              </div>

              {worktreeEnabled && (
                <div className="nsd-worktree-options">
                  {/* Branch mode radio */}
                  <div className="nsd-wt-radio-group">
                    <label className={`nsd-wt-radio ${worktreeBranchMode === 'existing' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="wt-branch-mode"
                        checked={worktreeBranchMode === 'existing'}
                        onChange={() => setWorktreeBranchMode('existing')}
                      />
                      Existing branch
                    </label>
                    <label className={`nsd-wt-radio ${worktreeBranchMode === 'new' ? 'active' : ''}`}>
                      <input
                        type="radio"
                        name="wt-branch-mode"
                        checked={worktreeBranchMode === 'new'}
                        onChange={() => setWorktreeBranchMode('new')}
                      />
                      New branch
                    </label>
                  </div>

                  {worktreeBranchMode === 'existing' ? (
                    <div className="nsd-wt-branch-select">
                      <input
                        type="text"
                        className="nsd-wt-search"
                        placeholder="Search branches..."
                        value={worktreeBranchSearch}
                        onChange={(e) => setWorktreeBranchSearch(e.target.value)}
                      />
                      <div className="nsd-wt-branch-list">
                        {gitBranches
                          .filter(b => !b.isCurrent && b.name.toLowerCase().includes(worktreeBranchSearch.toLowerCase()))
                          .map(b => (
                            <button
                              key={b.name}
                              type="button"
                              className={`nsd-wt-branch-item ${worktreeBranch === b.name ? 'selected' : ''}`}
                              onClick={() => setWorktreeBranch(b.name)}
                            >
                              {b.name}
                            </button>
                          ))
                        }
                        {gitBranches.filter(b => !b.isCurrent && b.name.toLowerCase().includes(worktreeBranchSearch.toLowerCase())).length === 0 && (
                          <div className="nsd-wt-no-branches">No matching branches</div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="nsd-wt-new-branch">
                      <input
                        type="text"
                        className="nsd-wt-input"
                        placeholder="feature/my-branch"
                        value={worktreeNewBranch}
                        onChange={(e) => { setWorktreeNewBranch(e.target.value); setWorktreeError(null); }}
                      />
                      <div className="nsd-wt-base-label">
                        Base:
                        <select
                          className="nsd-wt-base-select"
                          value={worktreeBaseBranch}
                          onChange={(e) => setWorktreeBaseBranch(e.target.value)}
                        >
                          {gitBranches.map(b => (
                            <option key={b.name} value={b.name}>{b.name}{b.isCurrent ? ' (current)' : ''}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  )}

                  {/* Worktree path preview */}
                  <div className="nsd-wt-path-preview">
                    <span className="nsd-wt-path-label">Worktree path:</span>
                    <code className="nsd-wt-path-value">
                      {(() => {
                        const dirPath = hasWorkspaces ? selectedSubdirectory : workingDirectory.trim();
                        const branch = worktreeBranchMode === 'new' ? worktreeNewBranch.trim() : worktreeBranch;
                        if (!dirPath || !branch) return '...';
                        const repoName = dirPath.split(/[\\/]/).pop() || 'repo';
                        const sanitized = branch.replace(/[/\\]/g, '-').replace(/\.\./g, '-');
                        return `../${repoName}-worktrees/${sanitized}/`;
                      })()}
                    </code>
                  </div>

                  {worktreeError && (
                    <div className="nsd-wt-error">{worktreeError}</div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Provider Selector — always shown when providers are registered */}
          {providers.length > 0 && (
            <div className="nsd-provider-section">
              <label className="nsd-label">Provider</label>
              <select
                className="nsd-provider-select"
                value={selectedProviderId}
                onChange={(e) => setSelectedProviderId(e.target.value as ProviderId)}
              >
                {providers.map(p => {
                  const isAvailable = availableProviders.some(ap => ap.id === p.id);
                  return (
                    <option key={p.id} value={p.id} disabled={!isAvailable}>
                      {p.displayName}{!isAvailable ? ' (not installed)' : ''}
                    </option>
                  );
                })}
              </select>
            </div>
          )}

          {/* Footer Controls */}
          <div className="nsd-footer">
            {/* Permission Toggle */}
            <div className="nsd-permission">
              <button
                type="button"
                className={`nsd-perm-toggle ${permissionMode === 'skip-permissions' ? 'danger' : ''}`}
                onClick={() => setPermissionMode(p => p === 'standard' ? 'skip-permissions' : 'standard')}
              >
                <span className={`nsd-perm-option ${permissionMode === 'standard' ? 'active' : ''}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <rect x="3" y="11" width="18" height="11" rx="2"/>
                    <path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                  Standard
                </span>
                <span className={`nsd-perm-option ${permissionMode === 'skip-permissions' ? 'active' : ''}`}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 9v4m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/>
                  </svg>
                  Skip
                </span>
              </button>
            </div>

            {/* Advanced Toggle */}
            <button
              type="button"
              className={`nsd-advanced-toggle ${showAdvanced ? 'open' : ''}`}
              onClick={() => setShowAdvanced(!showAdvanced)}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
              Options
            </button>

            {/* Actions */}
            <div className="nsd-actions">
              <button type="button" className="nsd-btn nsd-btn-cancel" onClick={handleClose}>
                Cancel
              </button>
              <button
                type="submit"
                className={`nsd-btn nsd-btn-submit ${permissionMode === 'skip-permissions' ? 'danger' : ''}`}
                disabled={sessionCount >= 10}
              >
                Create
              </button>
            </div>
          </div>

          {/* Advanced Options */}
          {showAdvanced && (
            <div className="nsd-advanced">
              <label className="nsd-label">Session Name <span className="nsd-optional">optional</span></label>
              <input
                type="text"
                className="nsd-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`Session ${sessionCount + 1}`}
                maxLength={50}
              />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="nsd-error">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10"/>
                <path d="M12 8v4m0 4h.01"/>
              </svg>
              {error}
            </div>
          )}
        </form>
      </div>

      <style>{styles}</style>
    </div>
  );
}

const styles = `
  .nsd-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: var(--z-modal);
    transition: background var(--duration-normal) var(--ease-out);
    font-family: var(--font-ui);
  }

  .nsd-overlay.visible {
    background: rgba(0, 0, 0, 0.6);
  }

  .nsd-dialog {
    width: var(--dialog-width-md, 520px);
    max-width: calc(100vw - 32px);
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-xl);
    overflow: hidden;
    transform: scale(0.96) translateY(8px);
    opacity: 0;
    transition: all var(--duration-normal) var(--ease-out);
  }

  .nsd-dialog.visible {
    transform: scale(1) translateY(0);
    opacity: 1;
  }

  /* Header */
  .nsd-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px var(--space-5);
    border-bottom: 1px solid var(--border-default);
    background: var(--surface-raised);
  }

  .nsd-title {
    font-size: var(--text-md);
    font-weight: var(--weight-semibold);
    color: var(--text-primary);
    margin: 0;
    font-family: var(--font-ui);
  }

  .nsd-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-close:hover {
    background: var(--state-hover);
    color: var(--text-primary);
  }

  /* Split Layout */
  .nsd-split {
    display: flex;
    height: 280px;
    border-bottom: 1px solid var(--border-default);
  }

  /* Workspace Rail */
  .nsd-rail {
    width: 140px;
    background: var(--surface-base);
    border-right: 1px solid var(--border-default);
    display: flex;
    flex-direction: column;
  }

  .nsd-rail-label {
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--text-tertiary);
    padding: 12px 12px 8px;
    font-family: var(--font-ui);
  }

  .nsd-workspace-list {
    flex: 1;
    overflow-y: auto;
    padding: 0 6px 6px;
  }

  .nsd-workspace-tab {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast);
    text-align: left;
    margin-bottom: 4px;
    font-family: var(--font-ui);
  }

  .nsd-workspace-tab:hover {
    background: var(--surface-overlay);
    border-color: var(--border-default);
  }

  .nsd-workspace-tab.active {
    background: var(--accent-primary-muted);
    border-color: var(--border-accent);
    color: var(--text-primary);
  }

  .nsd-ws-initial {
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-high);
    border-radius: var(--radius-sm);
    font-size: 11px;
    font-weight: var(--weight-semibold);
    color: var(--text-accent);
    flex-shrink: 0;
    font-family: var(--font-mono-ui);
  }

  .nsd-workspace-tab.active .nsd-ws-initial {
    background: var(--accent-primary);
    color: var(--text-inverse);
  }

  .nsd-ws-name {
    flex: 1;
    font-size: var(--text-xs);
    font-weight: var(--weight-medium);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .nsd-ws-danger {
    color: var(--semantic-warning);
    flex-shrink: 0;
  }

  /* Directory Panel */
  .nsd-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .nsd-panel-header {
    padding: 8px;
    border-bottom: 1px solid var(--border-default);
  }

  .nsd-search-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .nsd-search-icon {
    position: absolute;
    left: 10px;
    color: var(--text-tertiary);
    pointer-events: none;
  }

  .nsd-search {
    width: 100%;
    height: 36px;
    padding: 0 32px 0 34px;
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-search::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-search:focus {
    outline: none;
    border-color: var(--border-accent);
    background: var(--surface-base);
  }

  .nsd-search-clear {
    position: absolute;
    right: 6px;
    width: 24px;
    height: 24px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-search-clear:hover {
    background: var(--state-hover);
    color: var(--text-secondary);
  }

  .nsd-search-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .nsd-search-row .nsd-search-wrapper {
    flex: 1;
  }

  .nsd-new-folder-btn {
    width: 36px;
    height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .nsd-new-folder-btn:hover {
    background: var(--state-hover);
    color: var(--text-accent);
    border-color: var(--border-strong);
  }

  .nsd-new-folder-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 6px;
    animation: nsd-slideDown 0.15s ease;
  }

  .nsd-new-folder-input {
    flex: 1;
    height: 32px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-accent);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-new-folder-input::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-new-folder-input:focus {
    outline: none;
    box-shadow: 0 0 0 3px var(--accent-primary-muted);
  }

  .nsd-new-folder-confirm,
  .nsd-new-folder-cancel {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .nsd-new-folder-confirm {
    color: var(--semantic-success);
  }

  .nsd-new-folder-confirm:hover {
    background: var(--semantic-success-muted);
    border-color: var(--semantic-success);
  }

  .nsd-new-folder-cancel {
    color: var(--text-tertiary);
  }

  .nsd-new-folder-cancel:hover {
    background: var(--state-hover);
    color: var(--text-secondary);
  }

  .nsd-dir-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
  }

  .nsd-loading, .nsd-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100%;
    gap: 12px;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
  }

  .nsd-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: nsd-spin 0.8s linear infinite;
  }

  @keyframes nsd-spin {
    to { transform: rotate(360deg); }
  }

  .nsd-dir-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 12px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast);
    text-align: left;
    font-family: var(--font-ui);
  }

  .nsd-dir-item:hover {
    background: var(--surface-float);
    border-color: var(--border-default);
  }

  .nsd-dir-item.selected {
    background: var(--accent-primary-muted);
    border-color: var(--border-accent);
  }

  .nsd-dir-icon {
    color: var(--text-tertiary);
    flex-shrink: 0;
  }

  .nsd-dir-item.selected .nsd-dir-icon {
    color: var(--text-accent);
  }

  .nsd-dir-name {
    font-size: var(--text-sm);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Provider Section */
  .nsd-provider-section {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-default);
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .nsd-provider-section .nsd-label {
    margin-bottom: 0;
    flex-shrink: 0;
  }

  .nsd-provider-select {
    flex: 1;
    height: 32px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-provider-select:focus {
    outline: none;
    border-color: var(--border-accent);
    box-shadow: 0 0 0 3px var(--accent-primary-muted);
  }

  /* Simple Layout (no workspaces) */
  .nsd-simple {
    padding: 20px;
    border-bottom: 1px solid var(--border-default);
  }

  .nsd-label {
    display: block;
    font-size: var(--text-2xs);
    font-weight: var(--weight-semibold);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    color: var(--text-tertiary);
    margin-bottom: 8px;
    font-family: var(--font-ui);
  }

  .nsd-optional {
    font-weight: var(--weight-normal);
    text-transform: none;
    letter-spacing: normal;
    color: var(--text-tertiary);
    margin-left: 6px;
    opacity: 0.6;
  }

  .nsd-input-row {
    display: flex;
    gap: 8px;
  }

  .nsd-input {
    flex: 1;
    height: 40px;
    padding: 0 14px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    color: var(--text-primary);
    font-size: var(--text-sm);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-input::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-input:focus {
    outline: none;
    border-color: var(--border-accent);
    box-shadow: 0 0 0 3px var(--accent-primary-muted);
  }

  .nsd-browse {
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--surface-float);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-md);
    color: var(--text-secondary);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-browse:hover {
    background: var(--surface-high);
    border-color: var(--border-accent);
    color: var(--text-accent);
  }

  /* Footer */
  .nsd-footer {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 12px 16px;
    background: var(--surface-raised);
    border-top: 1px solid var(--border-default);
  }

  .nsd-permission {
    flex-shrink: 0;
  }

  .nsd-perm-toggle {
    display: flex;
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-md);
    padding: 2px;
    cursor: pointer;
  }

  .nsd-perm-toggle.danger {
    border-color: rgba(247, 167, 74, 0.3);
  }

  .nsd-perm-option {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    color: var(--text-tertiary);
    transition: all var(--duration-fast);
    font-family: var(--font-ui);
  }

  .nsd-perm-option.active {
    background: var(--surface-high);
    color: var(--text-primary);
  }

  .nsd-perm-toggle.danger .nsd-perm-option.active {
    background: var(--semantic-warning-muted);
    color: var(--semantic-warning);
  }

  .nsd-advanced-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 10px;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-tertiary);
    font-size: var(--text-2xs);
    font-weight: var(--weight-medium);
    font-family: var(--font-ui);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-advanced-toggle:hover {
    background: var(--state-hover);
    color: var(--text-secondary);
  }

  .nsd-advanced-toggle.open {
    color: var(--text-accent);
  }

  .nsd-advanced-toggle svg {
    transition: transform 0.2s;
  }

  .nsd-advanced-toggle.open svg {
    transform: rotate(180deg);
  }

  .nsd-actions {
    display: flex;
    gap: 8px;
    margin-left: auto;
  }

  .nsd-btn {
    height: 34px;
    padding: 0 16px;
    font-size: var(--text-sm);
    font-weight: var(--weight-semibold);
    font-family: var(--font-ui);
    border-radius: var(--radius-md);
    cursor: pointer;
    transition: all var(--duration-fast);
  }

  .nsd-btn-cancel {
    background: transparent;
    border: 1px solid var(--border-default);
    color: var(--text-secondary);
  }

  .nsd-btn-cancel:hover {
    background: var(--state-hover);
    border-color: var(--border-strong);
  }

  .nsd-btn-submit {
    background: var(--accent-primary);
    border: none;
    color: var(--text-inverse);
  }

  .nsd-btn-submit:hover {
    background: var(--accent-primary-dim);
  }

  .nsd-btn-submit.danger {
    background: var(--semantic-warning);
  }

  .nsd-btn-submit.danger:hover {
    opacity: 0.9;
  }

  .nsd-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Advanced Section */
  .nsd-advanced {
    padding: 16px 20px;
    background: var(--surface-raised);
    border-top: 1px solid var(--border-default);
    animation: nsd-slideDown 0.2s ease;
  }

  @keyframes nsd-slideDown {
    from {
      opacity: 0;
      transform: translateY(-8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Error */
  .nsd-error {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 12px 16px 16px;
    padding: 10px 14px;
    background: var(--semantic-error-muted);
    border: 1px solid rgba(247, 103, 142, 0.3);
    border-radius: var(--radius-md);
    font-size: var(--text-xs);
    color: var(--semantic-error);
    font-family: var(--font-ui);
  }

  /* Worktree Section */
  .nsd-worktree-section {
    border-bottom: 1px solid var(--border-default);
    padding: 12px 16px;
  }

  .nsd-worktree-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    user-select: none;
  }

  .nsd-worktree-toggle {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .nsd-checkbox {
    width: 16px;
    height: 16px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all var(--duration-fast);
    flex-shrink: 0;
  }

  .nsd-checkbox.checked {
    background: var(--semantic-success);
    border-color: var(--semantic-success);
    color: var(--text-inverse);
  }

  .nsd-worktree-label {
    font-size: var(--text-xs);
    color: var(--text-secondary);
    font-weight: var(--weight-medium);
    font-family: var(--font-ui);
  }

  .nsd-worktree-hint {
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    font-family: var(--font-ui);
  }

  .nsd-worktree-options {
    margin-top: 12px;
    padding-top: 12px;
    border-top: 1px solid var(--border-default);
    display: flex;
    flex-direction: column;
    gap: 10px;
    animation: nsd-slideDown 0.15s ease;
  }

  .nsd-wt-radio-group {
    display: flex;
    gap: 16px;
  }

  .nsd-wt-radio {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: var(--text-xs);
    color: var(--text-tertiary);
    cursor: pointer;
    transition: color var(--duration-fast);
    font-family: var(--font-ui);
  }

  .nsd-wt-radio.active {
    color: var(--text-secondary);
  }

  .nsd-wt-radio input {
    accent-color: var(--semantic-success);
  }

  .nsd-wt-branch-select {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .nsd-wt-search {
    height: 32px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-wt-search:focus {
    outline: none;
    border-color: var(--semantic-success);
  }

  .nsd-wt-search::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-wt-branch-list {
    max-height: 120px;
    overflow-y: auto;
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    background: var(--surface-base);
  }

  .nsd-wt-branch-item {
    width: 100%;
    padding: 6px 10px;
    background: transparent;
    border: none;
    color: var(--text-secondary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    text-align: left;
    cursor: pointer;
    transition: all 0.1s;
  }

  .nsd-wt-branch-item:hover {
    background: var(--surface-float);
  }

  .nsd-wt-branch-item.selected {
    background: var(--semantic-success-muted);
    color: var(--semantic-success);
  }

  .nsd-wt-no-branches {
    padding: 12px;
    text-align: center;
    color: var(--text-tertiary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
  }

  .nsd-wt-new-branch {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .nsd-wt-input {
    height: 32px;
    padding: 0 10px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-primary);
    font-size: var(--text-xs);
    font-family: var(--font-ui);
    transition: all var(--duration-fast);
  }

  .nsd-wt-input:focus {
    outline: none;
    border-color: var(--semantic-success);
  }

  .nsd-wt-input::placeholder {
    color: var(--text-tertiary);
  }

  .nsd-wt-base-label {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    font-family: var(--font-ui);
  }

  .nsd-wt-base-select {
    flex: 1;
    height: 28px;
    padding: 0 8px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: var(--radius-sm);
    color: var(--text-secondary);
    font-size: var(--text-2xs);
    font-family: var(--font-ui);
  }

  .nsd-wt-path-preview {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .nsd-wt-path-label {
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    text-transform: uppercase;
    letter-spacing: var(--tracking-widest);
    font-family: var(--font-ui);
  }

  .nsd-wt-path-value {
    padding: 6px 10px;
    background: var(--surface-float);
    border-radius: var(--radius-sm);
    font-size: var(--text-2xs);
    color: var(--text-tertiary);
    word-break: break-all;
    font-family: var(--font-mono-ui);
  }

  .nsd-wt-error {
    font-size: var(--text-2xs);
    color: var(--semantic-error);
    padding: 6px 10px;
    background: var(--semantic-error-muted);
    border-radius: var(--radius-sm);
    font-family: var(--font-ui);
  }

  .nsd-wt-branch-list::-webkit-scrollbar {
    width: 4px;
  }

  .nsd-wt-branch-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .nsd-wt-branch-list::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 2px;
  }

  /* Scrollbar styling */
  .nsd-workspace-list::-webkit-scrollbar,
  .nsd-dir-list::-webkit-scrollbar {
    width: 6px;
  }

  .nsd-workspace-list::-webkit-scrollbar-track,
  .nsd-dir-list::-webkit-scrollbar-track {
    background: transparent;
  }

  .nsd-workspace-list::-webkit-scrollbar-thumb,
  .nsd-dir-list::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 3px;
  }

  .nsd-workspace-list::-webkit-scrollbar-thumb:hover,
  .nsd-dir-list::-webkit-scrollbar-thumb:hover {
    background: var(--border-strong);
  }
`;
