import type { SessionManager } from './session-manager';
import type { CheckpointManager } from './checkpoint-manager';
import type { IPCEmitter } from './ipc-emitter';
import type { PlaybookManager } from './playbook-manager';
import type {
  Playbook,
  PlaybookExecutionState,
  PlaybookRunRequest,
} from '../shared/types/playbook-types';

export class PlaybookExecutor {
  private sessionManager: SessionManager;
  private checkpointManager: CheckpointManager;
  private playbookManager: PlaybookManager;
  private emitter: IPCEmitter | null = null;

  /** Active executions keyed by sessionId (one per session) */
  private executions: Map<string, PlaybookExecutionState> = new Map();
  /** Output unsubscribe functions keyed by sessionId */
  private outputUnsubs: Map<string, () => void> = new Map();
  /** Silence timers keyed by sessionId */
  private silenceTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** Step timeout timers keyed by sessionId */
  private stepTimeoutTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  /** Confirmation resolvers keyed by sessionId */
  private confirmResolvers: Map<string, () => void> = new Map();

  constructor(
    sessionManager: SessionManager,
    checkpointManager: CheckpointManager,
    playbookManager: PlaybookManager,
  ) {
    this.sessionManager = sessionManager;
    this.checkpointManager = checkpointManager;
    this.playbookManager = playbookManager;
  }

  setEmitter(emitter: IPCEmitter): void {
    this.emitter = emitter;
  }

  getExecution(sessionId: string): PlaybookExecutionState | null {
    return this.executions.get(sessionId) || null;
  }

  async run(request: PlaybookRunRequest): Promise<PlaybookExecutionState> {
    const { playbookId, sessionId, variables } = request;

    // Validate: no existing execution on this session
    if (this.executions.has(sessionId)) {
      throw new Error('A playbook is already running on this session');
    }

    // Validate session exists and is running
    const session = this.sessionManager.getSession(sessionId);
    if (!session) throw new Error('Session not found');
    if (session.status !== 'running') throw new Error('Session is not running');

    // Get playbook
    const playbook = this.playbookManager.get(playbookId);
    if (!playbook) throw new Error('Playbook not found');

    // Validate required variables
    for (const v of playbook.variables) {
      if (v.required && !variables[v.name]?.trim()) {
        throw new Error(`Missing required variable: ${v.label}`);
      }
    }

    // Create execution state
    const execution: PlaybookExecutionState = {
      playbookId,
      playbookName: playbook.name,
      sessionId,
      status: 'running',
      currentStepIndex: 0,
      stepStates: playbook.steps.map(s => ({
        stepId: s.id,
        status: 'pending',
      })),
      startedAt: Date.now(),
      variables,
    };

    this.executions.set(sessionId, execution);

    // Optional checkpoint before run
    if (playbook.execution.createCheckpointBeforeRun) {
      try {
        await this.checkpointManager.createCheckpoint({
          sessionId,
          name: `Before playbook: ${playbook.name}`,
          description: `Auto-checkpoint before running playbook "${playbook.name}"`,
        });
      } catch (err) {
        console.warn('[PlaybookExecutor] Failed to create pre-run checkpoint:', err);
      }
    }

    // Start execution loop (async, non-blocking)
    this.executeSteps(sessionId, playbook).catch(err => {
      console.error('[PlaybookExecutor] Execution error:', err);
      this.failExecution(sessionId, err instanceof Error ? err.message : 'Unknown error');
    });

    return execution;
  }

  cancel(sessionId: string): boolean {
    const execution = this.executions.get(sessionId);
    if (!execution || execution.status !== 'running' && execution.status !== 'paused') {
      return false;
    }

    execution.status = 'cancelled';
    execution.completedAt = Date.now();

    // Mark remaining steps as skipped
    for (const step of execution.stepStates) {
      if (step.status === 'pending' || step.status === 'running' || step.status === 'waiting_confirmation') {
        step.status = 'skipped';
      }
    }

    this.cleanup(sessionId);
    this.emitCompleted(sessionId, execution);
    // Note: Do NOT send Ctrl+C — critical constraint
    return true;
  }

  confirm(sessionId: string): boolean {
    const resolver = this.confirmResolvers.get(sessionId);
    if (!resolver) return false;
    resolver();
    this.confirmResolvers.delete(sessionId);
    return true;
  }

  // ── Private execution loop ──

  /** Check if execution was cancelled (defeats TS narrowing for cross-async mutation). */
  private wasCancelled(execution: PlaybookExecutionState): boolean {
    // cancel() mutates status asynchronously while executeSteps() awaits.
    // TypeScript narrows status after assignment, so direct comparison fails.
    return (execution.status as string) === 'cancelled';
  }

  private async executeSteps(sessionId: string, playbook: Playbook): Promise<void> {
    const execution = this.executions.get(sessionId);
    if (!execution) return;

    for (let i = 0; i < playbook.steps.length; i++) {
      // Check if cancelled
      if (this.wasCancelled(execution)) return;

      const step = playbook.steps[i];
      const stepState = execution.stepStates[i];
      execution.currentStepIndex = i;

      // Handle confirmation gate
      if (step.requireConfirmation && i > 0) {
        stepState.status = 'waiting_confirmation';
        execution.status = 'paused';
        this.emitStepChanged(sessionId, execution, i);

        // Wait for confirmation or cancellation
        const confirmed = await this.waitForConfirmation(sessionId);
        if (!confirmed || this.wasCancelled(execution)) return;

        execution.status = 'running';
      }

      // Mark step as running
      stepState.status = 'running';
      stepState.startedAt = Date.now();
      this.emitStepChanged(sessionId, execution, i);

      // Resolve variables in prompt
      const resolvedPrompt = this.resolvePromptVariables(step.prompt, execution.variables);

      // Write prompt to PTY
      this.sessionManager.sendInput(sessionId, resolvedPrompt + '\n');

      // Wait for silence (step completion)
      const silenceMs = step.silenceThresholdMs ?? playbook.execution.silenceThresholdMs;
      const timeoutMs = step.timeoutMs ?? playbook.execution.stepTimeoutMs;

      const result = await this.waitForSilence(sessionId, silenceMs, timeoutMs);

      if (this.wasCancelled(execution)) return;

      if (result === 'timeout') {
        stepState.status = 'timed_out';
        stepState.completedAt = Date.now();
        this.emitStepChanged(sessionId, execution, i);

        const policy = playbook.execution.stepTimeoutPolicy;
        if (policy === 'abort') {
          this.failExecution(sessionId, `Step "${step.name}" timed out`);
          return;
        } else if (policy === 'pause') {
          // Treat timeout as confirmation gate
          stepState.status = 'waiting_confirmation';
          execution.status = 'paused';
          this.emitStepChanged(sessionId, execution, i);

          const confirmed = await this.waitForConfirmation(sessionId);
          if (!confirmed || this.wasCancelled(execution)) return;

          execution.status = 'running';
          stepState.status = 'completed';
          stepState.completedAt = Date.now();
        }
        // policy === 'continue' — just proceed
      } else {
        stepState.status = 'completed';
        stepState.completedAt = Date.now();
      }

      this.emitStepChanged(sessionId, execution, i);

      // Inter-step delay (skip after last step)
      if (i < playbook.steps.length - 1 && execution.status !== 'cancelled') {
        await this.delay(playbook.execution.interStepDelayMs);
      }
    }

    // All steps completed
    execution.status = 'completed';
    execution.completedAt = Date.now();
    this.cleanup(sessionId);
    this.emitCompleted(sessionId, execution);
  }

  private resolvePromptVariables(prompt: string, variables: Record<string, string>): string {
    return prompt.replace(/\{\{(\w+)\}\}/g, (_match, name: string) => {
      return variables[name] ?? `{{${name}}}`;
    });
  }

  private waitForSilence(sessionId: string, silenceMs: number, timeoutMs: number): Promise<'silence' | 'timeout'> {
    return new Promise<'silence' | 'timeout'>((resolve) => {
      let resolved = false;

      const finish = (result: 'silence' | 'timeout') => {
        if (resolved) return;
        resolved = true;
        this.clearSilenceTimer(sessionId);
        this.clearStepTimeout(sessionId);
        const unsub = this.outputUnsubs.get(sessionId);
        if (unsub) {
          unsub();
          this.outputUnsubs.delete(sessionId);
        }
        resolve(result);
      };

      // Reset silence timer on each output
      const resetSilenceTimer = () => {
        this.clearSilenceTimer(sessionId);
        this.silenceTimers.set(sessionId, setTimeout(() => finish('silence'), silenceMs));
      };

      // Subscribe to session output
      const unsub = this.sessionManager.subscribeToOutput(sessionId, () => {
        resetSilenceTimer();
      });
      this.outputUnsubs.set(sessionId, unsub);

      // Start initial silence timer
      resetSilenceTimer();

      // Step timeout
      this.stepTimeoutTimers.set(sessionId, setTimeout(() => finish('timeout'), timeoutMs));
    });
  }

  private waitForConfirmation(sessionId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      // Check if already cancelled
      const execution = this.executions.get(sessionId);
      if (!execution || this.wasCancelled(execution)) {
        resolve(false);
        return;
      }

      this.confirmResolvers.set(sessionId, () => resolve(true));

      // Also resolve on cancellation via a poll (cleanup handles this)
    });
  }

  private failExecution(sessionId: string, error: string): void {
    const execution = this.executions.get(sessionId);
    if (!execution) return;

    execution.status = 'failed';
    execution.error = error;
    execution.completedAt = Date.now();

    this.cleanup(sessionId);

    this.emitter?.emit('onPlaybookError', {
      sessionId,
      playbookId: execution.playbookId,
      error,
      stepIndex: execution.currentStepIndex,
    });

    this.emitCompleted(sessionId, execution);
  }

  private cleanup(sessionId: string): void {
    this.clearSilenceTimer(sessionId);
    this.clearStepTimeout(sessionId);

    const unsub = this.outputUnsubs.get(sessionId);
    if (unsub) {
      unsub();
      this.outputUnsubs.delete(sessionId);
    }

    // Reject pending confirmation
    const resolver = this.confirmResolvers.get(sessionId);
    if (resolver) {
      // Don't call resolver — the execution check in waitForConfirmation handles cancelled state
      this.confirmResolvers.delete(sessionId);
    }

    // Remove execution after a delay (allow UI to show final state)
    setTimeout(() => {
      this.executions.delete(sessionId);
    }, 30000);
  }

  private clearSilenceTimer(sessionId: string): void {
    const timer = this.silenceTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.silenceTimers.delete(sessionId);
    }
  }

  private clearStepTimeout(sessionId: string): void {
    const timer = this.stepTimeoutTimers.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      this.stepTimeoutTimers.delete(sessionId);
    }
  }

  private emitStepChanged(sessionId: string, execution: PlaybookExecutionState, stepIndex: number): void {
    this.emitter?.emit('onPlaybookStepChanged', {
      sessionId,
      playbookId: execution.playbookId,
      stepIndex,
      stepStatus: execution.stepStates[stepIndex].status,
      executionStatus: execution.status,
    });
  }

  private emitCompleted(sessionId: string, execution: PlaybookExecutionState): void {
    const stepsCompleted = execution.stepStates.filter(s => s.status === 'completed').length;
    this.emitter?.emit('onPlaybookCompleted', {
      sessionId,
      playbookId: execution.playbookId,
      status: execution.status as 'completed' | 'cancelled' | 'failed',
      totalDurationMs: (execution.completedAt || Date.now()) - execution.startedAt,
      stepsCompleted,
      stepsTotal: execution.stepStates.length,
    });
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Cleanup all executions (app shutdown) */
  destroy(): void {
    for (const sessionId of this.executions.keys()) {
      this.cancel(sessionId);
    }
    this.executions.clear();
  }
}
