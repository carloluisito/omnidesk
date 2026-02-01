import { readFileSync, existsSync, writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { randomBytes } from 'crypto';
import { z } from 'zod';

// Lazy path resolution - evaluated when needed, not at module load time
// This ensures process.cwd() returns the correct data directory after cli.ts calls process.chdir()
function getConfigPath(): string {
  return join(process.cwd(), 'config', 'settings.json');
}

/**
 * SEC-04: Generate a random password for database services.
 * This replaces hardcoded defaults to improve security.
 */
function generateRandomPassword(): string {
  return randomBytes(16).toString('base64url');
}

// Docker service schema
export const DockerServiceSchema = z.object({
  enabled: z.boolean().default(false),
  port: z.number(),
  image: z.string(),
  version: z.string().optional(),
  username: z.string().optional(),
  password: z.string().optional(),
  database: z.string().optional(),
  dataVolume: z.boolean().default(true),
});

export type DockerService = z.infer<typeof DockerServiceSchema>;

// Docker settings schema
export const DockerSettingsSchema = z.object({
  enabled: z.boolean().default(false),
  autoStart: z.boolean().default(false),
  services: z.object({
    postgres: DockerServiceSchema,
    redis: DockerServiceSchema,
  }),
  networkName: z.string().default('claudedesk-dev-network'),
});

export type DockerSettings = z.infer<typeof DockerSettingsSchema>;

// Settings schema
export const SettingsSchema = z.object({
  // Setup wizard completed
  setupCompleted: z.boolean().default(false),

  // Security acknowledgment (SEC-01)
  securityAcknowledged: z.boolean().default(false),
  acknowledgedAt: z.string().optional(),

  // General settings
  general: z.object({
    theme: z.enum(['light', 'dark', 'system']).default('dark'),
    defaultProofMode: z.enum(['web', 'api', 'cli']).default('web'),
    logRetentionDays: z.number().min(1).max(365).default(30),
    autoCleanupArtifacts: z.boolean().default(false),
  }).default({}),

  // Claude settings (SEC-04: Permission modes)
  claude: z.object({
    permissionMode: z.enum(['autonomous', 'read-only']).default('autonomous'),
  }).default({}),

  // Claude OAuth token (manual configuration fallback)
  claudeToken: z.object({
    encryptedToken: z.string().default(''),
    iv: z.string().default(''),
    tag: z.string().default(''),
    savedAt: z.string().optional(),
    lastValidated: z.string().optional(),
  }).default({
    encryptedToken: '',
    iv: '',
    tag: '',
  }),

  // Voice settings
  voice: z.object({
    whisperModel: z.enum(['tiny.en', 'base.en', 'small.en', 'medium.en', 'large']).default('small.en'),
    enabled: z.boolean().default(true),
  }).default({}),

  // Notification settings
  notifications: z.object({
    enabled: z.boolean().default(true),
    sound: z.boolean().default(true),
    jobComplete: z.boolean().default(true),
    jobFailed: z.boolean().default(true),
  }).default({}),

  // Favorites
  favorites: z.object({
    repos: z.array(z.string()).default([]),
    recentRepos: z.array(z.string()).default([]),
  }).default({}),

  // Agents settings (pinned agents and auto-detection)
  agents: z.object({
    pinnedAgentIds: z.array(z.string()).default([]),
    autoDetect: z.boolean().default(true),
  }).default({}),

  // GitHub OAuth settings
  github: z.object({
    clientId: z.string().optional(),
  }).default({}),

  // GitLab OAuth settings
  gitlab: z.object({
    clientId: z.string().optional(),
  }).default({}),

  // Docker settings
  docker: DockerSettingsSchema.default({
    enabled: false,
    autoStart: false,
    services: {
      postgres: {
        enabled: false,
        port: 5432,
        image: 'postgres',
        version: '16-alpine',
        username: 'claudedesk',
        password: '', // SEC-04: Generated at runtime
        database: 'claudedesk_dev',
        dataVolume: true,
      },
      redis: {
        enabled: false,
        port: 6379,
        image: 'redis',
        version: '7-alpine',
        dataVolume: false,
      },
    },
    networkName: 'claudedesk-dev-network',
  }),

  // Remote access tunnel settings
  tunnel: z.object({
    enabled: z.boolean().default(false),
    autoStart: z.boolean().default(false),
    authToken: z.string().optional(),
    tokenCreatedAt: z.string().optional(),
    lastTunnelUrl: z.string().optional(),
  }).default({ enabled: false, autoStart: false }),

  // Update settings
  update: z.object({
    autoCheck: z.boolean().default(true),
    checkIntervalHours: z.number().min(1).max(168).default(6),
    dismissedVersion: z.string().optional(),
  }).default({}),

  // CI/CD Pipeline Monitoring settings
  cicd: z.object({
    autoMonitor: z.boolean().default(true),
    pollIntervalMs: z.number().min(5000).max(60000).default(10000),
    maxPollDurationMs: z.number().min(300000).max(3600000).default(1800000),
    showNotifications: z.boolean().default(true),
  }).default({
    autoMonitor: true,
    pollIntervalMs: 10000,
    maxPollDurationMs: 1800000,
    showNotifications: true,
  }),

  // MCP (Model Context Protocol) settings
  mcp: z.object({
    globalEnabled: z.boolean().default(true),
    toolApprovalMode: z.enum(['auto', 'ask']).default('auto'),
    connectionTimeout: z.number().default(30000),
    toolTimeout: z.number().default(60000),
  }).default({
    globalEnabled: true,
    toolApprovalMode: 'auto',
    connectionTimeout: 30000,
    toolTimeout: 60000,
  }),

  // Context management settings
  context: z.object({
    autoSummarize: z.boolean().default(true),
    summarizationThreshold: z.number().default(0.7),
    splitThreshold: z.number().default(0.85),
    verbatimRecentCount: z.number().default(6),
    maxMessageLength: z.number().default(4000),
    maxPromptTokens: z.number().default(150000),
  }).default({
    autoSummarize: true,
    summarizationThreshold: 0.7,
    splitThreshold: 0.85,
    verbatimRecentCount: 6,
    maxMessageLength: 4000,
    maxPromptTokens: 150000,
  }),
});

export type Settings = z.infer<typeof SettingsSchema>;

// Default settings
const DEFAULT_SETTINGS: Settings = {
  setupCompleted: false,
  securityAcknowledged: false,
  general: {
    theme: 'dark',
    defaultProofMode: 'web',
    logRetentionDays: 30,
    autoCleanupArtifacts: false,
  },
  claude: {
    permissionMode: 'autonomous',
  },
  claudeToken: {
    encryptedToken: '',
    iv: '',
    tag: '',
  },
  voice: {
    whisperModel: 'small.en',
    enabled: true,
  },
  notifications: {
    enabled: true,
    sound: true,
    jobComplete: true,
    jobFailed: true,
  },
  favorites: {
    repos: [],
    recentRepos: [],
  },
  agents: {
    pinnedAgentIds: [],
    autoDetect: true,
  },
  github: {},
  gitlab: {},
  docker: {
    enabled: false,
    autoStart: false,
    services: {
      postgres: {
        enabled: false,
        port: 5432,
        image: 'postgres',
        version: '16-alpine',
        username: 'claudedesk',
        password: '', // SEC-04: Will be generated on first use
        database: 'claudedesk_dev',
        dataVolume: true,
      },
      redis: {
        enabled: false,
        port: 6379,
        image: 'redis',
        version: '7-alpine',
        dataVolume: false,
      },
    },
    networkName: 'claudedesk-dev-network',
  },
  cicd: {
    autoMonitor: true,
    pollIntervalMs: 10000,
    maxPollDurationMs: 1800000,
    showNotifications: true,
  },
  tunnel: {
    enabled: false,
    autoStart: false,
  },
  update: {
    autoCheck: true,
    checkIntervalHours: 6,
  },
  mcp: {
    globalEnabled: true,
    toolApprovalMode: 'auto',
    connectionTimeout: 30000,
    toolTimeout: 60000,
  },
  context: {
    autoSummarize: true,
    summarizationThreshold: 0.7,
    splitThreshold: 0.85,
    verbatimRecentCount: 6,
    maxMessageLength: 4000,
    maxPromptTokens: 150000,
  },
};

export class SettingsManager {
  private settings: Settings;

  constructor() {
    this.settings = this.load();
  }

  private load(): Settings {
    const configPath = getConfigPath();
    if (!existsSync(configPath)) {
      return this.createDefault();
    }

    try {
      const content = readFileSync(configPath, 'utf-8');
      const parsed = JSON.parse(content);

      // SEC-04: Check if postgres password needs to be generated/migrated
      let postgresPassword = parsed.docker?.services?.postgres?.password;
      let needsSave = false;

      // Generate new password if empty or using old hardcoded default
      if (!postgresPassword || postgresPassword === 'claudedesk_dev') {
        postgresPassword = generateRandomPassword();
        needsSave = true;
        console.log('[Settings] Generated new random password for PostgreSQL');
      }

      // Merge with defaults to handle missing fields
      const settings = SettingsSchema.parse({
        setupCompleted: parsed.setupCompleted ?? DEFAULT_SETTINGS.setupCompleted,
        securityAcknowledged: parsed.securityAcknowledged ?? DEFAULT_SETTINGS.securityAcknowledged,
        acknowledgedAt: parsed.acknowledgedAt,
        general: { ...DEFAULT_SETTINGS.general, ...parsed.general },
        claude: { ...DEFAULT_SETTINGS.claude, ...parsed.claude },
        claudeToken: { ...DEFAULT_SETTINGS.claudeToken, ...parsed.claudeToken },
        voice: { ...DEFAULT_SETTINGS.voice, ...parsed.voice },
        notifications: { ...DEFAULT_SETTINGS.notifications, ...parsed.notifications },
        favorites: { ...DEFAULT_SETTINGS.favorites, ...parsed.favorites },
        agents: { ...DEFAULT_SETTINGS.agents, ...parsed.agents },
        github: { ...DEFAULT_SETTINGS.github, ...parsed.github },
        gitlab: { ...DEFAULT_SETTINGS.gitlab, ...parsed.gitlab },
        docker: {
          ...DEFAULT_SETTINGS.docker,
          ...parsed.docker,
          services: {
            postgres: {
              ...DEFAULT_SETTINGS.docker.services.postgres,
              ...parsed.docker?.services?.postgres,
              password: postgresPassword,
            },
            redis: { ...DEFAULT_SETTINGS.docker.services.redis, ...parsed.docker?.services?.redis },
          },
        },
        cicd: { ...DEFAULT_SETTINGS.cicd, ...parsed.cicd },
        tunnel: { ...DEFAULT_SETTINGS.tunnel, ...parsed.tunnel },
        update: { ...DEFAULT_SETTINGS.update, ...parsed.update },
        mcp: { ...DEFAULT_SETTINGS.mcp, ...parsed.mcp },
        context: { ...DEFAULT_SETTINGS.context, ...parsed.context },
      });

      // Save if password was migrated
      if (needsSave) {
        const dir = dirname(configPath);
        if (!existsSync(dir)) {
          mkdirSync(dir, { recursive: true });
        }
        writeFileSync(configPath, JSON.stringify(settings, null, 2));
      }

      return settings;
    } catch (error) {
      console.warn('Failed to load settings, using defaults:', error);
      return this.createDefault();
    }
  }

  private createDefault(): Settings {
    const configPath = getConfigPath();
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    // SEC-04: Generate random password for postgres instead of using hardcoded default
    const settings: Settings = {
      ...DEFAULT_SETTINGS,
      docker: {
        ...DEFAULT_SETTINGS.docker,
        services: {
          ...DEFAULT_SETTINGS.docker.services,
          postgres: {
            ...DEFAULT_SETTINGS.docker.services.postgres,
            password: generateRandomPassword(),
          },
        },
      },
    };
    writeFileSync(configPath, JSON.stringify(settings, null, 2));
    return settings;
  }

  private save(): void {
    const configPath = getConfigPath();
    const dir = dirname(configPath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(configPath, JSON.stringify(this.settings, null, 2));
  }

  get(): Settings {
    return { ...this.settings };
  }

  getGeneral(): Settings['general'] {
    return { ...this.settings.general };
  }

  getClaude(): Settings['claude'] {
    return { ...this.settings.claude };
  }

  getClaudeToken(): Settings['claudeToken'] {
    return { ...this.settings.claudeToken };
  }

  getVoice(): Settings['voice'] {
    return { ...this.settings.voice };
  }

  getNotifications(): Settings['notifications'] {
    return { ...this.settings.notifications };
  }

  getFavorites(): Settings['favorites'] {
    return { ...this.settings.favorites };
  }

  getAgents(): Settings['agents'] {
    return { ...this.settings.agents };
  }

  getGitHub(): Settings['github'] {
    return { ...this.settings.github };
  }

  getGitLab(): Settings['gitlab'] {
    return { ...this.settings.gitlab };
  }

  getDocker(): Settings['docker'] {
    return JSON.parse(JSON.stringify(this.settings.docker));
  }

  getTunnel(): Settings['tunnel'] {
    return { ...this.settings.tunnel };
  }

  getUpdate(): Settings['update'] {
    return { ...this.settings.update };
  }

  getCicd(): Settings['cicd'] {
    return { ...this.settings.cicd };
  }

  getMcp(): Settings['mcp'] {
    return { ...this.settings.mcp };
  }

  isSetupCompleted(): boolean {
    return this.settings.setupCompleted;
  }

  update(updates: Partial<Settings>): Settings {
    if (updates.setupCompleted !== undefined) {
      this.settings.setupCompleted = updates.setupCompleted;
    }
    if (updates.securityAcknowledged !== undefined) {
      this.settings.securityAcknowledged = updates.securityAcknowledged;
    }
    if (updates.acknowledgedAt !== undefined) {
      this.settings.acknowledgedAt = updates.acknowledgedAt;
    }
    if (updates.general) {
      this.settings.general = { ...this.settings.general, ...updates.general };
    }
    if (updates.claude) {
      this.settings.claude = { ...this.settings.claude, ...updates.claude };
    }
    if (updates.claudeToken) {
      this.settings.claudeToken = { ...this.settings.claudeToken, ...updates.claudeToken };
    }
    if (updates.voice) {
      this.settings.voice = { ...this.settings.voice, ...updates.voice };
    }
    if (updates.notifications) {
      this.settings.notifications = { ...this.settings.notifications, ...updates.notifications };
    }
    if (updates.favorites) {
      this.settings.favorites = { ...this.settings.favorites, ...updates.favorites };
    }
    if (updates.agents) {
      this.settings.agents = { ...this.settings.agents, ...updates.agents };
    }
    if (updates.github) {
      this.settings.github = { ...this.settings.github, ...updates.github };
    }
    if (updates.gitlab) {
      this.settings.gitlab = { ...this.settings.gitlab, ...updates.gitlab };
    }
    if (updates.docker) {
      this.settings.docker = {
        ...this.settings.docker,
        ...updates.docker,
        services: {
          postgres: { ...this.settings.docker.services.postgres, ...updates.docker.services?.postgres },
          redis: { ...this.settings.docker.services.redis, ...updates.docker.services?.redis },
        },
      };
    }
    if (updates.cicd) {
      this.settings.cicd = { ...this.settings.cicd, ...updates.cicd };
    }
    if (updates.tunnel) {
      this.settings.tunnel = { ...this.settings.tunnel, ...updates.tunnel };
    }
    if (updates.update) {
      this.settings.update = { ...this.settings.update, ...updates.update };
    }
    if (updates.mcp) {
      this.settings.mcp = { ...this.settings.mcp, ...updates.mcp };
    }
    if (updates.context) {
      this.settings.context = { ...this.settings.context, ...updates.context };
    }

    // Validate the merged settings
    this.settings = SettingsSchema.parse(this.settings);
    this.save();

    return this.get();
  }

  updateGeneral(updates: Partial<Settings['general']>): Settings['general'] {
    this.settings.general = { ...this.settings.general, ...updates };
    this.save();
    return this.getGeneral();
  }

  updateClaude(updates: Partial<Settings['claude']>): Settings['claude'] {
    this.settings.claude = { ...this.settings.claude, ...updates };
    this.save();
    return this.getClaude();
  }

  updateClaudeToken(updates: Partial<Settings['claudeToken']>): Settings['claudeToken'] {
    this.settings.claudeToken = { ...this.settings.claudeToken, ...updates };
    this.save();
    return this.getClaudeToken();
  }

  updateVoice(updates: Partial<Settings['voice']>): Settings['voice'] {
    this.settings.voice = { ...this.settings.voice, ...updates };
    this.save();
    return this.getVoice();
  }

  updateNotifications(updates: Partial<Settings['notifications']>): Settings['notifications'] {
    this.settings.notifications = { ...this.settings.notifications, ...updates };
    this.save();
    return this.getNotifications();
  }

  updateGitHub(updates: Partial<Settings['github']>): Settings['github'] {
    this.settings.github = { ...this.settings.github, ...updates };
    this.save();
    return this.getGitHub();
  }

  updateGitLab(updates: Partial<Settings['gitlab']>): Settings['gitlab'] {
    this.settings.gitlab = { ...this.settings.gitlab, ...updates };
    this.save();
    return this.getGitLab();
  }

  updateDocker(updates: Partial<Settings['docker']>): Settings['docker'] {
    this.settings.docker = {
      ...this.settings.docker,
      ...updates,
      services: {
        postgres: { ...this.settings.docker.services.postgres, ...updates.services?.postgres },
        redis: { ...this.settings.docker.services.redis, ...updates.services?.redis },
      },
    };
    this.save();
    return this.getDocker();
  }

  updateTunnel(updates: Partial<Settings['tunnel']>): Settings['tunnel'] {
    this.settings.tunnel = { ...this.settings.tunnel, ...updates };
    this.save();
    return this.getTunnel();
  }

  updateUpdate(updates: Partial<Settings['update']>): Settings['update'] {
    this.settings.update = { ...this.settings.update, ...updates };
    this.save();
    return this.getUpdate();
  }

  updateCicd(updates: Partial<Settings['cicd']>): Settings['cicd'] {
    this.settings.cicd = { ...this.settings.cicd, ...updates };
    this.save();
    return this.getCicd();
  }

  updateMcp(updates: Partial<Settings['mcp']>): Settings['mcp'] {
    this.settings.mcp = { ...this.settings.mcp, ...updates };
    this.save();
    return this.getMcp();
  }

  getContext(): Settings['context'] {
    return { ...this.settings.context };
  }

  updateContext(updates: Partial<Settings['context']>): Settings['context'] {
    this.settings.context = { ...this.settings.context, ...updates };
    this.save();
    return this.getContext();
  }

  setSetupCompleted(completed: boolean): void {
    this.settings.setupCompleted = completed;
    this.save();
  }

  // Favorites management
  addFavoriteRepo(repoId: string): void {
    if (!this.settings.favorites.repos.includes(repoId)) {
      this.settings.favorites.repos.push(repoId);
      this.save();
    }
  }

  removeFavoriteRepo(repoId: string): void {
    this.settings.favorites.repos = this.settings.favorites.repos.filter(id => id !== repoId);
    this.save();
  }

  isFavoriteRepo(repoId: string): boolean {
    return this.settings.favorites.repos.includes(repoId);
  }

  // Agents management
  updateAgents(updates: Partial<Settings['agents']>): Settings['agents'] {
    this.settings.agents = { ...this.settings.agents, ...updates };
    this.save();
    return this.getAgents();
  }

  togglePinnedAgent(agentId: string): void {
    const index = this.settings.agents.pinnedAgentIds.indexOf(agentId);
    if (index === -1) {
      this.settings.agents.pinnedAgentIds.push(agentId);
    } else {
      this.settings.agents.pinnedAgentIds.splice(index, 1);
    }
    this.save();
  }

  isPinnedAgent(agentId: string): boolean {
    return this.settings.agents.pinnedAgentIds.includes(agentId);
  }

  addRecentRepo(repoId: string): void {
    // Remove if already exists (to move to front)
    this.settings.favorites.recentRepos = this.settings.favorites.recentRepos.filter(id => id !== repoId);
    // Add to front
    this.settings.favorites.recentRepos.unshift(repoId);
    // Keep only last 5
    this.settings.favorites.recentRepos = this.settings.favorites.recentRepos.slice(0, 5);
    this.save();
  }

  reset(): Settings {
    this.settings = { ...DEFAULT_SETTINGS };
    this.save();
    return this.get();
  }
}

// Lazy singleton - only created on first access (after cli.ts has called process.chdir())
// This ensures process.cwd() returns the correct data directory
let _settingsManager: SettingsManager | null = null;

function getSettingsManagerInstance(): SettingsManager {
  if (!_settingsManager) {
    _settingsManager = new SettingsManager();
  }
  return _settingsManager;
}

// Export a proxy that forwards all property/method access to the lazy instance
// This keeps the same API (settingsManager.get(), settingsManager.update(), etc.)
export const settingsManager = new Proxy({} as SettingsManager, {
  get(_, prop) {
    const instance = getSettingsManagerInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  }
});
