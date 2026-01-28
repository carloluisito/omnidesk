export type JobStatus = 'QUEUED' | 'RUNNING' | 'AWAITING_APPROVAL' | 'READY_FOR_REVIEW' | 'PUSHED' | 'MERGED' | 'CONFLICT' | 'DISCARDED' | 'FAILED' | 'CANCELLED';

export type StepStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED' | 'SKIPPED';

export type ProofMode = 'web' | 'api' | 'cli';

export interface JobStep {
  name: string;
  status: StepStatus;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

// Monorepo service types
export interface DetectedService {
  id: string;
  name: string;
  path: string;
  framework?: string;
  runScript: 'dev' | 'start';
  suggestedPort: number;
  proof?: {
    mode: ProofMode;
    web?: { url: string; waitForSelector?: string; assertText?: string };
    api?: { healthUrl: string; timeout?: number };
    cli?: { command: string; assertStdout?: string; assertRegex?: string };
  };
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

export interface Job {
  id: string;
  repoId: string;
  workflowId: string;
  status: JobStatus;
  branch: string;
  steps: JobStep[];
  createdAt: string;
  updatedAt: string;
  completedAt?: string;
  error?: string;
  params?: Record<string, string>;
  detectedPort?: number;
  tunnelUrl?: string;
  prUrl?: string; // GitHub PR URL
  // Monorepo service tracking
  services?: DetectedService[];
  serviceProcesses?: Record<string, ServiceProcess>;
  primaryService?: string;
  artifacts: {
    diff?: string;
    changedFiles?: string[];
    proofScreenshot?: string;
    proofApiCheck?: string;
    proofStdout?: string;
    claudePrompt?: string;
    claudeOutput?: string;
    plan?: string;
    questions?: string;
    insights?: string;
    serviceProofs?: string;
  };
}

export interface RepoConfig {
  id: string;
  path: string;
  commands: {
    install?: string;
    build?: string;
    test?: string;
    run?: string;
  };
  proof: {
    mode: ProofMode;
    web?: {
      url: string;
      waitForSelector?: string;
      assertText?: string;
    };
    api?: {
      healthUrl: string;
      timeout?: number;
    };
    cli?: {
      command: string;
      assertStdout?: string;
      assertRegex?: string;
    };
  };
  port?: number;
  tunnel?: {
    enabled: boolean;
  };
  // Computed property - whether repo has a .git directory
  hasGit?: boolean;
  // Computed property - whether repo has a remote origin configured
  hasRemote?: boolean;
  // Workspace this repo belongs to
  workspaceId?: string;
}

export interface WorkflowConfig {
  id: string;
  name: string;
  steps: string[];
  requiresServer: boolean;
}

export interface Template {
  id: string;
  name: string;
  description?: string;
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
  summary: string;           // One-line summary
  problem: string;           // What was wrong
  solution: string[];        // What Claude did (bullet points)
  reasoning: string;         // Why this approach was chosen
  filesChanged: {            // Per-file explanations
    path: string;
    changes: string;
  }[];
  patterns?: string[];       // Patterns identified
  preventionTips?: string[]; // How to avoid similar issues
}
