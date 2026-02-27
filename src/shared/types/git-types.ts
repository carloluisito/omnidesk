// Git file status codes
export type GitFileStatus =
  | 'added'
  | 'modified'
  | 'deleted'
  | 'renamed'
  | 'copied'
  | 'untracked'
  | 'ignored'
  | 'unmerged';

export type GitFileArea = 'staged' | 'unstaged' | 'untracked' | 'conflicted';

export interface GitFileEntry {
  path: string;
  originalPath: string | null;
  indexStatus: GitFileStatus;
  workTreeStatus: GitFileStatus;
  area: GitFileArea;
}

export interface GitBranchInfo {
  name: string;
  isCurrent: boolean;
  upstream: string | null;
  ahead: number;
  behind: number;
}

export interface GitStatus {
  isRepo: boolean;
  isDetached: boolean;
  hasConflicts: boolean;
  branch: string | null;
  upstream: string | null;
  ahead: number;
  behind: number;
  files: GitFileEntry[];
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  /** Directory this status was fetched from (set on push events). */
  workDir?: string;
}

export interface GitCommitInfo {
  hash: string;
  shortHash: string;
  authorName: string;
  authorEmail: string;
  date: string;
  subject: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
}

export interface GitDiffResult {
  filePath: string;
  diff: string;
  isTruncated: boolean;
  totalSizeBytes: number;
}

export type CommitType =
  | 'feat'
  | 'fix'
  | 'refactor'
  | 'docs'
  | 'style'
  | 'test'
  | 'chore'
  | 'perf'
  | 'ci'
  | 'build';

export type CommitConfidence = 'high' | 'medium' | 'low';

export interface GeneratedCommitMessage {
  message: string;
  type: CommitType;
  scope: string | null;
  description: string;
  confidence: CommitConfidence;
  reasoning: string;
}

export interface GitOperationResult {
  success: boolean;
  message: string;
  errorCode: GitErrorCode | null;
}

export type GitErrorCode =
  | 'NOT_A_REPO'
  | 'GIT_NOT_INSTALLED'
  | 'NOTHING_TO_COMMIT'
  | 'MERGE_CONFLICTS'
  | 'NO_UPSTREAM'
  | 'PUSH_REJECTED'
  | 'AUTH_FAILED'
  | 'TIMEOUT'
  | 'DETACHED_HEAD'
  | 'BRANCH_EXISTS'
  | 'BRANCH_NOT_FOUND'
  | 'UNCOMMITTED_CHANGES'
  | 'UNKNOWN';

export interface GitCommitRequest {
  workingDirectory: string;
  message: string;
  createCheckpoint: boolean;
  sessionId: string | null;
}

export interface GitRemoteProgress {
  operation: 'push' | 'pull' | 'fetch';
  phase: string;
  isComplete: boolean;
}

export interface GitSettings {
  autoRefreshIntervalMs: number;
  commandTimeoutMs: number;
  createCheckpointAfterCommit: boolean;
  maxDiffSizeBytes: number;
}

// ── Git Worktree types ──

export interface WorktreeInfo {
  mainRepoPath: string;
  worktreePath: string;
  branch: string;
  /** New field. Backward-compat: read managedByClaudeDesk as fallback. */
  managedByOmniDesk: boolean;
  /** @deprecated Use managedByOmniDesk. Kept for backward-compat reads of persisted data. */
  managedByClaudeDesk?: boolean;
  createdAt: number;
}

export interface GitWorktreeEntry {
  path: string;
  head: string;
  branch: string | null;
  isMainWorktree: boolean;
  isBare: boolean;
  isLocked: boolean;
  isPrunable: boolean;
  linkedSessionId: string | null;
  /** New field. Backward-compat: read managedByClaudeDesk as fallback. */
  managedByOmniDesk: boolean;
  /** @deprecated Use managedByOmniDesk. Kept for backward-compat reads of persisted data. */
  managedByClaudeDesk?: boolean;
}

export interface WorktreeCreateRequest {
  mainRepoPath: string;
  branch: string;
  isNewBranch: boolean;
  baseBranch?: string;
  customPath?: string;
}

export interface WorktreeRemoveRequest {
  mainRepoPath: string;
  worktreePath: string;
  force: boolean;
}

export interface WorktreeSettings {
  basePath: 'sibling' | 'subdirectory' | 'custom';
  customBasePath?: string;
  cleanupOnSessionClose: 'ask' | 'always' | 'never';
}

export type WorktreeErrorCode =
  | 'WORKTREE_BRANCH_IN_USE'
  | 'WORKTREE_PATH_EXISTS'
  | 'WORKTREE_NOT_FOUND'
  | 'WORKTREE_LOCKED'
  | 'WORKTREE_DIRTY'
  | 'GIT_VERSION_TOO_OLD';
