import { BrowserWindow, dialog, shell } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import type { SubdirectoryEntry } from '../shared/ipc-types';
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
import { queryClaudeQuota, clearQuotaCache, getBurnRate } from './quota-service';
import { getFileInfo, readFileContent } from './file-dragdrop-handler';
import { IPCEmitter } from './ipc-emitter';
import { IPCRegistry } from './ipc-registry';

let registry: IPCRegistry | null = null;

export function setupIPCHandlers(
  mainWindow: BrowserWindow,
  sessionManager: SessionManager,
  settingsManager: SettingsManager,
  templatesManager: PromptTemplatesManager,
  historyManager: HistoryManager,
  checkpointManager: CheckpointManager,
  sessionPool: SessionPool,
  agentTeamManager: AgentTeamManager,
  atlasManager: AtlasManager,
  layoutPresetsManager: LayoutPresetsManager,
  commandRegistry: CommandRegistry,
  modelHistoryManager: ModelHistoryManager,
  gitManager: GitManager,
  playbookManager: PlaybookManager,
  playbookExecutor: PlaybookExecutor,
  tunnelManager: TunnelManager
): void {
  // Connect managers to window
  sessionManager.setMainWindow(mainWindow);
  checkpointManager.setMainWindow(mainWindow);
  playbookExecutor.setEmitter(new IPCEmitter(mainWindow));

  registry = new IPCRegistry();

  // ── Session management (invoke) ──

  registry.handle('createSession', async (_e, request) => {
    try {
      const result = await sessionManager.createSession(request);
      return result;
    }
    catch (err) { console.error('Failed to create session:', err); throw err; }
  });

  registry.handle('closeSession', async (_e, sessionId) => {
    return sessionManager.closeSession(sessionId);
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

  // ── Model History ──

  registry.handle('getModelHistory', async (_e, sessionId) => {
    return modelHistoryManager.getHistory(sessionId);
  });

  registry.handle('clearModelHistory', async (_e, sessionId) => {
    modelHistoryManager.clearHistory(sessionId);
    return true;
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

  registry.handle('createDirectory', async (_e, dirPath) => {
    try {
      await fs.promises.mkdir(dirPath);
      return true;
    } catch (err) { console.error('Failed to create directory:', err); return false; }
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

  // ── Commands ──

  registry.handle('searchCommands', async (_e, query, maxResults = 10) => {
    try { return commandRegistry.search(query, maxResults); }
    catch (err) { console.error('Failed to search commands:', err); throw err; }
  });

  registry.handle('getAllCommands', async () => {
    try { return commandRegistry.getAllCommands(); }
    catch (err) { console.error('Failed to get all commands:', err); throw err; }
  });

  registry.handle('executeCommand', async (_e, commandId, args) => {
    try {
      const command = commandRegistry.getCommand(commandId);
      if (!command) {
        console.error('Command not found:', commandId);
        return false;
      }

      // Execute command action
      // For now, commands with UI actions will be handled by the renderer
      // This is a placeholder for future server-side command execution
      console.log('Executing command:', commandId, args);
      return true;
    }
    catch (err) { console.error('Failed to execute command:', err); return false; }
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

  // ── Agent Teams ──

  registry.handle('getTeams', async () => {
    if (!settingsManager.getEnableAgentTeams()) return [];
    return agentTeamManager.getTeams();
  });

  registry.handle('getTeamForSession', async (_e, sessionId) => {
    if (!settingsManager.getEnableAgentTeams()) return null;
    return agentTeamManager.getTeamForSession(sessionId);
  });

  registry.handle('getTeamSessions', async (_e, teamName) => {
    if (!settingsManager.getEnableAgentTeams()) return [];
    return agentTeamManager.getTeamSessions(teamName);
  });

  registry.handle('linkSessionToTeam', async (_e, sessionId, teamName, agentId) => {
    if (!settingsManager.getEnableAgentTeams()) return false;
    return agentTeamManager.linkSessionToTeam(sessionId, teamName, agentId);
  });

  registry.handle('unlinkSessionFromTeam', async (_e, sessionId) => {
    if (!settingsManager.getEnableAgentTeams()) return false;
    return agentTeamManager.unlinkSessionFromTeam(sessionId);
  });

  registry.handle('closeTeam', async (_e, teamName) => {
    if (!settingsManager.getEnableAgentTeams()) return false;
    try { return await agentTeamManager.closeTeam(teamName); }
    catch (err) { console.error('Failed to close team:', err); return false; }
  });

  registry.handle('updateEnableAgentTeams', async (_e, enabled) => {
    try {
      settingsManager.updateEnableAgentTeams(enabled);
      if (enabled) {
        await agentTeamManager.initialize();
      } else {
        agentTeamManager.destroy();
      }
      // Drain and replenish pool so new sessions get correct env var
      sessionPool.drainAndReplenish();
      return true;
    } catch (err) { console.error('Failed to update enableAgentTeams:', err); return false; }
  });

  registry.handle('updateAutoLayoutTeams', async (_e, enabled) => {
    try {
      settingsManager.updateAutoLayoutTeams(enabled);
      return true;
    } catch (err) { console.error('Failed to update auto-layout setting:', err); return false; }
  });

  registry.handle('updateUIMode', async (_e, mode) => {
    try {
      settingsManager.updateUIMode(mode);
      return true;
    } catch (err) { console.error('Failed to update UI mode:', err); return false; }
  });

  registry.handle('updateDefaultModel', async (_e, model) => {
    try {
      settingsManager.updateDefaultModel(model);
      return true;
    } catch (err) { console.error('Failed to update default model:', err); return false; }
  });

  // ── Repository Atlas ──

  registry.handle('generateAtlas', async (_e, request) => {
    try { return await atlasManager.generateAtlas(request); }
    catch (err) { console.error('Failed to generate atlas:', err); throw err; }
  });

  registry.handle('writeAtlas', async (_e, request) => {
    try { return await atlasManager.writeAtlas(request); }
    catch (err) { console.error('Failed to write atlas:', err); throw err; }
  });

  registry.handle('getAtlasStatus', async (_e, projectPath) => {
    try { return await atlasManager.getStatus(projectPath); }
    catch (err) { console.error('Failed to get atlas status:', err); throw err; }
  });

  registry.handle('getAtlasSettings', async () => settingsManager.getAtlasSettings());

  registry.handle('updateAtlasSettings', async (_e, settings) => {
    try { return settingsManager.updateAtlasSettings(settings); }
    catch (err) { console.error('Failed to update atlas settings:', err); throw err; }
  });

  // ── Layout Presets ──

  registry.handle('getLayoutPresets', async () => {
    return layoutPresetsManager.getPresets();
  });

  registry.handle('applyLayoutPreset', async (_e, presetId) => {
    try {
      const preset = layoutPresetsManager.getPresetById(presetId);
      if (!preset) {
        console.error('Preset not found:', presetId);
        return false;
      }

      // Validate the preset structure
      if (!layoutPresetsManager.validateLayout(preset.structure)) {
        console.error('Invalid preset structure:', presetId);
        return false;
      }

      // Update split view state with preset layout
      settingsManager.updateSplitViewState({
        layout: preset.structure,
        focusedPaneId: '', // Will be set by renderer
      });

      // Save the last used preset ID
      layoutPresetsManager.saveLastUsedPreset(presetId);

      return true;
    } catch (err) {
      console.error('Failed to apply layout preset:', err);
      return false;
    }
  });

  registry.handle('applyCustomLayout', async (_e, rows, cols) => {
    try {
      const customLayout = layoutPresetsManager.createCustomGridLayout(rows, cols);

      // Validate the generated layout
      if (!layoutPresetsManager.validateLayout(customLayout)) {
        console.error('Invalid custom layout generated');
        return false;
      }

      // Update split view state
      settingsManager.updateSplitViewState({
        layout: customLayout,
        focusedPaneId: '', // Will be set by renderer
      });

      // Save as custom preset
      layoutPresetsManager.saveLastUsedPreset('custom');

      return true;
    } catch (err) {
      console.error('Failed to apply custom layout:', err);
      return false;
    }
  });

  registry.handle('getCurrentLayout', async () => {
    const settings = settingsManager.getSettings();
    if (settings.splitViewState) {
      return settings.splitViewState.layout;
    }
    // Return default single pane layout
    const { v4: uuidv4 } = require('uuid');
    const defaultLayout: import('../shared/ipc-types').LayoutLeaf = {
      type: 'leaf',
      paneId: uuidv4(),
      sessionId: null,
    };
    return defaultLayout;
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

  // ── Session Playbooks ──

  registry.handle('listPlaybooks', async () => playbookManager.listAll());
  registry.handle('getPlaybook', async (_e, id) => playbookManager.get(id));

  registry.handle('addPlaybook', async (_e, request) => {
    try { return playbookManager.add(request); }
    catch (err) { console.error('Failed to add playbook:', err); throw err; }
  });

  registry.handle('updatePlaybook', async (_e, request) => {
    try { return playbookManager.update(request); }
    catch (err) { console.error('Failed to update playbook:', err); throw err; }
  });

  registry.handle('deletePlaybook', async (_e, id) => {
    try { return playbookManager.delete(id); }
    catch (err) { console.error('Failed to delete playbook:', err); throw err; }
  });

  registry.handle('importPlaybook', async (_e, data) => {
    try { return playbookManager.importPlaybook(data); }
    catch (err) { console.error('Failed to import playbook:', err); throw err; }
  });

  registry.handle('exportPlaybook', async (_e, id) => {
    try { return playbookManager.exportPlaybook(id); }
    catch (err) { console.error('Failed to export playbook:', err); throw err; }
  });

  registry.handle('duplicatePlaybook', async (_e, id) => {
    try { return playbookManager.duplicate(id); }
    catch (err) { console.error('Failed to duplicate playbook:', err); throw err; }
  });

  registry.handle('runPlaybook', async (_e, request) => {
    try { return await playbookExecutor.run(request); }
    catch (err) { console.error('Failed to run playbook:', err); throw err; }
  });

  registry.handle('cancelPlaybook', async (_e, sessionId) => {
    return playbookExecutor.cancel(sessionId);
  });

  registry.handle('confirmPlaybook', async (_e, sessionId) => {
    return playbookExecutor.confirm(sessionId);
  });

  registry.handle('getPlaybookExecution', async (_e, sessionId) => {
    return playbookExecutor.getExecution(sessionId);
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

  // ── LaunchTunnel ──

  registry.handle('tunnelList', async () => {
    try { return await tunnelManager.list(); }
    catch (err) { console.error('Failed to list tunnels:', err); throw err; }
  });

  registry.handle('tunnelCreate', async (_e, request) => {
    try { return await tunnelManager.create(request); }
    catch (err) { console.error('Failed to create tunnel:', err); throw err; }
  });

  registry.handle('tunnelStop', async (_e, tunnelId) => {
    try { return await tunnelManager.stop(tunnelId); }
    catch (err) { console.error('Failed to stop tunnel:', err); throw err; }
  });

  registry.handle('tunnelGetInfo', async (_e, tunnelId) => {
    try { return await tunnelManager.getInfo(tunnelId); }
    catch (err) { console.error('Failed to get tunnel info:', err); throw err; }
  });

  registry.handle('tunnelGetLogs', async (_e, tunnelId, limit) => {
    try { return await tunnelManager.getLogs(tunnelId, limit); }
    catch (err) { console.error('Failed to get tunnel logs:', err); throw err; }
  });

  registry.handle('tunnelGetSettings', async () => {
    return tunnelManager.getSettings();
  });

  registry.handle('tunnelUpdateSettings', async (_e, settings) => {
    try { return tunnelManager.updateSettings(settings); }
    catch (err) { console.error('Failed to update tunnel settings:', err); throw err; }
  });

  registry.handle('tunnelGetAccount', async () => {
    try { return await tunnelManager.getAccount(); }
    catch (err) { console.error('Failed to get tunnel account:', err); throw err; }
  });

  registry.handle('tunnelGetUsage', async (_e, tunnelId) => {
    try { return await tunnelManager.getUsage(tunnelId); }
    catch (err) { console.error('Failed to get tunnel usage:', err); throw err; }
  });

  registry.handle('tunnelRefresh', async () => {
    try { return await tunnelManager.refresh(); }
    catch (err) { console.error('Failed to refresh tunnels:', err); throw err; }
  });

  registry.handle('tunnelDetectBinary', async () => {
    return tunnelManager.detectBinary();
  });

  registry.handle('tunnelValidateKey', async (_e, apiKey) => {
    try { return await tunnelManager.validateKey(apiKey); }
    catch (err) { console.error('Failed to validate tunnel API key:', err); throw err; }
  });

  registry.handle('tunnelStopAll', async () => {
    try { return await tunnelManager.stopAll(); }
    catch (err) { console.error('Failed to stop all tunnels:', err); throw err; }
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
