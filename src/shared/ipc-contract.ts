// @atlas-entrypoint: IPC single source of truth — 149 methods, auto-derives preload bridge and types
/**
 * IPC Contract — Single source of truth for all IPC methods.
 *
 * Adding a new IPC method:
 *   1. Add an entry to IPCContractMap below
 *   2. Add the handler in ipc-handlers.ts using registry.handle() / registry.on()
 *   That's it. The preload bridge and ElectronAPI type are auto-derived.
 */

import type {
  SessionCreateRequest,
  SessionMetadata,
  SessionListResponse,
  SessionOutput,
  SessionExitEvent,
  SessionInput,
  SessionResizeRequest,
  SubdirectoryEntry,
  AppSettings,
  Workspace,
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
  WorkspaceValidationResult,
  ClaudeUsageQuota,
  BurnRateData,
  FileInfo,
  FileReadResult,
  SplitViewState,
  SessionPoolSettings,
  AppVersionInfo,
  TeamInfo,
  TeammateDetectedEvent,
  TasksUpdatedEvent,
  TeamRemovedEvent,
  ClaudeModel,
  ModelSwitchEvent,
} from './ipc-types';

import type {
  PromptTemplate,
  TemplateCreateRequest,
  TemplateUpdateRequest,
} from './types/prompt-templates';

import type {
  HistorySessionEntry,
  HistorySearchResult,
  HistorySettings,
  HistoryStats,
} from './types/history-types';

import type {
  Checkpoint,
  CheckpointCreateRequest,
  CheckpointExportFormat,
} from './types/checkpoint-types';

import type {
  AtlasGenerateRequest,
  AtlasGenerateResult,
  AtlasWriteRequest,
  AtlasWriteResult,
  AtlasStatus,
  AtlasSettings,
  AtlasScanProgress,
} from './types/atlas-types';

import type {
  LayoutPreset,
} from '../types/layout-presets';

import type { LayoutNode } from './ipc-types';

import type {
  GitStatus,
  GitBranchInfo,
  GitCommitInfo,
  GitDiffResult,
  GitOperationResult,
  GitCommitRequest,
  GeneratedCommitMessage,
  GitRemoteProgress,
  GitWorktreeEntry,
  WorktreeCreateRequest,
  WorktreeRemoveRequest,
  WorktreeSettings,
  WorktreeInfo,
} from './types/git-types';

import type {
  Playbook,
  PlaybookRunRequest,
  PlaybookCreateRequest,
  PlaybookUpdateRequest,
  PlaybookExportData,
  PlaybookExecutionState,
  PlaybookStepChangedEvent,
  PlaybookCompletedEvent,
  PlaybookErrorEvent,
} from './types/playbook-types';

// ─── Contract helper types ──────────────────────────────────────────

/** renderer → main, expects a return value (ipcRenderer.invoke / ipcMain.handle) */
export interface InvokeContract<Ch extends string, Args extends unknown[], Ret> {
  kind: 'invoke';
  channel: Ch;
  args: Args;
  return: Ret;
}

/** renderer → main, fire-and-forget (ipcRenderer.send / ipcMain.on) */
export interface SendContract<Ch extends string, Args extends unknown[]> {
  kind: 'send';
  channel: Ch;
  args: Args;
  return: void;
}

/** main → renderer push event (webContents.send / ipcRenderer.on) */
export interface EventContract<Ch extends string, Payload> {
  kind: 'event';
  channel: Ch;
  payload: Payload;
  return: void;
}

// ─── The contract ───────────────────────────────────────────────────

export interface IPCContractMap {
  // ── Session management (invoke) ──
  createSession:       InvokeContract<'session:create',    [SessionCreateRequest],               SessionMetadata>;
  closeSession:        InvokeContract<'session:close',     [string],                             boolean>;
  switchSession:       InvokeContract<'session:switch',    [string],                             boolean>;
  renameSession:       InvokeContract<'session:rename',    [string, string],                     SessionMetadata>;
  listSessions:        InvokeContract<'session:list',      [],                                   SessionListResponse>;
  restartSession:      InvokeContract<'session:restart',   [string],                             boolean>;
  getActiveSession:    InvokeContract<'session:getActive', [],                                   string | null>;
  revealInExplorer:    InvokeContract<'session:revealInExplorer', [string],                      boolean>;

  // ── Session I/O (send — fire-and-forget) ──
  sendSessionInput:    SendContract<'session:input',  [SessionInput]>;
  resizeSession:       SendContract<'session:resize', [SessionResizeRequest]>;
  sessionReady:        SendContract<'session:ready',  [string]>;

  // ── Model switching (invoke) ──
  switchModel:         InvokeContract<'model:switch', [string, ClaudeModel], boolean>;

  // ── Model History (invoke) ──
  getModelHistory:     InvokeContract<'model:getHistory',   [string], import('../main/model-history-manager').ModelSwitchHistoryEntry[]>;
  clearModelHistory:   InvokeContract<'model:clearHistory', [string], boolean>;

  // ── Window controls (send) ──
  minimizeWindow:      SendContract<'window:minimize', []>;
  maximizeWindow:      SendContract<'window:maximize', []>;
  closeWindow:         SendContract<'window:close',    []>;

  // ── Session events (main→renderer) ──
  onSessionCreated:    EventContract<'session:created',  SessionMetadata>;
  onSessionClosed:     EventContract<'session:closed',   string>;
  onSessionSwitched:   EventContract<'session:switched',  string>;
  onSessionUpdated:    EventContract<'session:updated',  SessionMetadata>;
  onSessionOutput:     EventContract<'session:output',   SessionOutput>;
  onSessionExited:     EventContract<'session:exited',   SessionExitEvent>;
  onModelChanged:      EventContract<'model:changed',    ModelSwitchEvent>;

  // ── Dialogs & File system (invoke) ──
  browseDirectory:     InvokeContract<'dialog:browseDirectory', [],                              string | null>;
  showSaveDialog:      InvokeContract<'dialog:showSaveDialog',  [{ defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }], string | null>;
  writeFile:           InvokeContract<'fs:writeFile',            [string, string],                boolean>;
  listSubdirectories:  InvokeContract<'fs:listSubdirectories',   [string],                       SubdirectoryEntry[]>;
  createDirectory:     InvokeContract<'fs:createDirectory',      [string],                       boolean>;

  // ── Settings & Workspaces (invoke) ──
  getSettings:         InvokeContract<'settings:get',            [],                              AppSettings>;
  listWorkspaces:      InvokeContract<'workspace:list',          [],                              Workspace[]>;
  addWorkspace:        InvokeContract<'workspace:add',           [WorkspaceCreateRequest],        Workspace>;
  updateWorkspace:     InvokeContract<'workspace:update',        [WorkspaceUpdateRequest],        Workspace>;
  deleteWorkspace:     InvokeContract<'workspace:delete',        [string],                        boolean>;
  validateWorkspacePath: InvokeContract<'workspace:validate',    [string, string?],               WorkspaceValidationResult>;

  // ── Split View (invoke) ──
  updateSplitViewState: InvokeContract<'settings:updateSplitView', [SplitViewState | null],       void>;

  // ── Session Pool (invoke) ──
  updateSessionPoolSettings: InvokeContract<'settings:updateSessionPool',      [Partial<SessionPoolSettings>], SessionPoolSettings>;
  getSessionPoolStatus:      InvokeContract<'settings:getSessionPoolStatus',   [],                              { idleCount: number; enabled: boolean; size: number }>;

  // ── Quota/Budget (invoke) ──
  getQuota:            InvokeContract<'quota:get',        [boolean?],                            ClaudeUsageQuota | null>;
  refreshQuota:        InvokeContract<'quota:refresh',    [],                                    ClaudeUsageQuota | null>;
  getBurnRate:         InvokeContract<'burnRate:get',     [],                                    BurnRateData>;

  // ── Prompt Templates (invoke) ──
  listAllTemplates:    InvokeContract<'template:listAll',  [],                                   PromptTemplate[]>;
  listUserTemplates:   InvokeContract<'template:listUser', [],                                   PromptTemplate[]>;
  getTemplate:         InvokeContract<'template:get',      [string],                             PromptTemplate | null>;
  addTemplate:         InvokeContract<'template:add',      [TemplateCreateRequest],              PromptTemplate>;
  updateTemplate:      InvokeContract<'template:update',   [TemplateUpdateRequest],              PromptTemplate>;
  deleteTemplate:      InvokeContract<'template:delete',   [string],                             boolean>;

  // ── File Drag-and-Drop (invoke) ──
  getFileInfo:         InvokeContract<'dragdrop:getFileInfo',  [string[]],                       FileInfo[]>;
  readFileContent:     InvokeContract<'dragdrop:readFile',     [string, number],                 FileReadResult>;

  // ── Session History (invoke) ──
  listHistory:         InvokeContract<'history:list',            [],                              HistorySessionEntry[]>;
  getHistory:          InvokeContract<'history:get',             [string],                        string>;
  searchHistory:       InvokeContract<'history:search',          [string, boolean?],              HistorySearchResult[]>;
  deleteHistory:       InvokeContract<'history:delete',          [string],                        boolean>;
  deleteAllHistory:    InvokeContract<'history:deleteAll',       [],                              boolean>;
  exportHistoryMarkdown: InvokeContract<'history:exportMarkdown', [string, string],              boolean>;
  exportHistoryJson:   InvokeContract<'history:exportJson',      [string, string],               boolean>;
  getHistorySettings:  InvokeContract<'history:getSettings',     [],                             HistorySettings>;
  updateHistorySettings: InvokeContract<'history:updateSettings', [Partial<HistorySettings>],    boolean>;
  getHistoryStats:     InvokeContract<'history:getStats',        [],                             HistoryStats>;

  // ── Checkpoints (invoke) ──
  createCheckpoint:    InvokeContract<'checkpoint:create',    [CheckpointCreateRequest],         Checkpoint>;
  listCheckpoints:     InvokeContract<'checkpoint:list',      [string?],                         Checkpoint[]>;
  getCheckpoint:       InvokeContract<'checkpoint:get',       [string],                          Checkpoint | null>;
  deleteCheckpoint:    InvokeContract<'checkpoint:delete',    [string],                          boolean>;
  updateCheckpoint:    InvokeContract<'checkpoint:update',    [string, Partial<Pick<Checkpoint, 'name' | 'description' | 'tags' | 'isTemplate'>>], Checkpoint | null>;
  exportCheckpoint:    InvokeContract<'checkpoint:export',    [string, CheckpointExportFormat],  string>;
  getCheckpointCount:  InvokeContract<'checkpoint:getCount',  [string],                          number>;

  // ── Checkpoint events (main→renderer) ──
  onCheckpointCreated: EventContract<'checkpoint:created', Checkpoint>;
  onCheckpointDeleted: EventContract<'checkpoint:deleted', string>;

  // ── Agent Teams (invoke) ──
  getTeams:            InvokeContract<'teams:getAll',         [],                                 TeamInfo[]>;
  getTeamForSession:   InvokeContract<'teams:getForSession',  [string],                           TeamInfo | null>;
  getTeamSessions:     InvokeContract<'teams:getSessions',    [string],                           SessionMetadata[]>;
  linkSessionToTeam:   InvokeContract<'teams:linkSession',    [string, string, string],            boolean>;
  unlinkSessionFromTeam: InvokeContract<'teams:unlinkSession', [string],                          boolean>;
  closeTeam:           InvokeContract<'teams:close',          [string],                           boolean>;
  updateEnableAgentTeams: InvokeContract<'settings:updateEnableAgentTeams', [boolean],             boolean>;
  updateAutoLayoutTeams: InvokeContract<'settings:updateAutoLayout', [boolean],                   boolean>;
  updateUIMode:          InvokeContract<'settings:updateUIMode',     ['beginner' | 'expert'],     boolean>;
  updateDefaultModel:    InvokeContract<'settings:updateDefaultModel', [ClaudeModel],              boolean>;

  // ── Agent Teams events (main→renderer) ──
  onTeamDetected:      EventContract<'teams:detected',        TeamInfo>;
  onTeammateAdded:     EventContract<'teams:teammateAdded',   TeammateDetectedEvent>;
  onTasksUpdated:      EventContract<'teams:tasksUpdated',    TasksUpdatedEvent>;
  onTeamRemoved:       EventContract<'teams:removed',         TeamRemovedEvent>;

  // ── Repository Atlas (invoke) ──
  generateAtlas:       InvokeContract<'atlas:generate',       [AtlasGenerateRequest],             AtlasGenerateResult>;
  writeAtlas:          InvokeContract<'atlas:write',          [AtlasWriteRequest],                AtlasWriteResult>;
  getAtlasStatus:      InvokeContract<'atlas:getStatus',      [string],                           AtlasStatus>;
  getAtlasSettings:    InvokeContract<'atlas:getSettings',    [],                                 AtlasSettings>;
  updateAtlasSettings: InvokeContract<'atlas:updateSettings', [Partial<AtlasSettings>],           AtlasSettings>;

  // ── Command Registry (invoke) ──
  searchCommands:      InvokeContract<'commands:search',      [string, number?],                  import('./types/command-types').CommandSearchResult[]>;
  getAllCommands:      InvokeContract<'commands:getAll',      [],                                 import('./types/command-types').CommandRegistryData>;
  executeCommand:      InvokeContract<'commands:execute',     [string, any[]?],                   boolean>;

  // ── Repository Atlas events (main→renderer) ──
  onAtlasScanProgress: EventContract<'atlas:scanProgress', AtlasScanProgress>;

  // ── Layout Presets (invoke) ──
  getLayoutPresets:    InvokeContract<'layout:getPresets',    [],                                 LayoutPreset[]>;
  applyLayoutPreset:   InvokeContract<'layout:apply',         [string],                           boolean>;
  applyCustomLayout:   InvokeContract<'layout:applyCustom',   [number, number],                   boolean>;
  getCurrentLayout:    InvokeContract<'layout:getCurrent',    [],                                 LayoutNode>;

  // ── Git Integration (invoke) ──
  getGitStatus:        InvokeContract<'git:status',          [string],                              GitStatus>;
  getGitBranches:      InvokeContract<'git:branches',        [string],                              GitBranchInfo[]>;
  gitStageFiles:       InvokeContract<'git:stage',           [string, string[]],                    GitOperationResult>;
  gitUnstageFiles:     InvokeContract<'git:unstage',         [string, string[]],                    GitOperationResult>;
  gitStageAll:         InvokeContract<'git:stageAll',        [string],                              GitOperationResult>;
  gitUnstageAll:       InvokeContract<'git:unstageAll',      [string],                              GitOperationResult>;
  gitCommit:           InvokeContract<'git:commit',          [GitCommitRequest],                    GitOperationResult>;
  gitGenerateMessage:  InvokeContract<'git:generateMessage', [string],                              GeneratedCommitMessage>;
  gitPush:             InvokeContract<'git:push',            [string, boolean?],                    GitOperationResult>;
  gitPull:             InvokeContract<'git:pull',            [string],                              GitOperationResult>;
  gitFetch:            InvokeContract<'git:fetch',           [string],                              GitOperationResult>;
  gitSwitchBranch:     InvokeContract<'git:switchBranch',    [string, string],                      GitOperationResult>;
  gitCreateBranch:     InvokeContract<'git:createBranch',    [string, string],                      GitOperationResult>;
  gitLog:              InvokeContract<'git:log',             [string, number?],                     GitCommitInfo[]>;
  gitDiff:             InvokeContract<'git:diff',            [string, string, boolean],             GitDiffResult>;
  gitCommitDiff:       InvokeContract<'git:commitDiff',      [string, string],                      GitCommitInfo>;
  gitFileContent:      InvokeContract<'git:fileContent',      [string, string],                      GitDiffResult>;
  gitDiscardFile:      InvokeContract<'git:discardFile',     [string, string],                      GitOperationResult>;
  gitDiscardAll:       InvokeContract<'git:discardAll',      [string],                              GitOperationResult>;
  gitInit:             InvokeContract<'git:init',            [string],                              GitOperationResult>;
  gitStartWatching:    InvokeContract<'git:startWatching',   [string],                              boolean>;
  gitStopWatching:     InvokeContract<'git:stopWatching',    [string],                              boolean>;

  // ── Git Worktrees (invoke) ──
  gitWorktreeList:       InvokeContract<'git:worktreeList',       [string],                              GitWorktreeEntry[]>;
  gitWorktreeAdd:        InvokeContract<'git:worktreeAdd',        [WorktreeCreateRequest],               GitOperationResult & { worktreePath?: string }>;
  gitWorktreeRemove:     InvokeContract<'git:worktreeRemove',     [WorktreeRemoveRequest],               GitOperationResult>;
  gitWorktreePrune:      InvokeContract<'git:worktreePrune',      [string],                              GitOperationResult>;
  getWorktreeSettings:   InvokeContract<'git:getWorktreeSettings', [],                                   WorktreeSettings>;
  updateWorktreeSettings: InvokeContract<'git:updateWorktreeSettings', [Partial<WorktreeSettings>],      WorktreeSettings>;

  // ── Git events (main→renderer) ──
  onGitStatusChanged:  EventContract<'git:statusChanged',    GitStatus>;
  onGitRemoteProgress: EventContract<'git:remoteProgress',   GitRemoteProgress>;
  onWorktreeCreated:   EventContract<'git:worktreeCreated',  WorktreeInfo>;
  onWorktreeRemoved:   EventContract<'git:worktreeRemoved',  string>;

  // ── Session Playbooks (invoke) ──
  listPlaybooks:       InvokeContract<'playbook:list',        [],                                  Playbook[]>;
  getPlaybook:         InvokeContract<'playbook:get',         [string],                            Playbook | null>;
  addPlaybook:         InvokeContract<'playbook:add',         [PlaybookCreateRequest],             Playbook>;
  updatePlaybook:      InvokeContract<'playbook:update',      [PlaybookUpdateRequest],             Playbook>;
  deletePlaybook:      InvokeContract<'playbook:delete',      [string],                            boolean>;
  importPlaybook:      InvokeContract<'playbook:import',      [PlaybookExportData],                Playbook>;
  exportPlaybook:      InvokeContract<'playbook:export',      [string],                            PlaybookExportData>;
  duplicatePlaybook:   InvokeContract<'playbook:duplicate',   [string],                            Playbook>;
  runPlaybook:         InvokeContract<'playbook:run',         [PlaybookRunRequest],                PlaybookExecutionState>;
  cancelPlaybook:      InvokeContract<'playbook:cancel',      [string],                            boolean>;
  confirmPlaybook:     InvokeContract<'playbook:confirm',     [string],                            boolean>;
  getPlaybookExecution: InvokeContract<'playbook:getExecution', [string],                          PlaybookExecutionState | null>;

  // ── Session Playbooks events (main→renderer) ──
  onPlaybookStepChanged: EventContract<'playbook:stepChanged', PlaybookStepChangedEvent>;
  onPlaybookCompleted:   EventContract<'playbook:completed',   PlaybookCompletedEvent>;
  onPlaybookError:       EventContract<'playbook:error',       PlaybookErrorEvent>;

  // ── App info (invoke) ──
  getVersionInfo:      InvokeContract<'app:getVersionInfo', [],                                  AppVersionInfo>;
}

// ─── Runtime channel map ────────────────────────────────────────────

type ChannelOf<K extends keyof IPCContractMap> = IPCContractMap[K]['channel'];

/** Runtime lookup: method name → channel string */
export const channels: { [K in keyof IPCContractMap]: ChannelOf<K> } = {
  // Session management
  createSession:       'session:create',
  closeSession:        'session:close',
  switchSession:       'session:switch',
  renameSession:       'session:rename',
  listSessions:        'session:list',
  restartSession:      'session:restart',
  getActiveSession:    'session:getActive',
  revealInExplorer:    'session:revealInExplorer',

  // Session I/O
  sendSessionInput:    'session:input',
  resizeSession:       'session:resize',
  sessionReady:        'session:ready',

  // Model switching
  switchModel:         'model:switch',

  // Model History
  getModelHistory:     'model:getHistory',
  clearModelHistory:   'model:clearHistory',

  // Window controls
  minimizeWindow:      'window:minimize',
  maximizeWindow:      'window:maximize',
  closeWindow:         'window:close',

  // Session events
  onSessionCreated:    'session:created',
  onSessionClosed:     'session:closed',
  onSessionSwitched:   'session:switched',
  onSessionUpdated:    'session:updated',
  onSessionOutput:     'session:output',
  onSessionExited:     'session:exited',
  onModelChanged:      'model:changed',

  // Dialogs
  browseDirectory:     'dialog:browseDirectory',
  showSaveDialog:      'dialog:showSaveDialog',
  writeFile:           'fs:writeFile',
  listSubdirectories:  'fs:listSubdirectories',
  createDirectory:     'fs:createDirectory',

  // Settings & Workspaces
  getSettings:         'settings:get',
  listWorkspaces:      'workspace:list',
  addWorkspace:        'workspace:add',
  updateWorkspace:     'workspace:update',
  deleteWorkspace:     'workspace:delete',
  validateWorkspacePath: 'workspace:validate',

  // Split View
  updateSplitViewState: 'settings:updateSplitView',

  // Session Pool
  updateSessionPoolSettings: 'settings:updateSessionPool',
  getSessionPoolStatus:      'settings:getSessionPoolStatus',

  // Quota
  getQuota:            'quota:get',
  refreshQuota:        'quota:refresh',
  getBurnRate:         'burnRate:get',

  // Templates
  listAllTemplates:    'template:listAll',
  listUserTemplates:   'template:listUser',
  getTemplate:         'template:get',
  addTemplate:         'template:add',
  updateTemplate:      'template:update',
  deleteTemplate:      'template:delete',

  // Drag-Drop
  getFileInfo:         'dragdrop:getFileInfo',
  readFileContent:     'dragdrop:readFile',

  // History
  listHistory:         'history:list',
  getHistory:          'history:get',
  searchHistory:       'history:search',
  deleteHistory:       'history:delete',
  deleteAllHistory:    'history:deleteAll',
  exportHistoryMarkdown: 'history:exportMarkdown',
  exportHistoryJson:   'history:exportJson',
  getHistorySettings:  'history:getSettings',
  updateHistorySettings: 'history:updateSettings',
  getHistoryStats:     'history:getStats',

  // Checkpoints
  createCheckpoint:    'checkpoint:create',
  listCheckpoints:     'checkpoint:list',
  getCheckpoint:       'checkpoint:get',
  deleteCheckpoint:    'checkpoint:delete',
  updateCheckpoint:    'checkpoint:update',
  exportCheckpoint:    'checkpoint:export',
  getCheckpointCount:  'checkpoint:getCount',

  // Checkpoint events
  onCheckpointCreated: 'checkpoint:created',
  onCheckpointDeleted: 'checkpoint:deleted',

  // Agent Teams
  getTeams:            'teams:getAll',
  getTeamForSession:   'teams:getForSession',
  getTeamSessions:     'teams:getSessions',
  linkSessionToTeam:   'teams:linkSession',
  unlinkSessionFromTeam: 'teams:unlinkSession',
  closeTeam:           'teams:close',
  updateEnableAgentTeams: 'settings:updateEnableAgentTeams',
  updateAutoLayoutTeams: 'settings:updateAutoLayout',
  updateUIMode:          'settings:updateUIMode',
  updateDefaultModel:    'settings:updateDefaultModel',

  // Agent Teams events
  onTeamDetected:      'teams:detected',
  onTeammateAdded:     'teams:teammateAdded',
  onTasksUpdated:      'teams:tasksUpdated',
  onTeamRemoved:       'teams:removed',

  // Repository Atlas
  generateAtlas:       'atlas:generate',
  writeAtlas:          'atlas:write',
  getAtlasStatus:      'atlas:getStatus',
  getAtlasSettings:    'atlas:getSettings',
  updateAtlasSettings: 'atlas:updateSettings',

  // Command Registry
  searchCommands:      'commands:search',
  getAllCommands:      'commands:getAll',
  executeCommand:      'commands:execute',

  // Repository Atlas events
  onAtlasScanProgress: 'atlas:scanProgress',

  // Layout Presets
  getLayoutPresets:    'layout:getPresets',
  applyLayoutPreset:   'layout:apply',
  applyCustomLayout:   'layout:applyCustom',
  getCurrentLayout:    'layout:getCurrent',

  // Git Integration
  getGitStatus:        'git:status',
  getGitBranches:      'git:branches',
  gitStageFiles:       'git:stage',
  gitUnstageFiles:     'git:unstage',
  gitStageAll:         'git:stageAll',
  gitUnstageAll:       'git:unstageAll',
  gitCommit:           'git:commit',
  gitGenerateMessage:  'git:generateMessage',
  gitPush:             'git:push',
  gitPull:             'git:pull',
  gitFetch:            'git:fetch',
  gitSwitchBranch:     'git:switchBranch',
  gitCreateBranch:     'git:createBranch',
  gitLog:              'git:log',
  gitDiff:             'git:diff',
  gitCommitDiff:       'git:commitDiff',
  gitFileContent:      'git:fileContent',
  gitDiscardFile:      'git:discardFile',
  gitDiscardAll:       'git:discardAll',
  gitInit:             'git:init',
  gitStartWatching:    'git:startWatching',
  gitStopWatching:     'git:stopWatching',

  // Git Worktrees
  gitWorktreeList:       'git:worktreeList',
  gitWorktreeAdd:        'git:worktreeAdd',
  gitWorktreeRemove:     'git:worktreeRemove',
  gitWorktreePrune:      'git:worktreePrune',
  getWorktreeSettings:   'git:getWorktreeSettings',
  updateWorktreeSettings: 'git:updateWorktreeSettings',

  // Git events
  onGitStatusChanged:  'git:statusChanged',
  onGitRemoteProgress: 'git:remoteProgress',
  onWorktreeCreated:   'git:worktreeCreated',
  onWorktreeRemoved:   'git:worktreeRemoved',

  // Session Playbooks
  listPlaybooks:       'playbook:list',
  getPlaybook:         'playbook:get',
  addPlaybook:         'playbook:add',
  updatePlaybook:      'playbook:update',
  deletePlaybook:      'playbook:delete',
  importPlaybook:      'playbook:import',
  exportPlaybook:      'playbook:export',
  duplicatePlaybook:   'playbook:duplicate',
  runPlaybook:         'playbook:run',
  cancelPlaybook:      'playbook:cancel',
  confirmPlaybook:     'playbook:confirm',
  getPlaybookExecution: 'playbook:getExecution',
  onPlaybookStepChanged: 'playbook:stepChanged',
  onPlaybookCompleted:   'playbook:completed',
  onPlaybookError:       'playbook:error',

  // App info
  getVersionInfo:      'app:getVersionInfo',
};

// ─── Runtime kind map ───────────────────────────────────────────────

type KindOf<K extends keyof IPCContractMap> = IPCContractMap[K]['kind'];

/** Runtime lookup: method name → 'invoke' | 'send' | 'event' */
export const contractKinds: { [K in keyof IPCContractMap]: KindOf<K> } = {
  createSession:       'invoke',
  closeSession:        'invoke',
  switchSession:       'invoke',
  renameSession:       'invoke',
  listSessions:        'invoke',
  restartSession:      'invoke',
  getActiveSession:    'invoke',
  revealInExplorer:    'invoke',

  sendSessionInput:    'send',
  resizeSession:       'send',
  sessionReady:        'send',

  switchModel:         'invoke',

  getModelHistory:     'invoke',
  clearModelHistory:   'invoke',

  minimizeWindow:      'send',
  maximizeWindow:      'send',
  closeWindow:         'send',

  onSessionCreated:    'event',
  onSessionClosed:     'event',
  onSessionSwitched:   'event',
  onSessionUpdated:    'event',
  onSessionOutput:     'event',
  onSessionExited:     'event',
  onModelChanged:      'event',

  browseDirectory:     'invoke',
  showSaveDialog:      'invoke',
  writeFile:           'invoke',
  listSubdirectories:  'invoke',
  createDirectory:     'invoke',

  getSettings:         'invoke',
  listWorkspaces:      'invoke',
  addWorkspace:        'invoke',
  updateWorkspace:     'invoke',
  deleteWorkspace:     'invoke',
  validateWorkspacePath: 'invoke',

  updateSplitViewState: 'invoke',

  updateSessionPoolSettings: 'invoke',
  getSessionPoolStatus:      'invoke',

  getQuota:            'invoke',
  refreshQuota:        'invoke',
  getBurnRate:         'invoke',

  listAllTemplates:    'invoke',
  listUserTemplates:   'invoke',
  getTemplate:         'invoke',
  addTemplate:         'invoke',
  updateTemplate:      'invoke',
  deleteTemplate:      'invoke',

  searchCommands:      'invoke',
  getAllCommands:      'invoke',
  executeCommand:      'invoke',

  getFileInfo:         'invoke',
  readFileContent:     'invoke',

  listHistory:         'invoke',
  getHistory:          'invoke',
  searchHistory:       'invoke',
  deleteHistory:       'invoke',
  deleteAllHistory:    'invoke',
  exportHistoryMarkdown: 'invoke',
  exportHistoryJson:   'invoke',
  getHistorySettings:  'invoke',
  updateHistorySettings: 'invoke',
  getHistoryStats:     'invoke',

  createCheckpoint:    'invoke',
  listCheckpoints:     'invoke',
  getCheckpoint:       'invoke',
  deleteCheckpoint:    'invoke',
  updateCheckpoint:    'invoke',
  exportCheckpoint:    'invoke',
  getCheckpointCount:  'invoke',

  onCheckpointCreated: 'event',
  onCheckpointDeleted: 'event',

  getTeams:            'invoke',
  getTeamForSession:   'invoke',
  getTeamSessions:     'invoke',
  linkSessionToTeam:   'invoke',
  unlinkSessionFromTeam: 'invoke',
  closeTeam:           'invoke',
  updateEnableAgentTeams: 'invoke',
  updateAutoLayoutTeams: 'invoke',
  updateUIMode:          'invoke',
  updateDefaultModel:    'invoke',

  onTeamDetected:      'event',
  onTeammateAdded:     'event',
  onTasksUpdated:      'event',
  onTeamRemoved:       'event',

  generateAtlas:       'invoke',
  writeAtlas:          'invoke',
  getAtlasStatus:      'invoke',
  getAtlasSettings:    'invoke',
  updateAtlasSettings: 'invoke',

  onAtlasScanProgress: 'event',

  getLayoutPresets:    'invoke',
  applyLayoutPreset:   'invoke',
  applyCustomLayout:   'invoke',
  getCurrentLayout:    'invoke',

  // Git Integration
  getGitStatus:        'invoke',
  getGitBranches:      'invoke',
  gitStageFiles:       'invoke',
  gitUnstageFiles:     'invoke',
  gitStageAll:         'invoke',
  gitUnstageAll:       'invoke',
  gitCommit:           'invoke',
  gitGenerateMessage:  'invoke',
  gitPush:             'invoke',
  gitPull:             'invoke',
  gitFetch:            'invoke',
  gitSwitchBranch:     'invoke',
  gitCreateBranch:     'invoke',
  gitLog:              'invoke',
  gitDiff:             'invoke',
  gitCommitDiff:       'invoke',
  gitFileContent:      'invoke',
  gitDiscardFile:      'invoke',
  gitDiscardAll:       'invoke',
  gitInit:             'invoke',
  gitStartWatching:    'invoke',
  gitStopWatching:     'invoke',
  gitWorktreeList:       'invoke',
  gitWorktreeAdd:        'invoke',
  gitWorktreeRemove:     'invoke',
  gitWorktreePrune:      'invoke',
  getWorktreeSettings:   'invoke',
  updateWorktreeSettings: 'invoke',
  onGitStatusChanged:  'event',
  onGitRemoteProgress: 'event',
  onWorktreeCreated:   'event',
  onWorktreeRemoved:   'event',

  // Session Playbooks
  listPlaybooks:       'invoke',
  getPlaybook:         'invoke',
  addPlaybook:         'invoke',
  updatePlaybook:      'invoke',
  deletePlaybook:      'invoke',
  importPlaybook:      'invoke',
  exportPlaybook:      'invoke',
  duplicatePlaybook:   'invoke',
  runPlaybook:         'invoke',
  cancelPlaybook:      'invoke',
  confirmPlaybook:     'invoke',
  getPlaybookExecution: 'invoke',
  onPlaybookStepChanged: 'event',
  onPlaybookCompleted:   'event',
  onPlaybookError:       'event',

  getVersionInfo:      'invoke',
};

// ─── Derived ElectronAPI type ───────────────────────────────────────

/** Extract the public API shape for each method kind */
type APIMethod<C extends IPCContractMap[keyof IPCContractMap]> =
  C extends InvokeContract<string, infer A, infer R>
    ? (...args: A) => Promise<R>
    : C extends SendContract<string, infer A>
      ? (...args: A) => void
      : C extends EventContract<string, infer P>
        ? (callback: (payload: P) => void) => () => void
        : never;

/**
 * Auto-derived from IPCContractMap.
 *
 * IMPORTANT: The preload bridge packs multi-arg send methods into objects.
 * `sendSessionInput(sessionId, data)` and `resizeSession(sessionId, cols, rows)`
 * are special-cased in the bridge to keep the renderer call-site ergonomic
 * while sending a single object arg over IPC.
 */
export type DerivedElectronAPI = {
  [K in keyof IPCContractMap]: APIMethod<IPCContractMap[K]>;
} & {
  // Override send methods with ergonomic multi-arg signatures for renderer
  sendSessionInput: (sessionId: string, data: string) => void;
  resizeSession: (sessionId: string, cols: number, rows: number) => void;
};

declare global {
  interface Window {
    electronAPI: DerivedElectronAPI;
  }
}
