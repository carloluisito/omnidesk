/**
 * CustomCommandPanel — list, discover, and manage custom slash commands.
 *
 * Displays all commands accessible in the current context (project + user +
 * session scopes), with scope badges, parameter counts, and delete/edit actions.
 *
 * Designed to be embedded in SettingsDialog as a "Commands" tab, or surfaced
 * as a standalone panel anywhere in the layout.
 *
 * Usage:
 *   <CustomCommandPanel
 *     projectDir={activeSessionDir}
 *     sessionId={activeSessionId}
 *   />
 */

import { useState, useCallback } from 'react';
import { useCustomCommands } from '../hooks/useCustomCommands';
import { CustomCommandDialog } from './CustomCommandDialog';
import type { CustomCommand, CommandScope } from '../../shared/types/custom-command-types';

interface CustomCommandPanelProps {
  /** If provided, project-scoped commands are loaded from this directory. */
  projectDir?: string;
  /** If provided, session-only commands are included. */
  sessionId?: string | null;
  /** Optional CSS class for the root element. */
  className?: string;
}

// ── Scope badge ────────────────────────────────────────────────────────────

function ScopeBadge({ scope }: { scope: CommandScope }) {
  const label = scope === 'project' ? 'project' : scope === 'user' ? 'user' : 'session';
  const colorClass =
    scope === 'project'
      ? 'cc-badge-project'
      : scope === 'user'
      ? 'cc-badge-user'
      : 'cc-badge-session';
  return <span className={`cc-badge ${colorClass}`}>{label}</span>;
}

// ── Empty state ────────────────────────────────────────────────────────────

function EmptyState({ onCreateClick }: { onCreateClick: () => void }) {
  return (
    <div className="cc-empty">
      <div className="cc-empty-icon">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <polyline points="16 18 22 12 16 6" />
          <polyline points="8 6 2 12 8 18" />
        </svg>
      </div>
      <p className="cc-empty-title">No custom commands yet</p>
      <p className="cc-empty-desc">
        Create a command to save reusable instructions for Claude.
        Commands are stored as <code>.md</code> files in{' '}
        <code>.claude/commands/</code> and work in standalone Claude CLI
        sessions too.
      </p>
      <button className="cc-btn-primary" onClick={onCreateClick}>
        New command
      </button>
    </div>
  );
}

// ── Command row ────────────────────────────────────────────────────────────

interface CommandRowProps {
  command: CustomCommand;
  onEdit: (cmd: CustomCommand) => void;
  onDelete: (cmd: CustomCommand) => void;
  isDeleting: boolean;
}

function CommandRow({ command, onEdit, onDelete, isDeleting }: CommandRowProps) {
  return (
    <div className="cc-row">
      <div className="cc-row-main">
        <div className="cc-row-name">
          <span className="cc-row-slash">/</span>
          <span className="cc-row-slug">{command.slug}</span>
          <ScopeBadge scope={command.scope} />
          {command.parameters.length > 0 && (
            <span className="cc-row-params" title={`${command.parameters.length} parameter${command.parameters.length > 1 ? 's' : ''}`}>
              {command.parameters.length}p
            </span>
          )}
        </div>
        <div className="cc-row-desc">
          {command.description || <em className="cc-row-no-desc">No description</em>}
        </div>
        {command.tags.length > 0 && (
          <div className="cc-row-tags">
            {command.tags.map(tag => (
              <span key={tag} className="cc-tag">{tag}</span>
            ))}
          </div>
        )}
      </div>
      <div className="cc-row-actions">
        <button
          className="cc-btn-icon"
          title="Edit command"
          onClick={() => onEdit(command)}
          disabled={isDeleting}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
        </button>
        {command.scope !== 'session' && (
          <button
            className="cc-btn-icon cc-btn-danger"
            title="Delete command"
            onClick={() => onDelete(command)}
            disabled={isDeleting}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="3 6 5 6 21 6" />
              <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" />
              <path d="M10 11v6M14 11v6" />
              <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

// ── Usage hint section ─────────────────────────────────────────────────────

function UsageHint({ projectDir }: { projectDir?: string }) {
  const projectPath = projectDir
    ? `${projectDir.replace(/\\/g, '/')}/.claude/commands/`
    : '.claude/commands/';
  return (
    <div className="cc-hint">
      <div className="cc-hint-icon">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <div className="cc-hint-body">
        <strong>Project commands</strong> are saved in{' '}
        <code className="cc-hint-code">{projectPath}</code> — commit them to share with your
        team. <strong>User commands</strong> are in{' '}
        <code className="cc-hint-code">~/.claude/commands/</code> — available in all projects.
        Both scopes are recognized by the Claude CLI too.
        <br />
        <span className="cc-hint-gitignore">
          💡 Add <code className="cc-hint-code">.claude/commands/</code> to <code>.gitignore</code>{' '}
          to keep commands local; or commit them to share with teammates.
        </span>
      </div>
    </div>
  );
}

// ── Panel ──────────────────────────────────────────────────────────────────

export function CustomCommandPanel({ projectDir, sessionId, className }: CustomCommandPanelProps) {
  const { commands, isLoading, error, loadCommands, createCommand, updateCommand, deleteCommand } =
    useCustomCommands({ projectDir, sessionId });

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCommand, setEditingCommand] = useState<CustomCommand | null>(null);
  const [deletingSlug, setDeletingSlug] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [filterScope, setFilterScope] = useState<CommandScope | 'all'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ── Filtering ────────────────────────────────────────────────────────

  const filtered = commands.filter(cmd => {
    if (filterScope !== 'all' && cmd.scope !== filterScope) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        cmd.slug.includes(q) ||
        cmd.description.toLowerCase().includes(q) ||
        cmd.tags.some(t => t.toLowerCase().includes(q))
      );
    }
    return true;
  });

  const projectCount = commands.filter(c => c.scope === 'project').length;
  const userCount = commands.filter(c => c.scope === 'user').length;
  const sessionCount = commands.filter(c => c.scope === 'session').length;

  // ── Actions ──────────────────────────────────────────────────────────

  const handleOpenCreate = useCallback(() => {
    setEditingCommand(null);
    setIsDialogOpen(true);
  }, []);

  const handleOpenEdit = useCallback((cmd: CustomCommand) => {
    setEditingCommand(cmd);
    setIsDialogOpen(true);
  }, []);

  const handleCloseDialog = useCallback(() => {
    setIsDialogOpen(false);
    setEditingCommand(null);
  }, []);

  const handleSave = useCallback(
    async (data: {
      name: string;
      description: string;
      body: string;
      scope: 'project' | 'user' | 'session';
      parameters: Array<{ name: string; description: string; required: boolean; default?: string }>;
      tags: string[];
      icon: string;
    }) => {
      if (editingCommand) {
        await updateCommand({
          slug: editingCommand.slug,
          scope: editingCommand.scope,
          description: data.description,
          body: data.body,
          parameters: data.parameters,
          tags: data.tags,
          icon: data.icon,
          projectDir: editingCommand.scope === 'project' ? projectDir : undefined,
          sessionId: editingCommand.scope === 'session' ? sessionId ?? undefined : undefined,
        });
      } else {
        await createCommand({
          name: data.name,
          description: data.description,
          body: data.body,
          scope: data.scope,
          parameters: data.parameters,
          tags: data.tags,
          icon: data.icon,
          projectDir: data.scope === 'project' ? projectDir : undefined,
          sessionId: data.scope === 'session' ? sessionId ?? undefined : undefined,
        });
      }
      setIsDialogOpen(false);
      setEditingCommand(null);
    },
    [editingCommand, createCommand, updateCommand, projectDir, sessionId],
  );

  const handleDelete = useCallback(
    async (cmd: CustomCommand) => {
      setDeletingSlug(cmd.slug);
      setDeleteError(null);
      try {
        await deleteCommand({
          slug: cmd.slug,
          scope: cmd.scope,
          projectDir: cmd.scope === 'project' ? projectDir : undefined,
          sessionId: cmd.scope === 'session' ? sessionId ?? undefined : undefined,
        });
      } catch (err) {
        setDeleteError(err instanceof Error ? err.message : 'Delete failed');
      } finally {
        setDeletingSlug(null);
      }
    },
    [deleteCommand, projectDir, sessionId],
  );

  // ── Render ───────────────────────────────────────────────────────────

  return (
    <div className={`cc-panel ${className ?? ''}`}>
      {/* Header */}
      <div className="cc-header">
        <div className="cc-header-left">
          <h3 className="cc-title">Custom Commands</h3>
          <div className="cc-counters">
            {projectCount > 0 && (
              <span className="cc-counter">
                <span className="cc-counter-dot cc-counter-dot-project" />
                {projectCount} project
              </span>
            )}
            {userCount > 0 && (
              <span className="cc-counter">
                <span className="cc-counter-dot cc-counter-dot-user" />
                {userCount} user
              </span>
            )}
            {sessionCount > 0 && (
              <span className="cc-counter">
                <span className="cc-counter-dot cc-counter-dot-session" />
                {sessionCount} session
              </span>
            )}
          </div>
        </div>
        <div className="cc-header-right">
          <button
            className="cc-btn-refresh"
            title="Reload commands from disk"
            onClick={loadCommands}
            disabled={isLoading}
          >
            <svg
              width="13"
              height="13"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className={isLoading ? 'cc-spin' : ''}
            >
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 11-2.12-9.36L23 10" />
            </svg>
          </button>
          <button className="cc-btn-primary" onClick={handleOpenCreate}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 5v14M5 12h14" strokeLinecap="round" />
            </svg>
            New command
          </button>
        </div>
      </div>

      {/* Toolbar (search + scope filter) */}
      {commands.length > 0 && (
        <div className="cc-toolbar">
          <div className="cc-search-wrapper">
            <svg className="cc-search-icon" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="cc-search"
              type="text"
              placeholder="Search commands…"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className="cc-search-clear" onClick={() => setSearchQuery('')}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <path d="M18 6L6 18M6 6l12 12" strokeLinecap="round" />
                </svg>
              </button>
            )}
          </div>
          <div className="cc-scope-filter">
            {(['all', 'project', 'user', 'session'] as const).map(scope => (
              <button
                key={scope}
                className={`cc-scope-btn ${filterScope === scope ? 'active' : ''}`}
                onClick={() => setFilterScope(scope)}
              >
                {scope === 'all' ? 'All' : scope.charAt(0).toUpperCase() + scope.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Error state */}
      {error && (
        <div className="cc-error">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
      )}

      {deleteError && (
        <div className="cc-error">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {deleteError}
        </div>
      )}

      {/* Loading state */}
      {isLoading && commands.length === 0 && (
        <div className="cc-loading">
          <div className="cc-spinner" />
          Loading commands…
        </div>
      )}

      {/* Empty state */}
      {!isLoading && commands.length === 0 && !error && (
        <EmptyState onCreateClick={handleOpenCreate} />
      )}

      {/* Command list */}
      {filtered.length > 0 && (
        <div className="cc-list">
          {filtered.map(cmd => (
            <CommandRow
              key={`${cmd.scope}:${cmd.slug}`}
              command={cmd}
              onEdit={handleOpenEdit}
              onDelete={handleDelete}
              isDeleting={deletingSlug === cmd.slug}
            />
          ))}
        </div>
      )}

      {/* No results after filtering */}
      {!isLoading && commands.length > 0 && filtered.length === 0 && (
        <div className="cc-no-results">No commands match "{searchQuery}"</div>
      )}

      {/* Usage hint */}
      {commands.length > 0 && <UsageHint projectDir={projectDir} />}

      {/* Create / Edit dialog */}
      <CustomCommandDialog
        isOpen={isDialogOpen}
        editingCommand={editingCommand}
        defaultScope={projectDir ? 'project' : 'user'}
        onSave={handleSave}
        onClose={handleCloseDialog}
        projectDir={projectDir}
        sessionId={sessionId ?? undefined}
      />

      <style>{panelStyles}</style>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const panelStyles = `
  .cc-panel {
    display: flex;
    flex-direction: column;
    gap: 0;
    height: 100%;
    min-height: 0;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  /* Header */
  .cc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px 12px;
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .cc-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .cc-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .cc-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-primary);
    margin: 0;
  }

  .cc-counters {
    display: flex;
    gap: 10px;
  }

  .cc-counter {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    color: var(--text-tertiary);
  }

  .cc-counter-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }
  .cc-counter-dot-project { background: var(--accent-primary); }
  .cc-counter-dot-user { background: #a78bfa; }
  .cc-counter-dot-session { background: var(--semantic-warning); }

  /* Toolbar */
  .cc-toolbar {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .cc-search-wrapper {
    position: relative;
    flex: 1;
    min-width: 0;
  }

  .cc-search-icon {
    position: absolute;
    left: 9px;
    top: 50%;
    transform: translateY(-50%);
    color: var(--text-tertiary);
    pointer-events: none;
  }

  .cc-search {
    width: 100%;
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-primary);
    font-size: 12px;
    font-family: inherit;
    padding: 5px 28px 5px 30px;
    outline: none;
    box-sizing: border-box;
  }

  .cc-search:focus {
    border-color: var(--accent-primary);
  }

  .cc-search-clear {
    position: absolute;
    right: 7px;
    top: 50%;
    transform: translateY(-50%);
    background: transparent;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    padding: 2px;
    display: flex;
    align-items: center;
  }

  .cc-search-clear:hover { color: var(--text-secondary); }

  .cc-scope-filter {
    display: flex;
    gap: 2px;
  }

  .cc-scope-btn {
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: 5px;
    color: var(--text-tertiary);
    font-size: 11px;
    font-family: inherit;
    padding: 4px 9px;
    cursor: pointer;
    transition: all 0.1s;
  }

  .cc-scope-btn:hover { color: var(--text-secondary); }
  .cc-scope-btn.active {
    background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    border-color: var(--accent-primary);
    color: var(--accent-primary);
  }

  /* Buttons */
  .cc-btn-primary {
    display: flex;
    align-items: center;
    gap: 5px;
    background: var(--accent-primary);
    border: none;
    border-radius: 6px;
    color: var(--surface-overlay, #0d0e14);
    font-size: 12px;
    font-weight: 600;
    font-family: inherit;
    padding: 6px 12px;
    cursor: pointer;
    white-space: nowrap;
  }

  .cc-btn-primary:hover { opacity: 0.9; }

  .cc-btn-refresh {
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-tertiary);
    padding: 5px 8px;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .cc-btn-refresh:hover { color: var(--text-secondary); }
  .cc-btn-refresh:disabled { opacity: 0.5; cursor: default; }

  .cc-btn-icon {
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: var(--text-tertiary);
    padding: 4px;
    cursor: pointer;
    display: flex;
    align-items: center;
    transition: all 0.1s;
  }

  .cc-btn-icon:hover {
    border-color: var(--border-default);
    color: var(--text-secondary);
  }

  .cc-btn-icon.cc-btn-danger:hover {
    border-color: var(--semantic-error);
    color: var(--semantic-error);
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
  }

  .cc-btn-icon:disabled { opacity: 0.4; cursor: default; }

  /* List */
  .cc-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px 0;
  }

  .cc-row {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 10px 20px;
    border-bottom: 1px solid var(--border-default);
    gap: 12px;
    transition: background 0.1s;
  }

  .cc-row:last-child { border-bottom: none; }
  .cc-row:hover { background: color-mix(in srgb, var(--accent-primary) 4%, transparent); }

  .cc-row-main {
    display: flex;
    flex-direction: column;
    gap: 3px;
    flex: 1;
    min-width: 0;
  }

  .cc-row-name {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .cc-row-slash {
    color: var(--accent-primary);
    font-size: 13px;
    font-weight: 700;
    font-family: var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace);
  }

  .cc-row-slug {
    color: var(--text-primary);
    font-size: 13px;
    font-weight: 600;
    font-family: var(--font-mono, 'JetBrains Mono', 'Fira Code', monospace);
  }

  .cc-row-params {
    font-size: 10px;
    padding: 1px 5px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--text-tertiary) 15%, transparent);
    color: var(--text-tertiary);
    font-family: inherit;
  }

  .cc-row-desc {
    font-size: 12px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .cc-row-no-desc {
    color: var(--text-tertiary);
    font-style: italic;
  }

  .cc-row-tags {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
  }

  .cc-tag {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--accent-primary) 12%, transparent);
    color: var(--accent-primary);
    font-family: inherit;
  }

  .cc-row-actions {
    display: flex;
    gap: 2px;
    flex-shrink: 0;
    margin-top: 2px;
  }

  /* Scope badges */
  .cc-badge {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 500;
    font-family: inherit;
    letter-spacing: 0.02em;
  }

  .cc-badge-project {
    background: color-mix(in srgb, var(--accent-primary) 15%, transparent);
    color: var(--accent-primary);
  }

  .cc-badge-user {
    background: color-mix(in srgb, #a78bfa 15%, transparent);
    color: #a78bfa;
  }

  .cc-badge-session {
    background: color-mix(in srgb, var(--semantic-warning) 15%, transparent);
    color: var(--semantic-warning);
  }

  /* States */
  .cc-loading, .cc-no-results {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 24px 20px;
    color: var(--text-tertiary);
    font-size: 13px;
  }

  .cc-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: cc-spin 0.7s linear infinite;
    flex-shrink: 0;
  }

  @keyframes cc-spin { to { transform: rotate(360deg); } }

  .cc-spin {
    animation: cc-spin 0.7s linear infinite;
  }

  .cc-error {
    display: flex;
    align-items: center;
    gap: 8px;
    margin: 8px 20px;
    padding: 8px 12px;
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-error) 30%, transparent);
    border-radius: 6px;
    color: var(--semantic-error);
    font-size: 12px;
    flex-shrink: 0;
  }

  /* Empty state */
  .cc-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 32px;
    text-align: center;
    gap: 12px;
    flex: 1;
  }

  .cc-empty-icon {
    color: var(--text-tertiary);
    opacity: 0.5;
  }

  .cc-empty-title {
    font-size: 14px;
    font-weight: 600;
    color: var(--text-secondary);
    margin: 0;
  }

  .cc-empty-desc {
    font-size: 12px;
    color: var(--text-tertiary);
    max-width: 400px;
    line-height: 1.6;
    margin: 0;
  }

  .cc-empty code {
    font-family: var(--font-mono, monospace);
    font-size: 11px;
    background: var(--surface-overlay);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* Hint */
  .cc-hint {
    display: flex;
    gap: 9px;
    padding: 10px 20px;
    border-top: 1px solid var(--border-default);
    background: color-mix(in srgb, var(--accent-primary) 4%, transparent);
    flex-shrink: 0;
  }

  .cc-hint-icon {
    color: var(--accent-primary);
    flex-shrink: 0;
    margin-top: 1px;
  }

  .cc-hint-body {
    font-size: 11px;
    color: var(--text-tertiary);
    line-height: 1.6;
  }

  .cc-hint-code {
    font-family: var(--font-mono, monospace);
    font-size: 10.5px;
    background: color-mix(in srgb, var(--border-default) 60%, transparent);
    padding: 1px 4px;
    border-radius: 3px;
    color: var(--text-secondary);
  }

  .cc-hint-gitignore {
    display: inline-block;
    margin-top: 3px;
    color: var(--text-tertiary);
  }
`;
