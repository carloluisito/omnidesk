import { readFileSync, existsSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, basename, normalize, sep } from 'path';
import { homedir } from 'os';
import { z } from 'zod';
import { RepoConfig, RepoConfigSchema } from '../types.js';
import { workspaceManager, type RepoConfigOverride } from './workspaces.js';

// Lazy path resolution - evaluated when needed, not at module load time
function getConfigPath(): string {
  return join(process.cwd(), 'config', 'repos.json');
}

// Allowlisted base paths for repos (platform-agnostic)
const ALLOWED_BASE_PATHS = [
  join(homedir(), 'claudedesk', 'repos'),
  join(homedir(), 'repositories'),
];

const ReposFileSchema = z.object({
  repos: z.array(RepoConfigSchema),
  allowedBasePaths: z.array(z.string()).optional(),
  scanPaths: z.array(z.string()).optional(),
  branchPrefix: z.string().optional(),
});

export class RepoRegistry {
  private repos: Map<string, RepoConfig> = new Map();
  private allowedBasePaths: string[];
  private scanPaths: string[];
  private manualRepos: RepoConfig[] = [];
  private branchPrefix?: string;
  private loaded = false;

  constructor() {
    this.allowedBasePaths = ALLOWED_BASE_PATHS;
    this.scanPaths = [];
  }

  private ensureLoaded(): void {
    if (!this.loaded) {
      this.load();
      this.loaded = true;
    }
  }

  private load(): void {
    console.log('[RepoRegistry] load() called');
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
      console.log('[RepoRegistry] Creating default config');
      this.createDefaultConfig();
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      console.log('[RepoRegistry] Config file loaded');
      const parsed = ReposFileSchema.parse(JSON.parse(content));
      console.log('[RepoRegistry] Config parsed, repos in file:', parsed.repos.length);

      if (parsed.allowedBasePaths) {
        this.allowedBasePaths = parsed.allowedBasePaths;
      }

      if (parsed.scanPaths) {
        this.scanPaths = parsed.scanPaths;
        console.log('[RepoRegistry] Loaded scanPaths:', this.scanPaths);
      }

      if (parsed.branchPrefix) {
        this.branchPrefix = parsed.branchPrefix;
      }

      // Load manually configured repos
      this.manualRepos = parsed.repos;
      for (const repo of parsed.repos) {
        this.validateRepoPath(repo.path);
        this.repos.set(repo.id, repo);
      }
      console.log('[RepoRegistry] Manual repos loaded:', this.manualRepos.length);

      // Auto-discover repos from scan paths
      this.scanForRepos();
    } catch (error) {
      console.error('[RepoRegistry] Failed to load repos config:', error);
      throw new Error(`Failed to load repos config: ${error}`);
    }
  }

  private scanForRepos(): void {
    console.log('[RepoRegistry] scanForRepos() called');
    console.log('[RepoRegistry] Legacy scanPaths:', this.scanPaths);

    // First, scan legacy scan paths (for backwards compatibility)
    for (const scanPath of this.scanPaths) {
      console.log(`[RepoRegistry] Scanning legacy path: ${scanPath}`);
      this.scanSinglePath(scanPath);
    }

    console.log('[RepoRegistry] After legacy scan, repos:', this.repos.size);

    // Then, scan workspace paths
    const workspaces = workspaceManager.getAll();
    console.log('[RepoRegistry] Workspaces found:', workspaces.length, workspaces.map(w => w.id));

    for (const workspace of workspaces) {
      console.log(`[RepoRegistry] Scanning workspace ${workspace.id} path: ${workspace.scanPath}`);
      if (workspace.scanPath && existsSync(workspace.scanPath)) {
        this.scanSinglePath(workspace.scanPath, workspace.id);
      } else {
        console.log(`[RepoRegistry] Skipping workspace ${workspace.id} - path doesn't exist or is empty`);
      }
    }

    console.log('[RepoRegistry] Final repo count:', this.repos.size);
    console.log('[RepoRegistry] Repo IDs:', Array.from(this.repos.keys()));
  }

  private scanSinglePath(scanPath: string, workspaceId?: string): void {
    console.log(`[RepoRegistry] scanSinglePath(${scanPath}, ${workspaceId})`);

    if (!existsSync(scanPath)) {
      console.warn(`[RepoRegistry] Scan path does not exist: ${scanPath}`);
      return;
    }

    try {
      const entries = readdirSync(scanPath);
      console.log(`[RepoRegistry] Found ${entries.length} entries in ${scanPath}`);

      for (const entry of entries) {
        const fullPath = join(scanPath, entry);

        // Skip if not a directory
        if (!statSync(fullPath).isDirectory()) continue;

        // Skip if already manually configured
        const existingRepo = Array.from(this.repos.values()).find(r =>
          r.path.toLowerCase() === fullPath.toLowerCase()
        );
        if (existingRepo) {
          console.log(`[RepoRegistry] ${entry}: Already exists, updating workspaceId to ${workspaceId}`);
          // Update workspaceId if discovered from a workspace
          if (workspaceId && !existingRepo.workspaceId) {
            existingRepo.workspaceId = workspaceId;
          }
          // Apply workspace config override to existing repo
          if (workspaceId) {
            const merged = this.mergeWithWorkspaceConfig(existingRepo, workspaceId);
            existingRepo.proof = merged.proof;
            existingRepo.port = merged.port;
            existingRepo.commands = merged.commands;
          }
          continue;
        }

        // Check if it's a valid repo (has .git or package.json)
        const hasGit = existsSync(join(fullPath, '.git'));
        const hasPackageJson = existsSync(join(fullPath, 'package.json'));

        if (!hasGit && !hasPackageJson) {
          console.log(`[RepoRegistry] ${entry}: Skipping (no .git or package.json)`);
          continue;
        }

        console.log(`[RepoRegistry] ${entry}: Generating config (git=${hasGit}, pkg=${hasPackageJson})`);
        // Auto-generate repo config
        let repoConfig = this.generateRepoConfig(fullPath, entry, workspaceId);
        if (repoConfig) {
          // Merge with workspace config overrides if available
          if (workspaceId) {
            repoConfig = this.mergeWithWorkspaceConfig(repoConfig, workspaceId);
          }
          console.log(`[RepoRegistry] ${entry}: Added with workspaceId=${repoConfig.workspaceId}`);
          this.repos.set(repoConfig.id, repoConfig);
        }
      }
    } catch (error) {
      console.error(`[RepoRegistry] Failed to scan ${scanPath}:`, error);
    }
  }

  private generateRepoConfig(repoPath: string, dirName: string, workspaceId?: string): RepoConfig | null {
    const id = dirName.toLowerCase().replace(/[^a-z0-9-]/g, '-');

    // Detect project type and generate appropriate config
    const hasPackageJson = existsSync(join(repoPath, 'package.json'));
    const hasCargoToml = existsSync(join(repoPath, 'Cargo.toml'));
    const hasPyProject = existsSync(join(repoPath, 'pyproject.toml')) || existsSync(join(repoPath, 'setup.py'));
    const hasGoMod = existsSync(join(repoPath, 'go.mod'));

    let commands: RepoConfig['commands'] = {};
    let proof: RepoConfig['proof'] = { mode: 'cli', cli: { command: 'echo "No proof configured"' } };
    let port: number | undefined;

    if (hasPackageJson) {
      // Read package.json for scripts
      try {
        const pkg = JSON.parse(readFileSync(join(repoPath, 'package.json'), 'utf-8'));
        const allDeps = { ...pkg.dependencies, ...pkg.devDependencies };

        commands = {
          install: 'npm install',
          build: pkg.scripts?.build ? 'npm run build' : undefined,
          test: pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1' ? 'npm test' : undefined,
          run: pkg.scripts?.dev ? 'npm run dev' : (pkg.scripts?.start ? 'npm start' : undefined),
        };

        // Detect port and proof mode based on framework
        if (pkg.scripts?.dev || pkg.scripts?.start) {
          // Check if it's a frontend framework (use web proof with screenshot)
          const isFrontend = allDeps['vite'] || allDeps['next'] || allDeps['react-scripts'] ||
                            allDeps['react'] || allDeps['vue'] || allDeps['svelte'] ||
                            allDeps['@angular/core'];

          // Check if it's a backend API framework (use api health check)
          const isBackend = allDeps['express'] || allDeps['fastify'] || allDeps['@nestjs/core'] ||
                           allDeps['koa'] || allDeps['hapi'] || allDeps['restify'];

          // Vite uses port 5173 by default
          if (allDeps['vite']) {
            port = 5173;
          }
          // Next.js uses port 3000
          else if (allDeps['next']) {
            port = 3000;
          }
          // Create React App uses port 3000
          else if (allDeps['react-scripts']) {
            port = 3000;
          }
          // Default to 3000
          else {
            port = 3000;
          }

          // Use web proof for frontend apps (takes screenshot), api proof for backends
          if (isFrontend && !isBackend) {
            proof = { mode: 'web', web: { url: `http://localhost:${port}` } };
          } else {
            proof = { mode: 'api', api: { healthUrl: `http://localhost:${port}`, timeout: 30000 } };
          }
        }
      } catch {
        commands = { install: 'npm install' };
      }
    } else if (hasCargoToml) {
      commands = {
        build: 'cargo build',
        test: 'cargo test',
        run: 'cargo run',
      };
    } else if (hasPyProject) {
      commands = {
        install: 'pip install -e .',
        test: 'pytest',
        run: 'python -m ' + id.replace(/-/g, '_'),
      };
    } else if (hasGoMod) {
      commands = {
        build: 'go build',
        test: 'go test ./...',
        run: 'go run .',
      };
    }

    return {
      id,
      path: repoPath,
      commands,
      proof,
      port,
      workspaceId,
    };
  }

  private mergeWithWorkspaceConfig(repo: RepoConfig, workspaceId: string): RepoConfig {
    const workspace = workspaceManager.get(workspaceId);
    const override = workspace?.repoConfigs?.[repo.id];

    if (!override) return repo;

    console.log(`[RepoRegistry] Applying workspace config override for ${repo.id}`);

    // Merge proof config, ensuring timeout has a default if api mode is used
    let mergedProof = repo.proof;
    if (override.proof) {
      mergedProof = {
        ...override.proof,
        api: override.proof.api ? {
          ...override.proof.api,
          timeout: override.proof.api.timeout ?? 30000,
        } : undefined,
      };
    }

    return {
      ...repo,
      proof: mergedProof,
      port: override.port ?? repo.port,
      commands: override.commands
        ? { ...repo.commands, ...override.commands }
        : repo.commands,
    };
  }

  private createDefaultConfig(): void {
    const defaultConfig = {
      allowedBasePaths: ALLOWED_BASE_PATHS,
      scanPaths: [],
      repos: [],
    };
    writeFileSync(getConfigPath(), JSON.stringify(defaultConfig, null, 2));
  }

  private validateRepoPath(repoPath: string): void {
    const normalizedPath = normalize(repoPath);

    // Check both allowedBasePaths and scanPaths
    const allAllowedPaths = [...this.allowedBasePaths, ...this.scanPaths];
    const isAllowed = allAllowedPaths.some(basePath =>
      normalizedPath.toLowerCase().startsWith(normalize(basePath).toLowerCase())
    );

    if (!isAllowed) {
      throw new Error(
        `Repo path "${repoPath}" is not under an allowed base path. ` +
        `Allowed: ${allAllowedPaths.join(', ')}`
      );
    }
  }

  get(id: string): RepoConfig | undefined {
    this.ensureLoaded();
    return this.repos.get(id);
  }

  getAll(): RepoConfig[] {
    this.ensureLoaded();
    return Array.from(this.repos.values());
  }

  getBranchPrefix(): string | undefined {
    this.ensureLoaded();
    return this.branchPrefix;
  }

  add(repo: RepoConfig): void {
    this.ensureLoaded();
    const validated = RepoConfigSchema.parse(repo);
    this.validateRepoPath(validated.path);
    this.repos.set(validated.id, validated);
    this.save();
  }

  remove(id: string): boolean {
    this.ensureLoaded();
    const deleted = this.repos.delete(id);
    if (deleted) {
      this.save();
    }
    return deleted;
  }

  private save(): void {
    // Only save manually configured repos, not auto-discovered ones
    const manualRepoIds = new Set(this.manualRepos.map(r => r.id));
    const reposToSave = Array.from(this.repos.values()).filter(r =>
      manualRepoIds.has(r.id) || !this.isAutoDiscovered(r.path)
    );

    const config = {
      allowedBasePaths: this.allowedBasePaths,
      scanPaths: this.scanPaths,
      repos: reposToSave,
    };
    writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  }

  private isAutoDiscovered(repoPath: string): boolean {
    return this.scanPaths.some(scanPath =>
      repoPath.toLowerCase().startsWith(scanPath.toLowerCase())
    );
  }

  // Reload repos (useful after adding new scan paths)
  reload(): void {
    this.repos.clear();
    this.load();
  }

  // Get current scan paths
  getScanPaths(): string[] {
    return [...this.scanPaths];
  }

  // Determine repo category based on folder path
  getRepoCategory(repoPath: string): 'work-github' | 'personal-github' | 'local' {
    const normalizedPath = normalize(repoPath).toLowerCase();

    // Check which scan path this repo falls under
    for (const scanPath of this.scanPaths) {
      const normalizedScanPath = normalize(scanPath).toLowerCase();
      if (normalizedPath.startsWith(normalizedScanPath)) {
        // Determine category from scan path name
        if (normalizedScanPath.includes(`${sep}work`)) {
          return 'work-github';
        } else if (normalizedScanPath.includes(`${sep}personal`)) {
          return 'personal-github';
        }
      }
    }

    // Default to local if not in any known scan path
    return 'local';
  }

  // Add a scan path and discover repos
  addScanPath(scanPath: string): { addedRepos: string[], scanPath: string } {
    this.ensureLoaded();
    // Normalize path and remove trailing separator
    const normalizedPath = normalize(scanPath).replace(new RegExp(`${sep.replace(/\\/g, '\\\\')}$`), '');

    // Check if path exists
    if (!existsSync(normalizedPath)) {
      throw new Error(`Path does not exist: ${normalizedPath}`);
    }

    // Check if it's a directory
    if (!statSync(normalizedPath).isDirectory()) {
      throw new Error(`Path is not a directory: ${normalizedPath}`);
    }

    // Check if already added
    if (this.scanPaths.some(p => p.toLowerCase() === normalizedPath.toLowerCase())) {
      // Just rescan and return
      const beforeCount = this.repos.size;
      this.scanForRepos();
      const addedRepos = Array.from(this.repos.values())
        .filter(r => r.path.toLowerCase().startsWith(normalizedPath.toLowerCase()))
        .map(r => r.id);
      return { addedRepos, scanPath: normalizedPath };
    }

    // Add to scan paths
    this.scanPaths.push(normalizedPath);

    // Scan for repos in this path
    const reposBefore = new Set(this.repos.keys());
    this.scanForRepos();
    const reposAfter = new Set(this.repos.keys());

    // Find newly added repos
    const addedRepos = Array.from(reposAfter).filter(id => !reposBefore.has(id));

    // Save config
    this.saveConfig();

    return { addedRepos, scanPath: normalizedPath };
  }

  // Remove a scan path
  removeScanPath(scanPath: string): boolean {
    this.ensureLoaded();
    const normalizedPath = normalize(scanPath).replace(new RegExp(`${sep.replace(/\\/g, '\\\\')}$`), '');
    const index = this.scanPaths.findIndex(p => p.toLowerCase() === normalizedPath.toLowerCase());

    if (index === -1) {
      return false;
    }

    // Remove the scan path
    this.scanPaths.splice(index, 1);

    // Remove repos that were discovered from this path
    const reposToRemove: string[] = [];
    for (const [id, repo] of this.repos) {
      if (repo.path.toLowerCase().startsWith(normalizedPath.toLowerCase())) {
        // Only remove if it was auto-discovered (not manually configured)
        if (!this.manualRepos.some(r => r.id === id)) {
          reposToRemove.push(id);
        }
      }
    }

    for (const id of reposToRemove) {
      this.repos.delete(id);
    }

    // Save config
    this.saveConfig();

    return true;
  }

  private saveConfig(): void {
    const config = {
      allowedBasePaths: this.allowedBasePaths,
      scanPaths: this.scanPaths,
      repos: this.manualRepos,
    };
    writeFileSync(getConfigPath(), JSON.stringify(config, null, 2));
  }
}

// Lazy singleton - only created on first access (after cli.ts has called process.chdir())
let _repoRegistry: RepoRegistry | null = null;

function getRepoRegistryInstance(): RepoRegistry {
  if (!_repoRegistry) {
    _repoRegistry = new RepoRegistry();
  }
  return _repoRegistry;
}

export const repoRegistry = new Proxy({} as RepoRegistry, {
  get(_, prop) {
    const instance = getRepoRegistryInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  }
});
