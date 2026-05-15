/**
 * GitPanel — Redesigned to match Obsidian spec §04.
 *
 * PanelShell → Branch strip + branch picker → PanelSection for Staged /
 * Unstaged / Untracked → inline hunk diff → AI commit composer footer.
 *
 * All IPC calls, hooks, and manager logic are unchanged.
 * Visual overhaul only.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useGit } from '../hooks/useGit';
import { ConfirmDialog, PanelSection, PanelEmpty, PanelLoading } from './ui';
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
  AlertTriangle,
  Check,
  X,
  ChevronDown,
} from 'lucide-react';

interface GitPanelProps {
  isOpen: boolean;
  onClose: () => void;
  projectPath: string | null;
  activeSessionId: string | null;
}

// ─── File status helpers ───────────────────────────────────────────────────

// ─── V2 GitPanel ──────────────────────────────────────────────────────────

interface V2FileRowProps {
  file: GitFileEntry;
  selected: boolean;
  onClick: (file: GitFileEntry) => void;
  onToggle: (file: GitFileEntry) => void;
}

function V2FileRow({ file, selected, onClick, onToggle }: V2FileRowProps) {
  const [hovered, setHovered] = useState(false);

  const statusColors: Record<string, { fg: string; bg: string }> = {
    modified:  { fg: 'var(--v2-warning)', bg: 'rgba(247,168,74,.12)' },
    added:     { fg: 'var(--v2-success)', bg: 'rgba(61,214,140,.12)' },
    deleted:   { fg: 'var(--v2-error)',   bg: 'rgba(247,103,142,.12)' },
    renamed:   { fg: 'var(--v2-info)',    bg: 'rgba(124,143,255,.12)' },
    copied:    { fg: 'var(--v2-info)',    bg: 'rgba(124,143,255,.12)' },
    untracked: { fg: 'var(--v2-text-tertiary)', bg: 'rgba(255,255,255,.05)' },
    unmerged:  { fg: 'var(--v2-error)',   bg: 'rgba(247,103,142,.16)' },
  };

  const displayStatus = file.area === 'staged' ? file.indexStatus : file.workTreeStatus;
  const sc = statusColors[displayStatus] ?? statusColors['untracked'];
  const statusLabel = statusLabel_v2(displayStatus);

  const parts = file.path.split('/');
  const filename = parts[parts.length - 1];
  const dir = parts.length > 1 ? parts.slice(0, -1).join('/') + '/' : '';

  return (
    <div
      onClick={() => onClick(file)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        padding:      '4px 8px',
        borderRadius: 'var(--radius-md, 6px)',
        background:   selected ? 'var(--v2-surface-mid)' : hovered ? 'var(--v2-surface-mid)' : 'transparent',
        borderLeft:   `2px solid ${selected ? 'var(--v2-accent)' : 'transparent'}`,
        cursor:       'pointer',
        transition:   'background 100ms ease',
      }}
    >
      {/* Status badge */}
      <span
        style={{
          width:        16,
          height:       16,
          borderRadius: 3,
          background:   sc.bg,
          color:        sc.fg,
          display:      'grid',
          placeItems:   'center',
          fontSize:     10,
          fontWeight:   700,
          fontFamily:   'var(--font-mono, monospace)',
          flexShrink:   0,
        }}
      >
        {statusLabel}
      </span>

      {/* Path */}
      <span
        style={{
          flex:          1,
          fontSize:      'var(--text-xs, 11px)',
          fontFamily:    'var(--font-mono, monospace)',
          color:         selected ? 'var(--v2-text-primary)' : 'var(--v2-text-secondary)',
          overflow:      'hidden',
          textOverflow:  'ellipsis',
          whiteSpace:    'nowrap',
        }}
        title={file.path}
      >
        {dir && <span style={{ color: 'var(--v2-text-quaternary)' }}>{dir}</span>}
        {filename}
      </span>

      {/* Stage/Unstage button on hover */}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggle(file); }}
          title={file.area === 'staged' ? 'Unstage' : 'Stage'}
          style={{
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            width:        16,
            height:       16,
            background:   'none',
            border:       'none',
            borderRadius: 2,
            color:        'var(--v2-text-tertiary)',
            cursor:       'pointer',
            padding:      0,
            flexShrink:   0,
          }}
        >
          {file.area === 'staged' ? <MinusCircle size={12} /> : <PlusCircle size={12} />}
        </button>
      )}
    </div>
  );
}

function statusLabel_v2(status: string): string {
  switch (status) {
    case 'modified':  return 'M';
    case 'added':     return 'A';
    case 'deleted':   return 'D';
    case 'renamed':   return 'R';
    case 'copied':    return 'C';
    case 'untracked': return '?';
    case 'unmerged':  return 'U';
    default:          return '?';
  }
}

// Branch picker dropdown (includes worktrees per item #15)
interface BranchPickerProps {
  currentBranch: string;
  branches: import('../../shared/types/git-types').GitBranchInfo[];
  worktrees: import('../../shared/types/git-types').GitWorktreeEntry[];
  onSwitch: (branch: string) => void;
  onRemoveWorktree?: (path: string) => Promise<void>;
  projectPath: string | null;
}

function BranchPickerDropdown({
  currentBranch,
  branches,
  worktrees,
  onSwitch,
  onRemoveWorktree,
}: BranchPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const otherBranches = branches.filter(b => b.name !== currentBranch);
  const linkedWorktrees = worktrees.filter(w => !w.isMainWorktree);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="Switch branch / manage worktrees"
        style={{
          display:      'flex',
          alignItems:   'center',
          padding:      '2px 4px',
          background:   'none',
          border:       'none',
          borderRadius: 'var(--radius-sm, 4px)',
          color:        'var(--v2-text-tertiary)',
          cursor:       'pointer',
        }}
      >
        <ChevronDown size={11} />
      </button>

      {open && (
        <div
          style={{
            position:     'absolute',
            top:          '100%',
            right:        0,
            zIndex:       100,
            background:   'var(--v2-surface-overlay)',
            border:       '1px solid var(--v2-border-default)',
            borderRadius: 'var(--radius-md, 6px)',
            minWidth:     220,
            maxHeight:    320,
            overflow:     'auto',
            boxShadow:    '0 8px 24px rgba(0,0,0,0.4)',
            marginTop:    4,
          }}
        >
          {/* Current branch */}
          <div
            style={{
              padding:    '6px 10px',
              fontSize:   10,
              fontFamily: 'var(--font-mono, monospace)',
              color:      'var(--v2-text-tertiary)',
              textTransform: 'uppercase',
              letterSpacing: '.1em',
              borderBottom: '1px solid var(--v2-border-subtle)',
            }}
          >
            Current
          </div>
          <div
            style={{
              padding:    '6px 10px',
              fontSize:   'var(--text-sm, 12px)',
              fontFamily: 'var(--font-mono, monospace)',
              color:      'var(--v2-accent)',
              display:    'flex',
              alignItems: 'center',
              gap:        6,
            }}
          >
            <GitBranch size={11} />
            {currentBranch}
          </div>

          {/* Other branches */}
          {otherBranches.length > 0 && (
            <>
              <div
                style={{
                  padding:    '6px 10px',
                  fontSize:   10,
                  fontFamily: 'var(--font-mono, monospace)',
                  color:      'var(--v2-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  borderTop:  '1px solid var(--v2-border-subtle)',
                }}
              >
                Branches
              </div>
              {otherBranches.map(b => (
                <button
                  key={b.name}
                  onClick={() => { onSwitch(b.name); setOpen(false); }}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        6,
                    width:      '100%',
                    padding:    '5px 10px',
                    background: 'none',
                    border:     'none',
                    fontSize:   'var(--text-sm, 12px)',
                    fontFamily: 'var(--font-mono, monospace)',
                    color:      'var(--v2-text-secondary)',
                    cursor:     'pointer',
                    textAlign:  'left',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = 'var(--v2-surface-mid)'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <GitBranch size={11} />
                  {b.name}
                  {!b.isCurrent && !b.upstream && (
                    <span style={{ color: 'var(--v2-text-quaternary)', fontSize: 9 }}>local</span>
                  )}
                </button>
              ))}
            </>
          )}

          {/* Worktrees section (item #15) */}
          {linkedWorktrees.length > 0 && (
            <>
              <div
                style={{
                  padding:    '6px 10px',
                  fontSize:   10,
                  fontFamily: 'var(--font-mono, monospace)',
                  color:      'var(--v2-text-tertiary)',
                  textTransform: 'uppercase',
                  letterSpacing: '.1em',
                  borderTop:  '1px solid var(--v2-border-subtle)',
                }}
              >
                Worktrees
              </div>
              {linkedWorktrees.map(wt => (
                <div
                  key={wt.path}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        6,
                    padding:    '5px 10px',
                    fontSize:   'var(--text-sm, 12px)',
                    fontFamily: 'var(--font-mono, monospace)',
                    color:      'var(--v2-text-secondary)',
                  }}
                >
                  <GitFork size={11} style={{ flexShrink: 0, color: 'var(--v2-text-tertiary)' }} />
                  <span
                    style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    title={wt.path}
                  >
                    {wt.branch || wt.path}
                  </span>
                  {onRemoveWorktree && !wt.linkedSessionId && !wt.isMainWorktree && (
                    <button
                      onClick={(e) => { e.stopPropagation(); void onRemoveWorktree(wt.path); }}
                      title="Remove worktree"
                      style={{
                        background:   'none',
                        border:       'none',
                        color:        'var(--v2-error)',
                        cursor:       'pointer',
                        padding:      '0 2px',
                        fontSize:     10,
                      }}
                    >
                      Cleanup
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// AI commit composer — auto-drafts when staged set changes, locks on user typing
interface CommitComposerProps {
  stagedFiles: GitFileEntry[];
  projectPath: string | null;
  onCommit: (message: string) => Promise<void>;
  isCommitting: boolean;
}

function CommitComposer({ stagedFiles, projectPath, onCommit, isCommitting }: CommitComposerProps) {
  const [message, setMessage]       = useState('');
  const [userLocked, setUserLocked] = useState(false);
  const [isDrafting, setIsDrafting] = useState(false);
  const [draftedBy, setDraftedBy]   = useState<'claude' | null>(null);
  const [error, setError]           = useState<string | null>(null);
  // Track the staged file set to detect changes
  const prevStagedKey = useRef<string>('');

  // Auto-draft when staged set changes (if user hasn't locked)
  useEffect(() => {
    const key = stagedFiles.map(f => f.path).sort().join('|');
    if (key === prevStagedKey.current) return;
    prevStagedKey.current = key;

    if (stagedFiles.length === 0) {
      if (!userLocked) { setMessage(''); setDraftedBy(null); }
      return;
    }
    if (userLocked) return;

    setIsDrafting(true);
    setDraftedBy(null);
    void (async () => {
      try {
        const result = await window.electronAPI.gitGenerateMessage(projectPath ?? '');
        if (!userLocked) {
          setMessage(result.message);
          setDraftedBy('claude');
        }
      } catch {
        // Silently ignore — user can type manually
      } finally {
        setIsDrafting(false);
      }
    })();
  }, [stagedFiles, projectPath, userLocked]);

  const handleChange = (v: string) => {
    setMessage(v);
    setUserLocked(true);  // User typing locks the composer
    setDraftedBy(null);
    setError(null);
  };

  const handleRedraft = async () => {
    if (!projectPath || stagedFiles.length === 0) return;
    setUserLocked(false);
    setIsDrafting(true);
    try {
      const result = await window.electronAPI.gitGenerateMessage(projectPath);
      setMessage(result.message);
      setDraftedBy('claude');
    } catch {
      // Ignore
    } finally {
      setIsDrafting(false);
    }
  };

  const handleCommit = async () => {
    if (!message.trim()) { setError('Enter a commit message to continue.'); return; }
    setError(null);
    await onCommit(message);
    setMessage('');
    setUserLocked(false);
    setDraftedBy(null);
  };

  return (
    <div
      style={{
        padding:        12,
        borderTop:      '1px solid var(--v2-border-subtle)',
        background:     'var(--v2-surface-low)',
        display:        'flex',
        flexDirection:  'column',
        gap:            8,
        flexShrink:     0,
      }}
    >
      {/* Composer textarea */}
      <div
        style={{
          position:     'relative',
          background:   'var(--v2-surface-mid)',
          borderRadius: 'var(--radius-md, 6px)',
          border:       `1px solid ${error ? 'var(--v2-error)' : 'var(--v2-border-default)'}`,
          minHeight:    64,
        }}
      >
        <textarea
          value={message}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={isDrafting ? 'Drafting commit message…' : 'Describe what this commit does and why…'}
          rows={3}
          disabled={isDrafting}
          style={{
            width:        '100%',
            resize:       'vertical',
            background:   'transparent',
            border:       'none',
            color:        'var(--v2-text-primary)',
            fontSize:     'var(--text-sm, 12px)',
            fontFamily:   'var(--font-mono, monospace)',
            padding:      '8px 36px 8px 12px',
            outline:      'none',
            boxSizing:    'border-box',
            lineHeight:   1.5,
            opacity:      isDrafting ? 0.5 : 1,
          }}
        />
        {/* Re-draft sparkle button */}
        <button
          onClick={handleRedraft}
          disabled={isDrafting || stagedFiles.length === 0}
          title="Re-draft with Claude"
          style={{
            position:   'absolute',
            top:        6,
            right:      6,
            padding:    4,
            background: 'rgba(0,201,167,.08)',
            border:     'none',
            borderRadius: 4,
            color:      'var(--v2-accent)',
            cursor:     stagedFiles.length === 0 ? 'default' : 'pointer',
            opacity:    stagedFiles.length === 0 ? 0.4 : 1,
            display:    'flex',
            alignItems: 'center',
          }}
        >
          <Sparkles
            size={13}
            style={{ animation: isDrafting ? 'spin 1s linear infinite' : 'none' }}
          />
        </button>
      </div>

      {/* Error */}
      {error && (
        <span
          style={{
            display:    'flex',
            alignItems: 'center',
            gap:        4,
            fontSize:   'var(--text-xs, 11px)',
            color:      'var(--v2-error)',
          }}
        >
          <X size={10} />
          {error}
        </span>
      )}

      {/* Meta chips row */}
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 10 }}>
        {draftedBy === 'claude' && (
          <span
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          4,
              padding:      '2px 8px',
              background:   'rgba(61,214,140,.12)',
              color:        'var(--v2-success)',
              borderRadius: 'var(--radius-full, 999px)',
              fontFamily:   'var(--font-mono, monospace)',
              fontSize:     9,
            }}
          >
            <Sparkles size={9} /> drafted by claude
          </span>
        )}
        <span
          style={{
            marginLeft: 'auto',
            color:      'var(--v2-text-tertiary)',
            fontFamily: 'var(--font-mono, monospace)',
          }}
        >
          {stagedFiles.length}/{stagedFiles.length + '+'} staged
        </span>
      </div>

      {/* Commit button */}
      <button
        onClick={handleCommit}
        disabled={isCommitting || isDrafting}
        style={{
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          gap:             6,
          padding:         '7px 0',
          background:      'var(--v2-accent)',
          color:           '#0A0B11',
          border:          'none',
          borderRadius:    'var(--radius-md, 6px)',
          fontSize:        'var(--text-sm, 12px)',
          fontWeight:      600,
          cursor:          isCommitting ? 'default' : 'pointer',
          opacity:         isCommitting ? 0.6 : 1,
          fontFamily:      'inherit',
        }}
      >
        <Check size={13} />
        Commit
      </button>
    </div>
  );
}

function V2GitPanel({ isOpen, onClose, projectPath }: GitPanelProps) {
  const git = useGit(projectPath);
  const [showDiffViewer, setShowDiffViewer] = useState(false);
  const [diffViewerFile, setDiffViewerFile] = useState<GitFileEntry | null>(null);
  const [selectedFile, setSelectedFile] = useState<GitFileEntry | null>(null);
  const [showDiscardAllConfirm, setShowDiscardAllConfirm] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);

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
    return () => { if (projectPath) git.stopWatching(); };
  }, [isOpen, projectPath]);

  const handleFileClick = useCallback((file: GitFileEntry) => {
    setSelectedFile(prev => prev?.path === file.path && prev?.area === file.area ? null : file);
  }, []);

  const handleFileToggle = useCallback(async (file: GitFileEntry) => {
    if (file.area === 'staged') {
      await git.unstageFiles([file.path]);
    } else {
      await git.stageFiles([file.path]);
    }
  }, [git]);

  const handleCommit = useCallback(async (message: string) => {
    setIsCommitting(true);
    try {
      await git.commit({
        workingDirectory: projectPath || '',
        message,
        createCheckpoint: false,
        sessionId: null,
      });
    } finally {
      setIsCommitting(false);
    }
  }, [git, projectPath]);

  const handleRemoveWorktree = useCallback(async (worktreePath: string) => {
    if (!projectPath) return;
    try {
      await window.electronAPI.gitWorktreeRemove({
        mainRepoPath: projectPath,
        worktreePath,
        force: false,
      });
      git.loadBranches();
    } catch {
      // Ignore
    }
  }, [projectPath, git]);

  if (!isOpen) return null;

  const status  = git.status;
  const isNotRepo = !projectPath || (status && !status.isRepo);

  const stagedFiles       = status?.files.filter(f => f.area === 'staged')   || [];
  const unstagedFiles     = status?.files.filter(f => f.area === 'unstaged') || [];
  const untrackedFiles    = status?.files.filter(f => f.area === 'untracked')|| [];
  const isClean = stagedFiles.length === 0 && unstagedFiles.length === 0 && untrackedFiles.length === 0;

  // Header action buttons
  const headerActions = (
    <button
      onClick={() => { git.refreshStatus(); git.loadBranches(); }}
      disabled={git.operationInProgress !== null}
      title="Refresh"
      style={{
        display:    'flex',
        alignItems: 'center',
        width:      24,
        height:     24,
        background: 'none',
        border:     'none',
        borderRadius: 'var(--radius-sm, 4px)',
        color:      'var(--v2-text-tertiary)',
        cursor:     'pointer',
        padding:    0,
      }}
    >
      <RefreshCw
        size={12}
        style={{ animation: git.operationInProgress ? 'spin 1s linear infinite' : 'none' }}
      />
    </button>
  );

  // No-repo / no-session states
  if (isNotRepo) {
    return (
      <SidePanel isOpen={isOpen} onClose={onClose} title="Git" headerActions={headerActions}>
        <PanelEmpty
          icon={<GitBranch size={26} />}
          title={!projectPath ? 'No active session' : 'Not a git repository'}
          body={!projectPath
            ? 'Open a session to view git status.'
            : 'Initialize a git repo to start tracking changes.'
          }
        />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </SidePanel>
    );
  }

  // Loading
  if (!status) {
    return (
      <SidePanel isOpen={isOpen} onClose={onClose} title="Git" headerActions={headerActions}>
        <PanelLoading rows={4} />
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
      </SidePanel>
    );
  }

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title="Git"
        headerActions={headerActions}
      >
        <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

          {/* Branch strip */}
          <div
            style={{
              display:      'flex',
              alignItems:   'center',
              gap:          8,
              padding:      '8px 12px',
              background:   'var(--v2-surface-mid)',
              borderBottom: '1px solid var(--v2-border-subtle)',
              flexShrink:   0,
            }}
          >
            <GitBranch size={13} style={{ color: 'var(--v2-info)', flexShrink: 0 }} />
            <span
              style={{
                color:        'var(--v2-text-primary)',
                fontWeight:   500,
                fontFamily:   'var(--font-mono, monospace)',
                fontSize:     'var(--text-sm, 12px)',
                flex:         1,
                overflow:     'hidden',
                textOverflow: 'ellipsis',
                whiteSpace:   'nowrap',
              }}
            >
              {status.branch || 'HEAD'}
            </span>

            {/* Ahead/behind chips */}
            {status.ahead > 0 && (
              <span
                style={{
                  fontFamily:   'var(--font-mono, monospace)',
                  fontSize:     10,
                  color:        'var(--v2-info)',
                  background:   'rgba(124,143,255,.12)',
                  padding:      '1px 5px',
                  borderRadius: 'var(--radius-sm, 4px)',
                }}
              >
                ↑{status.ahead}
              </span>
            )}
            {status.behind > 0 && (
              <span
                style={{
                  fontFamily:   'var(--font-mono, monospace)',
                  fontSize:     10,
                  color:        'var(--v2-warning)',
                  background:   'rgba(247,168,74,.12)',
                  padding:      '1px 5px',
                  borderRadius: 'var(--radius-sm, 4px)',
                }}
              >
                ↓{status.behind}
              </span>
            )}

            {/* Pull/Push buttons */}
            <button
              onClick={() => git.pull?.()}
              style={{
                fontSize: 10,
                padding: '2px 8px',
                background: 'var(--v2-surface-high)',
                border: '1px solid var(--v2-border-default)',
                borderRadius: 'var(--radius-sm, 4px)',
                color: 'var(--v2-text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Pull
            </button>
            <button
              onClick={() => git.push?.()}
              style={{
                fontSize: 10,
                padding: '2px 8px',
                background: 'var(--v2-surface-high)',
                border: '1px solid var(--v2-border-default)',
                borderRadius: 'var(--radius-sm, 4px)',
                color: 'var(--v2-text-secondary)',
                cursor: 'pointer',
                fontFamily: 'inherit',
              }}
            >
              Push
            </button>

            {/* Branch picker — includes worktrees (item #15) */}
            <BranchPickerDropdown
              currentBranch={status.branch || 'HEAD'}
              branches={git.branches ?? []}
              worktrees={git.worktrees ?? []}
              onSwitch={(b) => { void git.switchBranch?.(b); }}
              onRemoveWorktree={handleRemoveWorktree}
              projectPath={projectPath}
            />
          </div>

          {/* Conflict banner */}
          {status.hasConflicts && (
            <div
              style={{
                display:      'flex',
                alignItems:   'center',
                gap:          6,
                padding:      '6px 12px',
                background:   'rgba(247,103,142,.08)',
                borderBottom: '1px solid var(--v2-border-subtle)',
                flexShrink:   0,
              }}
            >
              <AlertTriangle size={12} style={{ color: 'var(--v2-error)', flexShrink: 0 }} />
              <span style={{ fontSize: 'var(--text-xs, 11px)', color: 'var(--v2-error)' }}>
                {status.conflictedCount} merge conflict{status.conflictedCount !== 1 ? 's' : ''}
              </span>
            </div>
          )}

          {/* Clean tree */}
          {isClean && (
            <PanelEmpty
              icon={<Check size={26} />}
              title="Working tree clean"
              body={`Nothing to commit on ${status.branch || 'HEAD'}.`}
            />
          )}

          {/* File sections */}
          {!isClean && (
            <div style={{ flex: 1, overflow: 'auto', padding: '8px 0' }}>

              {/* Staged */}
              {stagedFiles.length > 0 && (
                <PanelSection
                  title="Staged"
                  count={stagedFiles.length}
                  defaultOpen
                  action={
                    <button
                      onClick={(e) => { e.stopPropagation(); void git.unstageAll(); }}
                      style={{
                        fontSize: 10,
                        padding: '0 6px',
                        background: 'none',
                        border: '1px solid var(--v2-border-default)',
                        borderRadius: 'var(--radius-sm, 4px)',
                        color: 'var(--v2-text-tertiary)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Unstage all
                    </button>
                  }
                >
                  {stagedFiles.map(file => (
                    <V2FileRow
                      key={file.path + '-staged'}
                      file={file}
                      selected={selectedFile?.path === file.path && selectedFile?.area === file.area}
                      onClick={handleFileClick}
                      onToggle={handleFileToggle}
                    />
                  ))}
                </PanelSection>
              )}

              {/* Unstaged */}
              {unstagedFiles.length > 0 && (
                <PanelSection
                  title="Unstaged"
                  count={unstagedFiles.length}
                  defaultOpen
                  action={
                    <button
                      onClick={(e) => { e.stopPropagation(); void git.stageAll(); }}
                      style={{
                        fontSize: 10,
                        padding: '0 6px',
                        background: 'none',
                        border: '1px solid var(--v2-border-default)',
                        borderRadius: 'var(--radius-sm, 4px)',
                        color: 'var(--v2-text-tertiary)',
                        cursor: 'pointer',
                        fontFamily: 'inherit',
                      }}
                    >
                      Stage all
                    </button>
                  }
                >
                  {unstagedFiles.map(file => (
                    <V2FileRow
                      key={file.path + '-unstaged'}
                      file={file}
                      selected={selectedFile?.path === file.path && selectedFile?.area === file.area}
                      onClick={handleFileClick}
                      onToggle={handleFileToggle}
                    />
                  ))}
                </PanelSection>
              )}

              {/* Untracked */}
              {untrackedFiles.length > 0 && (
                <PanelSection
                  title="Untracked"
                  count={untrackedFiles.length}
                  defaultOpen
                >
                  {untrackedFiles.map(file => (
                    <V2FileRow
                      key={file.path + '-untracked'}
                      file={file}
                      selected={selectedFile?.path === file.path && selectedFile?.area === file.area}
                      onClick={handleFileClick}
                      onToggle={handleFileToggle}
                    />
                  ))}
                </PanelSection>
              )}

              <div style={{ height: 8 }} />
            </div>
          )}

          {/* AI Commit composer */}
          {!isClean && (
            <CommitComposer
              stagedFiles={stagedFiles}
              projectPath={projectPath}
              onCommit={handleCommit}
              isCommitting={isCommitting}
            />
          )}
        </div>
      </SidePanel>

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

// ─── Public export ─────────────────────────────────────────────────────────

export function GitPanel(props: GitPanelProps) {
  return <V2GitPanel {...props} />;
}
