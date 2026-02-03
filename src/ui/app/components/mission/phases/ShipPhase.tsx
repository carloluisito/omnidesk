/**
 * ShipPhase - Unified shipping workflow
 *
 * Consolidates all ship logic: safety checks, PR preview,
 * commit/push/PR creation in one cohesive interface.
 */
import { useState, useCallback, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Rocket,
  GitBranch,
  GitPullRequest,
  GitMerge,
  Check,
  AlertTriangle,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Loader2,
  ChevronDown,
  Shield,
  Eye,
  Circle,
  XCircle,
  ShieldAlert,
  KeyRound,
  GitBranchPlus,
  FolderX,
  Clock,
  RefreshCw,
} from 'lucide-react';
import { cn } from '../../../lib/cn';
import { api } from '../../../lib/api';
import { OrgAccessErrorModal } from './OrgAccessErrorModal';

interface GitHubErrorDetails {
  type: string;
  message: string;
  statusCode?: number;
  owner?: string;
  repo?: string;
  organizationUrl?: string;
  retryable: boolean;
  actionable: boolean;
}

interface ShipSummary {
  files: Array<{
    path: string;
    insertions: number;
    deletions: number;
    status: 'added' | 'modified' | 'deleted' | 'renamed';
  }>;
  totalInsertions: number;
  totalDeletions: number;
  currentBranch: string;
  baseBranch: string;
  hasUncommittedChanges: boolean;
  hasChangesToShip: boolean;
  unpushedCommits: number;
  commitsAheadOfBase: number;
  existingPR: {
    url: string;
    number: number;
    title: string;
    state: string;
  } | null;
}

interface SafetyWarning {
  id: string;
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  canDismiss: boolean;
}

interface ShipPhaseProps {
  sessionId: string;
  repoId?: string;
  isMultiRepo?: boolean;
  reviewFiles?: string[];
  onSuccess?: (result: { prUrl?: string; commitHash?: string }) => void;
  onGoBack?: () => void;
}

export function ShipPhase({
  sessionId,
  repoId,
  isMultiRepo = false,
  reviewFiles,
  onSuccess,
  onGoBack,
}: ShipPhaseProps) {
  // Data state
  const [summary, setSummary] = useState<ShipSummary | null>(null);
  const [branches, setBranches] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  // Form state
  const [prTitle, setPrTitle] = useState('');
  const [prDescription, setPrDescription] = useState('');
  const [targetBranch, setTargetBranch] = useState('');
  const [shouldPush, setShouldPush] = useState(true);
  const [shouldCreatePR, setShouldCreatePR] = useState(true);

  // Action state
  const [shipping, setShipping] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{
    success: boolean;
    prUrl?: string;
    commitHash?: string;
    error?: string;
    errorDetails?: GitHubErrorDetails;
  } | null>(null);
  const [dismissedWarnings, setDismissedWarnings] = useState<Set<string>>(new Set());
  const [showOrgAccessModal, setShowOrgAccessModal] = useState(false);

  // Auto-show org access modal when error occurs
  useEffect(() => {
    if (result?.errorDetails?.type === 'org_access_required' && result.errorDetails.organizationUrl) {
      setShowOrgAccessModal(true);
    }
  }, [result]);

  // Derive whether existing PR is still actionable
  const isExistingPRActive = summary?.existingPR && summary.existingPR.state === 'open';
  const isExistingPRClosed = summary?.existingPR && (summary.existingPR.state === 'merged' || summary.existingPR.state === 'closed');

  // Detect warnings - scope to review files when available
  // Only show warnings for uncommitted changes, not for already-pushed commits
  const warnings = useMemo<SafetyWarning[]>(() => {
    if (!summary) return [];
    // Skip warnings if there are no uncommitted changes (PR-only mode)
    if (!summary.hasUncommittedChanges) return [];

    const w: SafetyWarning[] = [];
    const seen = new Set<string>();

    // Use review files if available, otherwise fall back to full summary
    const reviewFileSet = reviewFiles && reviewFiles.length > 0 ? new Set(reviewFiles) : null;
    const filesToCheck = reviewFileSet
      ? summary.files.filter(f => reviewFileSet.has(f.path))
      : summary.files;

    for (const file of filesToCheck) {
      const path = file.path.toLowerCase();

      if ((path.includes('auth') || path.includes('login') || path.includes('password')) && !seen.has('auth')) {
        seen.add('auth');
        w.push({
          id: 'auth',
          severity: 'warning',
          title: 'Authentication code modified',
          description: 'Review security implications of auth changes.',
          canDismiss: true,
        });
      }

      if ((path.includes('.env') || path.includes('secret') || path.includes('credential')) && !seen.has('secrets')) {
        seen.add('secrets');
        w.push({
          id: 'secrets',
          severity: 'critical',
          title: 'Possible secrets detected',
          description: 'Verify no sensitive data is being committed.',
          canDismiss: false,
        });
      }

      if ((path.includes('security') || path.includes('crypto') || path.includes('token')) && !seen.has('security')) {
        seen.add('security');
        w.push({
          id: 'security',
          severity: 'critical',
          title: 'Security-critical code',
          description: 'Extra review recommended for security paths.',
          canDismiss: false,
        });
      }
    }

    return w;
  }, [summary, reviewFiles]);

  const hasBlockingWarnings = warnings.some(
    (w) => w.severity === 'critical' && !w.canDismiss && !dismissedWarnings.has(w.id)
  );

  // Scoped file stats - use review files when available
  const scopedStats = useMemo(() => {
    if (!summary) return { fileCount: 0, insertions: 0, deletions: 0 };
    if (!reviewFiles || reviewFiles.length === 0) {
      return { fileCount: summary.files.length, insertions: summary.totalInsertions, deletions: summary.totalDeletions };
    }
    const reviewSet = new Set(reviewFiles);
    const scoped = summary.files.filter(f => reviewSet.has(f.path));
    return {
      fileCount: scoped.length,
      insertions: scoped.reduce((sum, f) => sum + f.insertions, 0),
      deletions: scoped.reduce((sum, f) => sum + f.deletions, 0),
    };
  }, [summary, reviewFiles]);

  // Build URL helper
  const buildUrl = useCallback(
    (path: string) => (isMultiRepo && repoId ? `${path}?repoId=${repoId}` : path),
    [isMultiRepo, repoId]
  );

  // Load data
  useEffect(() => {
    if (!sessionId) return;

    const load = async () => {
      setLoading(true);
      try {
        const summaryData = await api<ShipSummary>(
          'GET',
          buildUrl(`/terminal/sessions/${sessionId}/ship-summary`)
        );

        // Fetch branches separately - don't let it fail the whole load
        let fetchedBranches: string[] = [];
        try {
          const branchData = await api<{ branches: string[] }>(
            'GET',
            `/terminal/repos/${repoId || sessionId}/branches`
          );
          fetchedBranches = branchData.branches || [];
        } catch {
          // Branches endpoint may fail if repoId isn't registered; continue with fallback
        }

        setSummary(summaryData);
        // Ensure baseBranch is always in the list so the select is never empty
        const base = summaryData.baseBranch || 'main';
        if (fetchedBranches.length === 0) {
          fetchedBranches.push(base);
        } else if (!fetchedBranches.includes(base)) {
          fetchedBranches.unshift(base);
        }
        setBranches(fetchedBranches);
        setTargetBranch((prev) => prev || base);

        // Generate default PR title from branch
        if (summaryData.currentBranch && !prTitle) {
          const title = summaryData.currentBranch
            .replace(/^(feature|fix|bugfix|hotfix|chore|refactor|docs)\//, '')
            .replace(/[-_]/g, ' ')
            .replace(/^\w/, (c) => c.toUpperCase());
          setPrTitle(title);
        }

        // If no uncommitted changes, disable commit/push but enable PR creation
        if (!summaryData.hasUncommittedChanges && summaryData.commitsAheadOfBase > 0) {
          setShouldPush(false);
          setShouldCreatePR(true);
        }
      } catch (err) {
        console.error('Failed to load ship summary:', err);
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [sessionId, repoId, buildUrl]);

  // Generate PR content
  const handleGenerate = async () => {
    if (!sessionId) return;
    setGenerating(true);
    try {
      const body: { targetBranch: string; repoId?: string } = {
        targetBranch: targetBranch || summary?.baseBranch || 'main',
      };
      if (repoId) body.repoId = repoId;
      // Note: We don't pass reviewFiles here because PR generation should
      // consider ALL changes on the branch, not just reviewed files.
      // reviewFiles is only used for scoping safety checks and UI display.

      const data = await api<{ title: string; description: string }>(
        'POST',
        `/terminal/sessions/${sessionId}/generate-pr-content`,
        body
      );
      setPrTitle(data.title);
      setPrDescription(data.description);
    } catch (err) {
      console.error('Failed to generate:', err);
    } finally {
      setGenerating(false);
    }
  };

  // Ship changes
  const handleShip = async () => {
    if (!sessionId || !prTitle.trim()) return;

    setShipping(true);
    setResult(null);

    try {
      const body: Record<string, unknown> = {
        commitMessage: prTitle.trim(),
        push: shouldPush,
        createPR: shouldCreatePR,
        prTitle: prTitle.trim(),
        prBody: prDescription,
        targetBranch: targetBranch || summary?.baseBranch || 'main',
      };
      if (repoId) body.repoId = repoId;

      const data = await api<{
        success: boolean;
        committed?: boolean;
        pushed?: boolean;
        prUrl?: string;
        commitHash?: string;
        error?: string;
      }>('POST', `/terminal/sessions/${sessionId}/ship`, body);

      setResult(data);
      if (data.success && onSuccess) {
        onSuccess({ prUrl: data.prUrl, commitHash: data.commitHash });
      }
    } catch (err) {
      setResult({
        success: false,
        error: err instanceof Error ? err.message : 'Ship failed',
      });
    } finally {
      setShipping(false);
    }
  };

  // Helper to get error-specific border color
  const getErrorBorderColor = (errorType?: string): string => {
    switch (errorType) {
      case 'org_access_required':
      case 'rate_limited':
      case 'pr_already_exists':
        return 'border-l-amber-400';
      case 'branch_not_found':
        return 'border-l-blue-400';
      default:
        return 'border-l-red-400';
    }
  };

  // Helper to get error-specific icon color
  const getErrorIconColor = (errorType?: string): string => {
    switch (errorType) {
      case 'org_access_required':
      case 'rate_limited':
      case 'pr_already_exists':
        return 'text-amber-400';
      case 'branch_not_found':
        return 'text-blue-400';
      default:
        return 'text-red-400';
    }
  };

  // Helper to get error-specific icon
  const getErrorIcon = (errorType?: string) => {
    switch (errorType) {
      case 'org_access_required':
        return ShieldAlert;
      case 'token_expired':
        return KeyRound;
      case 'branch_not_found':
        return GitBranchPlus;
      case 'repo_not_found':
        return FolderX;
      case 'pr_already_exists':
        return GitPullRequest;
      case 'rate_limited':
        return Clock;
      default:
        return AlertCircle;
    }
  };

  // Helper to get user-friendly error titles
  const getErrorTitle = (errorType?: string): string => {
    switch (errorType) {
      case 'org_access_required':
        return 'Organization Access Required';
      case 'token_expired':
        return 'GitHub Connection Expired';
      case 'token_invalid':
        return 'GitHub Access Denied';
      case 'repo_not_found':
        return 'Repository Not Found';
      case 'branch_not_found':
        return 'Branch Not Pushed';
      case 'pr_already_exists':
        return 'Pull Request Already Exists';
      case 'rate_limited':
        return 'GitHub Rate Limited';
      default:
        return 'Failed to Create Pull Request';
    }
  };

  // Success state
  if (result?.success) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="mx-auto mb-4 flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/20 ring-2 ring-emerald-500/40">
            <Check className="h-10 w-10 text-emerald-400" />
          </div>
          <h2 className="text-2xl font-semibold text-white mb-2">Shipped!</h2>
          <p className="text-white/60 mb-6">Your changes are on their way.</p>

          {result.commitHash && (
            <p className="text-sm text-white/40 mb-2">
              Commit: <span className="font-mono text-white/60">{result.commitHash}</span>
            </p>
          )}

          {result.prUrl && (
            <a
              href={result.prUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
            >
              <ExternalLink className="h-4 w-4" />
              View Pull Request
            </a>
          )}

          {onGoBack && (
            <button
              onClick={onGoBack}
              className="mt-4 block w-full text-sm text-white/50 hover:text-white/70"
            >
              Start new conversation
            </button>
          )}
        </motion.div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-white/30" />
      </div>
    );
  }

  // No changes state — show existing PR if one exists
  if (!summary?.hasChangesToShip) {
    return (
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="text-center max-w-md">
          {summary?.existingPR ? (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              {/* PR status icon */}
              <div className="mx-auto mb-5 flex h-20 w-20 items-center justify-center rounded-full bg-purple-500/15 ring-2 ring-purple-500/30">
                {summary.existingPR.state === 'merged' ? (
                  <GitMerge className="h-10 w-10 text-purple-400" />
                ) : summary.existingPR.state === 'closed' ? (
                  <XCircle className="h-10 w-10 text-red-400" />
                ) : (
                  <GitPullRequest className="h-10 w-10 text-emerald-400" />
                )}
              </div>

              {/* Status badge */}
              <div className={cn(
                'inline-flex items-center gap-1.5 rounded-full px-3 py-1 mb-3 text-xs font-medium tracking-wide uppercase ring-1',
                summary.existingPR.state === 'merged'
                  ? 'bg-purple-500/15 text-purple-400 ring-purple-500/30'
                  : summary.existingPR.state === 'closed'
                  ? 'bg-red-500/15 text-red-400 ring-red-500/30'
                  : 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
              )}>
                {summary.existingPR.state === 'merged' ? (
                  <GitMerge className="h-3 w-3" />
                ) : summary.existingPR.state === 'closed' ? (
                  <XCircle className="h-3 w-3" />
                ) : (
                  <Circle className="h-3 w-3 fill-current" />
                )}
                {summary.existingPR.state || 'open'}
              </div>

              <h2 className="text-xl font-semibold text-white mb-1.5">
                PR #{summary.existingPR.number}
              </h2>
              <p className="text-sm text-white/60 mb-1">
                {summary.existingPR.title}
              </p>

              {/* Branch flow */}
              <div className="flex items-center justify-center gap-2 text-xs text-white/40 mb-6 font-mono">
                <GitBranch className="h-3 w-3" />
                <span>{summary.currentBranch}</span>
                <span className="text-white/20">→</span>
                <span>{summary.baseBranch}</span>
              </div>

              <div className="flex flex-col items-center gap-3">
                <a
                  href={summary.existingPR.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-sm font-semibold text-black hover:opacity-90 transition-opacity"
                >
                  <ExternalLink className="h-4 w-4" />
                  View Pull Request
                </a>
                {onGoBack && (
                  <button
                    onClick={onGoBack}
                    className="text-sm text-white/40 hover:text-white/60 transition-colors"
                  >
                    Back to prompting
                  </button>
                )}
              </div>

              <p className="mt-6 text-xs text-white/30">
                {summary.existingPR.state === 'merged'
                  ? 'This PR has been merged. Make changes to create a new PR.'
                  : summary.existingPR.state === 'closed'
                  ? 'This PR was closed. Make changes to create a new PR.'
                  : 'No uncommitted changes. Push new commits to update this PR.'}
              </p>
            </motion.div>
          ) : (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
                <Rocket className="h-8 w-8 text-white/30" />
              </div>
              <h2 className="text-lg font-semibold text-white mb-2">Nothing to ship</h2>
              <p className="text-sm text-white/50">
                Make some changes first, then come back to ship them.
              </p>
              {onGoBack && (
                <button
                  onClick={onGoBack}
                  className="mt-4 text-sm text-blue-400 hover:text-blue-300"
                >
                  Go back to prompting
                </button>
              )}
            </motion.div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col sm:flex-row min-h-0 gap-3 sm:gap-4 p-3 sm:p-4 overflow-y-auto sm:overflow-y-hidden">
      {/* Left - Safety & Branch */}
      <div className="w-full sm:w-72 sm:flex-shrink-0 flex flex-col gap-3 sm:gap-4">
        {/* Branch comparison */}
        <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-4">
          <div className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">
            Branch Flow
          </div>
          <div className="flex items-center gap-2">
            <div className="min-w-0 flex-1 rounded-lg bg-emerald-500/10 px-3 py-2 ring-1 ring-emerald-500/20">
              <div className="flex items-center gap-2">
                <GitBranch className="h-4 w-4 flex-shrink-0 text-emerald-400" />
                <span className="text-sm font-mono text-emerald-400 truncate">
                  {summary?.currentBranch}
                </span>
              </div>
            </div>
            <div className="flex-shrink-0 text-white/30">→</div>
            <div className="min-w-0 flex-1">
              <select
                value={targetBranch}
                onChange={(e) => setTargetBranch(e.target.value)}
                className="w-full rounded-lg bg-white/5 px-3 py-2 text-base sm:text-sm font-mono text-white/80 ring-1 ring-white/10 focus:ring-white/20 focus:outline-none"
              >
                {branches.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>
          </div>
          {summary?.unpushedCommits > 0 ? (
            <p className="mt-2 text-xs text-white/40">
              {summary.unpushedCommits} unpushed commit{summary.unpushedCommits > 1 ? 's' : ''}
            </p>
          ) : summary?.commitsAheadOfBase > 0 ? (
            <p className="mt-2 text-xs text-emerald-400/70">
              {summary.commitsAheadOfBase} commit{summary.commitsAheadOfBase > 1 ? 's' : ''} ahead (pushed)
            </p>
          ) : null}
        </div>

        {/* Safety checklist */}
        <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-4 sm:flex-1">
          <div className="flex items-center gap-2 mb-3">
            <Shield className="h-4 w-4 text-white/50" />
            <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
              Safety Check
            </span>
          </div>

          {warnings.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-400">
              <Check className="h-4 w-4" />
              <span className="text-sm">All clear</span>
            </div>
          ) : (
            <div className="space-y-2">
              {warnings.map((w) => (
                <div
                  key={w.id}
                  className={cn(
                    'rounded-lg p-3 ring-1',
                    w.severity === 'critical'
                      ? 'bg-red-500/10 ring-red-500/20'
                      : w.severity === 'warning'
                      ? 'bg-amber-500/10 ring-amber-500/20'
                      : 'bg-blue-500/10 ring-blue-500/20',
                    dismissedWarnings.has(w.id) && 'opacity-50'
                  )}
                >
                  <div className="flex items-start gap-2">
                    {w.severity === 'critical' ? (
                      <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-white">{w.title}</p>
                      <p className="text-xs text-white/50 mt-0.5">{w.description}</p>
                    </div>
                    {w.canDismiss && !dismissedWarnings.has(w.id) && (
                      <button
                        onClick={() =>
                          setDismissedWarnings((prev) => new Set([...prev, w.id]))
                        }
                        className="text-xs text-white/40 hover:text-white/60"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-4">
          <div className="flex items-center justify-between text-sm">
            <span className="text-white/50">{scopedStats.fileCount} files</span>
            <div className="flex items-center gap-3">
              <span className="text-emerald-400 font-mono">+{scopedStats.insertions}</span>
              <span className="text-red-400 font-mono">-{scopedStats.deletions}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Center - PR Preview */}
      <div className="flex-1 flex flex-col rounded-xl bg-white/[0.03] ring-1 ring-white/10 overflow-hidden min-w-0 min-h-0">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitPullRequest className="h-4 w-4 text-white/50" />
            <span className="text-sm font-medium text-white/70">Pull Request Preview</span>
          </div>
          <button
            onClick={handleGenerate}
            disabled={generating}
            className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white/80 transition-colors disabled:opacity-50"
          >
            {generating ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3" />
            )}
            {generating ? 'Generating...' : 'AI Generate'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* PR-only mode banner — shown when there are no uncommitted changes but commits ahead */}
          {!summary?.hasUncommittedChanges && summary?.commitsAheadOfBase > 0 && !summary?.existingPR && (
            <div className="rounded-xl p-4 ring-1 bg-blue-500/10 ring-blue-500/20">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-lg ring-1 bg-blue-500/15 ring-blue-500/30">
                  <GitPullRequest className="h-4 w-4 text-blue-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-white mb-0.5">
                    Branch ready for PR
                  </p>
                  <p className="text-xs text-white/50">
                    {summary.commitsAheadOfBase} commit{summary.commitsAheadOfBase > 1 ? 's' : ''} ahead of {summary.baseBranch}. Changes are already pushed.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Existing PR banner — shown prominently at top */}
          {summary?.existingPR && (
            <div className={cn(
              'rounded-xl p-4 ring-1',
              summary.existingPR.state === 'merged'
                ? 'bg-purple-500/10 ring-purple-500/20'
                : summary.existingPR.state === 'closed'
                ? 'bg-red-500/10 ring-red-500/20'
                : 'bg-emerald-500/10 ring-emerald-500/20'
            )}>
              <div className="flex items-center gap-3">
                <div className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-lg ring-1',
                  summary.existingPR.state === 'merged'
                    ? 'bg-purple-500/15 ring-purple-500/30'
                    : summary.existingPR.state === 'closed'
                    ? 'bg-red-500/15 ring-red-500/30'
                    : 'bg-emerald-500/15 ring-emerald-500/30'
                )}>
                  {summary.existingPR.state === 'merged' ? (
                    <GitMerge className="h-4 w-4 text-purple-400" />
                  ) : summary.existingPR.state === 'closed' ? (
                    <XCircle className="h-4 w-4 text-red-400" />
                  ) : (
                    <GitPullRequest className="h-4 w-4 text-emerald-400" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-white">
                      PR #{summary.existingPR.number}
                    </span>
                    <span className={cn(
                      'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1',
                      summary.existingPR.state === 'merged'
                        ? 'bg-purple-500/15 text-purple-400 ring-purple-500/30'
                        : summary.existingPR.state === 'closed'
                        ? 'bg-red-500/15 text-red-400 ring-red-500/30'
                        : 'bg-emerald-500/15 text-emerald-400 ring-emerald-500/30'
                    )}>
                      {summary.existingPR.state || 'open'}
                    </span>
                  </div>
                  <p className="text-xs text-white/50 truncate mt-0.5">
                    {summary.existingPR.title}
                  </p>
                </div>
                <a
                  href={summary.existingPR.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-xs text-white/60 hover:bg-white/10 hover:text-white/80 ring-1 ring-white/10 transition-colors"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  View
                </a>
              </div>
              <p className="mt-2 text-xs text-white/40">
                {isExistingPRClosed
                  ? `Previous PR was ${summary.existingPR.state}. A new PR will be created.`
                  : 'New commits will be pushed to the existing PR.'}
              </p>
            </div>
          )}

          {/* Title input */}
          <div>
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              PR Title
            </label>
            <input
              type="text"
              value={prTitle}
              onChange={(e) => setPrTitle(e.target.value)}
              placeholder="Add a concise title..."
              className="w-full rounded-lg bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 ring-1 ring-white/10 focus:ring-white/20 focus:outline-none"
            />
          </div>

          {/* Description input */}
          <div className="flex-1 flex flex-col">
            <label className="block text-xs font-medium text-white/50 mb-1.5">
              Description
            </label>
            <textarea
              value={prDescription}
              onChange={(e) => setPrDescription(e.target.value)}
              placeholder="Describe your changes..."
              className="flex-1 min-h-[120px] sm:min-h-[200px] w-full rounded-lg bg-white/5 px-3 py-2.5 text-sm text-white placeholder:text-white/30 ring-1 ring-white/10 focus:ring-white/20 focus:outline-none resize-none"
            />
          </div>

          {/* Options */}
          <div className="flex items-center gap-4">
            <label className={cn(
              "flex items-center gap-2",
              summary?.hasUncommittedChanges ? "cursor-pointer" : "cursor-not-allowed opacity-50"
            )}>
              <input
                type="checkbox"
                checked={shouldPush}
                onChange={(e) => setShouldPush(e.target.checked)}
                disabled={!summary?.hasUncommittedChanges}
                className="rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/20 disabled:cursor-not-allowed"
              />
              <span className="text-sm text-white/70">Push to remote</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={shouldCreatePR}
                onChange={(e) => setShouldCreatePR(e.target.checked)}
                className="rounded border-white/20 bg-white/5 text-emerald-500 focus:ring-emerald-500/20"
              />
              <span className="text-sm text-white/70">Create PR</span>
            </label>
          </div>

          {/* Enhanced error display with visual hierarchy */}
          {result?.error && (
            <div
              className={cn(
                "rounded-xl p-4 bg-white/[0.03] ring-1 ring-white/10",
                "border-l-4",
                getErrorBorderColor(result.errorDetails?.type),
                "space-y-3",
                "animate-in slide-in-from-top-2 fade-in duration-200"
              )}
              role="alert"
              aria-live="assertive"
            >
              <div className="flex items-start gap-3">
                {(() => {
                  const Icon = getErrorIcon(result.errorDetails?.type);
                  return <Icon className={cn("h-5 w-5 flex-shrink-0 mt-0.5", getErrorIconColor(result.errorDetails?.type))} />;
                })()}
                <div className="flex-1 min-w-0 space-y-3">
                  {/* Error title and message */}
                  <div>
                    <p className="text-sm font-medium text-white mb-1">
                      {getErrorTitle(result.errorDetails?.type)}
                    </p>
                    <p className="text-sm text-white/70 leading-6">{result.error}</p>
                  </div>

                  {/* Organization access - opens modal */}
                  {result.errorDetails?.type === 'org_access_required' && result.errorDetails.organizationUrl && (
                    <button
                      onClick={() => setShowOrgAccessModal(true)}
                      className="w-full px-4 py-2.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-sm font-medium text-amber-400 ring-1 ring-amber-500/30 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50"
                    >
                      View Access Options
                    </button>
                  )}

                  {/* Token expired guidance */}
                  {result.errorDetails?.type === 'token_expired' && (
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-sm text-white/70">
                        Your GitHub connection has expired. Reconnect your account in Settings → Integrations.
                      </p>
                    </div>
                  )}

                  {/* Branch not found guidance */}
                  {result.errorDetails?.type === 'branch_not_found' && (
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <p className="text-sm text-white/70">
                        Your branch exists locally but hasn't been pushed to GitHub yet. Try enabling "Push to remote" and shipping again.
                      </p>
                    </div>
                  )}

                  {/* Repository not found guidance */}
                  {result.errorDetails?.type === 'repo_not_found' && !result.errorDetails?.organizationUrl && (
                    <div className="rounded-lg bg-white/[0.03] p-3 space-y-2">
                      <ol className="ml-6 space-y-2 text-sm text-white/70">
                        <li className="flex gap-2">
                          <span className="text-white/50">1.</span>
                          <span>Verify the repository exists on GitHub</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-white/50">2.</span>
                          <span>Check that your GitHub account has access</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="text-white/50">3.</span>
                          <span>If it's a new repository, ensure it's been pushed</span>
                        </li>
                      </ol>
                    </div>
                  )}

                  {/* PR already exists - show link if available */}
                  {result.errorDetails?.type === 'pr_already_exists' && summary?.existingPR && (
                    <div className="rounded-lg bg-white/[0.03] p-3">
                      <a
                        href={summary.existingPR.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm font-medium text-white/70 hover:text-white underline-offset-4 hover:underline transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        View Existing PR #{summary.existingPR.number}
                      </a>
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-col sm:flex-row gap-3 pt-1">
                    {result.errorDetails?.retryable ? (
                      <button
                        onClick={() => setResult(null)}
                        className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-sm font-medium text-white transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 flex items-center justify-center gap-2 w-full sm:w-auto"
                      >
                        <RefreshCw className="h-4 w-4" />
                        Retry
                      </button>
                    ) : (
                      <button
                        onClick={() => setResult(null)}
                        className="px-4 py-2.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm text-white/60 hover:text-white/80 transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30 w-full sm:w-auto"
                      >
                        Dismiss
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Ship button */}
        <div className="p-4 border-t border-white/10">
          <button
            onClick={handleShip}
            disabled={shipping || !prTitle.trim() || hasBlockingWarnings}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-semibold transition-all',
              shipping || !prTitle.trim() || hasBlockingWarnings
                ? 'bg-white/10 text-white/40 cursor-not-allowed'
                : 'bg-white text-black hover:opacity-90'
            )}
          >
            {shipping ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Shipping...
              </>
            ) : (
              <>
                <Rocket className="h-4 w-4" />
                {isExistingPRActive && shouldPush
                  ? 'Push to Existing PR'
                  : shouldCreatePR && !summary?.hasUncommittedChanges
                  ? 'Create PR'
                  : shouldCreatePR
                  ? 'Commit & Create PR'
                  : 'Ship Changes'}
              </>
            )}
          </button>
          {hasBlockingWarnings && (
            <p className="mt-2 text-xs text-center text-red-400">
              Resolve critical warnings before shipping
            </p>
          )}
        </div>
      </div>

      {/* Organization Access Error Modal */}
      {showOrgAccessModal && result?.errorDetails?.type === 'org_access_required' && result.errorDetails.organizationUrl && (
        <OrgAccessErrorModal
          orgName={result.errorDetails.owner || 'the organization'}
          repoName={result.errorDetails.repo || 'this repository'}
          onSetupPAT={() => {
            setShowOrgAccessModal(false);
            // Navigate to settings integrations
            window.location.hash = '#/settings/integrations';
          }}
          onDismiss={() => setShowOrgAccessModal(false)}
          organizationUrl={result.errorDetails.organizationUrl}
        />
      )}
    </div>
  );
}
