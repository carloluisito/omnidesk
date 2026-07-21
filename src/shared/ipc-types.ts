import type { ProviderId } from './types/provider-types';

// Permission mode for sessions
export type PermissionMode = 'standard' | 'skip-permissions';

/** Whether a session runs an AI CLI ('agent') or is a plain terminal ('shell').
 *  Absent on persisted sessions from before this feature — treat as 'agent'. */
export type SessionKind = 'agent' | 'shell';

/**
 * The launch mode for a new session — drives which `claude` invocation runs in the PTY.
 *
 * - `'default'`              — `claude`
 * - `'bypass-permissions'`   — `claude --dangerously-skip-permissions`
 * - `'agents'`               — `claude agents` (Claude Code v2.1.139+ background-session TUI)
 * - `'continue'`             — `claude --continue` (resume the most recent
 *                              conversation in the session's working directory;
 *                              Claude Code starts fresh if none exists)
 *
 * Gated on `AgentViewAvailability` for `'agents'`; the spawner falls back to
 * `'default'` if the agents mode is requested while unavailable.
 */
export type LaunchMode = 'default' | 'bypass-permissions' | 'agents' | 'continue';

// Session status
export type SessionStatus = 'starting' | 'running' | 'exited' | 'error';

/**
 * Fine-grained live activity state of a session, derived by the
 * SessionStateClassifier from the PTY output stream (plus authoritative exit
 * events). Distinct from the coarse process-lifecycle `SessionStatus`. This is
 * the signal the attention-router cockpit routes on. Transient — never
 * persisted; reset to 'initializing' on load.
 */
export type SessionActivityState =
  | 'initializing'      // PTY up, CLI not yet at its ready banner
  | 'working'           // actively producing output / interrupt affordance present
  | 'awaiting-approval' // blocked on a permission/trust prompt — highest urgency
  | 'awaiting-input'    // quiescent at a prompt carrying a pending question
  | 'done'              // quiescent after a turn's output, unacknowledged
  | 'errored'           // non-zero exit, or a fatal error banner while quiescent
  | 'idle'              // quiescent, nothing new since last acknowledge
  | 'exited';           // clean / user-initiated exit

/** Emitted when a session's activity state changes (delta only). */
export interface SessionStateChangeEvent {
  sessionId: string;
  state: SessionActivityState;
  reason?: string; // optional human-readable cause (e.g. matched signal name)
  at: number;      // epoch ms
}

// Claude model types
export type ClaudeModel = 'sonnet' | 'opus' | 'haiku' | 'auto';

// Model preset types
export type ModelPreset = 'cheap' | 'balanced' | 'power';

// Session creation request
export interface SessionCreateRequest {
  name?: string;
  workingDirectory: string;
  permissionMode: PermissionMode;
  model?: ClaudeModel; // Starting model override (defaults to AppSettings.defaultModel)
  worktree?: import('./types/git-types').WorktreeCreateRequest;
  providerId?: ProviderId; // Provider to use (defaults to 'claude')
  launchMode?: LaunchMode; // Per-session launch mode (Claude-specific; other providers ignore this field)
  kind?: SessionKind; // 'shell' spawns a plain terminal with no AI CLI (default 'agent')
  initialPrompt?: string; // Seeded into the terminal at CLI readiness (typed, never auto-submitted)
}

// Session metadata
export interface SessionMetadata {
  id: string;
  name: string;
  workingDirectory: string;
  permissionMode: PermissionMode;
  status: SessionStatus;
  createdAt: number;
  exitCode?: number;
  error?: string; // Failure reason when status === 'error' (e.g. spawn failed)
  teamName?: string;
  agentId?: string;
  agentType?: 'lead' | 'teammate';
  isTeammate?: boolean;
  model?: ClaudeModel; // The model the session was launched with (starting intent; restored on restart)
  launchMode?: LaunchMode; // The launch mode the session was created with (restored on restart)
  currentModel?: ClaudeModel | null; // null = not yet detected (live-detected, distinct from `model`)
  activityState?: SessionActivityState; // Live classifier state (transient — never persisted)
  worktreeInfo?: import('./types/git-types').WorktreeInfo;
  providerId?: ProviderId; // Provider backing this session (defaults to 'claude')
  kind?: SessionKind; // undefined treated as 'agent' for back-compat
  nameIsCustom?: boolean; // true once the user explicitly named the session (create or rename) — blocks title auto-rename
  initialPrompt?: string; // Seeded into the terminal at CLI readiness (typed, never auto-submitted; not persisted)
}

// Session list response
export interface SessionListResponse {
  sessions: SessionMetadata[];
  activeSessionId: string | null;
}

// Session input
export interface SessionInput {
  sessionId: string;
  data: string;
}

// Session output
export interface SessionOutput {
  sessionId: string;
  data: string;
}

// Session resize request
export interface SessionResizeRequest {
  sessionId: string;
  cols: number;
  rows: number;
}

// Session exit event
export interface SessionExitEvent {
  sessionId: string;
  exitCode: number;
}

// Model switch event
export interface ModelSwitchEvent {
  sessionId: string;
  model: ClaudeModel;
  previousModel: ClaudeModel | null;
  detectedAt: number;
}

// Persisted session state
export interface PersistedSessionState {
  version: 1;
  sessions: SessionMetadata[];
  activeSessionId: string | null;
  lastModified: number;
}

// Terminal size
export interface TerminalSize {
  cols: number;
  rows: number;
}

// Workspace definition
export interface Workspace {
  id: string;
  name: string;
  path: string;
  defaultPermissionMode: PermissionMode;
  createdAt: number;
  updatedAt: number;
}

// File categories for drag-drop
export type FileCategory = 'code' | 'markup' | 'document' | 'image' | 'binary' | 'other';

// Drag-drop insert mode
export type DragDropInsertMode = 'path' | 'content' | 'ask';

// Path format for drag-drop
export type PathFormat = 'quoted' | 'unquoted' | 'escaped';

// Multi-file separator
export type MultiFileSeparator = 'space' | 'newline';

// Per-category drag-drop settings
export interface CategoryDragDropSettings {
  insertMode?: DragDropInsertMode;
  maxSizeKB?: number;
}

// Drag-drop settings
export interface DragDropSettings {
  defaultInsertMode: DragDropInsertMode;
  pathFormat: PathFormat;
  multiFileSeparator: MultiFileSeparator;
  maxContentSizeKB: number;
  categoryOverrides: Partial<Record<FileCategory, CategoryDragDropSettings>>;
}

// Split view types
export type SplitDirection = 'horizontal' | 'vertical';

export interface LayoutLeaf {
  type: 'leaf';
  paneId: string;
  sessionId: string | null;
}

export interface LayoutBranch {
  type: 'branch';
  direction: SplitDirection;
  ratio: number; // 0.0-1.0, first child's proportion
  children: [LayoutNode, LayoutNode];
}

export interface LayoutGrid {
  type: 'grid';
  id: string;
  direction: 'horizontal' | 'vertical'; // row or column
  children: LayoutNode[];
  sizes: number[]; // percentage for each child (must sum to 100)
}

export type LayoutNode = LayoutLeaf | LayoutBranch | LayoutGrid;

export interface SplitViewState {
  layout: LayoutNode;
  focusedPaneId: string;
}

// Session pool settings
export interface SessionPoolSettings {
  enabled: boolean;        // Default: true
  poolSize: number;        // 0-3, Default: 1
  maxIdleTimeMs: number;   // Default: 300000 (5 minutes)
}

// App settings
export interface AppSettings {
  version: 1;
  workspaces: Workspace[];
  dragDropSettings?: DragDropSettings;
  splitViewState?: SplitViewState | null;
  sessionPoolSettings?: SessionPoolSettings;
  enableAgentTeams?: boolean;
  autoLayoutTeams?: boolean;
  atlasSettings?: Record<string, unknown>;
  hasLaunchedBefore?: boolean; // Track first launch for Layout Picker
  lastUsedLayoutPresetId?: string; // Track which preset was last applied
  wizardCompleted?: boolean; // Track if welcome wizard has been completed
  tooltipCoachDismissed?: Record<string, boolean>; // Track dismissed tooltip coach hints
  panelHelpDismissed?: Record<string, boolean>; // Track dismissed panel help overlays
  uiMode?: 'beginner' | 'expert'; // UI complexity mode (default: beginner)
  defaultModel?: ClaudeModel; // Default model for new sessions (default: 'sonnet')
  modelPreset?: ModelPreset; // Model preset mode (default: 'balanced')
  gitSettings?: import('./types/git-types').GitSettings;
  worktreeSettings?: import('./types/git-types').WorktreeSettings;
  // Tour persistence
  tourDismissed?: boolean;
  // Wave 05 — focus mode persistence
  focusMode?: boolean;
  // Remote access (serve OmniDesk over a tunnel)
  remoteAccess?: RemoteAccessSettings;
  stt?: STTSettings;
  integrations?: import('./integration-types').IntegrationsSettings;
  quotaAccountMap?: QuotaAccountMapRule[];
}

/**
 * A single rule for mapping a session's working directory to a Claude config
 * directory, used by quota-service's resolveClaudeConfigDir to support
 * multiple Claude accounts on one machine (e.g. separate ~/.claude-work and
 * ~/.claude-personal directories for different repo trees).
 *
 * `pathContains` is matched case-insensitively against the working directory
 * (with backslashes normalized to forward slashes) as a substring. The first
 * matching rule wins; `configDir` may start with `~` to be resolved relative
 * to the user's home directory. When no rule matches (or the map is empty),
 * the default `~/.claude` directory is used.
 */
export interface QuotaAccountMapRule {
  pathContains: string;
  configDir: string;
}

// Remote access persisted settings
export interface RemoteAccessSettings {
  enabled: boolean;
  port: number;
  /** Persisted access token so installed PWAs / saved QRs stay valid across launches. */
  token?: string;
}

export type RemoteTunnelState = 'off' | 'starting' | 'running' | 'error';

// Remote access runtime status (returned by remote:* IPC)
export interface RemoteAccessStatus {
  enabled: boolean;
  port: number;
  token: string;
  /** Local address the server binds; the public address is the tunnel below. */
  url: string;
  /** Managed cloudflared tunnel state + public URL (when running). */
  tunnel: { state: RemoteTunnelState; url?: string; error?: string };
  /** Whether a usable cloudflared binary was found (PATH or managed copy). */
  cloudflaredInstalled: boolean;
}

// ── Speech-to-text (STT) ──
export type STTModel = 'tiny.en' | 'base.en' | 'small.en';

export type STTAvailabilityReason =
  | 'ready'                 // model present + engine healthy
  | 'disabled'              // STTSettings.enabled === false
  | 'model-missing'         // enabled but no model file yet
  | 'downloading'           // model download in progress
  | 'unsupported-platform'  // no prebuilt binding for this platform/arch
  | 'engine-error';         // binding failed to load / repeated crash

export interface STTStatus {
  available: boolean;              // true only when reason === 'ready'
  reason: STTAvailabilityReason;
  model: STTModel;
  modelPresent: boolean;
  downloadProgress?: number;       // 0..1, only while reason === 'downloading'
  error?: string;
}

export interface STTSettings {
  enabled: boolean;                // default false (opt-in)
  model: STTModel;                 // default 'base.en'
  hotkey: string;                  // default 'Ctrl+Shift+Space'
  language: 'auto' | 'en';         // default 'en'
  showButton: boolean;             // default true
}

/** 16 kHz mono Int16 LE PCM samples for one utterance. */
export interface STTTranscribeRequest {
  pcm: ArrayBuffer;
  language?: 'auto' | 'en';
}

export interface STTTranscribeResult {
  text: string;
}

// Workspace create request
export interface WorkspaceCreateRequest {
  name: string;
  path: string;
  defaultPermissionMode: PermissionMode;
}

// Workspace update request
export interface WorkspaceUpdateRequest {
  id: string;
  name?: string;
  path?: string;
  defaultPermissionMode?: PermissionMode;
}

// Workspace validation result
export interface WorkspaceValidationResult {
  valid: boolean;
  error?: 'NOT_FOUND' | 'NOT_DIRECTORY' | 'NO_ACCESS' | 'DUPLICATE_PATH';
  normalizedPath?: string;
}

// Subdirectory entry
export interface SubdirectoryEntry {
  name: string;
  path: string;
}

// Git repository entry — surfaced via fs:listGitRepos.
// A repo is a subdir (any depth, but typically depth 1) of a workspace that
// contains a `.git` directory or file (the file form is used by git worktrees).
export interface GitRepoEntry {
  /** Folder name. Acts as the human-readable label. */
  name: string;
  /** Absolute path to the repo's working tree root. */
  path: string;
  /** Path of the workspace this repo lives under. */
  workspacePath: string;
  /** Current branch name, if cheaply derivable from .git/HEAD; otherwise undefined. */
  branch?: string;
}

// Window state
export interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
  isMaximized: boolean;
}

// Quota bucket
export interface QuotaBucket {
  utilization: number; // 0-1
  resets_at: string;
}

// Claude usage quota
export interface ClaudeUsageQuota {
  five_hour: QuotaBucket;
  seven_day: QuotaBucket;
  lastUpdated: string;
}

// Burn rate data
export interface BurnRateData {
  ratePerHour5h: number | null;   // %/hr of 5h quota
  ratePerHour7d: number | null;   // %/hr of 7d quota
  trend: 'increasing' | 'decreasing' | 'stable' | 'unknown';
  projectedTimeToLimit5h: number | null; // minutes until 100%
  projectedTimeToLimit7d: number | null;
  label: 'on-track' | 'elevated' | 'critical' | 'unknown';
  dataPoints: number;
}

// File info from drag-drop
export interface FileInfo {
  path: string;
  name: string;
  extension: string;
  sizeBytes: number;
  category: FileCategory;
  isBinary: boolean;
  mimeType?: string;
}

// File read result
export interface FileReadResult {
  content: string;
  truncated: boolean;
}

// App version info
export interface AppVersionInfo {
  appVersion: string;
  electronVersion: string;
  nodeVersion: string;
  claudeVersion?: string;
}

// ── Agent Teams types ──

export interface TeamMember {
  name: string;
  agentId: string;
  agentType: 'lead' | 'teammate';
  color?: string;
  model?: string;
}

export interface TeamConfig {
  members: TeamMember[];
}

export interface Task {
  taskId: string;
  subject: string;
  description: string;
  status: 'pending' | 'in_progress' | 'completed';
  owner?: string;
  blockedBy?: string[];
  blocks?: string[];
}

export interface TeamInfo {
  name: string;
  description?: string;
  leadSessionId?: string;
  members: TeamMember[];
  tasks: Task[];
  createdAt: number;
  updatedAt: number;
}

export interface TeammateDetectedEvent {
  teamName: string;
  member: TeamMember;
  sessionId?: string;
}

export interface TasksUpdatedEvent {
  teamName: string;
  tasks: Task[];
}

export interface TeamRemovedEvent {
  teamName: string;
}

// Re-export types from sub-modules for convenience
export type {
  HistorySessionEntry,
  HistorySearchResult,
  HistorySettings,
  HistoryStats,
} from './types/history-types';

export type {
  Checkpoint,
  CheckpointCreateRequest,
  CheckpointExportFormat,
} from './types/checkpoint-types';

export type {
  GitFileStatus,
  GitFileArea,
  GitFileEntry,
  GitBranchInfo,
  GitStatus,
  GitCommitInfo,
  GitDiffResult,
  CommitType,
  CommitConfidence,
  GeneratedCommitMessage,
  GitOperationResult,
  GitErrorCode,
  GitCommitRequest,
  GitRemoteProgress,
  GitSettings,
  WorktreeInfo,
  GitWorktreeEntry,
  WorktreeCreateRequest,
  WorktreeRemoveRequest,
  WorktreeSettings,
  WorktreeErrorCode,
} from './types/git-types';

