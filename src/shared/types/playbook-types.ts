// ── Playbook variable types ──

export type PlaybookVariableType = 'text' | 'multiline' | 'select' | 'filepath';

export interface PlaybookVariable {
  name: string;        // alphanumeric + underscore, used in {{name}} template syntax
  label: string;       // human-readable label for the form
  type: PlaybookVariableType;
  required: boolean;
  default?: string;
  options?: string[];  // for 'select' type only
  placeholder?: string;
}

// ── Playbook step types ──

export interface PlaybookStep {
  id: string;
  name: string;
  prompt: string;                  // may contain {{variable}} placeholders
  requireConfirmation: boolean;    // pause before this step and ask user
  timeoutMs?: number;              // per-step timeout override (default: 5min)
  silenceThresholdMs?: number;     // per-step silence threshold override (default: 3s)
}

// ── Execution settings ──

export type StepTimeoutPolicy = 'continue' | 'pause' | 'abort';

export interface PlaybookExecutionSettings {
  silenceThresholdMs: number;      // default 3000 — silence = step done
  interStepDelayMs: number;        // default 1000 — delay between steps
  stepTimeoutMs: number;           // default 300000 (5 min) — max wait per step
  stepTimeoutPolicy: StepTimeoutPolicy;
  createCheckpointBeforeRun: boolean;
}

// ── Playbook definition ──

export interface Playbook {
  id: string;
  type: 'built-in' | 'user';
  name: string;
  description: string;
  icon: string;                    // emoji or single character
  category: string;
  keywords: string[];
  variables: PlaybookVariable[];
  steps: PlaybookStep[];
  execution: PlaybookExecutionSettings;
  createdAt: number;
  updatedAt: number;
}

// ── Execution state (runtime, in-memory only) ──

export type PlaybookExecutionStatus = 'idle' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled';
export type PlaybookStepStatus = 'pending' | 'running' | 'waiting_confirmation' | 'completed' | 'failed' | 'skipped' | 'timed_out';

export interface PlaybookStepState {
  stepId: string;
  status: PlaybookStepStatus;
  startedAt?: number;
  completedAt?: number;
  error?: string;
}

export interface PlaybookExecutionState {
  playbookId: string;
  playbookName: string;
  sessionId: string;
  status: PlaybookExecutionStatus;
  currentStepIndex: number;
  stepStates: PlaybookStepState[];
  startedAt: number;
  completedAt?: number;
  error?: string;
  variables: Record<string, string>;  // resolved variable values
}

// ── IPC request/response types ──

export interface PlaybookRunRequest {
  playbookId: string;
  sessionId: string;
  variables: Record<string, string>;
}

export interface PlaybookCreateRequest {
  name: string;
  description: string;
  icon: string;
  category: string;
  keywords: string[];
  variables: PlaybookVariable[];
  steps: Omit<PlaybookStep, 'id'>[];
  execution?: Partial<PlaybookExecutionSettings>;
}

export interface PlaybookUpdateRequest {
  id: string;
  name?: string;
  description?: string;
  icon?: string;
  category?: string;
  keywords?: string[];
  variables?: PlaybookVariable[];
  steps?: Omit<PlaybookStep, 'id'>[];
  execution?: Partial<PlaybookExecutionSettings>;
}

export interface PlaybookExportData {
  version: 1;
  playbook: Omit<Playbook, 'id' | 'type' | 'createdAt' | 'updatedAt'>;
}

// ── Persistence format ──

export interface PlaybooksData {
  version: 1;
  playbooks: Playbook[];
  lastModified: number;
}

// ── Event payloads ──

export interface PlaybookStepChangedEvent {
  sessionId: string;
  playbookId: string;
  stepIndex: number;
  stepStatus: PlaybookStepStatus;
  executionStatus: PlaybookExecutionStatus;
}

export interface PlaybookCompletedEvent {
  sessionId: string;
  playbookId: string;
  status: 'completed' | 'cancelled' | 'failed';
  totalDurationMs: number;
  stepsCompleted: number;
  stepsTotal: number;
}

export interface PlaybookErrorEvent {
  sessionId: string;
  playbookId: string;
  error: string;
  stepIndex: number;
}
