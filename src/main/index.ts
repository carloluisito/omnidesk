// @atlas-entrypoint: Main process — creates window, initializes all 8 managers, wires IPC
import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
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

const CONFIG_DIR = path.join(app.getPath('home'), '.claudedesk');
const WINDOW_STATE_FILE = path.join(CONFIG_DIR, 'window-state.json');

function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

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
    playbookExecutor
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

// Handle potential second instance
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });
}
