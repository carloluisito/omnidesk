// @atlas-entrypoint: New Session sheet (Phase 4).
// Repo picker · name · worktree mode (new/share) · branch · agent · launch mode.
import { useEffect, useMemo, useRef, useState } from 'react';
import { P4Icon } from './P4Icon';
import { colorBg, colorFg, type RepoColor } from './shell-utils';
import { sessionsForRepo, liveCount } from './SessionRail';
import type { Repo } from '../../hooks/useRepos';
import type { TabData } from '../ui/Tab';
import type { LaunchMode, PermissionMode, SessionKind } from '../../../shared/ipc-types';
import type { GitBranchInfo } from '../../../shared/types/git-types';
import type { ProviderId } from '../../../shared/types/provider-types';

export type WorktreeMode = 'new' | 'existing' | 'share' | 'current';

export interface NewSessionForm {
  name: string;
  repoId: string;
  workingDirectory: string;       // resolved per repo + worktree mode
  agent: ProviderId;
  launchMode: LaunchMode;
  permissionMode: PermissionMode; // derived from launchMode for back-compat with old session API
  worktreeMode: WorktreeMode;
  /** Branch name.
   *  - new:      derived from name unless overridden; the branch is created
   *  - existing: must be the name of an existing branch in the repo
   *  - share:    the branch of the session being shared (informational only)
   *  - current:  unused (we run in the repo's current checkout)
   */
  branch?: string;
  /** New worktree only: the branch this one forks off from. Defaults to the
   *  repo's current HEAD when omitted. */
  baseBranch?: string;
  /** Share mode only: id of the session whose worktree the new session joins. */
  shareSessionId?: string;
  /** Session kind: 'agent' (default) or 'shell' (plain terminal). */
  kind: SessionKind;
  /** Typed into the terminal at CLI readiness (never auto-submitted). Set by
   *  work intake (GitHub issue → session) to seed the issue context. */
  initialPrompt?: string;
}

/** Values pre-filled by a flow that opens the sheet (e.g. GitHub issue intake). */
export interface NewSessionPrefill {
  name?: string;
  branch?: string;
  initialPrompt?: string;
}

interface NewSessionSheetProps {
  repos: Repo[];
  sessions: TabData[];
  activeRepoId: string | null;
  /** Whether `claude agents` is available right now (probe result from useAgentViewAvailability). */
  agentsAvailable?: boolean;
  /** Optional pre-filled values (work intake). */
  prefill?: NewSessionPrefill;
  onClose: () => void;
  onCreate: (form: NewSessionForm) => Promise<void> | void;
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

export function NewSessionSheet({
  repos,
  sessions,
  activeRepoId,
  agentsAvailable = true,
  prefill,
  onClose,
  onCreate,
}: NewSessionSheetProps) {
  const [repoId, setRepoId] = useState<string>(activeRepoId ?? repos[0]?.id ?? '');
  const [name, setName] = useState(prefill?.name ?? '');
  const [sessionType, setSessionType] = useState<'agent' | 'shell'>('agent');
  const [agent, setAgent] = useState<ProviderId>('claude');
  const [launchMode, setLaunchMode] = useState<LaunchMode>('default');
  const [worktreeMode, setWorktreeMode] = useState<WorktreeMode>('new');
  const [branch, setBranch] = useState(prefill?.branch ?? '');
  const [baseBranch, setBaseBranch] = useState('');
  const [shareSessionId, setShareSessionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // All real git branches in the selected repo, fetched lazily.
  const [allBranches, setAllBranches] = useState<GitBranchInfo[]>([]);
  const [branchesLoading, setBranchesLoading] = useState(false);

  const repo = useMemo(() => repos.find(r => r.id === repoId) ?? null, [repos, repoId]);
  const currentBranchName = useMemo(
    () => allBranches.find(b => b.isCurrent)?.name ?? null,
    [allBranches]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Reset launch mode if user picks Codex (Codex ignores agents/bypass-permissions in UI).
  useEffect(() => {
    if (agent !== 'claude' && launchMode !== 'default') setLaunchMode('default');
  }, [agent, launchMode]);

  // Sessions in the active repo that currently have their own worktree —
  // candidates for "Share" mode. We exclude sessions running in the main
  // checkout (no worktree) since "Share" → those is just "Current" mode.
  const shareableSessions = useMemo(() => {
    if (!repo) return [];
    return sessionsForRepo(repo, sessions).filter(s => !!s.worktreeBranch && !!s.workingDirectory);
  }, [repo, sessions]);

  // Reset branch + base when switching repos. Also fetch the repo's branches
  // (skipped for plain non-git folders — they have no branches/worktrees).
  // The mount run must NOT clear a prefilled branch (work intake).
  const firstRepoRunRef = useRef(true);
  useEffect(() => {
    if (firstRepoRunRef.current) {
      firstRepoRunRef.current = false;
    } else {
      setBranch('');
      setBaseBranch('');
      setShareSessionId('');
    }
    if (!repo || !repo.isGit) { setAllBranches([]); setBranchesLoading(false); return; }
    let cancelled = false;
    setBranchesLoading(true);
    window.electronAPI.getGitBranches(repo.path).then(list => {
      if (!cancelled) {
        setAllBranches(list);
        setBranchesLoading(false);
      }
    }).catch(err => {
      console.warn('Failed to load branches:', err);
      if (!cancelled) { setAllBranches([]); setBranchesLoading(false); }
    });
    return () => { cancelled = true; };
  }, [repoId, repo]);

  // Plain folders always run "in the folder" — force the simplest mode.
  useEffect(() => {
    if (repo && !repo.isGit && worktreeMode !== 'current') {
      setWorktreeMode('current');
    }
  }, [repo, worktreeMode]);

  // When entering "existing", pre-select the current branch as a sensible default.
  useEffect(() => {
    if (worktreeMode === 'existing' && !branch && currentBranchName) {
      setBranch(currentBranchName);
    }
  }, [worktreeMode, currentBranchName, branch]);

  // For "new" mode, default baseBranch to the repo's current HEAD.
  useEffect(() => {
    if (worktreeMode === 'new' && !baseBranch && currentBranchName) {
      setBaseBranch(currentBranchName);
    }
  }, [worktreeMode, currentBranchName, baseBranch]);

  // For "share" mode, default to the first shareable session if any.
  useEffect(() => {
    if (worktreeMode === 'share' && !shareSessionId && shareableSessions.length > 0) {
      setShareSessionId(shareableSessions[0].id);
    }
  }, [worktreeMode, shareSessionId, shareableSessions]);

  if (!repo) return null;

  const derivedSlug = branch || slugify(name || 'new');
  const sharedSession = shareableSessions.find(s => s.id === shareSessionId) ?? null;
  // Display-only preview. Backend computes the real worktree path.
  const worktreePathPreview =
    worktreeMode === 'new'      ? `${repo.path}-worktrees/${slugify(derivedSlug)}` :
    worktreeMode === 'existing' && branch && branch !== currentBranchName
      ? `${repo.path}-worktrees/${slugify(branch)}` :
    worktreeMode === 'share' && sharedSession
      ? sharedSession.workingDirectory :
    repo.path;
  const disabled =
    submitting ||
    (sessionType === 'agent' && worktreeMode === 'existing' && !branch) ||
    (sessionType === 'agent' && worktreeMode === 'share' && !sharedSession);

  const submit = async () => {
    if (disabled || !repo) return;
    setSubmitting(true);
    setError(null);
    try {
      const isShell = sessionType === 'shell';
      const permissionMode: PermissionMode =
        launchMode === 'bypass-permissions' ? 'skip-permissions' : 'standard';
      await onCreate({
        name: name || (isShell ? 'Terminal' : 'New session'),
        repoId: repo.id,
        workingDirectory: isShell ? repo.path : worktreePathPreview,
        agent,
        launchMode: isShell ? 'default' : launchMode,
        permissionMode: isShell ? 'standard' : permissionMode,
        worktreeMode: isShell ? 'current' : worktreeMode,
        kind: isShell ? 'shell' : 'agent',
        branch: isShell ? undefined :
          worktreeMode === 'new'      ? derivedSlug :
          worktreeMode === 'existing' ? branch :
          worktreeMode === 'share'    ? sharedSession?.worktreeBranch ?? undefined :
          undefined,
        baseBranch: isShell ? undefined :
          worktreeMode === 'new' && baseBranch && baseBranch !== currentBranchName
            ? baseBranch
            : undefined,
        shareSessionId: isShell ? undefined :
          worktreeMode === 'share' ? shareSessionId : undefined,
        initialPrompt: isShell ? undefined : prefill?.initialPrompt,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to start session');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="p4-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="New session">
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="terminal" size={16} /></div>
          <div>
            <div className="t">New session</div>
            <div className="d">
              A new terminal in <b style={{ color: 'var(--text-primary)' }}>{repo.name}</b>.
              Pick a different repo below if needed.
            </div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body">
          {/* Repo picker */}
          <div className="p4-form-row">
            <label>Repository</label>
            <div
              style={{
                display: 'flex', flexWrap: 'wrap', gap: 6, padding: 4,
                background: 'var(--surface-mid)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              {repos.map(r => {
                const live = liveCount(sessionsForRepo(r, sessions));
                const selected = r.id === repoId;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setRepoId(r.id)}
                    className="p4-btn"
                    style={{
                      background: selected ? 'var(--surface-high)' : 'transparent',
                      border: 0,
                      color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      padding: '4px 10px', fontSize: 11,
                    }}
                  >
                    <span
                      style={{
                        width: 14, height: 14, borderRadius: 3,
                        background: colorBg(r.color as RepoColor),
                        color: colorFg(r.color as RepoColor),
                        display: 'inline-grid', placeItems: 'center',
                        fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                      }}
                    >
                      {r.name[0]?.toUpperCase() ?? '?'}
                    </span>
                    <span>{r.name}</span>
                    {live > 0 && (
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: 'var(--success)',
                        animation: 'p4-pulse 1.6s var(--ease-in-out) infinite',
                      }} />
                    )}
                  </button>
                );
              })}
            </div>
            <div className="help">
              <P4Icon name="folder" size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
              base: {repo.path}{repo.branch ? ` · ${repo.branch}` : ''}
            </div>
          </div>

          {/* Name */}
          <div className="p4-form-row">
            <label>Name</label>
            <input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder='e.g. "Onboarding flow rework"'
              autoFocus
            />
            <div className="help">Leave blank to auto-name from the first prompt.</div>
          </div>

          {/* Session type */}
          <div className="p4-form-row" style={{ marginBottom: 12 }}>
            <label>Type</label>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-mid)', padding: 2, borderRadius: 6 }}>
              {(['agent', 'shell'] as const).map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setSessionType(t)}
                  className="p4-btn"
                  style={{
                    flex: 1, justifyContent: 'center',
                    background: sessionType === t ? 'var(--surface-high)' : 'transparent',
                    border: 0,
                    gap: 4,
                    color: sessionType === t ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {t === 'shell' && <P4Icon name="terminal" size={12} />}
                  {t === 'agent' ? 'Agent' : 'Terminal'}
                </button>
              ))}
            </div>
          </div>

          {/* Worktree mode — git repos only. Plain folders run in the folder. */}
          {sessionType === 'agent' && (!repo.isGit ? (
            <div className="p4-form-row" style={{ marginTop: 12, marginBottom: 0 }}>
              <label>Working directory</label>
              <div className="help" style={{ marginTop: 0 }}>
                <P4Icon name="folder" size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                {repo.path}
              </div>
              <div className="help" style={{ marginTop: 4 }}>
                Plain folder (no git) — the session runs here directly.
              </div>
            </div>
          ) : (
          <>
          <div className="p4-form-row" style={{ marginTop: 12 }}>
            <label>Worktree</label>
            <div style={{ display: 'flex', gap: 4, background: 'var(--surface-mid)', padding: 3, borderRadius: 6 }}>
              {([
                { id: 'new',      icon: 'plus',   label: 'New',      hint: 'isolated' },
                { id: 'existing', icon: 'branch', label: 'Existing', hint: 'pick branch' },
                { id: 'share',    icon: 'layers', label: 'Share',    hint: 'collaborate' },
                { id: 'current',  icon: 'focus',  label: 'Current',  hint: 'main checkout' },
              ] as const).map(opt => {
                const selected = worktreeMode === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setWorktreeMode(opt.id)}
                    className="p4-btn"
                    style={{
                      flex: 1, justifyContent: 'flex-start',
                      background: selected ? 'var(--surface-high)' : 'transparent',
                      border: 0,
                      color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                      padding: '6px 10px',
                    }}
                  >
                    <P4Icon name={opt.icon} size={11} /> {opt.label}
                    <span style={{
                      marginLeft: 'auto', fontFamily: 'var(--font-mono)',
                      fontSize: 10, color: 'var(--text-tertiary)',
                    }}>{opt.hint}</span>
                  </button>
                );
              })}
            </div>
            <div className="help" style={{ marginTop: 6 }}>
              {worktreeMode === 'new'      && <>New branch in its own working copy. Won't touch your current checkout.</>}
              {worktreeMode === 'existing' && <>Check out an existing branch in a fresh worktree.</>}
              {worktreeMode === 'share'    && <>Join another OmniDesk session — same files, same branch. Use e.g. one session for code and another for <code>vitest --watch</code>.</>}
              {worktreeMode === 'current'  && <>Run directly in {repo.name} on whatever branch is currently checked out.</>}
            </div>
          </div>

          {worktreeMode === 'new' && (
            <>
              <div className="p4-form-row">
                <label>Branch &amp; worktree path</label>
                <input
                  value={branch}
                  onChange={e => setBranch(e.target.value)}
                  placeholder="auto · derived from name"
                />
                <div className="help">
                  <P4Icon name="folder" size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                  {worktreePathPreview}
                </div>
              </div>

              <div className="p4-form-row" style={{ marginBottom: 0 }}>
                <label>Base from</label>
                {branchesLoading ? (
                  <div className="help" style={{ color: 'var(--text-tertiary)', marginTop: 0 }}>
                    Loading branches…
                  </div>
                ) : allBranches.length === 0 ? (
                  <div className="help" style={{ color: 'var(--text-tertiary)', marginTop: 0 }}>
                    No branches found.
                  </div>
                ) : (
                  <select value={baseBranch} onChange={e => setBaseBranch(e.target.value)}>
                    {allBranches.map(b => (
                      <option key={b.name} value={b.name}>
                        {b.name}{b.isCurrent ? ' (current)' : ''}
                      </option>
                    ))}
                  </select>
                )}
                <div className="help">
                  New branch <b style={{ color: 'var(--text-secondary)' }}>{derivedSlug}</b> will fork off {baseBranch || currentBranchName || 'HEAD'}.
                </div>
              </div>
            </>
          )}

          {worktreeMode === 'existing' && (
            <div className="p4-form-row" style={{ marginBottom: 0 }}>
              <label>Branch</label>
              {branchesLoading ? (
                <div className="help" style={{ color: 'var(--text-tertiary)', marginTop: 0 }}>
                  Loading branches…
                </div>
              ) : allBranches.length === 0 ? (
                <div className="help" style={{ color: 'var(--text-tertiary)', marginTop: 0 }}>
                  No branches found.
                </div>
              ) : (
                <select value={branch} onChange={e => setBranch(e.target.value)}>
                  <option value="">— pick a branch in {repo.name} —</option>
                  {allBranches.map(b => {
                    const usedBy = sessionsForRepo(repo, sessions).filter(s => s.worktreeBranch === b.name).length;
                    return (
                      <option key={b.name} value={b.name}>
                        {b.name}{b.isCurrent ? ' (current)' : ''}{usedBy > 0 ? ` · ${usedBy} session${usedBy === 1 ? '' : 's'}` : ''}
                      </option>
                    );
                  })}
                </select>
              )}
              {branch && (
                <div className="help">
                  <P4Icon name="folder" size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                  {branch === currentBranchName ? repo.path : worktreePathPreview}
                </div>
              )}
            </div>
          )}

          {worktreeMode === 'share' && (
            <div className="p4-form-row" style={{ marginBottom: 0 }}>
              <label>Share with which session</label>
              {shareableSessions.length === 0 ? (
                <div className="help" style={{ color: 'var(--text-tertiary)', marginTop: 0 }}>
                  No other sessions in {repo.name} have a worktree yet — start one in "New" or "Existing" mode first.
                </div>
              ) : (
                <select value={shareSessionId} onChange={e => setShareSessionId(e.target.value)}>
                  {shareableSessions.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}{s.worktreeBranch ? ` · ${s.worktreeBranch}` : ''}
                    </option>
                  ))}
                </select>
              )}
              {sharedSession && (
                <div className="help">
                  <P4Icon name="folder" size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                  {sharedSession.workingDirectory}
                </div>
              )}
            </div>
          )}

          {worktreeMode === 'current' && (
            <div className="p4-form-row" style={{ marginBottom: 0 }}>
              <label>Working directory</label>
              <div className="help" style={{ marginTop: 0 }}>
                <P4Icon name="folder" size={10} style={{ verticalAlign: -1, marginRight: 4 }} />
                {repo.path}{currentBranchName ? ` · ${currentBranchName}` : ''}
              </div>
            </div>
          )}
          </>
          ))}

          {/* Agent + Launch mode */}
          {sessionType === 'agent' && (
          <div className="p4-form-grid" style={{ marginTop: 12 }}>
            <div className="p4-form-row" style={{ marginBottom: 0 }}>
              <label>Agent</label>
              <div style={{ display: 'flex', gap: 4, background: 'var(--surface-mid)', padding: 2, borderRadius: 6 }}>
                {(['claude', 'codex'] as ProviderId[]).map(a => (
                  <button
                    key={a}
                    type="button"
                    onClick={() => setAgent(a)}
                    className="p4-btn"
                    style={{
                      flex: 1, justifyContent: 'center',
                      background: agent === a ? 'var(--surface-high)' : 'transparent',
                      border: 0,
                      color: agent === a
                        ? a === 'claude' ? 'var(--accent)' : 'var(--accent-2)'
                        : 'var(--text-secondary)',
                    }}
                  >
                    {a === 'claude' ? 'Claude' : 'Codex'}
                  </button>
                ))}
              </div>
            </div>

            <div className="p4-form-row" style={{ marginBottom: 0 }}>
              <label>Launch mode</label>
              <div style={{
                display: 'flex', gap: 4, background: 'var(--surface-mid)',
                padding: 2, borderRadius: 6, flexWrap: 'wrap',
              }}>
                {(['default', 'bypass-permissions'] as LaunchMode[]).map(m => {
                  const selected = launchMode === m;
                  const isBypass = m === 'bypass-permissions';
                  const codexDisabled = agent !== 'claude' && isBypass;
                  return (
                    <button
                      key={m}
                      type="button"
                      disabled={codexDisabled}
                      onClick={() => setLaunchMode(m)}
                      className="p4-btn"
                      style={{
                        flex: '1 1 0', justifyContent: 'center',
                        background: selected
                          ? isBypass ? 'rgba(247,103,142,.14)' : 'var(--surface-high)'
                          : 'transparent',
                        border: selected && isBypass ? '1px solid rgba(247,103,142,.4)' : 0,
                        fontSize: 11,
                        color: codexDisabled
                          ? 'var(--text-quaternary)'
                          : selected
                            ? isBypass ? 'var(--error)' : 'var(--text-primary)'
                            : isBypass ? 'rgba(247,103,142,.65)' : 'var(--text-secondary)',
                        whiteSpace: 'nowrap',
                        fontWeight: selected && isBypass ? 600 : 500,
                        gap: 4,
                        opacity: codexDisabled ? 0.5 : 1,
                      }}
                    >
                      {isBypass && <span style={{ fontSize: 11 }}>⚠</span>}
                      {isBypass ? 'skip perms' : 'default'}
                    </button>
                  );
                })}
                {agent === 'claude' && agentsAvailable && (
                  <button
                    type="button"
                    onClick={() => setLaunchMode('agents')}
                    className="p4-btn"
                    style={{
                      flex: '1 1 0', justifyContent: 'center',
                      background: launchMode === 'agents' ? 'var(--surface-high)' : 'transparent',
                      border: 0,
                      fontSize: 11,
                      color: launchMode === 'agents' ? 'var(--accent-2)' : 'var(--text-secondary)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    agents
                  </button>
                )}
              </div>
            </div>
          </div>
          )}

          {error && (
            <div style={{
              marginTop: 12, padding: '8px 10px',
              background: 'rgba(247,103,142,.10)',
              border: '1px solid rgba(247,103,142,.30)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--error)', fontSize: 'var(--text-sm)',
            }}>{error}</div>
          )}
        </div>

        <div className="p4-sheet-foot">
          <button className="p4-btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="p4-btn primary"
            disabled={disabled}
            onClick={submit}
          >
            <P4Icon name="plus" size={13} /> Start session
          </button>
        </div>
      </div>
    </div>
  );
}
