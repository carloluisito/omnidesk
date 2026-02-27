import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  GitStatus,
  GitBranchInfo,
  GitCommitInfo,
  GitDiffResult,
  GeneratedCommitMessage,
  GitCommitRequest,
  GitWorktreeEntry,
  WorktreeCreateRequest,
  WorktreeRemoveRequest,
} from '../../shared/types/git-types';
import { showToast } from '../utils/toast';

export function useGit(projectPath: string | null) {
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [branches, setBranches] = useState<GitBranchInfo[]>([]);
  const [log, setLog] = useState<GitCommitInfo[]>([]);
  const [selectedDiff, setSelectedDiff] = useState<GitDiffResult | null>(null);
  const [generatedMessage, setGeneratedMessage] = useState<GeneratedCommitMessage | null>(null);
  const [worktrees, setWorktrees] = useState<GitWorktreeEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lastPath = useRef<string | null>(null);

  // Subscribe to status change events — filter by projectPath
  const projectPathRef = useRef(projectPath);
  projectPathRef.current = projectPath;

  useEffect(() => {
    const unsub = window.electronAPI.onGitStatusChanged((newStatus) => {
      const cur = projectPathRef.current;
      if (!cur) return;
      // Only accept events for our directory (normalize slashes for Windows)
      const normalize = (p: string) => p.replace(/\\/g, '/').toLowerCase();
      if (newStatus.workDir && normalize(newStatus.workDir) !== normalize(cur)) return;
      setStatus(newStatus);
    });
    return unsub;
  }, []);

  // Subscribe to worktree events
  useEffect(() => {
    const unsubCreated = window.electronAPI.onWorktreeCreated(() => {
      if (projectPath) loadWorktrees();
    });
    const unsubRemoved = window.electronAPI.onWorktreeRemoved(() => {
      if (projectPath) loadWorktrees();
    });
    return () => { unsubCreated(); unsubRemoved(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  // Load status when project path changes
  useEffect(() => {
    if (projectPath && projectPath !== lastPath.current) {
      lastPath.current = projectPath;
      refreshStatus();
    }
    if (!projectPath) {
      setStatus(null);
      setBranches([]);
      setLog([]);
      setSelectedDiff(null);
      setGeneratedMessage(null);
      lastPath.current = null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectPath]);

  const refreshStatus = useCallback(async () => {
    if (!projectPath) return;
    setIsLoading(true);
    setError(null);
    try {
      const s = await window.electronAPI.getGitStatus(projectPath);
      setStatus(s);
    } catch (err) {
      console.error('Failed to get git status:', err);
      setError('Failed to get git status');
    } finally {
      setIsLoading(false);
    }
  }, [projectPath]);

  const loadBranches = useCallback(async () => {
    if (!projectPath) return;
    try {
      const b = await window.electronAPI.getGitBranches(projectPath);
      setBranches(b);
    } catch (err) {
      console.error('Failed to load branches:', err);
    }
  }, [projectPath]);

  const loadHistory = useCallback(async (count?: number) => {
    if (!projectPath) return;
    try {
      const h = await window.electronAPI.gitLog(projectPath, count);
      setLog(h);
    } catch (err) {
      console.error('Failed to load history:', err);
    }
  }, [projectPath]);

  const stageFiles = useCallback(async (files: string[]) => {
    if (!projectPath) return;
    setOperationInProgress('staging');
    try {
      const result = await window.electronAPI.gitStageFiles(projectPath, files);
      if (!result.success) {
        showToast(result.message, 'error');
      }
      await refreshStatus();
    } catch (err) {
      showToast('Failed to stage files', 'error');
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus]);

  const unstageFiles = useCallback(async (files: string[]) => {
    if (!projectPath) return;
    setOperationInProgress('unstaging');
    try {
      const result = await window.electronAPI.gitUnstageFiles(projectPath, files);
      if (!result.success) {
        showToast(result.message, 'error');
      }
      await refreshStatus();
    } catch (err) {
      showToast('Failed to unstage files', 'error');
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus]);

  const stageAll = useCallback(async () => {
    if (!projectPath) return;
    setOperationInProgress('staging');
    try {
      const result = await window.electronAPI.gitStageAll(projectPath);
      if (!result.success) showToast(result.message, 'error');
      await refreshStatus();
    } catch (err) {
      showToast('Failed to stage all', 'error');
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus]);

  const unstageAll = useCallback(async () => {
    if (!projectPath) return;
    setOperationInProgress('unstaging');
    try {
      const result = await window.electronAPI.gitUnstageAll(projectPath);
      if (!result.success) showToast(result.message, 'error');
      await refreshStatus();
    } catch (err) {
      showToast('Failed to unstage all', 'error');
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus]);

  const commit = useCallback(async (request: GitCommitRequest) => {
    setOperationInProgress('committing');
    try {
      const result = await window.electronAPI.gitCommit(request);
      if (result.success) {
        showToast(result.message, 'success');
        setGeneratedMessage(null);
        await refreshStatus();
        await loadHistory(10);
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } catch (err) {
      showToast('Failed to commit', 'error');
      return { success: false, message: 'Failed to commit', errorCode: 'UNKNOWN' as const };
    } finally {
      setOperationInProgress(null);
    }
  }, [refreshStatus, loadHistory]);

  const generateMessage = useCallback(async () => {
    if (!projectPath) {
      showToast('No project directory available', 'error');
      return null;
    }
    setOperationInProgress('generating');
    try {
      const msg = await window.electronAPI.gitGenerateMessage(projectPath);
      setGeneratedMessage(msg);
      return msg;
    } catch (err) {
      showToast('Failed to generate commit message', 'error');
      return null;
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath]);

  const push = useCallback(async (setUpstream?: boolean) => {
    if (!projectPath) return;
    setOperationInProgress('pushing');
    try {
      const result = await window.electronAPI.gitPush(projectPath, setUpstream);
      if (result.success) {
        showToast(result.message, 'success');
        await refreshStatus();
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } catch (err) {
      showToast('Failed to push', 'error');
      return null;
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus]);

  const pull = useCallback(async () => {
    if (!projectPath) return;
    setOperationInProgress('pulling');
    try {
      const result = await window.electronAPI.gitPull(projectPath);
      if (result.success) {
        showToast(result.message, 'success');
        await refreshStatus();
        await loadHistory(10);
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } catch (err) {
      showToast('Failed to pull', 'error');
      return null;
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus, loadHistory]);

  const fetch_ = useCallback(async () => {
    if (!projectPath) return;
    setOperationInProgress('fetching');
    try {
      const result = await window.electronAPI.gitFetch(projectPath);
      if (result.success) {
        showToast(result.message, 'success');
        await refreshStatus();
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } catch (err) {
      showToast('Failed to fetch', 'error');
      return null;
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus]);

  const switchBranch = useCallback(async (branch: string) => {
    if (!projectPath) return;
    setOperationInProgress('switching');
    try {
      const result = await window.electronAPI.gitSwitchBranch(projectPath, branch);
      if (result.success) {
        showToast(`Switched to branch '${branch}'`, 'success');
        await refreshStatus();
        await loadBranches();
        await loadHistory(10);
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } catch (err) {
      showToast('Failed to switch branch', 'error');
      return null;
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus, loadBranches, loadHistory]);

  const createBranch = useCallback(async (branch: string) => {
    if (!projectPath) return;
    setOperationInProgress('creating branch');
    try {
      const result = await window.electronAPI.gitCreateBranch(projectPath, branch);
      if (result.success) {
        showToast(`Created branch '${branch}'`, 'success');
        await refreshStatus();
        await loadBranches();
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } catch (err) {
      showToast('Failed to create branch', 'error');
      return null;
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus, loadBranches]);

  const viewDiff = useCallback(async (filePath: string, staged: boolean) => {
    if (!projectPath) return;
    try {
      const diff = await window.electronAPI.gitDiff(projectPath, filePath, staged);
      setSelectedDiff(diff);
    } catch (err) {
      showToast('Failed to load diff', 'error');
    }
  }, [projectPath]);

  const viewFileContent = useCallback(async (filePath: string) => {
    if (!projectPath) return;
    try {
      const diff = await window.electronAPI.gitFileContent(projectPath, filePath);
      setSelectedDiff(diff);
    } catch (err) {
      showToast('Failed to load file content', 'error');
    }
  }, [projectPath]);

  const discardFile = useCallback(async (filePath: string) => {
    if (!projectPath) return;
    setOperationInProgress('discarding');
    try {
      const result = await window.electronAPI.gitDiscardFile(projectPath, filePath);
      if (result.success) {
        showToast(`Discarded changes to ${filePath}`, 'success');
        await refreshStatus();
      } else {
        showToast(result.message, 'error');
      }
    } catch (err) {
      showToast('Failed to discard changes', 'error');
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus]);

  const discardAll = useCallback(async () => {
    if (!projectPath) return;
    setOperationInProgress('discarding');
    try {
      const result = await window.electronAPI.gitDiscardAll(projectPath);
      if (result.success) {
        showToast('Discarded all unstaged changes', 'success');
        await refreshStatus();
      } else {
        showToast(result.message, 'error');
      }
    } catch (err) {
      showToast('Failed to discard all changes', 'error');
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus]);

  const initRepo = useCallback(async () => {
    if (!projectPath) return;
    setOperationInProgress('initializing');
    try {
      const result = await window.electronAPI.gitInit(projectPath);
      if (result.success) {
        showToast('Initialized git repository', 'success');
        await refreshStatus();
      } else {
        showToast(result.message, 'error');
      }
    } catch (err) {
      showToast('Failed to initialize git repository', 'error');
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, refreshStatus]);

  const loadWorktrees = useCallback(async () => {
    if (!projectPath) return;
    try {
      const wt = await window.electronAPI.gitWorktreeList(projectPath);
      setWorktrees(wt);
    } catch (err) {
      console.warn('Failed to load worktrees:', err);
    }
  }, [projectPath]);

  const addWorktree = useCallback(async (request: WorktreeCreateRequest) => {
    setOperationInProgress('creating worktree');
    try {
      const result = await window.electronAPI.gitWorktreeAdd(request);
      if (result.success) {
        showToast(result.message, 'success');
        await loadWorktrees();
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } catch (err) {
      showToast('Failed to create worktree', 'error');
      return { success: false, message: 'Failed to create worktree', errorCode: 'UNKNOWN' as const };
    } finally {
      setOperationInProgress(null);
    }
  }, [loadWorktrees]);

  const removeWorktree = useCallback(async (request: WorktreeRemoveRequest) => {
    setOperationInProgress('removing worktree');
    try {
      const result = await window.electronAPI.gitWorktreeRemove(request);
      if (result.success) {
        showToast(result.message, 'success');
        await loadWorktrees();
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } catch (err) {
      showToast('Failed to remove worktree', 'error');
      return { success: false, message: 'Failed to remove worktree', errorCode: 'UNKNOWN' as const };
    } finally {
      setOperationInProgress(null);
    }
  }, [loadWorktrees]);

  const pruneWorktrees = useCallback(async () => {
    if (!projectPath) return;
    setOperationInProgress('pruning worktrees');
    try {
      const result = await window.electronAPI.gitWorktreePrune(projectPath);
      if (result.success) {
        showToast('Pruned stale worktrees', 'success');
        await loadWorktrees();
      } else {
        showToast(result.message, 'error');
      }
      return result;
    } catch (err) {
      showToast('Failed to prune worktrees', 'error');
      return null;
    } finally {
      setOperationInProgress(null);
    }
  }, [projectPath, loadWorktrees]);

  const startWatching = useCallback(async () => {
    if (!projectPath) return;
    try {
      await window.electronAPI.gitStartWatching(projectPath);
    } catch (err) {
      console.warn('Failed to start git watching:', err);
    }
  }, [projectPath]);

  const stopWatching = useCallback(async () => {
    if (!projectPath) return;
    try {
      await window.electronAPI.gitStopWatching(projectPath);
    } catch (err) {
      console.warn('Failed to stop git watching:', err);
    }
  }, [projectPath]);

  return {
    status,
    branches,
    log,
    selectedDiff,
    generatedMessage,
    worktrees,
    isLoading,
    operationInProgress,
    error,
    refreshStatus,
    loadBranches,
    loadHistory,
    stageFiles,
    unstageFiles,
    stageAll,
    unstageAll,
    commit,
    generateMessage,
    push,
    pull,
    fetch: fetch_,
    switchBranch,
    createBranch,
    viewDiff,
    viewFileContent,
    setSelectedDiff,
    discardFile,
    discardAll,
    initRepo,
    loadWorktrees,
    addWorktree,
    removeWorktree,
    pruneWorktrees,
    startWatching,
    stopWatching,
  };
}
