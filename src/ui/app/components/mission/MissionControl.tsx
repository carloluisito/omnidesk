/**
 * MissionControl - Unified workspace screen
 *
 * Single screen that adapts based on the current phase (PROMPT → REVIEW → SHIP).
 * Eliminates navigation between screens for the core development workflow.
 */
import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Settings, Plus } from 'lucide-react';
import { Logo } from './Logo';
import { OnboardingFlow } from './OnboardingFlow';

import { PhaseNavigator, Phase, ExistingPR } from './PhaseNavigator';
import { RepoDock, RepoStatus } from './RepoDock';
import { PromptPhase } from './phases/PromptPhase';
import { ReviewPhase, FileChange } from './phases/ReviewPhase';
import { ShipPhase } from './phases/ShipPhase';

import { useTerminalStore } from '../../store/terminalStore';
import { useTerminalUIStore } from '../../store/terminalUIStore';
import { useAppStore } from '../../store/appStore';
import { useTerminal } from '../../hooks/useTerminal';
import { MessageItem } from '../terminal/MessageItem';
import { Composer } from '../terminal/v2/Composer';
import { OverlayManager } from '../terminal/overlays';
import { useAgents } from '../../hooks/useAgents';
import { SettingsDrawer } from './SettingsDrawer';
import { QuotaChip } from '../ui/QuotaChip';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { requestCache, CACHE_KEYS } from '../../lib/request-cache';

interface ClaudeQuotaBucket {
  utilization: number;
  resets_at: string;
}

interface ClaudeUsageQuota {
  five_hour: ClaudeQuotaBucket;
  seven_day: ClaudeQuotaBucket;
  lastUpdated: string;
}

export default function MissionControl() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialPhase = (searchParams.get('phase') as Phase) || 'prompt';

  // Stores
  const terminal = useTerminal();
  const agents = useAgents();
  const ui = useTerminalUIStore();
  const { repos, workspaces, loadData } = useAppStore();

  // Local state
  const [activePhase, setActivePhase] = useState<Phase>(initialPhase);
  const [approvedFiles, setApprovedFiles] = useState<Set<string>>(new Set());
  const [showSettings, setShowSettings] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const [existingPR, setExistingPR] = useState<ExistingPR | null>(null);

  // Quota state
  const [quota, setQuota] = useState<ClaudeUsageQuota | null>(null);
  const hasLoadedQuota = useRef(false);

  const fetchQuota = useCallback(async () => {
    try {
      const result = await api<ClaudeUsageQuota | null>('GET', '/terminal/usage/quota');
      setQuota(result);
    } catch (e) {
      console.error('Failed to fetch quota:', e);
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedQuota.current) {
      hasLoadedQuota.current = true;
      fetchQuota();
      const interval = setInterval(fetchQuota, 5 * 60 * 1000);
      return () => clearInterval(interval);
    }
  }, [fetchQuota]);

  const getRelativeResetTime = useCallback((resetsAt: string): string => {
    const diffMs = new Date(resetsAt).getTime() - Date.now();
    if (diffMs <= 0) return 'now';
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (days > 0) return `in ${days}d ${hours}h`;
    if (hours > 0) return `in ${hours}h ${minutes}m`;
    return `in ${minutes}m`;
  }, []);

  // Destructure terminal state
  const {
    sessions,
    activeSessionId,
    activeSession,
    switchSession,
    closeSession,
    input,
    setInput,
    handleSend,
    handleKeyDown,
    handlePaste,
    handleFileSelect,
    handleRetry,
    handleRegenerate,
    handleToggleMessageBookmark,
    pendingAttachments,
    removePendingAttachment,
    cancelOperation,
    isSending,
    isUploading,
    setMode,
    fileInputRef,
    lastAssistantIndex,
    fetchGitStatus,
  } = terminal;

  // Compute repo dock data from ALL sessions (each session = one repo entry)
  const repoStatuses: RepoStatus[] = useMemo(() => {
    return sessions.map((session) => {
      const repoId = session.repoIds?.[0] || session.repoId || session.id;
      const gitStatus = session.gitStatus;
      const changesCount = gitStatus?.files?.length || 0;

      return {
        id: session.id, // Use session ID for switching
        name: repoId.split('/').pop() || repoId,
        branch: gitStatus?.branch || session.branch || 'main',
        changesCount,
        status:
          session.status === 'running'
            ? 'running'
            : session.status === 'error'
            ? 'error'
            : changesCount > 0
            ? 'modified'
            : 'clean',
        isActive: session.id === activeSessionId,
      };
    });
  }, [sessions, activeSessionId]);

  // Compute file changes for review
  const fileChanges: FileChange[] = useMemo(() => {
    if (!activeSession?.gitStatus?.files) return [];
    return activeSession.gitStatus.files.map((f: any) => ({
      path: f.path || f,
      status: f.status === 'created' ? 'added' : f.status || 'modified',
      insertions: f.insertions || 0,
      deletions: f.deletions || 0,
      approved: approvedFiles.has(f.path || f),
    }));
  }, [activeSession?.gitStatus?.files, approvedFiles]);

  // Badge counts
  const messageCount = activeSession?.messages?.length || 0;
  const fileCount = fileChanges.length;
  const warningCount = fileChanges.filter((f) =>
    ['auth', 'secret', '.env', 'password', 'token'].some((s) =>
      f.path.toLowerCase().includes(s)
    )
  ).length;

  // Phase availability
  const canReview = fileCount > 0;
  const canShip = fileCount > 0 || existingPR !== null;

  // Fetch existing PR status for the active session's branch
  useEffect(() => {
    if (!activeSessionId) {
      setExistingPR(null);
      return;
    }

    let cancelled = false;
    api<{ existingPR: ExistingPR | null }>(
      'GET',
      `/terminal/sessions/${activeSessionId}/ship-summary`
    )
      .then((data) => {
        if (!cancelled) setExistingPR(data.existingPR ?? null);
      })
      .catch(() => {
        if (!cancelled) setExistingPR(null);
      });

    return () => { cancelled = true; };
  }, [activeSessionId, activeSession?.gitStatus]);

  // Auto-advance to review when files change
  useEffect(() => {
    if (
      activePhase === 'prompt' &&
      fileCount > 0 &&
      activeSession?.status === 'idle' &&
      messageCount > 0
    ) {
      // Optionally auto-advance: setActivePhase('review');
    }
  }, [fileCount, activePhase, activeSession?.status, messageCount]);

  // Update URL when phase changes
  useEffect(() => {
    const params = new URLSearchParams(searchParams);
    params.set('phase', activePhase);
    if (activeSessionId) params.set('sessionId', activeSessionId);
    const basePath = window.location.pathname.startsWith('/mission') ? '/mission' : '/';
    navigate(`${basePath}?${params.toString()}`, { replace: true });
  }, [activePhase, activeSessionId, navigate, searchParams]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Command palette
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        ui.openCommandPalette();
      }
      // Ctrl+Shift+T: New session
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'T') {
        e.preventDefault();
        ui.openNewSession();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [ui]);

  // Render message callback
  const renderMessage = useCallback(
    (message: any, index: number) => (
      <MessageItem
        key={message.id}
        message={message}
        isLastAssistantMessage={message.role === 'assistant' && index === lastAssistantIndex}
        toolActivities={activeSession?.toolActivities || []}
        currentActivity={activeSession?.currentActivity}
        onRetry={handleRetry}
        onRegenerate={handleRegenerate}
        onToggleBookmark={handleToggleMessageBookmark}
        isSessionRunning={activeSession?.status === 'running'}
        sessionId={activeSession?.id}
      />
    ),
    [
      lastAssistantIndex,
      activeSession?.toolActivities,
      activeSession?.currentActivity,
      activeSession?.status,
      activeSession?.id,
      handleRetry,
      handleRegenerate,
      handleToggleMessageBookmark,
    ]
  );

  // File approval handlers
  const handleFileApprove = useCallback((path: string) => {
    setApprovedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleApproveAll = useCallback(() => {
    setApprovedFiles(new Set(fileChanges.map((f) => f.path)));
  }, [fileChanges]);

  // Composer component
  const composerElement = (
    <Composer
      value={input}
      onChange={setInput}
      onSend={() => {
        handleSend(undefined, agents.selectedAgent?.id);
        if (agents.selectedAgent) agents.addToRecentAgents(agents.selectedAgent);
        agents.setSelectedAgent(null);
      }}
      onStop={cancelOperation}
      onKeyDown={handleKeyDown}
      onPaste={handlePaste}
      mode={activeSession?.mode || 'direct'}
      onToggleMode={() => setMode(activeSession?.mode === 'plan' ? 'direct' : 'plan')}
      onAttach={() => fileInputRef.current?.click()}
      inputRef={terminal.inputRef}
      disabled={false}
      isSending={isSending}
      isGenerating={activeSession?.status === 'running'}
      isUploading={isUploading}
      queueCount={activeSession?.messageQueue?.length || 0}
      pendingAttachments={pendingAttachments}
      onRemoveAttachment={(id) => removePendingAttachment(activeSessionId!, id)}
      agents={agents.allAgents}
      pinnedAgents={agents.pinnedAgents}
      recentAgents={agents.recentAgents}
      userAgents={agents.userAgents}
      builtinAgents={agents.builtinAgents}
      selectedAgent={agents.selectedAgent}
      onAgentSelect={agents.setSelectedAgent}
      agentSearchQuery={agents.searchQuery}
      onAgentSearchChange={agents.setSearchQuery}
      onBrowseAgents={ui.openAgents}
    />
  );

  // No session state
  if (!activeSession) {
    // No workspaces -> show onboarding flow
    if (workspaces.length === 0) {
      return (
        <OnboardingFlow
          onComplete={() => {
            loadData({ forceRefresh: true });
          }}
        />
      );
    }

    // Has workspaces but no session -> show branded empty state
    return (
      <div className="h-screen flex flex-col bg-[#05070c] text-white overflow-hidden">
        {/* Background texture — same as active state */}
        <div className="pointer-events-none fixed inset-0 z-0">
          <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />
          <div className="absolute -top-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full bg-blue-500/5 blur-3xl" />
        </div>

        {/* Header — matches active state structure */}
        <header className="relative z-10 flex items-center px-4 py-3 border-b border-white/10">
          <div className="flex items-center">
            <Logo size="lg" />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setShowSettings(true)}
              className="p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
            >
              <Settings className="h-5 w-5" />
            </button>
          </div>
        </header>

        {/* Center content — branded empty state */}
        <main className="relative z-10 flex-1 flex items-center justify-center px-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-center max-w-lg"
          >
            {/* Glass card */}
            <div className="rounded-3xl bg-white/[0.03] ring-1 ring-white/[0.08] p-10">
              {/* Logo as hero */}
              <div className="flex justify-center mb-6">
                <Logo size="lg" showText={false} />
              </div>

              <h1 className="text-2xl font-semibold text-white mb-3">
                Start a session
              </h1>
              <p className="text-sm text-white/50 leading-relaxed mb-8 max-w-sm mx-auto">
                Create a session to begin prompting, reviewing, and shipping code with Claude.
              </p>

              <button
                onClick={() => ui.openNewSession()}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
              >
                <Plus className="h-4 w-4" />
                Create Session
              </button>

              {/* Keyboard hint */}
              <p className="mt-4 text-xs text-white/25">
                or press{' '}
                <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-white/40 font-mono text-[11px]">
                  Ctrl+Shift+T
                </kbd>
              </p>
            </div>
          </motion.div>
        </main>

        {/* Overlay Manager for new session modal */}
        <OverlayManager
          newSessionProps={{
            onCreateSession: terminal.handleCreateSession,
            workspaces: terminal.workspaces,
            repos: terminal.repos,
            isLoadingAppData: terminal.isLoadingAppData,
            selectedWorkspaceId: terminal.selectedWorkspaceId,
            onWorkspaceChange: terminal.setSelectedWorkspaceId,
            selectedRepoIds: terminal.selectedRepoIds,
            onToggleRepoSelection: terminal.toggleRepoSelection,
            repoSearch: terminal.repoSearch,
            onRepoSearchChange: terminal.setRepoSearch,
            highlightedRepoIndex: terminal.highlightedRepoIndex,
            onHighlightedRepoIndexChange: terminal.setHighlightedRepoIndex,
            filteredRepos: terminal.filteredRepos,
            reposByWorkspace: terminal.reposByWorkspace,
            showCreateRepoForm: terminal.showCreateRepoForm,
            onShowCreateRepoForm: terminal.setShowCreateRepoForm,
            newRepoName: terminal.newRepoName,
            onNewRepoNameChange: terminal.setNewRepoName,
            createRepoWorkspaceId: terminal.createRepoWorkspaceId,
            onCreateRepoWorkspaceIdChange: terminal.setCreateRepoWorkspaceId,
            isCreatingRepo: terminal.isCreatingRepo,
            createRepoError: terminal.createRepoError,
            onCreateRepoInline: terminal.handleCreateRepoInline,
            worktreeMode: terminal.worktreeMode,
            onWorktreeModeChange: terminal.setWorktreeMode,
            worktreeAction: terminal.worktreeAction,
            onWorktreeActionChange: terminal.setWorktreeAction,
            worktreeBranch: terminal.worktreeBranch,
            onWorktreeBranchChange: terminal.setWorktreeBranch,
            worktreeBaseBranch: terminal.worktreeBaseBranch,
            onWorktreeBaseBranchChange: terminal.setWorktreeBaseBranch,
            availableBranches: terminal.availableBranches,
            loadingBranches: terminal.loadingBranches,
            mainBranch: terminal.mainBranch,
            existingWorktrees: terminal.existingWorktrees,
            selectedWorktreePath: terminal.selectedWorktreePath,
            onSelectedWorktreePathChange: terminal.setSelectedWorktreePath,
            loadingWorktrees: terminal.loadingWorktrees,
          }}
          sessions={[]}
          currentSessionId={null}
          messages={[]}
          sessionName=""
        />

        {/* Settings Drawer */}
        <SettingsDrawer isOpen={showSettings} onClose={() => setShowSettings(false)} />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[#05070c] text-white overflow-hidden">
      {/* Background texture */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-b from-white/[0.02] via-transparent to-transparent" />
        <div
          className={cn(
            'absolute -top-32 left-1/2 h-64 w-[600px] -translate-x-1/2 rounded-full blur-3xl transition-colors duration-500',
            activePhase === 'prompt' && 'bg-blue-500/5',
            activePhase === 'review' && 'bg-amber-500/5',
            activePhase === 'ship' && 'bg-emerald-500/5'
          )}
        />
      </div>

      {/* Header */}
      <header className="relative z-10 flex items-center px-4 py-3 border-b border-white/10">
        {/* Left - Logo */}
        <div className="flex items-center">
          <Logo size="lg" />
        </div>

        {/* Center - Phase Navigator (absolute to stay truly centered) */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <PhaseNavigator
            activePhase={activePhase}
            onPhaseChange={setActivePhase}
            messageCount={messageCount}
            fileCount={fileCount}
            warningCount={warningCount}
            isRunning={activeSession.status === 'running'}
            canReview={canReview}
            canShip={canShip}
            existingPR={existingPR}
          />
        </div>

        {/* Right actions */}
        <div className="ml-auto flex items-center gap-2">
          {/* Quota chips - hidden on mobile */}
          <div className="hidden sm:flex items-center gap-2">
            <QuotaChip
              label="5-hour"
              pct={quota ? Math.round(quota.five_hour.utilization * 100) : undefined}
              resetTime={quota ? getRelativeResetTime(quota.five_hour.resets_at) : undefined}
              onClick={() => ui.openOverlay('usage-dashboard')}
              isHourly={true}
            />
            <QuotaChip
              label="Weekly"
              pct={quota ? Math.round(quota.seven_day.utilization * 100) : undefined}
              resetTime={quota ? getRelativeResetTime(quota.seven_day.resets_at) : undefined}
              onClick={() => ui.openOverlay('usage-dashboard')}
              isHourly={false}
            />
          </div>
          <button
            onClick={() => setShowSettings(true)}
            className="p-2 rounded-lg text-white/50 hover:text-white/80 hover:bg-white/5 transition-colors"
          >
            <Settings className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* Main content area */}
      <main className="relative z-10 flex-1 flex flex-col min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          {activePhase === 'prompt' && (
            <motion.div
              key="prompt"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <PromptPhase
                messages={activeSession.messages || []}
                toolActivities={activeSession.toolActivities || []}
                currentActivity={activeSession.currentActivity}
                isRunning={activeSession.status === 'running'}
                isEmpty={(activeSession.messages?.length || 0) === 0}
                renderMessage={renderMessage}
                messagesEndRef={messagesEndRef}
                composer={composerElement}
              />
            </motion.div>
          )}

          {activePhase === 'review' && (
            <motion.div
              key="review"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <ReviewPhase
                sessionId={activeSessionId!}
                repoId={activeSession.repoIds?.[0]}
                files={fileChanges}
                onFileApprove={handleFileApprove}
                onApproveAll={handleApproveAll}
                onNavigateToShip={() => setActivePhase('ship')}
              />
            </motion.div>
          )}

          {activePhase === 'ship' && (
            <motion.div
              key="ship"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
              className="flex-1 flex flex-col min-h-0"
            >
              <ShipPhase
                sessionId={activeSessionId!}
                repoId={activeSession.repoIds?.[0]}
                isMultiRepo={activeSession.isMultiRepo}
                onSuccess={() => {
                  setApprovedFiles(new Set());
                  // Invalidate cached git status and re-fetch so Review/Ship
                  // reflect post-commit state (no pending changes)
                  requestCache.invalidate(CACHE_KEYS.GIT_STATUS(activeSessionId!));
                  fetchGitStatus(activeSessionId!);
                  setActivePhase('prompt');
                }}
                onGoBack={() => setActivePhase('prompt')}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Repo Dock */}
      <RepoDock
        repos={repoStatuses}
        onRepoClick={(sessionId) => {
          // Switch to the clicked session
          switchSession(sessionId);
        }}
        onRepoRemove={async (sessionId) => {
          // Close the session (may take time if deleting worktree)
          await closeSession(sessionId);
        }}
      />

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileSelect}
      />

      {/* Overlay Manager for modals (agents, new session, etc.) */}
      <OverlayManager
        newSessionProps={{
          onCreateSession: terminal.handleCreateSession,
          workspaces: terminal.workspaces,
          repos: terminal.repos,
          isLoadingAppData: terminal.isLoadingAppData,
          selectedWorkspaceId: terminal.selectedWorkspaceId,
          onWorkspaceChange: terminal.setSelectedWorkspaceId,
          selectedRepoIds: terminal.selectedRepoIds,
          onToggleRepoSelection: terminal.toggleRepoSelection,
          repoSearch: terminal.repoSearch,
          onRepoSearchChange: terminal.setRepoSearch,
          highlightedRepoIndex: terminal.highlightedRepoIndex,
          onHighlightedRepoIndexChange: terminal.setHighlightedRepoIndex,
          filteredRepos: terminal.filteredRepos,
          reposByWorkspace: terminal.reposByWorkspace,
          showCreateRepoForm: terminal.showCreateRepoForm,
          onShowCreateRepoForm: terminal.setShowCreateRepoForm,
          newRepoName: terminal.newRepoName,
          onNewRepoNameChange: terminal.setNewRepoName,
          createRepoWorkspaceId: terminal.createRepoWorkspaceId,
          onCreateRepoWorkspaceIdChange: terminal.setCreateRepoWorkspaceId,
          isCreatingRepo: terminal.isCreatingRepo,
          createRepoError: terminal.createRepoError,
          onCreateRepoInline: terminal.handleCreateRepoInline,
          worktreeMode: terminal.worktreeMode,
          onWorktreeModeChange: terminal.setWorktreeMode,
          worktreeAction: terminal.worktreeAction,
          onWorktreeActionChange: terminal.setWorktreeAction,
          worktreeBranch: terminal.worktreeBranch,
          onWorktreeBranchChange: terminal.setWorktreeBranch,
          worktreeBaseBranch: terminal.worktreeBaseBranch,
          onWorktreeBaseBranchChange: terminal.setWorktreeBaseBranch,
          availableBranches: terminal.availableBranches,
          loadingBranches: terminal.loadingBranches,
          mainBranch: terminal.mainBranch,
          existingWorktrees: terminal.existingWorktrees,
          selectedWorktreePath: terminal.selectedWorktreePath,
          onSelectedWorktreePathChange: terminal.setSelectedWorktreePath,
          loadingWorktrees: terminal.loadingWorktrees,
        }}
        sessions={sessions}
        currentSessionId={activeSessionId}
        messages={activeSession?.messages || []}
        sessionName={activeSession?.name || ''}
        quota={quota}
        onRefreshQuota={fetchQuota}
        onSelectAgent={(agent: any) => {
          agents.setSelectedAgent(agent);
        }}
        activeRepoId={activeSession?.repoIds?.[0]}
      />

      {/* Settings Drawer */}
      <SettingsDrawer isOpen={showSettings} onClose={() => setShowSettings(false)} />
    </div>
  );
}
