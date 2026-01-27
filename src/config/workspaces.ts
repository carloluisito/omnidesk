import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname, normalize } from 'path';
import { z } from 'zod';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// Lazy path resolution - evaluated when needed, not at module load time
function getConfigPath(): string {
  return join(process.cwd(), 'config', 'workspaces.json');
}

function getEncryptionKeyPath(): string {
  return join(process.cwd(), 'config', '.secrets-key');
}

// Helper to normalize paths to forward slashes for cross-platform comparison
function normalizePath(p: string): string {
  return normalize(p).replace(/\\/g, '/');
}

// Schema for GitHub credentials
const GitHubCredentialsSchema = z.object({
  accessToken: z.string(), // Encrypted
  username: z.string(),
  tokenScope: z.string().default('repo'),
  expiresAt: z.string().nullable().default(null),
});

export type GitHubCredentials = z.infer<typeof GitHubCredentialsSchema>;

// Schema for GitLab credentials
const GitLabCredentialsSchema = z.object({
  accessToken: z.string(), // Encrypted
  refreshToken: z.string().optional(), // Encrypted
  username: z.string(),
  tokenScope: z.string().default('api'),
  expiresAt: z.string().nullable().default(null),
});

export type GitLabCredentials = z.infer<typeof GitLabCredentialsSchema>;

// Schema for proof configuration
const ProofConfigSchema = z.object({
  mode: z.enum(['web', 'api', 'cli']),
  web: z.object({
    url: z.string(),
    waitForSelector: z.string().optional(),
    assertText: z.string().optional(),
  }).optional(),
  api: z.object({
    healthUrl: z.string(),
    timeout: z.number().optional(),
  }).optional(),
  cli: z.object({
    command: z.string(),
    assertStdout: z.string().optional(),
    assertRegex: z.string().optional(),
  }).optional(),
});

// Schema for per-service config override (for monorepos)
const ServiceConfigOverrideSchema = z.object({
  proof: ProofConfigSchema.optional(),
  port: z.number().optional(),
});

export type ServiceConfigOverride = z.infer<typeof ServiceConfigOverrideSchema>;

// Schema for repo config overrides at workspace level
const RepoConfigOverrideSchema = z.object({
  proof: ProofConfigSchema.optional(),
  port: z.number().optional(),
  commands: z.object({
    install: z.string().optional(),
    build: z.string().optional(),
    test: z.string().optional(),
    run: z.string().optional(),
  }).optional(),
  // Per-service overrides for monorepos
  services: z.record(z.string(), ServiceConfigOverrideSchema).optional(),
});

export type RepoConfigOverride = z.infer<typeof RepoConfigOverrideSchema>;

// Schema for workspace
export const WorkspaceSchema = z.object({
  id: z.string().min(1).max(50).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(100),
  scanPath: z.string(),
  github: GitHubCredentialsSchema.optional(),
  gitlab: GitLabCredentialsSchema.optional(),
  repoConfigs: z.record(z.string(), RepoConfigOverrideSchema).optional(),
  // SEC-04: Per-workspace permission mode override (null = use global)
  claudePermissionMode: z.enum(['autonomous', 'read-only']).nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export type Workspace = z.infer<typeof WorkspaceSchema>;

const WorkspacesDataSchema = z.object({
  workspaces: z.array(WorkspaceSchema).default([]),
});

type WorkspacesData = z.infer<typeof WorkspacesDataSchema>;

const DEFAULT_DATA: WorkspacesData = {
  workspaces: [],
};

// Encryption helper (reuses same key as secrets)
class Encryption {
  private key: Buffer;

  constructor() {
    this.key = this.getOrCreateKey();
  }

  private getOrCreateKey(): Buffer {
    const keyPath = getEncryptionKeyPath();
    const dir = dirname(keyPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }

    if (existsSync(keyPath)) {
      const keyHex = readFileSync(keyPath, 'utf-8').trim();
      return Buffer.from(keyHex, 'hex');
    }

    // Generate a new key
    const newKey = randomBytes(32);
    writeFileSync(keyPath, newKey.toString('hex'), { mode: 0o600 });
    return newKey;
  }

  encrypt(plaintext: string): string {
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag();

    // Format: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  decrypt(ciphertext: string): string {
    const [ivHex, authTagHex, encrypted] = ciphertext.split(':');

    if (!ivHex || !authTagHex || !encrypted) {
      throw new Error('Invalid encrypted format');
    }

    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = createDecipheriv('aes-256-gcm', this.key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}

export class WorkspaceManager {
  private data: WorkspacesData;
  private encryption: Encryption;

  constructor() {
    this.encryption = new Encryption();
    this.data = this.load();
  }

  private load(): WorkspacesData {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
      return DEFAULT_DATA;
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      return WorkspacesDataSchema.parse(JSON.parse(content));
    } catch (error) {
      console.error('Failed to load workspaces config:', error);
      return DEFAULT_DATA;
    }
  }

  private save(): void {
    const configPath = getConfigPath();
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(this.data, null, 2));
  }

  // ============================================
  // CRUD Operations
  // ============================================

  getAll(): Workspace[] {
    return [...this.data.workspaces];
  }

  get(id: string): Workspace | undefined {
    return this.data.workspaces.find(w => w.id === id);
  }

  create(name: string, scanPath: string): Workspace {
    // Generate ID from name
    const id = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

    // Check for duplicate ID
    if (this.data.workspaces.some(w => w.id === id)) {
      throw new Error(`Workspace with ID "${id}" already exists`);
    }

    // Check for duplicate path
    const normalizedPath = normalizePath(scanPath).toLowerCase();
    if (this.data.workspaces.some(w => normalizePath(w.scanPath).toLowerCase() === normalizedPath)) {
      throw new Error('A workspace with this path already exists');
    }

    const workspace: Workspace = {
      id,
      name,
      scanPath,
      createdAt: new Date().toISOString(),
    };

    this.data.workspaces.push(workspace);
    this.save();

    return workspace;
  }

  update(id: string, updates: Partial<Pick<Workspace, 'name' | 'scanPath' | 'claudePermissionMode'>>): Workspace {
    const index = this.data.workspaces.findIndex(w => w.id === id);
    if (index === -1) {
      throw new Error(`Workspace not found: ${id}`);
    }

    const workspace = this.data.workspaces[index];

    if (updates.name !== undefined) {
      workspace.name = updates.name;
    }

    if (updates.scanPath !== undefined) {
      // Check for duplicate path
      const normalizedPath = normalizePath(updates.scanPath).toLowerCase();
      const duplicate = this.data.workspaces.find(
        w => w.id !== id && normalizePath(w.scanPath).toLowerCase() === normalizedPath
      );
      if (duplicate) {
        throw new Error('A workspace with this path already exists');
      }
      workspace.scanPath = updates.scanPath;
    }

    if (updates.claudePermissionMode !== undefined) {
      workspace.claudePermissionMode = updates.claudePermissionMode;
    }

    workspace.updatedAt = new Date().toISOString();
    this.save();

    return workspace;
  }

  delete(id: string): boolean {
    const index = this.data.workspaces.findIndex(w => w.id === id);
    if (index === -1) {
      return false;
    }

    this.data.workspaces.splice(index, 1);
    this.save();
    return true;
  }

  // ============================================
  // GitHub OAuth
  // ============================================

  setGitHubToken(
    workspaceId: string,
    accessToken: string,
    username: string,
    scope: string = 'repo'
  ): void {
    const workspace = this.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Encrypt the access token
    const encryptedToken = this.encryption.encrypt(accessToken);

    workspace.github = {
      accessToken: encryptedToken,
      username,
      tokenScope: scope,
      expiresAt: null,
    };
    workspace.updatedAt = new Date().toISOString();

    this.save();
  }

  getGitHubToken(workspaceId: string): string | null {
    const workspace = this.get(workspaceId);
    if (!workspace?.github?.accessToken) {
      return null;
    }

    try {
      return this.encryption.decrypt(workspace.github.accessToken);
    } catch (error) {
      console.error('Failed to decrypt GitHub token:', error);
      return null;
    }
  }

  getGitHubCredentials(workspaceId: string): Omit<GitHubCredentials, 'accessToken'> | null {
    const workspace = this.get(workspaceId);
    if (!workspace?.github) {
      return null;
    }

    // Return credentials without the access token
    return {
      username: workspace.github.username,
      tokenScope: workspace.github.tokenScope,
      expiresAt: workspace.github.expiresAt,
    };
  }

  clearGitHubToken(workspaceId: string): void {
    const workspace = this.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    delete workspace.github;
    workspace.updatedAt = new Date().toISOString();
    this.save();
  }

  // ============================================
  // GitLab OAuth
  // ============================================

  setGitLabToken(
    workspaceId: string,
    accessToken: string,
    username: string,
    scope: string = 'api',
    refreshToken?: string,
    expiresAt?: string | null
  ): void {
    const workspace = this.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    // Encrypt the access token
    const encryptedToken = this.encryption.encrypt(accessToken);

    // Encrypt refresh token if provided
    const encryptedRefreshToken = refreshToken
      ? this.encryption.encrypt(refreshToken)
      : undefined;

    workspace.gitlab = {
      accessToken: encryptedToken,
      refreshToken: encryptedRefreshToken,
      username,
      tokenScope: scope,
      expiresAt: expiresAt ?? null,
    };
    workspace.updatedAt = new Date().toISOString();

    this.save();
  }

  getGitLabToken(workspaceId: string): { accessToken: string; refreshToken?: string } | null {
    const workspace = this.get(workspaceId);
    if (!workspace?.gitlab?.accessToken) {
      return null;
    }

    try {
      const accessToken = this.encryption.decrypt(workspace.gitlab.accessToken);
      const refreshToken = workspace.gitlab.refreshToken
        ? this.encryption.decrypt(workspace.gitlab.refreshToken)
        : undefined;
      return { accessToken, refreshToken };
    } catch (error) {
      console.error('Failed to decrypt GitLab token:', error);
      return null;
    }
  }

  getGitLabCredentials(workspaceId: string): Omit<GitLabCredentials, 'accessToken' | 'refreshToken'> | null {
    const workspace = this.get(workspaceId);
    if (!workspace?.gitlab) {
      return null;
    }

    // Return credentials without the access token
    return {
      username: workspace.gitlab.username,
      tokenScope: workspace.gitlab.tokenScope,
      expiresAt: workspace.gitlab.expiresAt,
    };
  }

  clearGitLabToken(workspaceId: string): void {
    const workspace = this.get(workspaceId);
    if (!workspace) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    delete workspace.gitlab;
    workspace.updatedAt = new Date().toISOString();
    this.save();
  }

  // ============================================
  // Repo Config Overrides
  // ============================================

  setRepoConfig(workspaceId: string, repoId: string, config: RepoConfigOverride): void {
    const index = this.data.workspaces.findIndex(w => w.id === workspaceId);
    if (index === -1) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const workspace = this.data.workspaces[index];
    if (!workspace.repoConfigs) {
      workspace.repoConfigs = {};
    }
    workspace.repoConfigs[repoId] = config;
    workspace.updatedAt = new Date().toISOString();
    this.save();
  }

  getRepoConfig(workspaceId: string, repoId: string): RepoConfigOverride | null {
    const workspace = this.get(workspaceId);
    return workspace?.repoConfigs?.[repoId] ?? null;
  }

  deleteRepoConfig(workspaceId: string, repoId: string): boolean {
    const index = this.data.workspaces.findIndex(w => w.id === workspaceId);
    if (index === -1) return false;

    const workspace = this.data.workspaces[index];
    if (!workspace.repoConfigs?.[repoId]) return false;

    delete workspace.repoConfigs[repoId];
    workspace.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  // ============================================
  // Service Config Overrides (for monorepos)
  // ============================================

  setServiceConfig(workspaceId: string, repoId: string, serviceId: string, config: ServiceConfigOverride): void {
    const index = this.data.workspaces.findIndex(w => w.id === workspaceId);
    if (index === -1) {
      throw new Error(`Workspace not found: ${workspaceId}`);
    }

    const workspace = this.data.workspaces[index];
    if (!workspace.repoConfigs) {
      workspace.repoConfigs = {};
    }
    if (!workspace.repoConfigs[repoId]) {
      workspace.repoConfigs[repoId] = {};
    }
    if (!workspace.repoConfigs[repoId].services) {
      workspace.repoConfigs[repoId].services = {};
    }
    workspace.repoConfigs[repoId].services![serviceId] = config;
    workspace.updatedAt = new Date().toISOString();
    this.save();
  }

  getServiceConfig(workspaceId: string, repoId: string, serviceId: string): ServiceConfigOverride | null {
    const workspace = this.get(workspaceId);
    return workspace?.repoConfigs?.[repoId]?.services?.[serviceId] ?? null;
  }

  deleteServiceConfig(workspaceId: string, repoId: string, serviceId: string): boolean {
    const index = this.data.workspaces.findIndex(w => w.id === workspaceId);
    if (index === -1) return false;

    const workspace = this.data.workspaces[index];
    if (!workspace.repoConfigs?.[repoId]?.services?.[serviceId]) return false;

    delete workspace.repoConfigs[repoId].services![serviceId];
    workspace.updatedAt = new Date().toISOString();
    this.save();
    return true;
  }

  // ============================================
  // Workspace Lookup
  // ============================================

  getWorkspaceForRepo(repoPath: string): Workspace | null {
    const normalizedPath = normalizePath(repoPath).toLowerCase();

    // Find workspace whose scanPath contains this repo
    for (const workspace of this.data.workspaces) {
      const normalizedScanPath = normalizePath(workspace.scanPath).toLowerCase();
      if (normalizedPath.startsWith(normalizedScanPath)) {
        return workspace;
      }
    }

    return null;
  }

  // ============================================
  // Git Credentials Helper
  // ============================================

  /**
   * Get git credentials for a repository path.
   * Looks up the workspace containing the repo and returns any OAuth tokens.
   *
   * @param repoPath - The path to the repository
   * @returns Object with platform, token, and username; or null values if no credentials
   */
  getGitCredentialsForRepo(repoPath: string): {
    platform: 'github' | 'gitlab' | null;
    token: string | null;
    username: string | null;
  } {
    const workspace = this.getWorkspaceForRepo(repoPath);

    if (!workspace) {
      return { platform: null, token: null, username: null };
    }

    // Check GitHub credentials first
    const githubToken = this.getGitHubToken(workspace.id);
    if (githubToken) {
      return {
        platform: 'github',
        token: githubToken,
        username: workspace.github?.username || null,
      };
    }

    // Check GitLab credentials
    const gitlabTokenData = this.getGitLabToken(workspace.id);
    if (gitlabTokenData) {
      return {
        platform: 'gitlab',
        token: gitlabTokenData.accessToken,
        username: workspace.gitlab?.username || null,
      };
    }

    return { platform: null, token: null, username: null };
  }

  // ============================================
  // Migration from scan paths
  // ============================================

  migrateFromScanPaths(scanPaths: string[]): { created: string[]; skipped: string[] } {
    const created: string[] = [];
    const skipped: string[] = [];

    for (const scanPath of scanPaths) {
      // Check if workspace already exists for this path
      const normalizedPath = normalizePath(scanPath).toLowerCase();
      const exists = this.data.workspaces.some(
        w => normalizePath(w.scanPath).toLowerCase() === normalizedPath
      );

      if (exists) {
        skipped.push(scanPath);
        continue;
      }

      // Generate name from path
      const pathParts = scanPath.split(/[\/\\]/);
      const folderName = pathParts[pathParts.length - 1] || 'workspace';
      const name = folderName.charAt(0).toUpperCase() + folderName.slice(1);

      try {
        this.create(name, scanPath);
        created.push(scanPath);
      } catch (error) {
        console.error(`Failed to migrate scan path ${scanPath}:`, error);
        skipped.push(scanPath);
      }
    }

    return { created, skipped };
  }
}

// Lazy singleton - only created on first access (after cli.ts has called process.chdir())
let _workspaceManager: WorkspaceManager | null = null;

function getWorkspaceManagerInstance(): WorkspaceManager {
  if (!_workspaceManager) {
    _workspaceManager = new WorkspaceManager();
  }
  return _workspaceManager;
}

export const workspaceManager = new Proxy({} as WorkspaceManager, {
  get(_, prop) {
    const instance = getWorkspaceManagerInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  }
});
