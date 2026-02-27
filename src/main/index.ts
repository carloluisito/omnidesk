// @atlas-entrypoint: Main process — creates window, initializes all 8 managers, wires IPC
import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { CONFIG_DIR, ensureConfigDir, migrateFromLegacy } from './config-dir';
import { SessionManager } from './session-manager';
import { SessionPool } from './session-pool';
import { SettingsManager } from './settings-persistence';
import { PromptTemplatesManager } from './prompt-templates-manager';
import { HistoryManager } from './history-manager';
import { CheckpointManager } from './checkpoint-manager';
import { AgentTeamManager } from './agent-team-manager';
import { AtlasManager } from './atlas-manager';
import { LayoutPresetsManager } from './layout-presets-manager';
import { CommandRegistry } from './command-registry';
import { ModelHistoryManager } from './model-history-manager';
import { GitManager } from './git-manager';
import { PlaybookManager } from './playbook-manager';
import { PlaybookExecutor } from './playbook-executor';
import { TunnelManager } from './tunnel-manager';
import { ProviderRegistry } from './providers/provider-registry';
import { SharingManager } from './sharing-manager';
import { IPCEmitter } from './ipc-emitter';
import { setupIPCHandlers, removeIPCHandlers } from './ipc-handlers';
import { WindowState } from '../shared/ipc-types';

// Prevent EPIPE crashes when stdout/stderr pipe breaks (e.g., renderer window closes while PTY is active)
process.stdout?.on?.('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });
process.stderr?.on?.('error', (err: NodeJS.ErrnoException) => { if (err.code !== 'EPIPE') throw err; });

// Check for dev mode via environment variable or if dist files don't exist
const isDev = process.env.ELECTRON_IS_DEV === 'true' ||
  (!app.isPackaged && !fs.existsSync(path.join(__dirname, '../renderer/index.html')));

let mainWindow: BrowserWindow | null = null;
let sessionManager: SessionManager | null = null;
let sessionPool: SessionPool | null = null;
let settingsManager: SettingsManager | null = null;
let templatesManager: PromptTemplatesManager | null = null;
let historyManager: HistoryManager | null = null;
let checkpointManager: CheckpointManager | null = null;
let agentTeamManager: AgentTeamManager | null = null;
let atlasManager: AtlasManager | null = null;
let layoutPresetsManager: LayoutPresetsManager | null = null;
let commandRegistry: CommandRegistry | null = null;
let modelHistoryManager: ModelHistoryManager | null = null;
let gitManager: GitManager | null = null;
let playbookManager: PlaybookManager | null = null;
let playbookExecutor: PlaybookExecutor | null = null;
let tunnelManager: TunnelManager | null = null;
let providerRegistry: ProviderRegistry | null = null;
let sharingManager: SharingManager | null = null;

const WINDOW_STATE_FILE = path.join(CONFIG_DIR, 'window-state.json');

function loadWindowState(): WindowState | null {
  try {
    if (fs.existsSync(WINDOW_STATE_FILE)) {
      const data = fs.readFileSync(WINDOW_STATE_FILE, 'utf-8');
      return JSON.parse(data) as WindowState;
    }
  } catch (err) {
    console.error('Failed to load window state:', err);
  }
  return null;
}

function saveWindowState(window: BrowserWindow): void {
  if (window.isDestroyed()) return;

  const bounds = window.getBounds();
  const state: WindowState = {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height,
    isMaximized: window.isMaximized(),
  };

  try {
    ensureConfigDir();
    fs.writeFileSync(WINDOW_STATE_FILE, JSON.stringify(state, null, 2));
  } catch (err) {
    console.error('Failed to save window state:', err);
  }
}

function getDefaultWindowState(): WindowState {
  const { width, height } = screen.getPrimaryDisplay().workAreaSize;
  return {
    x: Math.round((width - 1200) / 2),
    y: Math.round((height - 800) / 2),
    width: 1200,
    height: 800,
    isMaximized: false,
  };
}

function createWindow(): void {
  const savedState = loadWindowState();
  const windowState = savedState || getDefaultWindowState();

  mainWindow = new BrowserWindow({
    x: windowState.x,
    y: windowState.y,
    width: windowState.width,
    height: windowState.height,
    minWidth: 600,
    minHeight: 400,
    backgroundColor: '#1a1b26',
    titleBarStyle: 'hidden',
    titleBarOverlay: {
      color: '#1a1b26',
      symbolColor: '#a9b1d6',
      height: 36,
    },
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload', 'index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // Required for node-pty IPC
    },
  });

  if (windowState.isMaximized) {
    mainWindow.maximize();
  }

  // Initialize managers
  settingsManager = new SettingsManager();
  layoutPresetsManager = new LayoutPresetsManager(settingsManager);
  templatesManager = new PromptTemplatesManager();
  historyManager = new HistoryManager();
  checkpointManager = new CheckpointManager(historyManager);
  modelHistoryManager = new ModelHistoryManager();

  // Create session pool with config
  const poolSettings = settingsManager.getSessionPoolSettings();
  sessionPool = new SessionPool({
    size: poolSettings.poolSize,
    enabled: poolSettings.enabled,
    maxIdleTimeMs: poolSettings.maxIdleTimeMs,
  });

  // Create session manager with pool reference
  sessionManager = new SessionManager(historyManager, sessionPool);
  sessionManager.setModelHistoryManager(modelHistoryManager);
  sessionManager.initialize();

  // Validate split view state against current sessions
  const sessionList = sessionManager.listSessions();
  const validSessionIds = sessionList.sessions.map(s => s.id);
  settingsManager.validateSplitViewState(validSessionIds);

  // Initialize atlas manager
  atlasManager = new AtlasManager();
  atlasManager.setMainWindow(mainWindow);

  // Initialize git manager
  gitManager = new GitManager(checkpointManager);
  gitManager.setMainWindow(mainWindow);

  // Wire git manager into session manager for worktree support
  sessionManager.setGitManager(gitManager);
  sessionManager.setWorktreeSettings(settingsManager.getWorktreeSettings());

  // Wire agent teams getter into session manager and session pool
  sessionManager.setAgentTeamsGetter(() => settingsManager!.getEnableAgentTeams());
  sessionPool.setAgentTeamsGetter(() => settingsManager!.getEnableAgentTeams());

  // Initialize playbook manager + executor
  playbookManager = new PlaybookManager();
  playbookExecutor = new PlaybookExecutor(sessionManager, checkpointManager, playbookManager);

  // Initialize tunnel manager
  tunnelManager = new TunnelManager();
  tunnelManager.setMainWindow(mainWindow);

  // Initialize sharing manager (depends on sessionManager + tunnelManager)
  sharingManager = new SharingManager(sessionManager, tunnelManager);
  sharingManager.setEmitter(new IPCEmitter(mainWindow));

  // Initialize command registry
  commandRegistry = new CommandRegistry();

  // Initialize agent team manager
  agentTeamManager = new AgentTeamManager();
  agentTeamManager.setMainWindow(mainWindow);
  agentTeamManager.setSessionAccessors(
    () => sessionManager!.getAllSessionMetadata(),
    (sessionId, teamData) => sessionManager!.updateSessionTeamMetadata(sessionId, teamData),
    (sessionId) => sessionManager!.closeSession(sessionId),
  );

  // Clean up teams when sessions close or exit
  sessionManager.onSessionEnd((sessionId) => {
    agentTeamManager?.onSessionClosed(sessionId);
  });

  // Initialize provider registry and wire into session manager
  providerRegistry = new ProviderRegistry();
  sessionManager.setProviderRegistry(providerRegistry);

  // Setup IPC handlers with pool reference
  setupIPCHandlers(
    mainWindow,
    sessionManager,
    settingsManager,
    templatesManager,
    historyManager,
    checkpointManager,
    sessionPool,
    agentTeamManager,
    atlasManager,
    layoutPresetsManager,
    commandRegistry,
    modelHistoryManager,
    gitManager,
    playbookManager,
    playbookExecutor,
    tunnelManager,
    providerRegistry,
    sharingManager
  );

  // Initialize pool (delayed, async)
  setTimeout(() => {
    if (sessionPool) {
      sessionPool.initialize().catch(err => {
        console.error('Failed to initialize session pool:', err);
      });
    }
  }, 2500); // 2.5 second delay to avoid slowing app startup

  // Initialize agent team manager (delayed to avoid slowing app startup)
  setTimeout(() => {
    if (agentTeamManager && settingsManager!.getEnableAgentTeams()) {
      agentTeamManager.initialize().catch(err => {
        console.error('Failed to initialize agent team manager:', err);
      });
    }
  }, 1500);

  // Run history cleanup on startup
  historyManager.runCleanup().catch(err => {
    console.error('Initial history cleanup failed:', err);
  });

  // Load the renderer
  if (isDev) {
    mainWindow.loadURL('http://localhost:9742');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Toggle DevTools with F12 or Ctrl+Shift+I
  mainWindow.webContents.on('before-input-event', (_event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      if (mainWindow) {
        mainWindow.webContents.toggleDevTools();
      }
    }
  });

  // Save window state on close
  mainWindow.on('close', () => {
    if (mainWindow) {
      saveWindowState(mainWindow);
    }
  });

  mainWindow.on('closed', () => {
    removeIPCHandlers();
    if (sharingManager) {
      sharingManager.destroy();
      sharingManager = null;
    }
    if (tunnelManager) {
      tunnelManager.destroy();
      tunnelManager = null;
    }
    if (modelHistoryManager) {
      modelHistoryManager.shutdown();
      modelHistoryManager = null;
    }
    if (playbookExecutor) {
      playbookExecutor.destroy();
      playbookExecutor = null;
    }
    playbookManager = null;
    if (gitManager) {
      gitManager.destroy();
      gitManager = null;
    }
    if (atlasManager) {
      atlasManager.destroy();
      atlasManager = null;
    }
    if (agentTeamManager) {
      agentTeamManager.destroy();
      agentTeamManager = null;
    }
    if (sessionManager) {
      sessionManager.destroyAll();
      sessionManager = null;
    }
    if (sessionPool) {
      sessionPool.destroy();
      sessionPool = null;
    }
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  migrateFromLegacy();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// ── Protocol registration (Phase 11): omnidesk:// deep links ─────────────────
// Must be registered before app.whenReady() for Windows (registry).
app.setAsDefaultProtocolClient('omnidesk');

/**
 * Parse an omnidesk://join/<code> URL and return the share code, or null
 * if the URL does not match the expected pattern.
 */
function extractDeepLinkCode(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'omnidesk:') return null;
    if (parsed.hostname !== 'join') return null;
    // pathname is "/<code>" — strip the leading "/"
    const code = parsed.pathname.replace(/^\//, '').trim();
    if (!code) return null;
    return code;
  } catch {
    return null;
  }
}

/**
 * Send a deep-link join event to the renderer so it can pre-fill and open
 * the JoinSessionDialog.  The channel name 'sharing:deepLinkJoin' is used
 * directly (not via the IPC contract) since it is a fire-and-forget push
 * from the main process triggered by OS events.
 */
function handleDeepLink(url: string): void {
  const code = extractDeepLinkCode(url);
  if (!code) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
    mainWindow.webContents.send('sharing:deepLinkJoin', { shareCode: code });
  }
}

// Handle potential second instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', (_event, argv) => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
    // On Windows the protocol URL arrives in argv (last element that starts with 'omnidesk:')
    const deepLinkUrl = argv.find((arg) => arg.startsWith('omnidesk://'));
    if (deepLinkUrl) {
      handleDeepLink(deepLinkUrl);
    }
  });
}

// macOS: protocol URL arrives via 'open-url' event
app.on('open-url', (_event, url) => {
  handleDeepLink(url);
});
