import { app, BrowserWindow, dialog, shell } from 'electron';
import { getCachedAgentViewAvailability } from './agent-view/availability-cache';
import * as fs from 'fs';
import * as path from 'path';
import type { SubdirectoryEntry, GitRepoEntry } from '../shared/ipc-types';
import { SessionManager } from './session-manager';
import { SessionPool } from './session-pool';
import { SettingsManager } from './settings-persistence';
import { HistoryManager } from './history-manager';
import { CheckpointManager } from './checkpoint-manager';
import { GitManager } from './git-manager';
import { ProviderRegistry } from './providers/provider-registry';
import { queryClaudeQuota, clearQuotaCache, getBurnRate, resolveClaudeConfigDir } from './quota-service';
import { getFileInfo, readFileContent } from './file-dragdrop-handler';
import { IPCRegistry } from './ipc-registry';
import { isPathAllowed as isPathAllowedAgainst, approvePickedRoot } from './path-access';

let registry: IPCRegistry | null = null;

export function setupIPCHandlers(
  mainWindow: BrowserWindow,
  sessionManager: SessionManager,
  settingsManager: SettingsManager,
  historyManager: HistoryManager,
  checkpointManager: CheckpointManager,
  sessionPool: SessionPool,
  gitManager: GitManager,
  providerRegistry: ProviderRegistry,
): void {
  // Connect managers to window
  sessionManager.setMainWindow(mainWindow);
  checkpointManager.setMainWindow(mainWindow);

  registry = new IPCRegistry();

  // ── Session management (invoke) ──

  registry.handle('createSession', async (_e, request) => {
    try {
      const result = await sessionManager.createSession(request);
      return result;
    }
    catch (err) { console.error('Failed to create session:', err); throw err; }
  });

  registry.handle('closeSession', async (_e, sessionId, opts) => {
    return sessionManager.closeSession(sessionId, opts);
  });

  registry.handle('switchSession', async (_e, sessionId) => {
    return sessionManager.switchSession(sessionId);
  });

  registry.handle('renameSession', async (_e, sessionId, newName) => {
    try {
      const result = await sessionManager.renameSession(sessionId, newName);
      return result;
    }
    catch (err) { console.error('Failed to rename session:', err); throw err; }
  });

  registry.handle('listSessions', async () => {
    return sessionManager.listSessions();
  });

  registry.handle('restartSession', async (_e, sessionId) => {
    return sessionManager.restartSession(sessionId);
  });

  registry.handle('stopSession', async (_e, sessionId) => {
    return sessionManager.stopSession(sessionId);
  });

  registry.handle('getActiveSession', async () => {
    return sessionManager.getActiveSessionId();
  });

  registry.handle('revealInExplorer', async (_e, sessionId) => {
    try {
      const session = sessionManager.getSession(sessionId);
      if (!session) {
        console.error('[revealInExplorer] Session not found:', sessionId);
        return false;
      }

      const workDir = session.workingDirectory;

      // Validate directory exists
      if (!fs.existsSync(workDir)) {
        console.error('[revealInExplorer] Directory does not exist:', workDir);
        return false;
      }

      // Reveal in file manager
      shell.showItemInFolder(workDir);
      return true;
    } catch (err) {
      console.error('[revealInExplorer] Failed:', err);
      return false;
    }
  });

  registry.handle('getSessionScrollback', async (_e, sessionId) => {
    return sessionManager.getSessionScrollback(sessionId);
  });

  // ── Model switching ──

  registry.handle('switchModel', async (_e, sessionId, model) => {
    const session = sessionManager.getSession(sessionId);
    console.log('[switchModel] Called with:', { sessionId, model, sessionStatus: session?.status });
    if (!session) {
      console.log('[switchModel] Session not found');
      return false;
    }
    if (session.status === 'exited' || session.status === 'error') {
      console.log('[switchModel] Session not active:', session.status);
      return false;
    }

    const VALID_MODELS = ['opus', 'sonnet', 'haiku'];
    if (!VALID_MODELS.includes(model)) {
      console.log('[switchModel] Unknown model:', model);
      return false;
    }

    const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

    // Use direct command syntax: /model haiku, /model sonnet, /model opus
    // Type character-by-character to avoid autocomplete interference
    const command = `/model ${model}`;
    console.log('[switchModel] Typing command:', command);

    for (const char of command) {
      sessionManager.sendInput(sessionId, char);
      await delay(50);
    }

    // Wait for autocomplete to settle
    await delay(300);

    // Press Enter to execute
    sessionManager.sendInput(sessionId, '\r');
    console.log('[switchModel] Command sent');

    return true;
  });

  // ── Dialogs ──

  registry.handle('browseDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Working Directory',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    // The user explicitly chose this folder, so trust it (and its descendants)
    // for subsequent fs operations even if it lives outside the home directory
    // and isn't a registered workspace yet — e.g. repo detection during add.
    approvePickedRoot(result.filePaths[0]);
    return result.filePaths[0];
  });

  registry.handle('showSaveDialog', async (_e, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save File',
      defaultPath: options.defaultPath,
      filters: options.filters,
    });
    if (result.canceled || !result.filePath) return null;
    // The user explicitly chose this save target, so trust the exact path for a
    // subsequent writeFile even if it's outside the home directory. Approving
    // the file path (not its directory) keeps this to just the chosen file.
    approvePickedRoot(result.filePath);
    return result.filePath;
  });

  // A path is allowed if it's under the home directory, under a registered
  // workspace, or under a folder the user explicitly picked via a native dialog
  // (see approvePickedRoot in browseDirectory). See ./path-access.
  const isPathAllowed = (resolved: string): boolean =>
    isPathAllowedAgainst(
      resolved,
      app.getPath('home'),
      settingsManager.getWorkspaces().map((ws) => ws.path),
    );

  registry.handle('writeFile', async (_e, filePath, content) => {
    const resolved = path.resolve(filePath);
    if (!isPathAllowed(resolved)) {
      console.warn('[writeFile] Blocked path outside home/workspaces:', resolved);
      return false;
    }
    try {
      await fs.promises.writeFile(resolved, content, 'utf-8');
      return true;
    } catch (err) { console.error('Failed to write file:', err); return false; }
  });

  registry.handle('listSubdirectories', async (_e, parentPath): Promise<SubdirectoryEntry[]> => {
    const resolved = path.resolve(parentPath);
    if (!isPathAllowed(resolved)) {
      console.warn('[listSubdirectories] Blocked path outside home/workspaces:', resolved);
      return [];
    }
    try {
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      const subdirs: SubdirectoryEntry[] = [];
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          subdirs.push({ name: entry.name, path: path.join(resolved, entry.name) });
        }
      }
      subdirs.sort((a, b) => a.name.localeCompare(b.name));
      return subdirs;
    } catch (err) { console.error('Failed to list subdirectories:', err); return []; }
  });

  registry.handle('listGitRepos', async (_e, parentPath): Promise<GitRepoEntry[]> => {
    const resolved = path.resolve(parentPath);
    if (!isPathAllowed(resolved)) {
      console.warn('[listGitRepos] Blocked path outside home/workspaces:', resolved);
      return [];
    }
    const repos: GitRepoEntry[] = [];
    const readBranch = (gitPath: string): string | undefined => {
      try {
        // .git can be a directory (regular repo) or a file (worktree pointing at the parent .git).
        const stat = fs.statSync(gitPath);
        const headFile = stat.isDirectory()
          ? path.join(gitPath, 'HEAD')
          : (() => {
              const ptr = fs.readFileSync(gitPath, 'utf8').trim();
              const m = ptr.match(/^gitdir:\s*(.+)$/);
              if (!m) return null;
              const dir = path.isAbsolute(m[1]) ? m[1] : path.resolve(path.dirname(gitPath), m[1]);
              return path.join(dir, 'HEAD');
            })();
        if (!headFile || !fs.existsSync(headFile)) return undefined;
        const head = fs.readFileSync(headFile, 'utf8').trim();
        const m = head.match(/^ref:\s*refs\/heads\/(.+)$/);
        return m ? m[1] : head.slice(0, 7); // detached HEAD: short SHA
      } catch {
        return undefined;
      }
    };
    const considerEntry = (name: string, fullPath: string) => {
      const gitPath = path.join(fullPath, '.git');
      if (!fs.existsSync(gitPath)) return;
      repos.push({ name, path: fullPath, workspacePath: resolved, branch: readBranch(gitPath) });
    };
    try {
      // First, is the workspace path ITSELF a git repo?
      if (fs.existsSync(path.join(resolved, '.git'))) {
        considerEntry(path.basename(resolved), resolved);
      }
      // Then enumerate top-level subdirs as candidate repos.
      const entries = fs.readdirSync(resolved, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
        considerEntry(entry.name, path.join(resolved, entry.name));
      }
      repos.sort((a, b) => a.name.localeCompare(b.name));
      return repos;
    } catch (err) {
      console.error('Failed to list git repos:', err);
      return repos;
    }
  });

  registry.handle('createDirectory', async (_e, dirPath) => {
    const resolved = path.resolve(dirPath);
    if (!isPathAllowed(resolved)) {
      console.warn('[createDirectory] Blocked path outside home/workspaces:', resolved);
      return false;
    }
    try {
      await fs.promises.mkdir(resolved);
      return true;
    } catch (err) { console.error('Failed to create directory:', err); return false; }
  });

  // ── Settings & Workspaces ──

  registry.handle('getSettings', async () => settingsManager.getSettings());
  registry.handle('setSettings', async (_e, partial) => settingsManager.mergeSettings(partial as Record<string, unknown>));
  registry.handle('listWorkspaces', async () => settingsManager.getWorkspaces());

  registry.handle('addWorkspace', async (_e, request) => {
    try { return settingsManager.addWorkspace(request); }
    catch (err) { console.error('Failed to add workspace:', err); throw err; }
  });

  registry.handle('updateWorkspace', async (_e, request) => {
    try { return settingsManager.updateWorkspace(request); }
    catch (err) { console.error('Failed to update workspace:', err); throw err; }
  });

  registry.handle('deleteWorkspace', async (_e, workspaceId) => {
    return settingsManager.deleteWorkspace(workspaceId);
  });

  registry.handle('validateWorkspacePath', async (_e, wsPath, excludeId) => {
    return settingsManager.validatePath(wsPath, excludeId);
  });

  registry.handle('updateSplitViewState', async (_e, state) => {
    try { settingsManager.updateSplitViewState(state); }
    catch (err) { console.error('Failed to update split view state:', err); throw err; }
  });

  // ── Session Pool ──

  registry.handle('updateSessionPoolSettings', async (_e, settings) => {
    try {
      const updated = settingsManager.updateSessionPoolSettings(settings);
      sessionPool.updateConfig({ size: updated.poolSize, enabled: updated.enabled, maxIdleTimeMs: updated.maxIdleTimeMs });
      return updated;
    } catch (err) { console.error('Failed to update session pool settings:', err); throw err; }
  });

  registry.handle('getSessionPoolStatus', async () => sessionPool.getStatus());

  // ── Quota ──

  /** Resolve the Claude config dir for the currently active session */
  function getActiveConfigDir(): string {
    const activeId = sessionManager.getActiveSessionId();
    if (activeId) {
      const session = sessionManager.getSession(activeId);
      if (session?.workingDirectory) {
        return resolveClaudeConfigDir(session.workingDirectory);
      }
    }
    return resolveClaudeConfigDir();
  }

  registry.handle('getQuota', async (_e, forceRefresh) => {
    try {
      const configDir = getActiveConfigDir();
      return await queryClaudeQuota(forceRefresh, configDir);
    }
    catch (err) { console.error('Failed to get quota:', err); return null; }
  });

  registry.handle('refreshQuota', async () => {
    try {
      const configDir = getActiveConfigDir();
      clearQuotaCache(configDir);
      return await queryClaudeQuota(true, configDir);
    }
    catch (err) { console.error('Failed to refresh quota:', err); return null; }
  });

  registry.handle('getBurnRate', async () => {
    const configDir = getActiveConfigDir();
    return getBurnRate(configDir);
  });

  // ── Drag-Drop ──

  registry.handle('getFileInfo', async (_e, filePaths) => {
    try { return await getFileInfo(filePaths); }
    catch (err) { console.error('Failed to get file info:', err); throw err; }
  });

  registry.handle('readFileContent', async (_e, filePath, maxSizeKB) => {
    try { return await readFileContent(filePath, maxSizeKB); }
    catch (err) { console.error('Failed to read file content:', err); throw err; }
  });

  // ── History ──

  registry.handle('listHistory', async () => {
    try { return await historyManager.listSessions(); }
    catch (err) { console.error('Failed to list history:', err); throw err; }
  });

  registry.handle('getHistory', async (_e, sessionId) => {
    try { return await historyManager.getSessionContent(sessionId); }
    catch (err) { console.error('Failed to get history:', err); throw err; }
  });

  registry.handle('searchHistory', async (_e, query, useRegex) => {
    try { return await historyManager.search(query, useRegex); }
    catch (err) { console.error('Failed to search history:', err); throw err; }
  });

  registry.handle('deleteHistory', async (_e, sessionId) => {
    try { return await historyManager.deleteSession(sessionId); }
    catch (err) { console.error('Failed to delete history:', err); return false; }
  });

  registry.handle('deleteAllHistory', async () => {
    try { return await historyManager.deleteAllSessions(); }
    catch (err) { console.error('Failed to delete all history:', err); return false; }
  });

  registry.handle('exportHistoryMarkdown', async (_e, sessionId, outputPath) => {
    try { return await historyManager.exportMarkdown(sessionId, outputPath); }
    catch (err) { console.error('Failed to export markdown:', err); return false; }
  });

  registry.handle('exportHistoryJson', async (_e, sessionId, outputPath) => {
    try { return await historyManager.exportJson(sessionId, outputPath); }
    catch (err) { console.error('Failed to export JSON:', err); return false; }
  });

  registry.handle('getHistorySettings', async () => historyManager.getSettings());

  registry.handle('updateHistorySettings', async (_e, settings) => {
    try { return await historyManager.updateSettings(settings); }
    catch (err) { console.error('Failed to update history settings:', err); return false; }
  });

  registry.handle('getHistoryStats', async () => {
    try { return await historyManager.getStats(); }
    catch (err) { console.error('Failed to get history stats:', err); throw err; }
  });

  // ── Checkpoints ──

  registry.handle('createCheckpoint', async (_e, request) => {
    try { return await checkpointManager.createCheckpoint(request); }
    catch (err) { console.error('Failed to create checkpoint:', err); throw err; }
  });

  registry.handle('listCheckpoints', async (_e, sessionId) => {
    try { return await checkpointManager.listCheckpoints(sessionId); }
    catch (err) { console.error('Failed to list checkpoints:', err); throw err; }
  });

  registry.handle('getCheckpoint', async (_e, checkpointId) => {
    try { return await checkpointManager.getCheckpoint(checkpointId); }
    catch (err) { console.error('Failed to get checkpoint:', err); throw err; }
  });

  registry.handle('deleteCheckpoint', async (_e, checkpointId) => {
    try { return await checkpointManager.deleteCheckpoint(checkpointId); }
    catch (err) { console.error('Failed to delete checkpoint:', err); return false; }
  });

  registry.handle('updateCheckpoint', async (_e, checkpointId, updates) => {
    try { return await checkpointManager.updateCheckpoint(checkpointId, updates); }
    catch (err) { console.error('Failed to update checkpoint:', err); throw err; }
  });

  registry.handle('exportCheckpoint', async (_e, checkpointId, format) => {
    try { return await checkpointManager.exportCheckpointHistory(checkpointId, format); }
    catch (err) { console.error('Failed to export checkpoint:', err); throw err; }
  });

  registry.handle('getCheckpointCount', async (_e, sessionId) => {
    try { return checkpointManager.getCheckpointCount(sessionId); }
    catch (err) { console.error('Failed to get checkpoint count:', err); return 0; }
  });

  // ── Git Integration ──

  registry.handle('getGitStatus', async (_e, workDir) => {
    try { return await gitManager.getStatus(workDir); }
    catch (err) { console.error('Failed to get git status:', err); throw err; }
  });

  registry.handle('getGitBranches', async (_e, workDir) => {
    try { return await gitManager.getBranches(workDir); }
    catch (err) { console.error('Failed to get git branches:', err); throw err; }
  });

  registry.handle('gitStageFiles', async (_e, workDir, files) => {
    try { return await gitManager.stageFiles(workDir, files); }
    catch (err) { console.error('Failed to stage files:', err); throw err; }
  });

  registry.handle('gitUnstageFiles', async (_e, workDir, files) => {
    try { return await gitManager.unstageFiles(workDir, files); }
    catch (err) { console.error('Failed to unstage files:', err); throw err; }
  });

  registry.handle('gitStageAll', async (_e, workDir) => {
    try { return await gitManager.stageAll(workDir); }
    catch (err) { console.error('Failed to stage all:', err); throw err; }
  });

  registry.handle('gitUnstageAll', async (_e, workDir) => {
    try { return await gitManager.unstageAll(workDir); }
    catch (err) { console.error('Failed to unstage all:', err); throw err; }
  });

  registry.handle('gitCommit', async (_e, request) => {
    try { return await gitManager.commit(request); }
    catch (err) { console.error('Failed to commit:', err); throw err; }
  });

  registry.handle('gitGenerateMessage', async (_e, workDir) => {
    try { return await gitManager.generateMessage(workDir); }
    catch (err) { console.error('Failed to generate commit message:', err); throw err; }
  });

  registry.handle('gitPush', async (_e, workDir, setUpstream) => {
    try { return await gitManager.push(workDir, setUpstream); }
    catch (err) { console.error('Failed to push:', err); throw err; }
  });

  registry.handle('gitPull', async (_e, workDir) => {
    try { return await gitManager.pull(workDir); }
    catch (err) { console.error('Failed to pull:', err); throw err; }
  });

  registry.handle('gitFetch', async (_e, workDir) => {
    try { return await gitManager.fetch(workDir); }
    catch (err) { console.error('Failed to fetch:', err); throw err; }
  });

  registry.handle('gitSwitchBranch', async (_e, workDir, branch) => {
    try { return await gitManager.switchBranch(workDir, branch); }
    catch (err) { console.error('Failed to switch branch:', err); throw err; }
  });

  registry.handle('gitCreateBranch', async (_e, workDir, branch) => {
    try { return await gitManager.createBranch(workDir, branch); }
    catch (err) { console.error('Failed to create branch:', err); throw err; }
  });

  registry.handle('gitLog', async (_e, workDir, count) => {
    try { return await gitManager.log(workDir, count); }
    catch (err) { console.error('Failed to get git log:', err); throw err; }
  });

  registry.handle('gitDiff', async (_e, workDir, filePath, staged) => {
    try { return await gitManager.diff(workDir, filePath, staged); }
    catch (err) { console.error('Failed to get diff:', err); throw err; }
  });

  registry.handle('gitFileContent', async (_e, workDir, filePath) => {
    try { return await gitManager.fileContent(workDir, filePath); }
    catch (err) { console.error('Failed to read file content:', err); throw err; }
  });

  registry.handle('gitCommitDiff', async (_e, workDir, hash) => {
    try { return await gitManager.commitDiff(workDir, hash); }
    catch (err) { console.error('Failed to get commit diff:', err); throw err; }
  });

  registry.handle('gitDiscardFile', async (_e, workDir, filePath) => {
    try { return await gitManager.discardFile(workDir, filePath); }
    catch (err) { console.error('Failed to discard file:', err); throw err; }
  });

  registry.handle('gitDiscardAll', async (_e, workDir) => {
    try { return await gitManager.discardAll(workDir); }
    catch (err) { console.error('Failed to discard all:', err); throw err; }
  });

  registry.handle('gitInit', async (_e, workDir) => {
    try { return await gitManager.init(workDir); }
    catch (err) { console.error('Failed to init git:', err); throw err; }
  });

  registry.handle('gitStartWatching', async (_e, workDir) => {
    return gitManager.startWatching(workDir);
  });

  registry.handle('gitStopWatching', async (_e, workDir) => {
    return gitManager.stopWatching(workDir);
  });

  // ── Git Worktrees ──

  registry.handle('gitWorktreeList', async (_e, workDir) => {
    try { return await gitManager.listWorktrees(workDir); }
    catch (err) { console.error('Failed to list worktrees:', err); throw err; }
  });

  registry.handle('gitWorktreeAdd', async (_e, request) => {
    try {
      const wtSettings = settingsManager.getWorktreeSettings();
      return await gitManager.addWorktree(request, wtSettings);
    }
    catch (err) { console.error('Failed to add worktree:', err); throw err; }
  });

  registry.handle('gitWorktreeRemove', async (_e, request) => {
    try { return await gitManager.removeWorktree(request); }
    catch (err) { console.error('Failed to remove worktree:', err); throw err; }
  });

  registry.handle('gitWorktreePrune', async (_e, workDir) => {
    try { return await gitManager.pruneWorktrees(workDir); }
    catch (err) { console.error('Failed to prune worktrees:', err); throw err; }
  });

  registry.handle('getWorktreeSettings', async () => {
    return settingsManager.getWorktreeSettings();
  });

  registry.handle('updateWorktreeSettings', async (_e, settings) => {
    try { return settingsManager.updateWorktreeSettings(settings); }
    catch (err) { console.error('Failed to update worktree settings:', err); throw err; }
  });

  // ── Providers ──

  registry.handle('listProviders', async () => {
    return providerRegistry.list();
  });

  registry.handle('getAvailableProviders', async () => {
    return providerRegistry.getAvailable();
  });

  registry.handle('getProviderCapabilities', async (_e, id) => {
    return providerRegistry.get(id).getInfo().capabilities;
  });

  // ── App info ──

  registry.handle('getVersionInfo', async () => {
    const { app } = require('electron');
    const { execSync } = require('child_process');
    let claudeVersion: string | undefined;
    try { claudeVersion = execSync('claude --version', { encoding: 'utf-8' }).trim(); }
    catch (_err) { claudeVersion = undefined; }
    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      nodeVersion: process.versions.node,
      claudeVersion,
    };
  });

  // ── Session I/O (send — fire and forget) ──

  registry.on('sendSessionInput', (_e, input) => {
    sessionManager.sendInput(input.sessionId, input.data);
  });

  registry.on('resizeSession', (_e, request) => {
    sessionManager.resizeSession(request.sessionId, request.cols, request.rows);
  });

  registry.on('sessionReady', (_e, sessionId) => {
    console.log(`Session ${sessionId} ready`);
  });

  // ── Window controls ──

  registry.on('minimizeWindow', () => { mainWindow.minimize(); });

  registry.on('maximizeWindow', () => {
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    else mainWindow.maximize();
  });

  registry.on('closeWindow', () => { mainWindow.close(); });

  // ── Shell ──

  registry.handle('openExternal', async (_e, url) => {
    // Validate scheme before opening: only allow http, https, file
    const allowed = /^(https?|file):\/\//i.test(url);
    if (!allowed) {
      console.warn('openExternal: blocked non-http/https/file URL:', url);
      return false;
    }
    await shell.openExternal(url);
    return true;
  });

  // ── Agent View availability ──

  registry.handle('getAgentViewAvailability', async () => {
    return getCachedAgentViewAvailability();
  });

  // ── Updates ──

  registry.handle('checkForUpdates', async () => {
    try {
      const { autoUpdater } = await import('electron-updater');
      autoUpdater.autoDownload = false;
      autoUpdater.autoInstallOnAppQuit = true;
      const result = await autoUpdater.checkForUpdates();
      if (result && result.updateInfo && result.updateInfo.version !== app.getVersion()) {
        // Newer version found — start downloading
        await autoUpdater.downloadUpdate();
        return { updateAvailable: true, version: result.updateInfo.version };
      }
      return { updateAvailable: false };
    } catch (err: any) {
      console.error('Update check failed:', err);
      return { updateAvailable: false, error: err.message || 'Update check failed' };
    }
  });
}

export function removeIPCHandlers(): void {
  if (registry) {
    registry.removeAll();
    registry = null;
  }
}
