/**
 * GitPanel — Redesigned Git panel matching Obsidian design spec §6.5.
 *
 * Layout: Branch header → Staged section → Unstaged section →
 *         Commit textarea → Generate/Commit actions → Worktrees
 *
 * All IPC calls, hooks, and manager logic are unchanged.
 * Visual overhaul only.
 */

import { useState, useEffect, useCallback } from 'react';
import { useGit } from '../hooks/useGit';
import { CommitDialog } from './ui/CommitDialog';
import { ConfirmDialog } from './ui';
import { DiffViewer } from './DiffViewer';
import { SidePanel } from './SidePanel';
import type { GitFileEntry } from '../../shared/types/git-types';
import {
  GitBranch,
  RefreshCw,
  PlusCircle,
  MinusCircle,
  Sparkles,
  GitFork,
  Plus,
  AlertTriangle,
  Check,
  X,
} from 'lucide-react';

interface GitPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string | null;
  activeSessionId: string | null;
}

// ─── File status helpers ───────────────────────────────────────────────────

import type { GitFileStatus } from '../../shared/types/git-types';

function getDisplayStatus(file: GitFileEntry): GitFileStatus {
  return file.area === 'staged' ? file.indexStatus : file.workTreeStatus;
}

function statusColor(status: GitFileStatus): string {
  switch (status) {
    case 'modified': return 'var(--semantic-warning)';
    case 'added': return 'var(--semantic-success)';
    case 'deleted': return 'var(--semantic-error)';
    case 'unmerged': return 'var(--semantic-error)';
    case 'untracked': return 'var(--text-tertiary)';
    case 'renamed':
    case 'copied': return 'var(--semantic-info)';
    default: return 'var(--text-tertiary)';
  }
}

function statusLabel(status: GitFileStatus): string {
  switch (status) {
    case 'modified': return 'M';
    case 'added': return 'A';
    case 'deleted': return 'D';
    case 'renamed': return 'R';
    case 'copied': return 'C';
    case 'untracked': return '?';
    case 'unmerged': return 'U';
    default: return '?';
  }
}

function StatusIcon({ status }: { status: GitFileStatus }) {
  const color = statusColor(status);
  const label = statusLabel(status);
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 16,
        height: 16,
        fontSize: 10,
        fontWeight: 700,
        fontFamily: 'var(--font-mono-ui)',
        color,
        flexShrink: 0,
      }}
    >
      {label}
    </span>
  );
}

// ─── File row ─────────────────────────────────────────────────────────────

interface FileRowProps {
  file: GitFileEntry;
  onClick: (file: GitFileEntry) => void;
  onToggle: (file: GitFileEntry) => void;
}

function FileRow({ file, onClick, onToggle }: FileRowProps) {
  const [hovered, setHovered] = useState(false);
  const parts = file.path.split('/');
  const filename = parts[parts.length - 1];
  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';

  return (
    <div
      onClick={() => onClick(file)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '3px var(--space-3)',
        cursor: 'pointer',
        background: hovered ? 'var(--state-hover)' : 'transparent',
        transition: 'background var(--duration-instant)',
        minWidth: 0,
      }}
    >
      <StatusIcon status={getDisplayStatus(file)} />
      <span
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono-ui)',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
        title={file.path}
      >
        {dir && (
          <span style={{ color: 'var(--text-tertiary)' }}>{dir}</span>
        )}
        {filename}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onToggle(file); }}
        style={{
          display: hovered ? 'flex' : 'none',
          alignItems: 'center',
          justifyContent: 'center',
          width: 16,
          height: 16,
          background: 'none',
          border: 'none',
          borderRadius: 2,
          color: 'var(--text-tertiary)',
          cursor: 'pointer',
          padding: 0,
          flexShrink: 0,
        }}
        title={file.area === 'staged' ? 'Unstage' : 'Stage'}
      >
        {file.area === 'staged'
          ? <MinusCircle size={12} />
          : <PlusCircle size={12} />}
      </button>
    </div>
  );
}

// ─── Section header ────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  count: number;
  actionLabel?: string;
  onAction?: () => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

function SectionHeader({
  title,
  count,
  actionLabel,
  onAction,
  collapsed,
  onToggleCollapse,
}: SectionHeaderProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        padding: '6px var(--space-3)',
        cursor: 'pointer',
        userSelect: 'none',
        gap: 'var(--space-2)',
      }}
      onClick={onToggleCollapse}
    >
      <svg
        width="10" height="10" viewBox="0 0 10 10"
        style={{
          color: 'var(--text-tertiary)',
          transform: collapsed ? 'rotate(-90deg)' : 'rotate(0)',
          transition: 'transform var(--duration-fast)',
          flexShrink: 0,
        }}
        fill="currentColor"
      >
        <path d="M5 7L1 3h8L5 7z" />
      </svg>
      <span
        style={{
          flex: 1,
          fontSize: 'var(--text-xs)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: 'var(--tracking-wide)',
          fontFamily: 'var(--font-ui)',
        }}
      >
        {title}
      </span>
      <span
        style={{
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono-ui)',
        }}
      >
        {count}
      </span>
      {actionLabel && onAction && (
        <button
          onClick={(e) => { e.stopPropagation(); onAction(); }}
          style={{
            fontSize: 10,
            padding: '1px 6px',
            background: 'var(--surface-float)',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono-ui)',
          }}
        >
          {actionLabel}
        </button>
      )}
    </div>
  );
}

// ─── Divider ───────────────────────────────────────────────────────────────

function Divider({ label }: { label?: string }) {
  if (!label) {
    return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />;
  }
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '8px var(--space-3) 4px',
      }}
    >
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
      <span
        style={{
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-mono-ui)',
          letterSpacing: 'var(--tracking-widest)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
      <div style={{ flex: 1, height: 1, background: 'var(--border-subtle)' }} />
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function GitPanel({ isOpen, onClose, projectPath }: GitPanelProps) {
  const git = useGit(projectPath);
  const [showCommitDialog, setShowCommitDialog] = useState(false);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [diffViewerFile, setDiffViewerFile] = useState<GitFileEntry | null>(null);
  const [stagedCollapsed, setStagedCollapsed] = useState(false);
  const [unstagedCollapsed, setUnstagedCollapsed] = useState(false);
  const [showDiscardAllConfirm, setShowDiscardAllConfirm] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');
  const [commitError, setCommitError] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);

  useEffect(() => {
    if (isOpen && projectPath) {
      git.refreshStatus();
      git.loadBranches();
      git.loadHistory(10);
      git.startWatching();
    }
    if (!isOpen && projectPath) {
      git.stopWatching();
    }
  }, [isOpen, projectPath]);

  const handleFileClick = useCallback((file: GitFileEntry) => {
    setDiffViewerFile(file);
    setShowDiffViewer(true);
  }, []);

  const handleFileToggle = useCallback(async (file: GitFileEntry) => {
    if (file.area === 'staged') {
      await git.unstageFiles([file.path]);
    } else {
      await git.stageFiles([file.path]);
    }
  }, [git]);

  const handleGenerateMessage = useCallback(async () => {
    setIsGenerating(true);
    try {
      const result = await git.generateMessage();
      if (result) setCommitMessage(result.message);
    } finally {
      setIsGenerating(false);
    }
  }, [git]);

  const handleCommit = useCallback(async () => {
    if (!commitMessage.trim()) {
      setCommitError('Enter a commit message to continue.');
      return;
    }
    setCommitError(null);
    await git.commit({
      workingDirectory: projectPath || '',
      message: commitMessage,
      createCheckpoint: false,
      sessionId: null,
    });
    setCommitMessage('');
  }, [git, commitMessage, projectPath]);

  if (!isOpen) return null;

  const status = git.status;
  const stagedFiles = status?.files.filter((f) => f.area === 'staged') || [];
  const unstagedFiles = status?.files.filter((f) => f.area === 'unstaged') || [];
  const untrackedFiles = status?.files.filter((f) => f.area === 'untracked') || [];
  const allUnstagedAndUntracked = [...unstagedFiles, ...untrackedFiles];

  const isClean = stagedFiles.length === 0 && allUnstagedAndUntracked.length === 0;
  const isNotRepo = !projectPath || (status && !status.isRepo);

  const headerActions = (
    <button
      onClick={() => { git.refreshStatus(); git.loadBranches(); }}
      disabled={git.operationInProgress !== null}
      title="Refresh"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: 24,
        height: 24,
        background: 'none',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-tertiary)',
        cursor: 'pointer',
        padding: 0,
      }}
    >
      <RefreshCw
        size={12}
        style={{
          animation: git.operationInProgress ? 'spin 1s linear infinite' : 'none',
        }}
      />
    </button>
  );

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title="Git"
        headerActions={headerActions}
      >
        <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>

          {/* Not a git repository */}
          {isNotRepo && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-8) var(--space-4)',
                gap: 'var(--space-2)',
                flex: 1,
              }}
            >
              <GitBranch size={32} style={{ color: 'var(--text-tertiary)' }} />
              <span style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)', textAlign: 'center' }}>
                {!projectPath ? 'No active session' : 'Not a git repository'}
              </span>
            </div>
          )}

          {/* Git repository content */}
          {!isNotRepo && status && (
            <>
              {/* Branch row */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: '8px var(--space-3)',
                  borderBottom: '1px solid var(--border-subtle)',
                }}
              >
                <GitBranch size={13} style={{ color: 'var(--text-accent)', flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 'var(--text-sm)',
                    fontFamily: 'var(--font-mono-ui)',
                    color: 'var(--text-primary)',
                    fontWeight: 'var(--weight-medium)',
                    flex: 1,
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {status.branch || 'HEAD'}
                </span>
                {status.ahead > 0 && (
                  <span
                    style={{
                      fontSize: 'var(--text-2xs)',
                      fontFamily: 'var(--font-mono-ui)',
                      color: 'var(--semantic-info)',
                      background: 'var(--semantic-info-muted)',
                      padding: '1px 5px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    ↑{status.ahead}
                  </span>
                )}
                {status.behind > 0 && (
                  <span
                    style={{
                      fontSize: 'var(--text-2xs)',
                      fontFamily: 'var(--font-mono-ui)',
                      color: 'var(--semantic-warning)',
                      background: 'var(--semantic-warning-muted)',
                      padding: '1px 5px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    ↓{status.behind}
                  </span>
                )}
                <span
                  style={{
                    fontSize: 'var(--text-2xs)',
                    color: isClean ? 'var(--semantic-success)' : 'var(--semantic-warning)',
                    fontFamily: 'var(--font-mono-ui)',
                  }}
                >
                  {isClean ? '● clean' : '● dirty'}
                </span>
              </div>

              {/* Conflict warning */}
              {status.hasConflicts && (
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--space-2)',
                    padding: '6px var(--space-3)',
                    background: 'var(--semantic-error-muted)',
                    borderBottom: '1px solid var(--border-subtle)',
                  }}
                >
                  <AlertTriangle size={12} style={{ color: 'var(--semantic-error)', flexShrink: 0 }} />
                  <span style={{ fontSize: 'var(--text-xs)', color: 'var(--semantic-error)' }}>
                    {status.conflictedCount} merge conflict{status.conflictedCount !== 1 ? 's' : ''}
                  </span>
                </div>
              )}

              {/* Working tree clean */}
              {isClean && (
                <div
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    padding: 'var(--space-6) var(--space-4)',
                    gap: 'var(--space-2)',
                  }}
                >
                  <Check size={24} style={{ color: 'var(--semantic-success)' }} />
                  <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
                    Working tree clean
                  </span>
                </div>
              )}

              {/* STAGED section */}
              {stagedFiles.length > 0 && (
                <div>
                  <SectionHeader
                    title="Staged"
                    count={stagedFiles.length}
                    actionLabel="+all"
                    onAction={git.unstageAll}
                    collapsed={stagedCollapsed}
                    onToggleCollapse={() => setStagedCollapsed(!stagedCollapsed)}
                  />
                  {!stagedCollapsed && stagedFiles.map((file) => (
                    <FileRow
                      key={file.path + '-staged'}
                      file={file}
                      onClick={handleFileClick}
                      onToggle={handleFileToggle}
                    />
                  ))}
                </div>
              )}

              {/* UNSTAGED section */}
              {allUnstagedAndUntracked.length > 0 && (
                <div>
                  <SectionHeader
                    title="Unstaged"
                    count={allUnstagedAndUntracked.length}
                    actionLabel="stage"
                    onAction={git.stageAll}
                    collapsed={unstagedCollapsed}
                    onToggleCollapse={() => setUnstagedCollapsed(!unstagedCollapsed)}
                  />
                  {!unstagedCollapsed && allUnstagedAndUntracked.map((file) => (
                    <FileRow
                      key={file.path + '-unstaged'}
                      file={file}
                      onClick={handleFileClick}
                      onToggle={handleFileToggle}
                    />
                  ))}
                </div>
              )}

              {/* Commit area */}
              {!isClean && (
                <div style={{ padding: 'var(--space-3)', borderTop: '1px solid var(--border-subtle)' }}>
                  <span
                    style={{
                      display: 'block',
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-tertiary)',
                      marginBottom: 'var(--space-2)',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    Commit message
                  </span>
                  <textarea
                    value={commitMessage}
                    onChange={(e) => { setCommitMessage(e.target.value); setCommitError(null); }}
                    placeholder="Describe what this commit does and why..."
                    rows={3}
                    style={{
                      width: '100%',
                      resize: 'vertical',
                      background: 'var(--surface-float)',
                      border: `1px solid ${commitError ? 'var(--semantic-error)' : 'var(--border-default)'}`,
                      borderRadius: 'var(--radius-md)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-ui)',
                      padding: '6px var(--space-2)',
                      outline: 'none',
                      boxSizing: 'border-box',
                      lineHeight: 'var(--leading-normal)',
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border-accent)';
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor = commitError ? 'var(--semantic-error)' : 'var(--border-default)';
                    }}
                  />
                  {commitError && (
                    <span
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        fontSize: 'var(--text-xs)',
                        color: 'var(--semantic-error)',
                        marginTop: 4,
                      }}
                    >
                      <X size={10} />
                      {commitError}
                    </span>
                  )}
                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--space-2)',
                      marginTop: 'var(--space-2)',
                      alignItems: 'center',
                    }}
                  >
                    <button
                      onClick={handleGenerateMessage}
                      disabled={isGenerating || stagedFiles.length === 0}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '5px var(--space-2)',
                        background: 'var(--surface-float)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-md)',
                        color: isGenerating ? 'var(--text-tertiary)' : 'var(--text-accent)',
                        fontSize: 'var(--text-xs)',
                        cursor: stagedFiles.length === 0 ? 'default' : 'pointer',
                        opacity: stagedFiles.length === 0 ? 0.5 : 1,
                        fontFamily: 'var(--font-ui)',
                      }}
                    >
                      <Sparkles size={11} style={{ animation: isGenerating ? 'spin 1s linear infinite' : 'none' }} />
                      Generate message
                    </button>
                    <button
                      onClick={handleCommit}
                      disabled={git.operationInProgress !== null}
                      style={{
                        marginLeft: 'auto',
                        padding: '5px var(--space-3)',
                        background: 'var(--accent-primary)',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        color: 'var(--text-inverse)',
                        fontSize: 'var(--text-xs)',
                        fontWeight: 'var(--weight-semibold)',
                        cursor: 'pointer',
                        fontFamily: 'var(--font-ui)',
                      }}
                    >
                      Commit
                    </button>
                  </div>
                </div>
              )}

              {/* Worktrees section */}
              {git.worktrees && git.worktrees.length > 0 && (
                <>
                  <Divider label="Worktrees" />
                  <div style={{ padding: '0 var(--space-3) var(--space-3)' }}>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 'var(--space-2)',
                      }}
                    >
                      <span
                        style={{
                          fontSize: 'var(--text-xs)',
                          fontWeight: 'var(--weight-semibold)',
                          color: 'var(--text-tertiary)',
                          textTransform: 'uppercase',
                          letterSpacing: 'var(--tracking-wide)',
                          fontFamily: 'var(--font-ui)',
                        }}
                      >
                        Worktrees ({git.worktrees.length})
                      </span>
                      <button
                        onClick={() => git.addWorktree({ mainRepoPath: projectPath || '', branch: 'new-branch', isNewBranch: true })}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 2,
                          fontSize: 'var(--text-xs)',
                          padding: '2px 6px',
                          background: 'var(--surface-float)',
                          border: '1px solid var(--border-default)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'var(--text-secondary)',
                          cursor: 'pointer',
                          fontFamily: 'var(--font-ui)',
                        }}
                      >
                        <Plus size={10} />
                        New
                      </button>
                    </div>
                    {git.worktrees.map((wt) => (
                      <div
                        key={wt.path}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          padding: '4px 0',
                          borderBottom: '1px solid var(--border-subtle)',
                        }}
                      >
                        <GitFork size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
                        <span
                          style={{
                            flex: 1,
                            fontSize: 'var(--text-xs)',
                            fontFamily: 'var(--font-mono-ui)',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                          title={wt.path}
                        >
                          {wt.branch || wt.path}
                        </span>
                        <span
                          style={{
                            fontSize: 'var(--text-2xs)',
                            color: wt.isMainWorktree ? 'var(--semantic-success)' : 'var(--text-tertiary)',
                            fontFamily: 'var(--font-mono-ui)',
                          }}
                        >
                          {wt.isMainWorktree ? '●' : '○'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </SidePanel>

      {/* Commit dialog */}
      {showCommitDialog && (
        <CommitDialog
          isOpen={showCommitDialog}
          onClose={() => setShowCommitDialog(false)}
          onCommit={async (request) => {
            await git.commit(request);
            setShowCommitDialog(false);
          }}
          onGenerateMessage={git.generateMessage}
          stagedFiles={stagedFiles}
          workingDirectory={projectPath || ''}
          sessionId={null}
          generatedMessage={git.generatedMessage}
          isGenerating={isGenerating}
        />
      )}

      {/* Diff viewer */}
      {showDiffViewer && (
        <DiffViewer
          isOpen={showDiffViewer}
          initialFile={diffViewerFile}
          files={status?.files || []}
          selectedDiff={git.selectedDiff}
          onClose={() => { setShowDiffViewer(false); setDiffViewerFile(null); }}
          viewDiff={git.viewDiff}
          viewFileContent={git.viewFileContent}
          stageFiles={git.stageFiles}
          unstageFiles={git.unstageFiles}
          discardFile={git.discardFile}
        />
      )}

      {/* Discard all confirm */}
      {showDiscardAllConfirm && (
        <ConfirmDialog
          isOpen={true}
          title="Discard all changes?"
          message="This will permanently discard all unstaged changes. This action cannot be undone."
          confirmLabel="Discard All"
          cancelLabel="Cancel"
          onConfirm={async () => {
            await git.discardAll?.();
            setShowDiscardAllConfirm(false);
          }}
          onCancel={() => setShowDiscardAllConfirm(false)}
          isDangerous={true}
        />
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
