import { z } from 'zod';

// Repo configuration schema
export const RepoConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/, 'Repo ID must be lowercase alphanumeric with dashes'),
  path: z.string(),
  commands: z.object({
    install: z.string().optional(),
    build: z.string().optional(),
    test: z.string().optional(),
    run: z.string().optional(),
  }),
  proof: z.object({
    mode: z.enum(['web', 'api', 'cli']),
    web: z.object({
      url: z.string(),
      waitForSelector: z.string().optional(),
      assertText: z.string().optional(),
    }).optional(),
    api: z.object({
      healthUrl: z.string(),
      timeout: z.number().default(30000),
    }).optional(),
    cli: z.object({
      command: z.string(),
      assertStdout: z.string().optional(),
      assertRegex: z.string().optional(),
    }).optional(),
  }),
  port: z.number().optional(),
  tunnel: z.object({
    enabled: z.boolean().default(false),
  }).optional(),
  workspaceId: z.string().optional(),
  hasGit: z.boolean().optional(),
  // Monorepo support
  isMonorepo: z.boolean().optional(),
  services: z.array(z.object({
    id: z.string(),
    name: z.string(),
    path: z.string(),
    framework: z.string().optional(),
    runScript: z.enum(['dev', 'start']),
    suggestedPort: z.number(),
    proof: z.object({
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
    }).optional(),
  })).optional(),
  primaryService: z.string().optional(),  // Service ID for tunnel
});

export type RepoConfig = z.infer<typeof RepoConfigSchema>;

// Monorepo Service Detection types
export interface DetectedService {
  id: string;           // Workspace package name (e.g., "@myapp/frontend")
  name: string;         // Display name (e.g., "frontend")
  path: string;         // Relative path from repo root (e.g., "packages/frontend")
  framework?: string;   // Detected framework (Next.js, Express, etc.)
  runScript: 'dev' | 'start';  // Which npm script to use
  suggestedPort: number;       // Based on framework detection
  proof?: {
    mode: 'web' | 'api' | 'cli';
    web?: { url: string; waitForSelector?: string; assertText?: string };
    api?: { healthUrl: string; timeout?: number };
    cli?: { command: string; assertStdout?: string; assertRegex?: string };
  };
}

export interface ServicePort {
  serviceId: string;
  preferredPort: number;
  assignedPort: number;
  localUrl: string;
}

export interface ServiceProcess {
  serviceId: string;
  processId?: string;
  containerId?: string;
  port: number;
  status: 'starting' | 'running' | 'stopped' | 'failed';
  localUrl: string;
  tunnelUrl?: string;
  error?: string;
}

// Workflow step type - supports predefined steps and skill: prefixed steps
export const WorkflowStepSchema = z.union([
  z.enum(['install', 'build', 'test', 'run', 'proof', 'scaffold', 'claude']),
  z.string().regex(/^skill:[a-z0-9-]+$/, 'Skill steps must be in format skill:skill-id'),
]);
export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;

// Workflow configuration schema
export const WorkflowConfigSchema = z.object({
  id: z.string(),
  name: z.string(),
  steps: z.array(WorkflowStepSchema),
  requiresServer: z.boolean().default(false),
});

export type WorkflowConfig = z.infer<typeof WorkflowConfigSchema>;

// Job types
export type JobStatus = 'QUEUED' | 'RUNNING' | 'AWAITING_APPROVAL' | 'READY_FOR_REVIEW' | 'PUSHED' | 'MERGED' | 'CONFLICT' | 'DISCARDED' | 'FAILED' | 'CANCELLED';

export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export interface JobStep {
  name: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export interface Job {
  id: string;
  repoId: string;
  workflowId: string;
  status: JobStatus;
  branch: string;
  worktreePath?: string; // Path to job's isolated git worktree
  steps: JobStep[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  params?: Record<string, string>; // For create-repo: templateId, repoName, etc.
  detectedPort?: number; // Port detected from server output during run step
  tunnelUrl?: string; // Public Cloudflare tunnel URL when active
  prUrl?: string; // GitHub PR URL (auto-created or manual link)
  // Monorepo service tracking
  services?: DetectedService[];  // Detected services from workspace config
  serviceProcesses?: Record<string, ServiceProcess>;  // Running service processes by serviceId
  primaryService?: string;  // Service ID that gets tunnel (first web-facing service)
  artifacts: {
    diff?: string;
    changedFiles?: string[];
    proofScreenshot?: string;
    proofApiCheck?: string;
    proofStdout?: string;
    claudePrompt?: string;
    claudeOutput?: string;
    plan?: string;           // Path to Claude's plan output
    questions?: string;      // Path to parsed questions JSON
    insights?: string;       // Path to insights.json
  };
}

// Git Conflict Information
export interface ConflictInfo {
  filePath: string;           // Path to conflicting file relative to repo root
  preview: string;            // First ~30 lines showing conflict markers
  oursLabel: string;          // Label for "ours" side (e.g., "HEAD (main)")
  theirsLabel: string;        // Label for "theirs" side (e.g., "claudedesk/fix-branch")
  conflictCount: number;      // Number of conflict sections in this file
}

// Job Insights - explains what Claude did and why
export interface JobInsights {
  summary: string;           // One-line summary: "Fixed authentication timeout by adding retry logic"
  problem: string;           // What was wrong: "OAuth token refresh was failing silently"
  solution: string[];        // What Claude did (bullet points)
  reasoning: string;         // Why this approach was chosen
  filesChanged: {            // Per-file explanations
    path: string;
    changes: string;         // What changed in this file
  }[];
  patterns?: string[];       // Patterns identified: "Null check missing", "Race condition"
  preventionTips?: string[]; // How to avoid similar issues
}

// API types
export interface CreateJobRequest {
  repoId: string;
  workflowId: string;
  params?: Record<string, string>;
}

// Running App types
export type AppStatus = 'STARTING' | 'RUNNING' | 'STOPPING' | 'STOPPED' | 'FAILED';

export interface DockerConfig {
  enabled: boolean;
  imageName?: string;
  buildArgs?: Record<string, string>;
  volumes?: string[];
  memoryLimit?: string;
  cpuLimit?: number;
}

export interface RunConfig {
  port: number;
  env?: Record<string, string>;
  docker?: DockerConfig;
  tunnel?: { enabled: boolean };
  command?: string;
}

export interface RunningApp {
  id: string;
  repoId: string;
  status: AppStatus;
  runConfig: RunConfig;
  containerId?: string;
  processId?: string;
  detectedPort?: number;
  localUrl?: string;
  tunnelUrl?: string;
  startedAt: string;
  error?: string;
  logs: string[];
  // Monorepo service support
  isMonorepo?: boolean;
  services?: Record<string, ServiceProcess>;  // Per-service processes
  serviceLogs?: Record<string, string[]>;     // Per-service log buffers
}

export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Schedule types
export type ScheduleStatus = 'success' | 'failed' | null;

export interface Schedule {
  id: string;
  name: string;
  repoId: string;
  workflowId: string;
  cron: string;
  enabled: boolean;
  params?: {
    prompt?: string;
  };
  nextRun: string | null;
  lastRun: string | null;
  lastStatus: ScheduleStatus;
  lastJobId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateScheduleRequest {
  name: string;
  repoId: string;
  workflowId: string;
  cron: string;
  enabled?: boolean;
  params?: {
    prompt?: string;
  };
}

export interface UpdateScheduleRequest {
  name?: string;
  repoId?: string;
  workflowId?: string;
  cron?: string;
  enabled?: boolean;
  params?: {
    prompt?: string;
  };
}

// Git Commit type for commit history display
export interface GitCommit {
  hash: string;         // Short hash (7 char)
  fullHash: string;     // Full commit hash
  message: string;      // Commit message (first line)
  author: string;       // Author name
  authorEmail: string;  // Author email
  date: string;         // ISO date string
  filesCount: number;   // Number of files changed in commit
}

// =============================================================================
// CI/CD Pipeline Monitoring Types
// =============================================================================

export const PipelineErrorCategorySchema = z.enum([
  'test_failure',
  'build_error',
  'lint_error',
  'type_error',
  'runtime_error',
  'timeout',
  'unknown',
]);
export type PipelineErrorCategory = z.infer<typeof PipelineErrorCategorySchema>;

export const WorkflowStepStatusSchema = z.enum([
  'queued',
  'in_progress',
  'completed',
  'failed',
  'cancelled',
  'skipped',
]);

export const WorkflowJobSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  steps: z.array(z.object({
    name: z.string(),
    status: z.string(),
    conclusion: z.string().nullable(),
    number: z.number(),
  })).default([]),
});
export type WorkflowJob = z.infer<typeof WorkflowJobSchema>;

export const WorkflowRunSchema = z.object({
  id: z.number(),
  name: z.string(),
  status: z.string(),
  conclusion: z.string().nullable(),
  headBranch: z.string(),
  headSha: z.string(),
  htmlUrl: z.string(),
  jobs: z.array(WorkflowJobSchema).default([]),
});
export type WorkflowRun = z.infer<typeof WorkflowRunSchema>;

export const PipelineMonitorSchema = z.object({
  id: z.string(),
  sessionId: z.string(),
  platform: z.enum(['github', 'gitlab']).default('github'),
  owner: z.string(),
  repo: z.string(),
  branch: z.string(),
  commitSha: z.string(),
  workspaceId: z.string().optional(),
  status: z.enum(['polling', 'success', 'failed', 'stalled', 'stopped', 'error']),
  runs: z.array(WorkflowRunSchema).default([]),
  errorCategory: PipelineErrorCategorySchema.optional(),
  errorSummary: z.string().optional(),
  failedJobId: z.number().optional(),
  timestamps: z.object({
    startedAt: z.string(),
    lastPollAt: z.string().optional(),
    completedAt: z.string().optional(),
  }),
  pollCount: z.number().default(0),
});
export type PipelineMonitor = z.infer<typeof PipelineMonitorSchema>;

// =============================================================================
// Skill System Types
// =============================================================================

// Skill input definition
export const SkillInputSchema = z.object({
  name: z.string(),
  type: z.enum(['string', 'number', 'boolean', 'select']),
  description: z.string().optional(),
  required: z.boolean().default(false),
  default: z.union([z.string(), z.number(), z.boolean()]).optional(),
  options: z.array(z.string()).optional(), // For select type
});

export type SkillInput = z.infer<typeof SkillInputSchema>;

// Skill command (for command-based skills)
export const SkillCommandSchema = z.object({
  run: z.string(),
  cwd: z.string().optional(),
  env: z.record(z.string()).optional(),
  timeout: z.number().optional(),
});

export type SkillCommand = z.infer<typeof SkillCommandSchema>;

// Workflow step within a skill (for workflow-based skills)
export const SkillWorkflowStepSchema = z.object({
  skill: z.string().optional(),      // Reference another skill
  prompt: z.string().optional(),     // Inline prompt
  command: z.string().optional(),    // Inline command
  condition: z.string().optional(),  // Skip condition
});

export type SkillWorkflowStep = z.infer<typeof SkillWorkflowStepSchema>;

// Main skill configuration schema
export const SkillConfigSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]+$/),
  name: z.string(),
  description: z.string().optional(),
  version: z.string().default('1.0.0'),
  type: z.enum(['prompt', 'command', 'workflow']),
  inputs: z.array(SkillInputSchema).default([]),
  command: SkillCommandSchema.optional(),
  workflow: z.object({
    steps: z.array(SkillWorkflowStepSchema),
  }).optional(),
  tags: z.array(z.string()).default([]),
  // Runtime metadata (added by registry)
  source: z.enum(['global', 'repo']).optional(),
  filePath: z.string().optional(),
  promptContent: z.string().optional(), // The markdown body
});

export type SkillConfig = z.infer<typeof SkillConfigSchema>;

// Skill execution request
export interface SkillExecuteRequest {
  skillId: string;
  repoId: string;
  inputs?: Record<string, string | number | boolean>;
  jobId?: string;  // If running within an existing job context
}

// Skill execution result
export interface SkillExecuteResult {
  success: boolean;
  output?: string;
  error?: string;
  artifacts?: Record<string, string>;
}

// =============================================================================
// File Change Tracking Types
// =============================================================================

export interface FileChange {
  id: string;
  filePath: string;
  fileName: string;
  operation: 'created' | 'modified' | 'deleted';
  toolActivityId: string;
}

// =============================================================================
// Usage Tracking Types
// =============================================================================

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface MessageUsage {
  messageId: string;
  timestamp: string;
  model: string;
  usage: TokenUsage;
  costUsd: number;
  durationMs: number;
}

export interface SessionUsageStats {
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  messageCount: number;
  toolUseCount: number;
  filesChanged: number;
  model?: string;
}

export interface GlobalUsageStats {
  periodStart: string;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalApiCalls: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number }>;
}

export interface WeeklyUsageStats {
  weekStart: string;          // Sunday at 00:00 ISO string
  weekEnd: string;            // Following Saturday 23:59:59 ISO string
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostUsd: number;
  totalApiCalls: number;
  byModel: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; apiCalls: number }>;
  dailyBreakdown: Record<string, { inputTokens: number; outputTokens: number; costUsd: number; apiCalls: number }>;
}

// Claude Code usage stats (from ~/.claude/stats-cache.json)
export interface ClaudeUsageStats {
  today: {
    messageCount: number;
    sessionCount: number;
    toolCallCount: number;
    tokensByModel: Record<string, number>;
  };
  week: {
    messageCount: number;
    sessionCount: number;
    toolCallCount: number;
    tokensByModel: Record<string, number>;
  };
  modelUsage: Record<string, {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens: number;
    cacheCreationTokens: number;
  }>;
  totalSessions: number;
  totalMessages: number;
  firstSessionDate: string | null;
  lastUpdated: string;
}

// Claude OAuth Usage Quota (from api.anthropic.com/api/oauth/usage)
export interface ClaudeQuotaBucket {
  utilization: number;    // 0.0 to 1.0 (percentage used)
  resets_at: string;      // ISO timestamp when quota resets
}

export interface ClaudeUsageQuota {
  five_hour: ClaudeQuotaBucket;
  seven_day: ClaudeQuotaBucket;
  lastUpdated: string;
}

// =============================================================================
// Context Management Types
// =============================================================================

export interface ContextSummary {
  id: string;
  createdAt: string;
  summarizedMessageIds: string[];
  tokenEstimate: number;
  content: string;
  model: string;
}

export interface ContextState {
  modelContextWindow: number;
  estimatedPromptTokens: number;
  lastActualInputTokens: number;
  contextUtilizationPercent: number;
  summarizationStatus: 'none' | 'suggested' | 'in_progress' | 'completed' | 'failed';
  summaryCount: number;
  verbatimMessageCount: number;
  totalMessageCount: number;
}

export interface ContextSettings {
  autoSummarize: boolean;
  summarizationThreshold: number;
  splitThreshold: number;
  verbatimRecentCount: number;
  maxMessageLength: number;
  maxPromptTokens: number;
}

// =============================================================================
// MCP (Model Context Protocol) Types
// =============================================================================

// MCP server configuration
export const MCPServerConfigSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  transport: z.enum(['stdio', 'sse']),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  cwd: z.string().optional(),
  url: z.string().optional(),
  env: z.record(z.string()).optional(),
  enabled: z.boolean().default(true),
  autoConnect: z.boolean().default(true),
  createdAt: z.string(),
  updatedAt: z.string().optional(),
});

export type MCPServerConfig = z.infer<typeof MCPServerConfigSchema>;

// MCP server status
export type MCPConnectionStatus = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface MCPServerStatus {
  id: string;
  status: MCPConnectionStatus;
  error?: string;
  tools?: MCPToolDefinition[];
  connectedAt?: string;
  lastError?: string;
  lastErrorAt?: string;
}

// MCP tool definition (from MCP protocol)
export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>; // JSON Schema
}

// MCP tool result content
export interface MCPToolResultContent {
  type: 'text' | 'image' | 'resource';
  text?: string;
  data?: string;       // Base64 for images
  mimeType?: string;
  uri?: string;
}

// MCP Server Catalog Types
export type ServerCategory = 'development' | 'productivity' | 'data' | 'filesystem' | 'search' | 'cloud' | 'automation' | 'utilities';

export type MaintainerType = 'official' | 'community' | 'verified';

export interface ConfigField {
  key: string;                  // "GITHUB_PERSONAL_ACCESS_TOKEN"
  name: string;                 // "Personal Access Token"
  description: string;
  type: 'string' | 'password' | 'path' | 'url' | 'number' | 'boolean' | 'select';
  required: boolean;
  placeholder?: string;
  helpUrl?: string;
  sensitive: boolean;
  default?: string;
  validation?: {
    pattern?: string;
    message?: string;
  };
  options?: string[];           // For select type
}

export interface Prerequisite {
  name: string;                 // "Node.js"
  command: string;              // "node"
  args: string[];               // ["--version"]
  installUrl: Record<string, string>; // { windows: "...", darwin: "...", linux: "..." }
}

export interface PredefinedServerTemplate {
  templateId: string;           // "github"
  name: string;                 // "GitHub"
  description: string;          // Short description
  longDescription?: string;     // Extended description
  iconName: string;             // Lucide icon name
  category: ServerCategory;
  tags: string[];               // ["version-control", "git"]
  maintainer: MaintainerType;
  documentationUrl?: string;
  transport: 'stdio' | 'sse';
  command: string;              // "npx"
  args: string[];               // ["-y", "@modelcontextprotocol/server-github"]
  configFields: ConfigField[];
  prerequisites: Prerequisite[];
  platforms: ('windows' | 'darwin' | 'linux')[];
}

export interface PrerequisiteCheckResult {
  prerequisite: Prerequisite;
  installed: boolean;
  version?: string;
  error?: string;
}
