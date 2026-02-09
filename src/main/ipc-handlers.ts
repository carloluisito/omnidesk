import { BrowserWindow, dialog } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { SubdirectoryEntry } from '../shared/ipc-types';
import { SessionManager } from './session-manager';
import { SessionPool } from './session-pool';
import { SettingsManager } from './settings-persistence';
import { PromptTemplatesManager } from './prompt-templates-manager';
import { HistoryManager } from './history-manager';
import { CheckpointManager } from './checkpoint-manager';
import { queryClaudeQuota, clearQuotaCache, getBurnRate } from './quota-service';
import { getFileInfo, readFileContent } from './file-dragdrop-handler';
import { IPCRegistry } from './ipc-registry';

let registry: IPCRegistry | null = null;

export function setupIPCHandlers(
  mainWindow: BrowserWindow,
  sessionManager: SessionManager,
  settingsManager: SettingsManager,
  templatesManager: PromptTemplatesManager,
  historyManager: HistoryManager,
  checkpointManager: CheckpointManager,
  sessionPool: SessionPool
): void {
  // Connect managers to window
  sessionManager.setMainWindow(mainWindow);
  checkpointManager.setMainWindow(mainWindow);

  registry = new IPCRegistry();

  // ── Session management (invoke) ──

  registry.handle('createSession', async (_e, request) => {
    try { return await sessionManager.createSession(request); }
    catch (err) { console.error('Failed to create session:', err); throw err; }
  });

  registry.handle('closeSession', async (_e, sessionId) => {
    return sessionManager.closeSession(sessionId);
  });

  registry.handle('switchSession', async (_e, sessionId) => {
    return sessionManager.switchSession(sessionId);
  });

  registry.handle('renameSession', async (_e, sessionId, newName) => {
    try { return await sessionManager.renameSession(sessionId, newName); }
    catch (err) { console.error('Failed to rename session:', err); throw err; }
  });

  registry.handle('listSessions', async () => {
    return sessionManager.listSessions();
  });

  registry.handle('restartSession', async (_e, sessionId) => {
    return sessionManager.restartSession(sessionId);
  });

  registry.handle('getActiveSession', async () => {
    return sessionManager.getActiveSessionId();
  });

  // ── Dialogs ──

  registry.handle('browseDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Working Directory',
    });
    if (result.canceled || result.filePaths.length === 0) return null;
    return result.filePaths[0];
  });

  registry.handle('showSaveDialog', async (_e, options) => {
    const result = await dialog.showSaveDialog(mainWindow, {
      title: 'Save File',
      defaultPath: options.defaultPath,
      filters: options.filters,
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
  });

  registry.handle('writeFile', async (_e, filePath, content) => {
    try {
      await fs.promises.writeFile(filePath, content, 'utf-8');
      return true;
    } catch (err) { console.error('Failed to write file:', err); return false; }
  });

  registry.handle('listSubdirectories', async (_e, parentPath): Promise<SubdirectoryEntry[]> => {
    try {
      const entries = fs.readdirSync(parentPath, { withFileTypes: true });
      const subdirs: SubdirectoryEntry[] = [];
      for (const entry of entries) {
        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          subdirs.push({ name: entry.name, path: path.join(parentPath, entry.name) });
        }
      }
      subdirs.sort((a, b) => a.name.localeCompare(b.name));
      return subdirs;
    } catch (err) { console.error('Failed to list subdirectories:', err); return []; }
  });

  // ── Settings & Workspaces ──

  registry.handle('getSettings', async () => settingsManager.getSettings());
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

  registry.handle('getQuota', async (_e, forceRefresh) => {
    try { return await queryClaudeQuota(forceRefresh); }
    catch (err) { console.error('Failed to get quota:', err); return null; }
  });

  registry.handle('refreshQuota', async () => {
    try { clearQuotaCache(); return await queryClaudeQuota(true); }
    catch (err) { console.error('Failed to refresh quota:', err); return null; }
  });

  registry.handle('getBurnRate', async () => getBurnRate());

  // ── Templates ──

  registry.handle('listAllTemplates', async () => templatesManager.getAllTemplates());
  registry.handle('listUserTemplates', async () => templatesManager.getUserTemplates());
  registry.handle('getTemplate', async (_e, id) => templatesManager.getTemplateById(id));

  registry.handle('addTemplate', async (_e, request) => {
    try { return templatesManager.addTemplate(request); }
    catch (err) { console.error('Failed to add template:', err); throw err; }
  });

  registry.handle('updateTemplate', async (_e, request) => {
    try { return templatesManager.updateTemplate(request); }
    catch (err) { console.error('Failed to update template:', err); throw err; }
  });

  registry.handle('deleteTemplate', async (_e, id) => {
    try { return templatesManager.deleteTemplate(id); }
    catch (err) { console.error('Failed to delete template:', err); throw err; }
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
}

export function removeIPCHandlers(): void {
  if (registry) {
    registry.removeAll();
    registry = null;
  }
}
