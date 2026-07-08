// @atlas-entrypoint: Root React component — Phase 4 shell.
// Flat repo→session model. Activity bar = repo switcher. Session rail =
// primary nav. Main view = Focus or Grid. Right panel = per-session inspector.
import './styles/tokens.css';
import './styles/animations.css';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  RepoActivityBar, SessionRail, MainView, RepoSwitcher,
  AddRepoSheet, NewSessionSheet, Palette, RightInspector,
  TitleBar, StatusBar, RemoteAccessPanel, P4Icon,
  sessionsForRepo, liveCount, resolveSessionWorktree,
  type ViewMode, type PaletteAction, type NewSessionForm,
} from './components/shell';
import type { ActiveSelection } from './components/shell/RepoActivityBar';
import { ContextMenu } from './components/shell/ContextMenu';
import { TerminalHost } from './components/shell/TerminalHost';
import { PromptDialog } from './components/shell/PromptDialog';
import { CloseSessionDialog } from './components/shell/CloseSessionDialog';
import { NonGitFolderDialog } from './components/shell/NonGitFolderDialog';
import { useSessionManager } from './hooks/useSessionManager';
import { useRepos } from './hooks/useRepos';
import { useQuota } from './hooks/useQuota';
import { useAgentViewAvailability } from './hooks/useAgentViewAvailability';
import { useSessionPreviews } from './hooks/useSessionPreviews';
import { useTouchMode } from './hooks/useTouchMode';
import { MobileKeyBar } from './components/shell/mobile/MobileKeyBar';
import { shouldShowCloseDialog } from './terminal/shell-key-rules';
import { ToastContainer } from './components/ui/ToastContainer';
import { ConfirmDialog } from './components/ui/ConfirmDialog';
import { showToast } from './utils/toast';
import iconDarkUrl from './assets/logo/icon-dark.svg';
import type { PermissionMode } from '../shared/ipc-types';

function App() {
  // ─── Core state ──────────────────────────────────────────────
  const {
    sessions,
    activeSessionId,
    createSession,
    switchSession,
    closeSession,
    renameSession,
    restartSession,
    stopSession,
    sendInput,
    resizeSession,
    onOutput,
  } = useSessionManager();

  const {
    repos, activeRepo, activeRepoId, workspaces, openedRepoIds,
    groups,
    setActiveRepoId, addWorkspace, refresh: refreshRepos,
    openRepo, closeRepo,
    openPlainFolder, removePlainFolder,
    createGroup, addRepoToGroup, dissolveGroup, renameGroup,
  } = useRepos();

  // ─── Group selection state ───
  // null = no group context (just a single repo is active).
  // string = the active context is this group; activeRepoId still points at
  // a member repo (the "current" member, used as default for new sessions).
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null);
  const activeGroup = useMemo(
    () => activeGroupId ? groups.find(g => g.id === activeGroupId) ?? null : null,
    [activeGroupId, groups],
  );
  // Compose the sidebar selection (drives icon highlighting).
  const sidebarActive: ActiveSelection = activeGroup
    ? { kind: 'group', id: activeGroup.id }
    : activeRepoId ? { kind: 'repo', id: activeRepoId } : null;

  // Pending name prompts for group create/rename, etc.
  const [createGroupPrompt, setCreateGroupPrompt] = useState<
    { fromRepoId: string; ontoRepoId: string; defaultName: string } | null
  >(null);
  const [renameGroupPrompt, setRenameGroupPrompt] = useState<
    { groupId: string; current: string } | null
  >(null);
  // Non-git folder open choice (init git vs open plain).
  const [nonGitChoice, setNonGitChoice] = useState<
    { path: string; name: string; permissionMode: PermissionMode } | null
  >(null);
  // Session row context menu + rename prompt.
  const [sessionMenu, setSessionMenu] = useState<{ id: string; x: number; y: number } | null>(null);
  const [renameSessionPrompt, setRenameSessionPrompt] = useState<{ id: string; current: string } | null>(null);
  const [confirmKill, setConfirmKill] = useState<{ id: string; name: string } | null>(null);

  // Last-known burn rate for the active session, surfaced in the status bar.
  const { burnRate } = useQuota(activeSessionId);

  // Gate the "agents" launch mode based on the live availability probe.
  const agentView = useAgentViewAvailability();
  const agentsAvailable = agentView.availability?.status === 'available';

  // Per-session recent-output snapshots, fed into Grid tiles + Inspector last-activity.
  const previews = useSessionPreviews();
  useEffect(() => {
    const cleanup = previews.attach(onOutput);
    return cleanup;
  }, [previews, onOutput]);

  // ─── UI state ─────────────────────────────────────────────────
  const [mode, setMode] = useState<ViewMode>('focus');
  const [railQuery, setRailQuery] = useState('');
  // Per-repo session display order (drag-reorder in the rail). Persisted.
  const [sessionOrders, setSessionOrders] = useState<Record<string, string[]>>(() => {
    try { return JSON.parse(localStorage.getItem('omnidesk.repo.sessionOrders') || '{}'); }
    catch { return {}; }
  });
  const reorderSession = useCallback((repoId: string, draggedId: string, targetId: string) => {
    setSessionOrders(prev => {
      const cur = prev[repoId] ? [...prev[repoId]] : [];
      if (!cur.includes(draggedId)) cur.push(draggedId);
      if (!cur.includes(targetId)) cur.push(targetId);
      const without = cur.filter(id => id !== draggedId);
      const ti = without.indexOf(targetId);
      without.splice(ti, 0, draggedId);
      const next = { ...prev, [repoId]: without };
      try { localStorage.setItem('omnidesk.repo.sessionOrders', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);
  const [repoSwitcher, setRepoSwitcher] = useState<{ anchorRect: DOMRect | null } | null>(null);
  const [addRepoTab, setAddRepoTab] = useState<'clone' | 'open' | null>(null);
  const showAddRepo = addRepoTab !== null;
  const setShowAddRepo = (next: boolean) => setAddRepoTab(next ? (addRepoTab ?? 'clone') : null);
  const [showNewSession, setShowNewSession] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [showRightPanel, setShowRightPanel] = useState(false);
  const [showRemote, setShowRemote] = useState(false);
  const [navOpen, setNavOpen] = useState(false); // mobile drawer (activity bar + rail)
  const touchMode = useTouchMode();
  // Pending close confirmation. null while no prompt is open.
  const [confirmClose, setConfirmClose] = useState<{ id: string; name: string } | null>(null);
  const [confirmCloseRepo, setConfirmCloseRepo] = useState<{
    id: string;
    name: string;
    sessionIds: string[];
    runningCount: number;
  } | null>(null);

  // ─── Active session within the active repo ───────────────────
  const repoSessions = useMemo(
    () => (activeRepo ? sessionsForRepo(activeRepo, sessions) : []),
    [activeRepo, sessions]
  );
  const activeSession = useMemo(
    () => repoSessions.find(s => s.id === activeSessionId) ?? null,
    [repoSessions, activeSessionId]
  );

  // ─── Cross-repo live counts for the activity bar ─────────────
  const liveCountByRepo = useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of repos) {
      m[r.id] = liveCount(sessionsForRepo(r, sessions));
    }
    return m;
  }, [repos, sessions]);

  // A repo is "visible" in the sidebar if (a) it has any sessions OR
  // (b) the user explicitly opened it via Open folder / Clone.
  const visibleRepos = useMemo(
    () => repos.filter(r =>
      sessionsForRepo(r, sessions).length > 0 || openedRepoIds.has(r.id)
    ),
    [repos, sessions, openedRepoIds]
  );

  // "Active" set used by the rail/picker/switcher — same rule.
  const reposWithSessions = visibleRepos;

  // If the active repo stops being "visible" (no sessions AND no longer pinned),
  // fall back to another visible repo or to the welcome screen.
  // A pinned-but-empty repo stays active by design — the user explicitly opened it.
  useEffect(() => {
    if (!activeRepoId) return;
    const stillVisible = visibleRepos.some(r => r.id === activeRepoId);
    if (stillVisible) return;
    setActiveRepoId(visibleRepos[0]?.id ?? null);
  }, [activeRepoId, visibleRepos, setActiveRepoId]);

  // ─── Handlers ─────────────────────────────────────────────────
  const handleSelectSession = useCallback((id: string) => {
    switchSession(id);
    setMode('focus');
  }, [switchSession]);

  const handleCloseRepo = useCallback((id: string) => {
    const target = repos.find(r => r.id === id);
    if (!target) return;
    const repoSessions = sessionsForRepo(target, sessions);
    setConfirmCloseRepo({
      id,
      name: target.name,
      sessionIds: repoSessions.map(s => s.id),
      runningCount: repoSessions.filter(s => s.status === 'running').length,
    });
  }, [repos, sessions]);

  const handleCloseSession = useCallback((id: string) => {
    const target = sessions.find(s => s.id === id);
    if (!target) return;
    // Always open the dialog so the user can opt in to destructive cleanup.
    // Default (just click Close) preserves everything.
    setConfirmClose({ id, name: target.name });
  }, [sessions]);

  const handleSelectRepo = useCallback((id: string) => {
    setActiveRepoId(id);
    setActiveGroupId(null); // single-repo selection exits group context
    // Switch active session to the most recent one in the picked repo, if any.
    const repo = repos.find(r => r.id === id);
    if (repo) {
      const first = sessionsForRepo(repo, sessions)[0];
      if (first) switchSession(first.id);
    }
    setRepoSwitcher(null);
  }, [setActiveRepoId, repos, sessions, switchSession]);

  const handleSelectGroup = useCallback((groupId: string) => {
    const group = groups.find(g => g.id === groupId);
    if (!group) return;
    setActiveGroupId(groupId);
    // Pick a member repo to be the "current" one inside the group (for new-session defaults).
    const firstMember = group.repoIds
      .map(rid => repos.find(r => r.id === rid))
      .find((r): r is NonNullable<typeof r> => !!r);
    if (firstMember) setActiveRepoId(firstMember.id);
  }, [groups, repos, setActiveRepoId]);

  const handleCreateGroupFromDrop = useCallback((fromRepoId: string, ontoRepoId: string) => {
    const a = repos.find(r => r.id === fromRepoId);
    const b = repos.find(r => r.id === ontoRepoId);
    const defaultName = `${b?.name ?? 'repo'} + ${a?.name ?? 'repo'}`;
    setCreateGroupPrompt({ fromRepoId, ontoRepoId, defaultName });
  }, [repos]);

  const handleCreateSession = useCallback(async (form: NewSessionForm) => {
    const repo = repos.find(r => r.id === form.repoId);
    if (!repo) throw new Error('Repository not found');

    if (form.kind === 'shell') {
      // Plain terminal in the repo folder — no worktree, provider, or launch mode.
      await createSession(form.name, form.workingDirectory, 'standard', undefined, undefined, undefined, 'shell');
      return;
    }

    // Resolve the workingDirectory + worktree request per mode (see
    // resolveSessionWorktree). Share mode needs the donor session's cwd, so
    // look that up here before delegating the decision.
    let shareWorkingDirectory: string | undefined;
    if (form.worktreeMode === 'share' && form.shareSessionId) {
      const donor = sessions.find(s => s.id === form.shareSessionId);
      if (!donor || !donor.workingDirectory) {
        throw new Error("Couldn't find the session you're sharing with.");
      }
      shareWorkingDirectory = donor.workingDirectory;
    }

    const { cwd, worktree } = resolveSessionWorktree(form, repo, shareWorkingDirectory);

    const start = async (override?: { isNewBranch: boolean } | null): Promise<void> => {
      const wt = worktree && override !== null
        ? { ...worktree, ...(override ?? {}) }
        : worktree && override === null ? undefined : worktree;
      await createSession(
        form.name,
        cwd,
        form.permissionMode,
        wt,
        form.agent,
        form.launchMode,
      );
    };

    try {
      await start();
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      if (worktree && /already exists/i.test(msg)) {
        // Branch exists from a prior new-branch attempt — retry as "use existing".
        await start({ isNewBranch: false });
      } else if (worktree && /already checked out/i.test(msg)) {
        // The branch is already the current checkout in the main repo —
        // git refuses to make a second worktree for it. Run in the main repo.
        await start(null);
      } else {
        // "invalid reference" / stale worktree-registry errors are now
        // self-healed inside git-manager.addWorktree (it prunes + retries).
        // Anything that escapes here is a genuine error worth surfacing.
        throw err;
      }
    }
  }, [createSession, repos, sessions]);

  const handleOpenTerminalHere = useCallback(async (_sessionId: string, workingDirectory: string, baseName: string) => {
    // Loosely-coupled companion: a plain shell seeded to the agent's dir, then focus it.
    const newId = await createSession(`${baseName} · shell`, workingDirectory, 'standard', undefined, undefined, undefined, 'shell');
    await switchSession(newId);
  }, [createSession, switchSession]);

  const isWin = navigator.platform.toLowerCase().includes('win');
  const normalizePath = useCallback((p: string) => {
    const s = p.replace(/\\/g, '/').replace(/\/+$/, '');
    return isWin ? s.toLowerCase() : s;
  }, [isWin]);

  // Register the picked git repo's parent as a workspace (so the scan surfaces
  // it), then pin + activate the repo. Returns true if the repo was found.
  const registerGitRepoAndOpen = useCallback(async (repoPath: string, name: string, permissionMode: PermissionMode): Promise<boolean> => {
    const parentPath = repoPath.replace(/[\\/][^\\/]+$/, '') || repoPath;
    const wantsPath = normalizePath(parentPath);
    const alreadyRegistered = workspaces.some(w => {
      const wp = normalizePath(w.path);
      return wp === wantsPath || wp === normalizePath(repoPath);
    });
    if (!alreadyRegistered) {
      await addWorkspace({ name, path: parentPath, defaultPermissionMode: permissionMode });
    }
    const fresh = await refreshRepos();
    const match = fresh.find(r => normalizePath(r.path) === normalizePath(repoPath));
    if (match) {
      openRepo(match.id);
      setActiveRepoId(match.id);
      return true;
    }
    return false;
  }, [workspaces, addWorkspace, refreshRepos, openRepo, setActiveRepoId, normalizePath]);

  const handleAddRepo = useCallback(async (req: {
    name: string;
    path: string;
    permissionMode: PermissionMode;
    source: 'clone' | 'open';
    cloneUrl?: string;
  }): Promise<void> => {
    // Determine whether the picked folder is itself a git repo. listGitRepos
    // returns the folder itself when it has a `.git`, plus any git subdirs.
    let entries: { path: string }[] = [];
    try {
      entries = await window.electronAPI.listGitRepos(req.path);
    } catch { /* treat as non-git */ }
    const isSelfGit = entries.some(e => normalizePath(e.path) === normalizePath(req.path));

    if (isSelfGit || req.source === 'clone') {
      const opened = await registerGitRepoAndOpen(req.path, req.name, req.permissionMode);
      if (!opened) {
        throw new Error(`Could not open ${req.path}. It may not be a git repository.`);
      }
      return;
    }

    // Non-git folder — defer to the user: init git, or open as a plain folder.
    setNonGitChoice({ path: req.path, name: req.name, permissionMode: req.permissionMode });
  }, [normalizePath, registerGitRepoAndOpen]);

  // Resolve the non-git folder choice.
  const handleInitGitAndOpen = useCallback(async () => {
    if (!nonGitChoice) return;
    const { path, name, permissionMode } = nonGitChoice;
    setNonGitChoice(null);
    try {
      const res = await window.electronAPI.gitInit(path);
      if (!(res as any)?.success) {
        showToast('Failed to initialize git in that folder.', 'error');
        return;
      }
      await registerGitRepoAndOpen(path, name, permissionMode);
    } catch (err) {
      console.error('git init failed', err);
      showToast('Failed to initialize git in that folder.', 'error');
    }
  }, [nonGitChoice, registerGitRepoAndOpen]);

  const handleOpenPlainFolder = useCallback(async () => {
    if (!nonGitChoice) return;
    const { path, name } = nonGitChoice;
    setNonGitChoice(null);
    const repo = await openPlainFolder(path, name);
    openRepo(repo.id);
    setActiveRepoId(repo.id);
  }, [nonGitChoice, openPlainFolder, openRepo, setActiveRepoId]);

  // ─── Keyboard shortcuts ──────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const cmd = e.metaKey || e.ctrlKey;
      if (cmd && e.shiftKey && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setRepoSwitcher({ anchorRect: null });
        return;
      }
      if (cmd && e.key === 'k') { e.preventDefault(); setShowPalette(true); return; }
      if (cmd && e.key === 'n') { e.preventDefault(); setShowNewSession(true); return; }
      if (cmd && e.key === '1') { e.preventDefault(); setMode('focus'); return; }
      if (cmd && e.key === '2') { e.preventDefault(); setMode('grid'); return; }
      if (cmd && e.key === '.') { e.preventDefault(); setShowRightPanel(v => !v); return; }
      if (e.key === 'Escape') {
        if (showPalette)    setShowPalette(false);
        if (showNewSession) setShowNewSession(false);
        if (showAddRepo)    setShowAddRepo(false);
        if (showRemote)     setShowRemote(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showPalette, showNewSession, showAddRepo, showRemote]);

  // ─── Palette actions ─────────────────────────────────────────
  const paletteActions: PaletteAction[] = useMemo(() => [
    {
      id: 'new', icon: 'plus', title: 'New session…',
      sub: 'Open the new-session sheet', shortcut: ['⌘', 'N'],
      run: () => { setShowPalette(false); setShowNewSession(true); },
    },
    {
      id: 'focus', icon: 'focus', title: 'Switch to Focus view',
      sub: 'one session fills the area', shortcut: ['⌘', '1'],
      run: () => { setMode('focus'); setShowPalette(false); },
    },
    {
      id: 'grid', icon: 'grid', title: 'Switch to Grid view',
      sub: 'all sessions at once', shortcut: ['⌘', '2'],
      run: () => { setMode('grid'); setShowPalette(false); },
    },
    {
      id: 'inspector', icon: 'sparkle', title: 'Toggle inspector',
      sub: 'show session details on the right', shortcut: ['⌘', '.'],
      run: () => { setShowRightPanel(v => !v); setShowPalette(false); },
    },
    {
      id: 'add-repo', icon: 'folder', title: 'Add repository…',
      sub: 'Clone from URL or open an existing folder',
      run: () => { setShowPalette(false); setShowAddRepo(true); },
    },
    {
      id: 'remote', icon: 'tunnel', title: 'Remote access…',
      sub: 'Reach OmniDesk from a browser over a tunnel',
      run: () => { setShowPalette(false); setShowRemote(true); },
    },
  ], []);

  // ─── Session provider map for the terminal host ──────────────
  const sessionProviderMap = useMemo(() => {
    const m: Record<string, 'claude' | 'codex'> = {};
    for (const s of sessions) {
      if (s.providerId) m[s.id] = s.providerId;
    }
    return m;
  }, [sessions]);

  // ─── Session kind map for the terminal host ───────────────────
  const sessionKindMap = useMemo(() => {
    const m: Record<string, 'agent' | 'shell'> = {};
    for (const s of sessions) {
      if (s.kind) m[s.id] = s.kind;
    }
    return m;
  }, [sessions]);

  // Key-bar dispatch: identical close-dialog rule to the terminal's onData
  // handler, so agent Ctrl+C opens the confirm dialog instead of killing Claude.
  const dispatchMobileKey = useCallback((bytes: string) => {
    if (!activeSessionId) return;
    const kind = sessionKindMap[activeSessionId];
    if (shouldShowCloseDialog(bytes, 0, kind)) {
      const s = sessions.find(x => x.id === activeSessionId);
      if (s) setConfirmClose({ id: s.id, name: s.name });
      return;
    }
    sendInput(activeSessionId, bytes);
  }, [activeSessionId, sessionKindMap, sessions, sendInput]);

  // ─── Native folder picker, used by AddRepoSheet "Browse…" ────
  const handlePickFolder = useCallback(async (): Promise<string | null> => {
    try {
      return await window.electronAPI.browseDirectory();
    } catch (err) {
      console.error('browseDirectory failed', err);
      return null;
    }
  }, []);

  // ─── Empty-state: no active repo (either nothing added, or all sessions closed)
  if (!activeRepo) {
    const hasActive = reposWithSessions.length > 0;
    return (
      <>
        <div className="p4-shell" style={{ gridTemplateColumns: '48px 1fr', gridTemplateRows: '36px 1fr 24px' }}>
          <TitleBar />
          <RepoActivityBar
            repos={reposWithSessions}
            groups={groups}
            active={null}
            liveCountByRepo={liveCountByRepo}
            onSelectRepo={handleSelectRepo}
            onSelectGroup={handleSelectGroup}
            onAddRepo={() => setShowAddRepo(true)}
            onCreateGroupFromDrop={handleCreateGroupFromDrop}
            onAddRepoToGroup={addRepoToGroup}
            onRequestRenameGroup={(gid) => {
              const g = groups.find(x => x.id === gid);
              if (g) setRenameGroupPrompt({ groupId: g.id, current: g.name });
            }}
            onRequestUngroup={(gid) => {
              dissolveGroup(gid);
              if (activeGroupId === gid) setActiveGroupId(null);
            }}
            onOpenRemote={() => setShowRemote(true)}
          />
          <div style={{
            gridColumn: '2', gridRow: '2',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexDirection: 'column', gap: 16, padding: 32, textAlign: 'center',
            background: 'var(--surface-base)',
          }}>
            <img
              src={iconDarkUrl}
              alt="OmniDesk"
              width={96}
              height={96}
              style={{ borderRadius: 'var(--radius-lg)' }}
            />
            <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 'var(--text-lg)' }}>
              {hasActive ? 'No active sessions' : 'Welcome to OmniDesk'}
            </div>
            <div style={{ color: 'var(--text-secondary)', maxWidth: 380, lineHeight: 1.5 }}>
              {hasActive
                ? 'Pick one of your repositories to start a new session, or add another one.'
                : 'Add a repository to begin. You can open a local folder or clone from a remote URL.'}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="p4-btn primary"
                onClick={() => setAddRepoTab('open')}
              >
                Pick a repository
              </button>
              <button
                className="p4-btn"
                onClick={() => setAddRepoTab('clone')}
              >
                Clone from URL
              </button>
            </div>
          </div>
          <footer className="p4-statusbar">
            <span>{hasActive ? 'no active session' : 'no repositories'}</span>
          </footer>
        </div>

        {repoSwitcher && (
          <RepoSwitcher
            repos={reposWithSessions}
            activeRepoId={activeRepoId}
            sessions={sessions}
            anchorRect={repoSwitcher.anchorRect}
            onPick={handleSelectRepo}
            onAddRepo={() => setShowAddRepo(true)}
            onClose={() => setRepoSwitcher(null)}
          />
        )}
        {showAddRepo && (
          <AddRepoSheet
            initialTab={addRepoTab ?? 'clone'}
            onClose={() => setAddRepoTab(null)}
            onCreate={(req) => handleAddRepo(req)}
            onPickFolder={handlePickFolder}
          />
        )}
        {showPalette && (
          <Palette
            repo={{ id: '', name: '', org: '', path: '', workspacePath: '', lastOpened: 0, color: 'neutral', isGit: false }}
            sessions={[]}
            onPickSession={() => {}}
            onClose={() => setShowPalette(false)}
            actions={paletteActions}
          />
        )}
        {showRemote && <RemoteAccessPanel onClose={() => setShowRemote(false)} />}
        {nonGitChoice && (
          <NonGitFolderDialog
            name={nonGitChoice.name}
            onInitGit={handleInitGitAndOpen}
            onOpenPlain={handleOpenPlainFolder}
            onCancel={() => setNonGitChoice(null)}
          />
        )}
        <ToastContainer />
      </>
    );
  }

  // ─── Main shell ──────────────────────────────────────────────
  const shellClass = 'p4-shell' + (showRightPanel ? ' with-right' : '') + (navOpen ? ' nav-open' : '');

  return (
    <TerminalHost
      sessionIds={sessions.map(s => s.id)}
      focusedSessionId={activeSessionId}
      sessionProviderMap={sessionProviderMap}
      sessionKindMap={sessionKindMap}
      onInput={sendInput}
      onResize={resizeSession}
      onOutput={onOutput}
      onFocusSession={(id) => {
        // Mark the focused terminal active WITHOUT changing the view mode,
        // so the Grid highlight follows whichever tile you're typing in.
        if (id !== activeSessionId) void switchSession(id);
      }}
    >
      <div className={shellClass}>
        <TitleBar />

        {/* Mobile: hamburger toggles the activity-bar + rail drawer. Hidden >768px. */}
        <button
          className="p4-mobile-nav-toggle"
          aria-label={navOpen ? 'Close navigation' : 'Open navigation'}
          onClick={() => setNavOpen(v => !v)}
        >
          <P4Icon name={navOpen ? 'x' : 'layers'} size={16} />
        </button>
        <div className="p4-mobile-backdrop" onClick={() => setNavOpen(false)} />

        <RepoActivityBar
          repos={visibleRepos}
          groups={groups}
          active={sidebarActive}
          liveCountByRepo={liveCountByRepo}
          onSelectRepo={handleSelectRepo}
          onSelectGroup={handleSelectGroup}
          onCloseRepo={handleCloseRepo}
          onAddRepo={() => setShowAddRepo(true)}
          onCreateGroupFromDrop={handleCreateGroupFromDrop}
          onAddRepoToGroup={addRepoToGroup}
          onRequestRenameGroup={(gid) => {
            const g = groups.find(x => x.id === gid);
            if (g) setRenameGroupPrompt({ groupId: g.id, current: g.name });
          }}
          onRequestUngroup={(gid) => {
            dissolveGroup(gid);
            if (activeGroupId === gid) setActiveGroupId(null);
          }}
          onOpenRemote={() => setShowRemote(true)}
        />

        {activeRepo && (
          <SessionRail
            repo={activeRepo}
            repos={repos}
            sessions={sessions}
            activeSessionId={activeSessionId}
            query={railQuery}
            setQuery={setRailQuery}
            onSelectSession={(id) => { handleSelectSession(id); setNavOpen(false); }}
            onCloseSession={handleCloseSession}
            onSessionContextMenu={(id, x, y) => setSessionMenu({ id, x, y })}
            onNewSession={() => setShowNewSession(true)}
            onOpenRepoSwitcher={(rect) => setRepoSwitcher({ anchorRect: rect })}
            repoSwitcherOpen={!!repoSwitcher}
            sessionOrders={sessionOrders}
            onReorderSession={reorderSession}
            group={activeGroup ?? undefined}
            groupMembers={
              activeGroup
                ? activeGroup.repoIds.map(rid => repos.find(r => r.id === rid)).filter((r): r is NonNullable<typeof r> => !!r)
                : undefined
            }
          />
        )}

        {activeRepo && (
          <MainView
            mode={mode}
            setMode={setMode}
            repo={activeRepo}
            sessions={sessions}
            activeSessionId={activeSessionId}
            lastActivityAt={previews.lastActivityAt}
            onSelectSession={handleSelectSession}
            onCloseSession={handleCloseSession}
            onRestartSession={(id) => { void restartSession(id); }}
            onKillSession={(id) => {
              const s = sessions.find(x => x.id === id);
              if (s) setConfirmKill({ id, name: s.name });
            }}
            onOpenRepoSwitcher={() => setRepoSwitcher({ anchorRect: null })}
            onNewSession={() => setShowNewSession(true)}
          />
        )}

        {showRightPanel && (
          <RightInspector
            session={activeSession}
            lastActiveAt={activeSession ? previews.lastActivityAt[activeSession.id] : undefined}
            onClose={() => setShowRightPanel(false)}
          />
        )}

        <StatusBar
          repo={activeRepo}
          repos={repos}
          sessions={sessions}
          burnRatePerHour={(burnRate as any)?.dollarsPerHour ?? null}
          onOpenOtherReposLive={() => setRepoSwitcher({ anchorRect: null })}
        />
      </div>

      {touchMode && activeSessionId && <MobileKeyBar onKey={dispatchMobileKey} />}

      {repoSwitcher && (
        <RepoSwitcher
          // Match the activity bar: only repos with current sessions.
          repos={reposWithSessions}
          activeRepoId={activeRepoId}
          sessions={sessions}
          anchorRect={repoSwitcher.anchorRect}
          onPick={handleSelectRepo}
          onAddRepo={() => setShowAddRepo(true)}
          onClose={() => setRepoSwitcher(null)}
        />
      )}

      {showAddRepo && (
        <AddRepoSheet
          initialTab={addRepoTab ?? 'clone'}
          onClose={() => setAddRepoTab(null)}
          onCreate={(req) => handleAddRepo(req)}
          onPickFolder={handlePickFolder}
        />
      )}

      {showNewSession && activeRepo && (() => {
        // When a group is active, scope the repo picker to its members only.
        // Otherwise show the same set as the activity bar (repos with sessions)
        // plus the active repo so a freshly-added one can spin its first session.
        const scoped = activeGroup
          ? activeGroup.repoIds
              .map(rid => repos.find(r => r.id === rid))
              .filter((r): r is NonNullable<typeof r> => !!r)
          : reposWithSessions.some(r => r.id === activeRepo.id)
            ? reposWithSessions
            : [activeRepo, ...reposWithSessions];
        return (
          <NewSessionSheet
            repos={scoped}
            sessions={sessions}
            activeRepoId={activeRepoId}
            agentsAvailable={agentsAvailable}
            onClose={() => setShowNewSession(false)}
            onCreate={handleCreateSession}
          />
        );
      })()}

      {showPalette && activeRepo && (
        <Palette
          repo={activeRepo}
          sessions={sessions}
          onPickSession={(id) => { handleSelectSession(id); setShowPalette(false); }}
          onClose={() => setShowPalette(false)}
          actions={paletteActions}
        />
      )}

      {showRemote && <RemoteAccessPanel onClose={() => setShowRemote(false)} />}

      {confirmClose && (() => {
        const target = sessions.find(s => s.id === confirmClose.id);
        const hasWorktree = !!target?.mainRepoPath || !!target?.worktreeBranch;
        return (
          <CloseSessionDialog
            name={confirmClose.name}
            isRunning={target?.status === 'running'}
            hasWorktree={hasWorktree}
            branchName={target?.worktreeBranch ?? null}
            onConfirm={(opts) => {
              const id = confirmClose.id;
              setConfirmClose(null);
              void closeSession(id, opts);
            }}
            onCancel={() => setConfirmClose(null)}
          />
        );
      })()}

      {confirmCloseRepo && (() => {
        const { id, name, sessionIds, runningCount } = confirmCloseRepo;
        const total = sessionIds.length;
        const hasRunning = runningCount > 0;
        const hasSessions = total > 0;
        return (
          <ConfirmDialog
            isOpen={true}
            title={
              hasRunning
                ? `Close ${name} and end ${runningCount} running session${runningCount === 1 ? '' : 's'}?`
                : hasSessions
                  ? `Close ${name} and remove ${total} session${total === 1 ? '' : 's'}?`
                  : `Close ${name}?`
            }
            message={
              hasRunning
                ? `${runningCount} session${runningCount === 1 ? ' is' : 's are'} still running in this repository. Closing the repo will terminate the underlying CLI process${runningCount === 1 ? '' : 'es'} and remove the repo from the sidebar. The repo itself stays on disk.`
                : hasSessions
                  ? `This repo has ${total} session${total === 1 ? '' : 's'} in the manager. They'll be removed when the repo closes. The repo itself stays on disk.`
                  : `"${name}" will be removed from the sidebar. The repo itself stays on disk and can be reopened later via the "+" button.`
            }
            confirmLabel={hasSessions ? `Close ${total} session${total === 1 ? '' : 's'} & repo` : 'Close repository'}
            cancelLabel="Keep open"
            isDangerous={hasRunning}
            onConfirm={async () => {
              setConfirmCloseRepo(null);
              // Close each session non-destructively — worktree dirs and
              // branches survive. The user can clean them up individually
              // via each session's close dialog if they want to.
              for (const sid of sessionIds) {
                try { await closeSession(sid); } catch (err) { console.warn('closeSession failed', err); }
              }
              closeRepo(id);
              // Plain folders aren't backed by a workspace scan, so unpinning
              // alone leaves them in localStorage. Remove them outright.
              const closed = repos.find(r => r.id === id);
              if (closed && !closed.isGit) removePlainFolder(id);
            }}
            onCancel={() => setConfirmCloseRepo(null)}
          />
        );
      })()}

      {createGroupPrompt && (
        <PromptDialog
          title="Name this group"
          message="Group these repositories so they share a sidebar slot."
          defaultValue={createGroupPrompt.defaultName}
          placeholder="e.g. Backend services"
          confirmLabel="Create group"
          onConfirm={(name) => {
            const { fromRepoId, ontoRepoId } = createGroupPrompt;
            setCreateGroupPrompt(null);
            const id = createGroup(name, [ontoRepoId, fromRepoId]);
            setActiveGroupId(id);
          }}
          onCancel={() => setCreateGroupPrompt(null)}
        />
      )}

      {renameGroupPrompt && (
        <PromptDialog
          title="Rename group"
          defaultValue={renameGroupPrompt.current}
          confirmLabel="Rename"
          onConfirm={(name) => {
            renameGroup(renameGroupPrompt.groupId, name);
            setRenameGroupPrompt(null);
          }}
          onCancel={() => setRenameGroupPrompt(null)}
        />
      )}

      {sessionMenu && (() => {
        const s = sessions.find(x => x.id === sessionMenu.id);
        if (!s) return null;
        const isIdle = s.status !== 'running';
        return (
          <ContextMenu
            x={sessionMenu.x}
            y={sessionMenu.y}
            items={[
              {
                label: isIdle ? 'Restart session' : 'Restart session (respawn)',
                icon: 'play',
                onSelect: () => {
                  void restartSession(s.id);
                  switchSession(s.id);
                },
              },
              // Kill = stop the process but keep the card. Only for running sessions.
              ...(!isIdle ? [{
                label: 'Kill session',
                icon: 'pause' as const,
                onSelect: () => setConfirmKill({ id: s.id, name: s.name }),
              }] : []),
              {
                label: 'Rename session…',
                icon: 'sparkle',
                onSelect: () => setRenameSessionPrompt({ id: s.id, current: s.name }),
              },
              {
                label: 'Open terminal here',
                icon: 'terminal',
                onSelect: () => {
                  if (s.workingDirectory) {
                    void handleOpenTerminalHere(s.id, s.workingDirectory, s.name);
                  }
                },
              },
              {
                label: 'Close session',
                icon: 'x',
                variant: 'danger',
                onSelect: () => handleCloseSession(s.id),
              },
            ]}
            onClose={() => setSessionMenu(null)}
          />
        );
      })()}

      {renameSessionPrompt && (
        <PromptDialog
          title="Rename session"
          defaultValue={renameSessionPrompt.current}
          placeholder="Session name"
          confirmLabel="Rename"
          onConfirm={(name) => {
            void renameSession(renameSessionPrompt.id, name);
            setRenameSessionPrompt(null);
          }}
          onCancel={() => setRenameSessionPrompt(null)}
        />
      )}

      {confirmKill && (
        <ConfirmDialog
          isOpen={true}
          title={`Kill "${confirmKill.name}"?`}
          message="The CLI process will be terminated, but the session stays in the rail and keeps its worktree. You can restart it anytime."
          confirmLabel="Kill session"
          cancelLabel="Cancel"
          isDangerous={true}
          onConfirm={() => {
            const id = confirmKill.id;
            setConfirmKill(null);
            void stopSession(id);
          }}
          onCancel={() => setConfirmKill(null)}
        />
      )}

      {nonGitChoice && (
        <NonGitFolderDialog
          name={nonGitChoice.name}
          onInitGit={handleInitGitAndOpen}
          onOpenPlain={handleOpenPlainFolder}
          onCancel={() => setNonGitChoice(null)}
        />
      )}

      <ToastContainer />
    </TerminalHost>
  );
}

export default App;
