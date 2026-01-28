/**
 * NewSessionModal.tsx - Redesigned two-step session creation
 *
 * Step 1: Pick a repo (single click selects + advances)
 * Step 2: Branch config (worktree always on, auto-generated name, one-click launch)
 */

import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search,
  Folder,
  Check,
  Loader2,
  Plus,
  X,
  GitBranch,
  GitFork,
  ArrowLeft,
  Rocket,
  Sparkles,
} from 'lucide-react';
import { cn } from '@/lib/cn';

interface Workspace {
  id: string;
  name: string;
  rootPath: string;
}

interface Repo {
  id: string;
  path: string;
  workspaceId?: string;
  hasGit?: boolean;
}

interface NewSessionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCreateSession: () => Promise<void>;

  // Workspaces and repos
  workspaces: Workspace[];
  repos: Repo[];
  isLoadingAppData: boolean;

  // Workspace selection
  selectedWorkspaceId: string;
  onWorkspaceChange: (workspaceId: string) => void;

  // Repo selection
  selectedRepoIds: string[];
  onToggleRepoSelection: (repoId: string) => void;
  repoSearch: string;
  onRepoSearchChange: (search: string) => void;
  highlightedRepoIndex: number;
  onHighlightedRepoIndexChange: (index: number) => void;
  filteredRepos: Repo[];
  reposByWorkspace: Record<string, Repo[]>;

  // Inline repo creation
  showCreateRepoForm: boolean;
  onShowCreateRepoForm: (show: boolean) => void;
  newRepoName: string;
  onNewRepoNameChange: (name: string) => void;
  createRepoWorkspaceId: string;
  onCreateRepoWorkspaceIdChange: (workspaceId: string) => void;
  isCreatingRepo: boolean;
  createRepoError: string | null;
  onCreateRepoInline: () => Promise<void>;

  // Worktree options
  worktreeMode: boolean;
  onWorktreeModeChange: (enabled: boolean) => void;
  worktreeAction: 'create' | 'existing';
  onWorktreeActionChange: (action: 'create' | 'existing') => void;
  worktreeBranch: string;
  onWorktreeBranchChange: (branch: string) => void;
  worktreeBaseBranch: string;
  onWorktreeBaseBranchChange: (branch: string) => void;
  availableBranches: string[];
  loadingBranches: boolean;
  mainBranch: string;
  existingWorktrees: Array<{ path: string; branch: string; isMain?: boolean }>;
  selectedWorktreePath: string;
  onSelectedWorktreePathChange: (path: string) => void;
  loadingWorktrees: boolean;
}

type Step = 'repo' | 'branch';

function generateBranchName(): string {
  const now = new Date();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hour = String(now.getHours()).padStart(2, '0');
  const min = String(now.getMinutes()).padStart(2, '0');
  return `session/${month}${day}-${hour}${min}`;
}

export function NewSessionModal({
  isOpen,
  onClose,
  onCreateSession,
  workspaces,
  repos,
  isLoadingAppData,
  selectedWorkspaceId,
  onWorkspaceChange,
  selectedRepoIds,
  onToggleRepoSelection,
  repoSearch,
  onRepoSearchChange,
  highlightedRepoIndex,
  onHighlightedRepoIndexChange,
  filteredRepos,
  reposByWorkspace,
  showCreateRepoForm,
  onShowCreateRepoForm,
  newRepoName,
  onNewRepoNameChange,
  createRepoWorkspaceId,
  onCreateRepoWorkspaceIdChange,
  isCreatingRepo,
  createRepoError,
  onCreateRepoInline,
  worktreeMode,
  onWorktreeModeChange,
  worktreeAction,
  onWorktreeActionChange,
  worktreeBranch,
  onWorktreeBranchChange,
  worktreeBaseBranch,
  onWorktreeBaseBranchChange,
  availableBranches,
  loadingBranches,
  mainBranch,
  existingWorktrees,
  selectedWorktreePath,
  onSelectedWorktreePathChange,
  loadingWorktrees,
}: NewSessionModalProps) {
  const [step, setStep] = useState<Step>('repo');
  const [isCreating, setIsCreating] = useState(false);

  // Reset step when modal opens
  useEffect(() => {
    if (isOpen) {
      setStep('repo');
      setIsCreating(false);
    }
  }, [isOpen]);

  // Auto-generate branch name when entering branch step
  useEffect(() => {
    if (step === 'branch' && !worktreeBranch) {
      onWorktreeBranchChange(generateBranchName());
    }
  }, [step]);

  // Enable worktree mode when entering branch step
  useEffect(() => {
    if (step === 'branch' && !worktreeMode) {
      onWorktreeModeChange(true);
    }
  }, [step]);

  // Search filtered repos
  const searchedRepos = useMemo(() => {
    return filteredRepos.filter((r) => {
      if (!repoSearch) return true;
      const lower = repoSearch.toLowerCase();
      return r.id.toLowerCase().includes(lower) || r.path.toLowerCase().includes(lower);
    });
  }, [filteredRepos, repoSearch]);

  // Handle repo click -> select + advance to branch step
  const handleRepoSelect = (repoId: string) => {
    // Clear previous selections and select this one
    selectedRepoIds.forEach((id) => {
      if (id !== repoId) onToggleRepoSelection(id);
    });
    if (!selectedRepoIds.includes(repoId)) {
      onToggleRepoSelection(repoId);
    }
    setStep('branch');
  };

  // Handle launch
  const handleLaunch = async () => {
    setIsCreating(true);
    try {
      await onCreateSession();
      onClose();
    } catch {
      setIsCreating(false);
    }
  };

  // Handle quick launch (skip branch config, no worktree)
  const handleQuickLaunch = async (repoId: string) => {
    // Select repo
    selectedRepoIds.forEach((id) => {
      if (id !== repoId) onToggleRepoSelection(id);
    });
    if (!selectedRepoIds.includes(repoId)) {
      onToggleRepoSelection(repoId);
    }
    // Disable worktree for quick launch
    onWorktreeModeChange(false);
    setIsCreating(true);
    // Small delay to let state propagate
    await new Promise((r) => setTimeout(r, 50));
    try {
      await onCreateSession();
      onClose();
    } catch {
      setIsCreating(false);
    }
  };

  const selectedRepo = repos.find((r) => selectedRepoIds.includes(r.id));

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.97, y: 8 }}
        transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
        className="w-full max-w-lg mx-4 rounded-2xl border border-white/[0.08] bg-[#0a0e14] overflow-hidden shadow-2xl shadow-black/50"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative px-5 pt-5 pb-4">
          <div className="flex items-center gap-3">
            {step === 'branch' && (
              <button
                onClick={() => setStep('repo')}
                className="p-1.5 -ml-1.5 rounded-lg text-white/40 hover:text-white/80 hover:bg-white/5 transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
              </button>
            )}
            <div className="flex-1">
              <h2 className="text-[15px] font-semibold text-white tracking-[-0.01em]">
                {step === 'repo' ? 'Select Repository' : 'Configure Branch'}
              </h2>
              <p className="text-xs text-white/35 mt-0.5">
                {step === 'repo'
                  ? 'Choose a project to work on'
                  : `Working on ${selectedRepo?.id || 'repository'}`}
              </p>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex gap-1.5 mt-4">
            <div className={cn(
              'h-[3px] flex-1 rounded-full transition-colors duration-300',
              step === 'repo' ? 'bg-white/60' : 'bg-white/15'
            )} />
            <div className={cn(
              'h-[3px] flex-1 rounded-full transition-colors duration-300',
              step === 'branch' ? 'bg-white/60' : 'bg-white/10'
            )} />
          </div>
        </div>

        {/* Content */}
        <AnimatePresence mode="wait">
          {step === 'repo' && (
            <motion.div
              key="repo"
              initial={{ opacity: 0, x: -16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.15 }}
            >
              {/* Workspace filter + Search */}
              <div className="px-5 pb-3 space-y-2.5">
                {workspaces.length > 1 && (
                  <select
                    value={selectedWorkspaceId}
                    onChange={(e) => {
                      onWorkspaceChange(e.target.value);
                      selectedRepoIds.forEach((id) => onToggleRepoSelection(id));
                    }}
                    className="w-full rounded-xl bg-white/[0.04] px-3 py-2 text-[13px] text-white/70 ring-1 ring-white/[0.06] focus:outline-none focus:ring-white/15 appearance-none cursor-pointer"
                  >
                    <option value="" className="bg-[#0a0e14]">All Workspaces</option>
                    {workspaces.map((ws) => (
                      <option key={ws.id} value={ws.id} className="bg-[#0a0e14]">
                        {ws.name}
                      </option>
                    ))}
                  </select>
                )}
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-white/25" />
                  <input
                    type="text"
                    value={repoSearch}
                    onChange={(e) => {
                      onRepoSearchChange(e.target.value);
                      onHighlightedRepoIndexChange(0);
                    }}
                    placeholder="Search repositories..."
                    className="w-full rounded-xl bg-white/[0.04] pl-9 pr-3 py-2.5 text-[13px] text-white placeholder-white/25 ring-1 ring-white/[0.06] focus:outline-none focus:ring-white/15"
                    autoFocus
                  />
                </div>
              </div>

              {/* Repo list */}
              <div className="max-h-[340px] overflow-y-auto px-3 pb-3">
                {isLoadingAppData ? (
                  <div className="flex items-center justify-center py-12">
                    <Loader2 className="h-5 w-5 animate-spin text-white/30" />
                  </div>
                ) : searchedRepos.length > 0 ? (
                  <div className="space-y-0.5">
                    {/* Grouped by workspace when "All" selected */}
                    {!selectedWorkspaceId ? (
                      Object.entries(reposByWorkspace).map(([wsId, wsRepos]) => {
                        const workspace = workspaces.find((w) => w.id === wsId);
                        const reposToShow = wsRepos.filter(
                          (r) =>
                            !repoSearch ||
                            r.id.toLowerCase().includes(repoSearch.toLowerCase()) ||
                            r.path.toLowerCase().includes(repoSearch.toLowerCase())
                        );
                        if (reposToShow.length === 0) return null;
                        return (
                          <div key={wsId}>
                            {workspaces.length > 1 && (
                              <p className="text-[10px] font-medium text-white/25 uppercase tracking-wider px-3 pt-3 pb-1">
                                {workspace?.name || 'Unknown'}
                              </p>
                            )}
                            {reposToShow.map((repo) => (
                              <RepoRow
                                key={repo.id}
                                repo={repo}
                                onSelect={() => handleRepoSelect(repo.id)}
                                onQuickLaunch={() => handleQuickLaunch(repo.id)}
                                isCreating={isCreating}
                              />
                            ))}
                          </div>
                        );
                      })
                    ) : (
                      searchedRepos.map((repo) => (
                        <RepoRow
                          key={repo.id}
                          repo={repo}
                          onSelect={() => handleRepoSelect(repo.id)}
                          onQuickLaunch={() => handleQuickLaunch(repo.id)}
                          isCreating={isCreating}
                        />
                      ))
                    )}
                  </div>
                ) : (
                  <div className="text-center py-12">
                    <Folder className="h-7 w-7 mx-auto mb-2 text-white/15" />
                    <p className="text-[13px] text-white/40">No repositories found</p>
                    <p className="text-[11px] text-white/20 mt-1">
                      {workspaces.length === 0
                        ? 'Add a workspace in Settings first'
                        : repoSearch
                        ? 'Try a different search'
                        : 'No repos in this workspace'}
                    </p>
                  </div>
                )}

                {/* Create new repository */}
                {workspaces.length > 0 && (
                  <div className="mt-1">
                    {!showCreateRepoForm ? (
                      <button
                        onClick={() => onShowCreateRepoForm(true)}
                        className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-left text-white/30 hover:bg-white/[0.03] hover:text-white/50 transition"
                      >
                        <Plus className="h-3.5 w-3.5" />
                        <span className="text-[13px]">Create new repository</span>
                      </button>
                    ) : (
                      <div className="rounded-xl p-3.5 ring-1 ring-white/[0.08] bg-white/[0.02] space-y-2.5 mt-1">
                        <input
                          type="text"
                          value={newRepoName}
                          onChange={(e) => onNewRepoNameChange(e.target.value)}
                          placeholder="Repository name"
                          className="w-full rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] text-white placeholder-white/25 ring-1 ring-white/[0.06] focus:outline-none focus:ring-white/15"
                          autoFocus
                        />
                        {!selectedWorkspaceId && (
                          <select
                            value={createRepoWorkspaceId}
                            onChange={(e) => onCreateRepoWorkspaceIdChange(e.target.value)}
                            className="w-full rounded-lg bg-white/[0.04] px-3 py-2 text-[13px] text-white ring-1 ring-white/[0.06] focus:outline-none focus:ring-white/15"
                          >
                            {workspaces.map((ws) => (
                              <option key={ws.id} value={ws.id} className="bg-[#0a0e14]">
                                {ws.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {createRepoError && (
                          <p className="text-[11px] text-red-400">{createRepoError}</p>
                        )}
                        <div className="flex gap-2">
                          <button
                            onClick={() => { onShowCreateRepoForm(false); onNewRepoNameChange(''); }}
                            className="flex-1 px-3 py-1.5 rounded-lg text-[13px] text-white/50 hover:bg-white/5 transition"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={onCreateRepoInline}
                            disabled={isCreatingRepo || !newRepoName.trim()}
                            className="flex-1 px-3 py-1.5 rounded-lg text-[13px] bg-white/10 text-white font-medium hover:bg-white/15 disabled:opacity-40 transition flex items-center justify-center gap-1.5"
                          >
                            {isCreatingRepo && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                            Create
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {step === 'branch' && (
            <motion.div
              key="branch"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 16 }}
              transition={{ duration: 0.15 }}
              className="px-5 pb-5"
            >
              {/* Selected repo summary */}
              {selectedRepo && (
                <div className="flex items-center gap-3 rounded-xl bg-white/[0.03] px-3.5 py-3 ring-1 ring-white/[0.06] mb-4">
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-500/10">
                    <Folder className="h-4 w-4 text-blue-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">{selectedRepo.id}</p>
                    <p className="text-[11px] text-white/30 truncate">{selectedRepo.path}</p>
                  </div>
                </div>
              )}

              {/* Worktree toggle */}
              <div className="mb-4">
                <button
                  onClick={() => {
                    if (selectedRepo?.hasGit !== false) {
                      onWorktreeModeChange(!worktreeMode);
                    }
                  }}
                  disabled={selectedRepo?.hasGit === false}
                  className={cn(
                    'w-full flex items-center gap-3 rounded-xl px-3.5 py-3 ring-1 transition',
                    selectedRepo?.hasGit === false
                      ? 'bg-white/[0.01] ring-white/[0.04] cursor-not-allowed opacity-50'
                      : worktreeMode
                        ? 'bg-blue-500/[0.07] ring-blue-500/20'
                        : 'bg-white/[0.02] ring-white/[0.06] hover:bg-white/[0.04]'
                  )}
                >
                  <div className={cn(
                    'flex h-8 w-8 items-center justify-center rounded-lg transition',
                    worktreeMode && selectedRepo?.hasGit !== false ? 'bg-blue-500/15' : 'bg-white/5'
                  )}>
                    <GitFork className={cn('h-4 w-4', worktreeMode && selectedRepo?.hasGit !== false ? 'text-blue-400' : 'text-white/40')} />
                  </div>
                  <div className="flex-1 text-left">
                    <p className={cn('text-[13px] font-medium', worktreeMode && selectedRepo?.hasGit !== false ? 'text-white' : 'text-white/60')}>
                      Use worktree
                    </p>
                    <p className="text-[11px] text-white/30">
                      {selectedRepo?.hasGit === false
                        ? 'Requires a git repository'
                        : 'Isolated branch for safe experimentation'}
                    </p>
                  </div>
                  <div className={cn(
                    'h-5 w-9 rounded-full p-0.5 transition-colors',
                    worktreeMode && selectedRepo?.hasGit !== false ? 'bg-blue-500' : 'bg-white/10'
                  )}>
                    <div className={cn(
                      'h-4 w-4 rounded-full bg-white transition-transform shadow-sm',
                      worktreeMode && selectedRepo?.hasGit !== false ? 'translate-x-4' : 'translate-x-0'
                    )} />
                  </div>
                </button>
              </div>

              {/* Branch config (when worktree enabled) */}
              <AnimatePresence>
                {worktreeMode && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="overflow-hidden"
                  >
                    {/* Action tabs */}
                    <div className="flex gap-1 p-1 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] mb-3">
                      <button
                        onClick={() => onWorktreeActionChange('create')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition',
                          worktreeAction === 'create'
                            ? 'bg-white/10 text-white shadow-sm'
                            : 'text-white/40 hover:text-white/60'
                        )}
                      >
                        <Sparkles className="h-3 w-3" />
                        New branch
                      </button>
                      <button
                        onClick={() => onWorktreeActionChange('existing')}
                        className={cn(
                          'flex-1 flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-medium transition',
                          worktreeAction === 'existing'
                            ? 'bg-white/10 text-white shadow-sm'
                            : 'text-white/40 hover:text-white/60'
                        )}
                      >
                        <GitBranch className="h-3 w-3" />
                        Existing
                      </button>
                    </div>

                    {worktreeAction === 'create' && (
                      <div className="space-y-2.5">
                        <div>
                          <label className="block text-[11px] text-white/35 mb-1 px-0.5">Branch name</label>
                          <input
                            type="text"
                            value={worktreeBranch}
                            onChange={(e) => onWorktreeBranchChange(e.target.value)}
                            placeholder="e.g., feature/my-feature"
                            className="w-full rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px] text-white placeholder-white/20 ring-1 ring-white/[0.06] focus:outline-none focus:ring-white/15 font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-white/35 mb-1 px-0.5">Base branch</label>
                          {loadingBranches ? (
                            <div className="flex items-center gap-2 px-3 py-2.5 text-[13px] text-white/30">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Loading branches...
                            </div>
                          ) : (
                            <select
                              value={worktreeBaseBranch}
                              onChange={(e) => onWorktreeBaseBranchChange(e.target.value)}
                              className="w-full rounded-xl bg-white/[0.04] px-3 py-2.5 text-[13px] text-white ring-1 ring-white/[0.06] focus:outline-none focus:ring-white/15 appearance-none cursor-pointer"
                            >
                              <option value="" className="bg-[#0a0e14]">Select base branch...</option>
                              {availableBranches.map((branch) => (
                                <option key={branch} value={branch} className="bg-[#0a0e14]">
                                  {branch}{branch === mainBranch ? ' (default)' : ''}
                                </option>
                              ))}
                            </select>
                          )}
                        </div>
                      </div>
                    )}

                    {worktreeAction === 'existing' && (
                      <>
                        {loadingWorktrees ? (
                          <div className="flex items-center gap-2 px-3 py-3 text-[13px] text-white/30">
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            Loading worktrees...
                          </div>
                        ) : existingWorktrees.length > 0 ? (
                          <div className="space-y-1">
                            {existingWorktrees.map((wt) => (
                              <button
                                key={wt.path}
                                onClick={() => onSelectedWorktreePathChange(wt.path)}
                                className={cn(
                                  'w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left ring-1 transition',
                                  selectedWorktreePath === wt.path
                                    ? 'bg-blue-500/[0.07] ring-blue-500/20'
                                    : 'ring-white/[0.04] hover:bg-white/[0.03]'
                                )}
                              >
                                <GitBranch className={cn(
                                  'h-3.5 w-3.5',
                                  selectedWorktreePath === wt.path ? 'text-blue-400' : 'text-white/30'
                                )} />
                                <div className="flex-1 min-w-0">
                                  <p className="text-[13px] text-white/80 truncate">{wt.branch}</p>
                                  <p className="text-[11px] text-white/25 truncate">
                                    {wt.path.split(/[/\\]/).slice(-2).join('/')}
                                  </p>
                                </div>
                                {selectedWorktreePath === wt.path && (
                                  <Check className="h-3.5 w-3.5 text-blue-400" />
                                )}
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-xl bg-amber-500/[0.06] ring-1 ring-amber-500/15 px-3.5 py-3">
                            <p className="text-[12px] text-amber-300/70">
                              No existing worktrees. Switch to "New branch" to create one.
                            </p>
                          </div>
                        )}
                      </>
                    )}

                    {selectedRepoIds.length > 1 && (
                      <div className="mt-3 rounded-xl bg-blue-500/[0.06] ring-1 ring-blue-500/15 px-3.5 py-3">
                        <p className="text-[11px] text-blue-300/70">
                          <strong>Multi-repo:</strong> Worktree applies to the primary repo. Others use their current branch.
                        </p>
                      </div>
                    )}

                    {/* Spacer before button */}
                    <div className="h-4" />
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Launch button */}
              <button
                onClick={handleLaunch}
                disabled={
                  isCreating ||
                  selectedRepoIds.length === 0 ||
                  (worktreeMode && worktreeAction === 'create' && !worktreeBranch) ||
                  (worktreeMode && worktreeAction === 'existing' && !selectedWorktreePath)
                }
                className={cn(
                  'w-full flex items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-semibold transition',
                  isCreating
                    ? 'bg-white/10 text-white/50'
                    : 'bg-white text-black hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed'
                )}
              >
                {isCreating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <Rocket className="h-4 w-4" />
                    Launch Session
                  </>
                )}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}

/** Single repo row with click-to-select and quick-launch shortcut */
function RepoRow({
  repo,
  onSelect,
  onQuickLaunch,
  isCreating,
}: {
  repo: Repo;
  onSelect: () => void;
  onQuickLaunch: () => void;
  isCreating: boolean;
}) {
  const repoName = repo.id.split('/').pop() || repo.id;
  const pathParts = repo.path.replace(/\\/g, '/').split('/');
  const shortPath = pathParts.slice(-3).join('/');

  return (
    <div className="group relative">
      <button
        onClick={onSelect}
        disabled={isCreating}
        className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-white/[0.04] transition disabled:opacity-50"
      >
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/[0.04] ring-1 ring-white/[0.06] group-hover:bg-white/[0.06] transition">
          <Folder className="h-3.5 w-3.5 text-white/40 group-hover:text-white/60 transition" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium text-white/80 group-hover:text-white truncate transition">
            {repoName}
          </p>
          <p className="text-[11px] text-white/25 truncate">{shortPath}</p>
        </div>
        {/* Quick launch button */}
        <div
          role="button"
          onClick={(e) => {
            e.stopPropagation();
            onQuickLaunch();
          }}
          className="opacity-0 group-hover:opacity-100 flex items-center gap-1 rounded-lg bg-white/[0.06] px-2 py-1 text-[11px] text-white/40 hover:bg-white/10 hover:text-white/70 transition-all cursor-pointer"
        >
          <Rocket className="h-3 w-3" />
          Quick
        </div>
      </button>
    </div>
  );
}
