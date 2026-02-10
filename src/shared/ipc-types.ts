// Permission mode for sessions
export type PermissionMode = 'standard' | 'skip-permissions';

// Session status
export type SessionStatus = 'starting' | 'running' | 'exited' | 'error';

// Session creation request
export interface SessionCreateRequest {
  name?: string;
  workingDirectory: string;
  permissionMode: PermissionMode;
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
  teamName?: string;
  agentId?: string;
  agentType?: 'lead' | 'teammate';
  isTeammate?: boolean;
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

export type LayoutNode = LayoutLeaf | LayoutBranch;

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
  autoLayoutTeams?: boolean;
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
  PromptTemplate,
  TemplateCreateRequest,
  TemplateUpdateRequest,
} from './types/prompt-templates';

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

