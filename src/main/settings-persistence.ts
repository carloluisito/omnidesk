import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  AppSettings,
  Workspace,
  WorkspaceCreateRequest,
  WorkspaceUpdateRequest,
  WorkspaceValidationResult,
  DragDropSettings,
  SplitViewState,
  SessionPoolSettings,
  LayoutNode,
} from '../shared/ipc-types';
import type { AtlasSettings } from '../shared/types/atlas-types';
import type { WorktreeSettings, WorktreeInfo } from '../shared/types/git-types';
import { CONFIG_DIR, ensureConfigDir } from './config-dir';

const WORKTREE_REGISTRY_FILE = path.join(CONFIG_DIR, 'worktrees.json');
const SETTINGS_FILE = path.join(CONFIG_DIR, 'settings.json');
const MAX_WORKSPACES = 50;

function getDefaultSettings(): AppSettings {
  return {
    version: 1,
    workspaces: [],
    dragDropSettings: {
      defaultInsertMode: 'path',
      pathFormat: 'quoted',
      multiFileSeparator: 'space',
      maxContentSizeKB: 100,
      categoryOverrides: {
        code: { insertMode: 'content', maxSizeKB: 50 },
        markup: { insertMode: 'content', maxSizeKB: 100 },
        document: { insertMode: 'path' },
        image: { insertMode: 'path' },
        binary: { insertMode: 'path' },
      },
    },
    sessionPoolSettings: {
      enabled: true,
      poolSize: 1,
      maxIdleTimeMs: 300000, // 5 minutes
    },
    atlasSettings: {
      enableAtlas: true,
      maxInlineTags: 20,
      domainInferenceSensitivity: 'medium',
      atlasOutputLocation: 'root',
      excludePatterns: [],
      scanTimeoutMs: 30000,
    },
    enableAgentTeams: true,
    defaultModel: 'sonnet',
    modelPreset: 'balanced',
  };
}

// Validate split view layout by removing invalid session references
function validateSplitViewLayout(
  layout: LayoutNode,
  validSessionIds: Set<string>
): LayoutNode {
  if (layout.type === 'leaf') {
    // If sessionId is invalid, set to null
    const sessionId = layout.sessionId && validSessionIds.has(layout.sessionId)
      ? layout.sessionId
      : null;
    return { ...layout, sessionId };
  }

  if (layout.type === 'branch') {
    // Branch: recursively validate children
    return {
      ...layout,
      children: [
        validateSplitViewLayout(layout.children[0], validSessionIds),
        validateSplitViewLayout(layout.children[1], validSessionIds)
      ] as [LayoutNode, LayoutNode]
    };
  }

  if (layout.type === 'grid') {
    // Grid: recursively validate all children
    return {
      ...layout,
      children: layout.children.map(child => validateSplitViewLayout(child, validSessionIds))
    };
  }

  return layout;
}

// Get all pane IDs from layout tree
function getAllPaneIdsFromLayout(layout: LayoutNode): string[] {
  if (layout.type === 'leaf') {
    return [layout.paneId];
  }
  if (layout.type === 'branch') {
    return [
      ...getAllPaneIdsFromLayout(layout.children[0]),
      ...getAllPaneIdsFromLayout(layout.children[1])
    ];
  }
  if (layout.type === 'grid') {
    return layout.children.flatMap(child => getAllPaneIdsFromLayout(child));
  }
  return [];
}

// Validate layout structure (ensure it's well-formed)
function isValidLayoutStructure(layout: LayoutNode): boolean {
  try {
    if (layout.type === 'leaf') {
      return typeof layout.paneId === 'string' && layout.paneId.length > 0;
    }

    if (layout.type === 'branch') {
      if (!Array.isArray(layout.children) || layout.children.length !== 2) {
        return false;
      }
      if (typeof layout.ratio !== 'number' || layout.ratio < 0.1 || layout.ratio > 0.9) {
        return false;
      }
      if (layout.direction !== 'horizontal' && layout.direction !== 'vertical') {
        return false;
      }
      return isValidLayoutStructure(layout.children[0]) && isValidLayoutStructure(layout.children[1]);
    }

    if (layout.type === 'grid') {
      if (typeof layout.id !== 'string' || layout.id.length === 0) {
        return false;
      }
      if (layout.direction !== 'horizontal' && layout.direction !== 'vertical') {
        return false;
      }
      if (!Array.isArray(layout.children) || layout.children.length === 0) {
        return false;
      }
      if (!Array.isArray(layout.sizes) || layout.sizes.length !== layout.children.length) {
        return false;
      }
      // Validate sizes sum to approximately 100
      const sum = layout.sizes.reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.5) {
        return false;
      }
      // Validate all children
      return layout.children.every(child => isValidLayoutStructure(child));
    }

    return false;
  } catch {
    return false;
  }
}

export function loadSettings(): AppSettings {
  try {
    if (fs.existsSync(SETTINGS_FILE)) {
      const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
      const settings = JSON.parse(data) as AppSettings;

      // Validate version
      if (settings.version !== 1) {
        console.warn('Unknown settings version, using defaults');
        return getDefaultSettings();
      }

      // Merge with defaults for any missing fields (backward compatibility)
      const defaults = getDefaultSettings();
      if (!settings.dragDropSettings) {
        settings.dragDropSettings = defaults.dragDropSettings;
      }
      if (!settings.sessionPoolSettings) {
        settings.sessionPoolSettings = defaults.sessionPoolSettings;
      }
      if (!settings.atlasSettings) {
        settings.atlasSettings = defaults.atlasSettings;
      }

      return settings;
    }
  } catch (err) {
    console.error('Failed to load settings:', err);
  }
  return getDefaultSettings();
}

function saveSettings(settings: AppSettings): void {
  try {
    ensureConfigDir();
    const tempFile = `${SETTINGS_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(settings, null, 2), 'utf-8');
    fs.renameSync(tempFile, SETTINGS_FILE);
  } catch (err) {
    console.error('Failed to save settings:', err);
    throw err;
  }
}

function normalizePath(inputPath: string): string {
  // Expand ~ to home directory
  if (inputPath.startsWith('~')) {
    inputPath = path.join(app.getPath('home'), inputPath.slice(1));
  }
  // Resolve to absolute path and normalize
  return path.resolve(inputPath);
}

export function validateWorkspacePath(
  inputPath: string,
  existingWorkspaces: Workspace[],
  excludeId?: string
): WorkspaceValidationResult {
  try {
    const normalizedPath = normalizePath(inputPath);

    // Check if path exists
    if (!fs.existsSync(normalizedPath)) {
      return { valid: false, error: 'NOT_FOUND' };
    }

    // Check if it's a directory
    const stats = fs.statSync(normalizedPath);
    if (!stats.isDirectory()) {
      return { valid: false, error: 'NOT_DIRECTORY' };
    }

    // Check for duplicates (case-insensitive on Windows)
    const isDuplicate = existingWorkspaces.some(w => {
      if (excludeId && w.id === excludeId) return false;
      const existingNormalized = normalizePath(w.path);
      if (process.platform === 'win32') {
        return existingNormalized.toLowerCase() === normalizedPath.toLowerCase();
      }
      return existingNormalized === normalizedPath;
    });

    if (isDuplicate) {
      return { valid: false, error: 'DUPLICATE_PATH' };
    }

    return { valid: true, normalizedPath };
  } catch (err) {
    console.error('Error validating workspace path:', err);
    return { valid: false, error: 'NO_ACCESS' };
  }
}

export class SettingsManager {
  private settings: AppSettings;

  constructor() {
    this.settings = loadSettings();
  }

  getSettings(): AppSettings {
    return { ...this.settings };
  }

  getWorkspaces(): Workspace[] {
    return [...this.settings.workspaces];
  }

  addWorkspace(request: WorkspaceCreateRequest): Workspace {
    if (this.settings.workspaces.length >= MAX_WORKSPACES) {
      throw new Error(`Maximum ${MAX_WORKSPACES} workspaces allowed`);
    }

    // Validate name
    const name = request.name.trim();
    if (!name || name.length > 50) {
      throw new Error('Workspace name must be 1-50 characters');
    }

    // Validate path
    const validation = validateWorkspacePath(request.path, this.settings.workspaces);
    if (!validation.valid) {
      throw new Error(this.getValidationErrorMessage(validation.error!));
    }

    const now = Date.now();
    const workspace: Workspace = {
      id: uuidv4(),
      name,
      path: validation.normalizedPath!,
      defaultPermissionMode: request.defaultPermissionMode,
      createdAt: now,
      updatedAt: now,
    };

    this.settings.workspaces.push(workspace);
    saveSettings(this.settings);

    return workspace;
  }

  updateWorkspace(request: WorkspaceUpdateRequest): Workspace {
    const index = this.settings.workspaces.findIndex(w => w.id === request.id);
    if (index === -1) {
      throw new Error('Workspace not found');
    }

    const workspace = this.settings.workspaces[index];

    // Validate name if provided
    if (request.name !== undefined) {
      const name = request.name.trim();
      if (!name || name.length > 50) {
        throw new Error('Workspace name must be 1-50 characters');
      }
      workspace.name = name;
    }

    // Validate path if provided
    if (request.path !== undefined) {
      const validation = validateWorkspacePath(
        request.path,
        this.settings.workspaces,
        request.id
      );
      if (!validation.valid) {
        throw new Error(this.getValidationErrorMessage(validation.error!));
      }
      workspace.path = validation.normalizedPath!;
    }

    // Update permission mode if provided
    if (request.defaultPermissionMode !== undefined) {
      workspace.defaultPermissionMode = request.defaultPermissionMode;
    }

    workspace.updatedAt = Date.now();
    saveSettings(this.settings);

    return workspace;
  }

  deleteWorkspace(workspaceId: string): boolean {
    const index = this.settings.workspaces.findIndex(w => w.id === workspaceId);
    if (index === -1) {
      return false;
    }

    this.settings.workspaces.splice(index, 1);
    saveSettings(this.settings);

    return true;
  }

  validatePath(path: string, excludeId?: string): WorkspaceValidationResult {
    return validateWorkspacePath(path, this.settings.workspaces, excludeId);
  }

  updateDragDropSettings(settings: Partial<DragDropSettings>): DragDropSettings {
    const defaults = getDefaultSettings();
    this.settings.dragDropSettings = {
      ...(this.settings.dragDropSettings || defaults.dragDropSettings!),
      ...settings,
    };
    saveSettings(this.settings);
    return this.settings.dragDropSettings;
  }

  getDragDropSettings(): DragDropSettings {
    const defaults = getDefaultSettings();
    return this.settings.dragDropSettings || defaults.dragDropSettings!;
  }

  updateSplitViewState(splitViewState: SplitViewState | null): void {
    this.settings.splitViewState = splitViewState;
    saveSettings(this.settings);
  }

  updateSessionPoolSettings(settings: Partial<SessionPoolSettings>): SessionPoolSettings {
    const defaults = getDefaultSettings();
    this.settings.sessionPoolSettings = {
      ...(this.settings.sessionPoolSettings || defaults.sessionPoolSettings!),
      ...settings,
    };
    saveSettings(this.settings);
    return this.settings.sessionPoolSettings;
  }

  getSessionPoolSettings(): SessionPoolSettings {
    const defaults = getDefaultSettings();
    return this.settings.sessionPoolSettings || defaults.sessionPoolSettings!;
  }

  getAtlasSettings(): AtlasSettings {
    const defaults = getDefaultSettings();
    return this.settings.atlasSettings || defaults.atlasSettings!;
  }

  updateAtlasSettings(settings: Partial<AtlasSettings>): AtlasSettings {
    const defaults = getDefaultSettings();
    this.settings.atlasSettings = {
      ...(this.settings.atlasSettings || defaults.atlasSettings!),
      ...settings,
    };
    saveSettings(this.settings);
    return this.settings.atlasSettings;
  }

  getEnableAgentTeams(): boolean {
    return this.settings.enableAgentTeams !== false;
  }

  updateEnableAgentTeams(enabled: boolean): void {
    this.settings.enableAgentTeams = enabled;
    saveSettings(this.settings);
  }

  updateAutoLayoutTeams(enabled: boolean): void {
    this.settings.autoLayoutTeams = enabled;
    saveSettings(this.settings);
  }

  updateUIMode(mode: 'beginner' | 'expert'): void {
    this.settings.uiMode = mode;
    saveSettings(this.settings);
  }

  updateDefaultModel(model: import('../shared/ipc-types').ClaudeModel): void {
    this.settings.defaultModel = model;
    saveSettings(this.settings);
  }

  updateLastUsedLayoutPreset(presetId: string): void {
    this.settings.lastUsedLayoutPresetId = presetId;
    saveSettings(this.settings);
  }

  markAsLaunched(): void {
    this.settings.hasLaunchedBefore = true;
    saveSettings(this.settings);
  }

  validateSplitViewState(validSessionIds: string[]): void {
    if (!this.settings.splitViewState) {
      return;
    }

    const { layout, focusedPaneId } = this.settings.splitViewState;

    // Validate layout structure
    if (!isValidLayoutStructure(layout)) {
      console.warn('Invalid split view layout structure, resetting to null');
      this.settings.splitViewState = null;
      saveSettings(this.settings);
      return;
    }

    // Validate session references
    const validSessionIdSet = new Set(validSessionIds);
    const validatedLayout = validateSplitViewLayout(layout, validSessionIdSet);

    // Validate focusedPaneId
    const allPaneIds = getAllPaneIdsFromLayout(validatedLayout);
    const validFocusedPaneId = allPaneIds.includes(focusedPaneId)
      ? focusedPaneId
      : allPaneIds[0];

    // Update settings with validated state
    this.settings.splitViewState = {
      layout: validatedLayout,
      focusedPaneId: validFocusedPaneId,
    };

    saveSettings(this.settings);
  }

  getWorktreeSettings(): WorktreeSettings {
    return this.settings.worktreeSettings || {
      basePath: 'sibling',
      cleanupOnSessionClose: 'ask',
    };
  }

  updateWorktreeSettings(settings: Partial<WorktreeSettings>): WorktreeSettings {
    this.settings.worktreeSettings = {
      ...this.getWorktreeSettings(),
      ...settings,
    };
    saveSettings(this.settings);
    return this.settings.worktreeSettings;
  }

  private getValidationErrorMessage(error: string): string {
    switch (error) {
      case 'NOT_FOUND':
        return 'Directory does not exist';
      case 'NOT_DIRECTORY':
        return 'Path is not a directory';
      case 'NO_ACCESS':
        return 'Cannot access directory';
      case 'DUPLICATE_PATH':
        return 'A workspace with this path already exists';
      default:
        return 'Invalid path';
    }
  }
}

// ── Worktree Registry ──

interface WorktreeRegistry {
  version: 1;
  worktrees: WorktreeInfo[];
}

export function loadWorktreeRegistry(): WorktreeInfo[] {
  try {
    if (fs.existsSync(WORKTREE_REGISTRY_FILE)) {
      const data = fs.readFileSync(WORKTREE_REGISTRY_FILE, 'utf-8');
      const registry = JSON.parse(data) as WorktreeRegistry;
      if (registry.version === 1 && Array.isArray(registry.worktrees)) {
        // Prune entries where the path no longer exists
        return registry.worktrees.filter(wt => fs.existsSync(wt.worktreePath));
      }
    }
  } catch (err) {
    console.error('Failed to load worktree registry:', err);
  }
  return [];
}

export function saveWorktreeRegistry(worktrees: WorktreeInfo[]): void {
  try {
    ensureConfigDir();
    const registry: WorktreeRegistry = { version: 1, worktrees };
    const tempFile = `${WORKTREE_REGISTRY_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(registry, null, 2), 'utf-8');
    fs.renameSync(tempFile, WORKTREE_REGISTRY_FILE);
  } catch (err) {
    console.error('Failed to save worktree registry:', err);
  }
}

export function addWorktreeToRegistry(info: WorktreeInfo): void {
  const worktrees = loadWorktreeRegistry();
  // Avoid duplicates
  const existing = worktrees.findIndex(wt => wt.worktreePath === info.worktreePath);
  if (existing >= 0) {
    worktrees[existing] = info;
  } else {
    worktrees.push(info);
  }
  saveWorktreeRegistry(worktrees);
}

export function removeWorktreeFromRegistry(worktreePath: string): void {
  const worktrees = loadWorktreeRegistry().filter(wt => wt.worktreePath !== worktreePath);
  saveWorktreeRegistry(worktrees);
}

export function isWorktreeManagedByOmniDesk(worktreePath: string): boolean {
  const worktrees = loadWorktreeRegistry();
  return worktrees.some(wt => wt.worktreePath === worktreePath && (wt.managedByOmniDesk ?? wt.managedByClaudeDesk));
}
