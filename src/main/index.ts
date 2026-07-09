// @atlas-entrypoint: Main process — creates window, initializes all 8 managers, wires IPC
import { app, BrowserWindow, screen } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { CONFIG_DIR, ensureConfigDir, migrateFromLegacy } from './config-dir';
import { SessionManager } from './session-manager';
import { SessionPool } from './session-pool';
import { SettingsManager } from './settings-persistence';
import { HistoryManager } from './history-manager';
import { CheckpointManager } from './checkpoint-manager';
import { GitManager } from './git-manager';
import { ProviderRegistry } from './providers/provider-registry';
import { probeClaudeVersion } from './agent-view/probe-version';
import { getAgentViewAvailability } from './agent-view/availability';
import { setCachedAgentViewAvailability } from './agent-view/availability-cache';
import { setupIPCHandlers, removeIPCHandlers, getRegistry, setRemoteServer, setRemoteTunnel } from './ipc-handlers';
import { RemoteAccessServer } from './remote/remote-access-server';
import { RemoteAuth } from './remote/remote-auth';
import { ClientHub } from './remote/client-hub';
import { TunnelController } from './remote/tunnel-controller';
import { managedCloudflaredPath } from './remote/tunnel-manager';
import { registerRemoteBroadcaster } from './ipc-emitter';
import { STTManager } from './stt/stt-manager';
import { createUtilityEngine } from './stt/utility-engine';
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
let historyManager: HistoryManager | null = null;
let checkpointManager: CheckpointManager | null = null;
let gitManager: GitManager | null = null;
let providerRegistry: ProviderRegistry | null = null;
let remoteServer: RemoteAccessServer | null = null;
let remoteTunnel: TunnelController | null = null;

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

/**
 * One-shot Agent View availability probe.
 *
 * Runs off the createWindow synchronous critical path (called from a
 * setTimeout(..., 2000) block) so a hung or missing `claude` binary cannot
 * delay window creation. Uses timeout: 5000 on the execFile call.
 *
 * Lesson replicated from plans/abandoned/agent-view.plan.md, Learnings item #4.
 */
async function agentViewDelayedInit(): Promise<void> {
  // 1. Probe the CLI version
  const cliVersion = await probeClaudeVersion();

  // 2. Read ~/.claude/settings.json (or honour CLAUDE_CONFIG_DIR env var).
  //    Try/catch + default to {} on any failure so a missing/malformed file
  //    never crashes the probe.
  const claudeConfigDir = process.env['CLAUDE_CONFIG_DIR']
    ?? path.join(os.homedir(), '.claude');
  let settings: Record<string, unknown> = {};
  try {
    const settingsPath = path.join(claudeConfigDir, 'settings.json');
    const raw = fs.readFileSync(settingsPath, 'utf-8');
    settings = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // File missing, unreadable, or unparseable — treat as empty settings.
  }

  // 3. Compute availability
  const availability = getAgentViewAvailability({
    cliVersion,
    env: process.env,
    settings,
  });

  // 4. Store in module-level cache (replaces the initial "probing" value)
  setCachedAgentViewAvailability(availability);

  // 4b. Push the final availability to the renderer so it does not need to poll.
  //     The window is always present at this point: agentViewDelayedInit runs 2s
  //     after app.whenReady → createWindow(), which assigns mainWindow synchronously.
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('agentView:availabilityChanged', availability);
  }

  // 5. Log for support diagnostics
  console.log(
    '[AgentView] availability:',
    availability.status,
    availability.status === 'unavailable' ? availability.reason : availability.cliVersion,
  );
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
    backgroundColor: '#0A0B11',
    // Hidden title bar + NO native overlay — the in-app traffic lights handle
    // minimize / maximize / close via the window:* IPCs.
    titleBarStyle: 'hidden',
    // macOS-only: position the OS controls under our title bar so they don't show.
    // On Windows/Linux, omitting titleBarOverlay removes the native controls entirely.
    ...(process.platform === 'darwin'
      ? { trafficLightPosition: { x: -100, y: -100 } as any }
      : {}),
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
  historyManager = new HistoryManager();
  checkpointManager = new CheckpointManager(historyManager);

  // Create session pool with config
  const poolSettings = settingsManager.getSessionPoolSettings();
  sessionPool = new SessionPool({
    size: poolSettings.poolSize,
    enabled: poolSettings.enabled,
    maxIdleTimeMs: poolSettings.maxIdleTimeMs,
  });

  // Create session manager with pool reference
  sessionManager = new SessionManager(historyManager, sessionPool);
  sessionManager.initialize();

  // Validate split view state against current sessions
  const sessionList = sessionManager.listSessions();
  const validSessionIds = sessionList.sessions.map(s => s.id);
  settingsManager.validateSplitViewState(validSessionIds);

  // Initialize git manager
  gitManager = new GitManager(checkpointManager);
  gitManager.setMainWindow(mainWindow);

  // Wire git manager into session manager for worktree support
  sessionManager.setGitManager(gitManager);
  sessionManager.setWorktreeSettings(settingsManager.getWorktreeSettings());

  // Wire agent teams getter into session manager and session pool
  sessionManager.setAgentTeamsGetter(() => settingsManager!.getEnableAgentTeams());
  sessionPool.setAgentTeamsGetter(() => settingsManager!.getEnableAgentTeams());

  // Initialize provider registry and wire into session manager
  providerRegistry = new ProviderRegistry();
  sessionManager.setProviderRegistry(providerRegistry);

  // Remote access collaborators. The server binds 127.0.0.1 only and is off
  // until explicitly enabled; the user exposes it via a tunnel. Events fan out
  // to all connected web clients through the ClientHub broadcaster.
  const persistedToken = settingsManager.getRemoteAccessToken();
  const remoteAuth = new RemoteAuth(persistedToken);
  if (!persistedToken) settingsManager.setRemoteAccessToken(remoteAuth.getToken());
  const clientHub = new ClientHub();
  registerRemoteBroadcaster((channel, payload) => clientHub.broadcast(channel, payload));

  // Speech-to-text engine (WASM Whisper in a crash-isolated utilityProcess).
  // Models cache under userData/models/transformers. Status pushes to the
  // desktop window AND every remote web client.
  const sttModelsDir = path.join(app.getPath('userData'), 'models', 'transformers');
  const sttManager = new STTManager({
    getSettings: () => settingsManager!.getSTTSettings(),
    modelsDir: sttModelsDir,
    engineFactory: () => createUtilityEngine(sttModelsDir),
    onStatusChanged: (s) => {
      mainWindow?.webContents.send('stt:statusChanged', s);
      clientHub.broadcast('stt:statusChanged', s);
    },
  });

  // Setup IPC handlers with pool reference
  setupIPCHandlers(
    mainWindow,
    sessionManager,
    settingsManager,
    historyManager,
    checkpointManager,
    sessionPool,
    gitManager,
    providerRegistry,
    remoteAuth,
    sttManager,
  );

  // Construct the remote server now that the IPC registry exists, then inject
  // it back into the handlers so the remote:* IPC methods can drive it.
  const registryRef = getRegistry();
  if (registryRef) {
    remoteServer = new RemoteAccessServer({
      port: settingsManager.getRemoteAccessPort(),
      rendererDir: path.join(__dirname, '../renderer'),
      registry: registryRef,
      auth: remoteAuth,
      hub: clientHub,
      // In dev the built renderer is stale/empty; proxy to the Vite dev server.
      devServerUrl: isDev ? 'http://localhost:9742' : undefined,
    });
    setRemoteServer(remoteServer);
    remoteTunnel = new TunnelController(managedCloudflaredPath(app.getPath('userData')));
    setRemoteTunnel(remoteTunnel);
  }

  // Auto-start remote access if it was enabled last run (delayed off the
  // critical path, mirroring the session pool init).
  setTimeout(() => {
    if (settingsManager?.getRemoteAccessEnabled() && remoteServer && !remoteServer.isRunning()) {
      remoteServer.start()
        .then(() => remoteTunnel?.start(remoteServer!.getPort()))
        .catch((e) => console.error('[remote] auto-start failed:', e));
    }
  }, 3000);

  // Initialize pool (delayed, async)
  setTimeout(() => {
    if (sessionPool) {
      sessionPool.initialize().catch(err => {
        console.error('Failed to initialize session pool:', err);
      });
    }
  }, 2500); // 2.5 second delay to avoid slowing app startup

  // Probe claude --version once and cache AgentView availability (delayed to
  // keep createWindow synchronous — a hung binary cannot block window creation)
  setTimeout(() => {
    void agentViewDelayedInit();
  }, 2000);

  // Warm the STT engine off the synchronous critical path (loads the model if
  // already cached; no-op if voice is disabled or the model isn't downloaded).
  setTimeout(() => { void sttManager.warmUp(); }, 3000);

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
    registerRemoteBroadcaster(null);
    if (remoteTunnel) {
      remoteTunnel.stop().catch(() => {});
      remoteTunnel = null;
    }
    if (remoteServer) {
      remoteServer.stop().catch(() => {});
      remoteServer = null;
    }
    sttManager.shutdown();
    removeIPCHandlers();
    if (gitManager) {
      gitManager.destroy();
      gitManager = null;
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

// Drain in-flight session-cleanup work before the main process exits.
// Without this, closing a session and then immediately quitting can leave
// the worktree dir removed but the branch ref still alive, which then breaks
// future "Existing branch" worktree creation on the same name.
let isFlushingCleanups = false;
app.on('before-quit', (e) => {
  if (isFlushingCleanups) return;        // already flushing — let it complete
  if (!sessionManager) return;
  // Defer the actual quit until cleanups settle.
  e.preventDefault();
  isFlushingCleanups = true;
  sessionManager.waitForPendingCleanups()
    .catch(err => console.warn('[before-quit] cleanup error', err))
    .finally(() => app.quit());
});

// ── Protocol registration (Phase 11): omnidesk:// deep links ─────────────────
// Must be registered before app.whenReady() for Windows (registry).
app.setAsDefaultProtocolClient('omnidesk');

// NOTE: LaunchTunnel disabled — extractDeepLinkCode commented out
// function extractDeepLinkCode(url: string): string | null {
//   try {
//     const parsed = new URL(url);
//     if (parsed.protocol !== 'omnidesk:') return null;
//     if (parsed.hostname !== 'join') return null;
//     const code = parsed.pathname.replace(/^\//, '').trim();
//     if (!code) return null;
//     return code;
//   } catch {
//     return null;
//   }
// }

// NOTE: LaunchTunnel/sharing deep link disabled
// function handleDeepLink(url: string): void {
//   const code = extractDeepLinkCode(url);
//   if (!code) return;
//   if (mainWindow && !mainWindow.isDestroyed()) {
//     if (mainWindow.isMinimized()) mainWindow.restore();
//     mainWindow.focus();
//     mainWindow.webContents.send('sharing:deepLinkJoin', { shareCode: code });
//   }
// }
function handleDeepLink(_url: string): void {
  // LaunchTunnel sharing disabled — deep links are no-ops for now
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
