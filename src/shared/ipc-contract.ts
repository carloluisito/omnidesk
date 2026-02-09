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

  // ── Session I/O (send — fire-and-forget) ──
  sendSessionInput:    SendContract<'session:input',  [SessionInput]>;
  resizeSession:       SendContract<'session:resize', [SessionResizeRequest]>;
  sessionReady:        SendContract<'session:ready',  [string]>;

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

  // ── Dialogs & File system (invoke) ──
  browseDirectory:     InvokeContract<'dialog:browseDirectory', [],                              string | null>;
  showSaveDialog:      InvokeContract<'dialog:showSaveDialog',  [{ defaultPath?: string; filters?: Array<{ name: string; extensions: string[] }> }], string | null>;
  writeFile:           InvokeContract<'fs:writeFile',            [string, string],                boolean>;
  listSubdirectories:  InvokeContract<'fs:listSubdirectories',   [string],                       SubdirectoryEntry[]>;

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

  // Session I/O
  sendSessionInput:    'session:input',
  resizeSession:       'session:resize',
  sessionReady:        'session:ready',

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

  // Dialogs
  browseDirectory:     'dialog:browseDirectory',
  showSaveDialog:      'dialog:showSaveDialog',
  writeFile:           'fs:writeFile',
  listSubdirectories:  'fs:listSubdirectories',

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

  sendSessionInput:    'send',
  resizeSession:       'send',
  sessionReady:        'send',

  minimizeWindow:      'send',
  maximizeWindow:      'send',
  closeWindow:         'send',

  onSessionCreated:    'event',
  onSessionClosed:     'event',
  onSessionSwitched:   'event',
  onSessionUpdated:    'event',
  onSessionOutput:     'event',
  onSessionExited:     'event',

  browseDirectory:     'invoke',
  showSaveDialog:      'invoke',
  writeFile:           'invoke',
  listSubdirectories:  'invoke',

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
