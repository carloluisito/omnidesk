import * as pty from 'node-pty';
import { TerminalSize, PermissionMode, ClaudeModel } from '../shared/ipc-types';
import { detectModelFromOutput } from '../shared/model-detector';

export interface CLIManagerOptions {
  workingDirectory: string;
  permissionMode: PermissionMode;
  model?: ClaudeModel;
  enableAgentTeams?: boolean;
}

export class CLIManager {
  private ptyProcess: pty.IPty | null = null;
  private outputCallback: ((data: string) => void) | null = null;
  private exitCallback: ((exitCode: number) => void) | null = null;
  private modelChangeCallback: ((model: ClaudeModel) => void) | null = null;
  private outputBuffer: string = '';
  private flushTimeout: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 16; // ~60fps, prevents IPC flooding
  private options: CLIManagerOptions;
  private _isRunning: boolean = false;
  private _isInitialized: boolean = false;
  private currentModel: ClaudeModel | null = null;
  private initialDetectionBuffer: string = '';
  private initialDetectionDone: boolean = false;
  private switchDetectionBuffer: string = '';

  // Safe log that ignores EPIPE errors (broken pipe when app window closes)
  private safeLog(...args: unknown[]): void {
    try {
      console.log(...args);
    } catch {
      // Ignore EPIPE / broken pipe errors on stdout
    }
  }

  constructor(options: CLIManagerOptions) {
    this.options = options;
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get isInitialized(): boolean {
    return this._isInitialized;
  }

  /**
   * Phase 1: Spawn shell only (for pooling).
   * Creates lightweight shell, but does NOT launch Claude.
   */
  async spawnShell(): Promise<void> {
    await this.createPtyProcess();
  }

  /**
   * Phase 2: Activate session (for pool claim).
   * Updates working directory and permission mode, then launches Claude.
   */
  async initializeSession(workingDirectory: string, permissionMode: PermissionMode, model?: ClaudeModel): Promise<void> {
    if (!this._isRunning || this._isInitialized) {
      throw new Error('Cannot initialize: session is not in correct state');
    }

    // Reset detection state so Phase 1 starts fresh (discard shell output from pool)
    this.resetDetectionState();

    // Update options with actual session parameters
    this.options.workingDirectory = workingDirectory;
    this.options.permissionMode = permissionMode;
    if (model !== undefined) {
      this.options.model = model;
    }

    // Change to the target directory (shell was spawned at process.cwd())
    if (process.platform === 'win32') {
      this.write(`cd /d "${workingDirectory}"\r`);
    } else {
      const escapedDir = workingDirectory.replace(/'/g, "'\\''");
      this.write(`cd '${escapedDir}'\r`);
    }

    this.launchClaudeCommand();
    this._isInitialized = true;

    // Wait for Claude to launch
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  /**
   * Create shell and launch Claude directly.
   * Waits for shell readiness before sending the claude command.
   */
  async spawn(): Promise<void> {
    await this.createPtyProcess();
    this.launchClaudeCommand();
    this._isInitialized = true;
  }

  /**
   * Shared PTY creation: spawn a lightweight shell, wire handlers, wait for readiness.
   * Uses cmd.exe on Windows (fast startup, no .NET overhead) and user's shell on Unix.
   */
  private async createPtyProcess(): Promise<void> {
    const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/bash';

    // Build clean env: filter out Electron-specific vars that can break child processes
    const cleanEnv: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && !key.startsWith('ELECTRON_') && !key.startsWith('ORIGINAL_')) {
        cleanEnv[key] = value;
      }
    }

    const ptyEnv: { [key: string]: string } = {
      ...cleanEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };
    if (this.options.enableAgentTeams !== false) {
      ptyEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
    }

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.options.workingDirectory,
      env: ptyEnv,
    });

    this._isRunning = true;

    this.ptyProcess.onData((data: string) => {
      this.bufferOutput(data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this._isRunning = false;
      this._isInitialized = false;
      this.flushOutput();
      if (this.exitCallback) {
        this.exitCallback(exitCode);
      }
    });

    // Wait for shell to initialize before sending commands
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  private launchClaudeCommand(): void {
    let claudeCommand = this.options.permissionMode === 'skip-permissions'
      ? 'claude --dangerously-skip-permissions'
      : 'claude';

    // Add model flag if specified (skip for 'auto' — let CLI decide)
    if (this.options.model && this.options.model !== 'auto') {
      claudeCommand += ` --model ${this.options.model}`;
    }

    this.write(`${claudeCommand}\r`);
  }

  private bufferOutput(data: string): void {
    this.outputBuffer += data;

    // Phase 1: Initial detection (try on each chunk, give up after 8KB)
    if (!this.initialDetectionDone) {
      this.initialDetectionBuffer += data;
      const result = detectModelFromOutput(this.initialDetectionBuffer, true);
      if (result.model) {
        this.safeLog('[ModelDetect] Phase 1 detected:', result.model, '(bufLen:', this.initialDetectionBuffer.length, ')');
        this.currentModel = result.model;
        if (this.modelChangeCallback) {
          this.modelChangeCallback(result.model);
        }
        this.initialDetectionDone = true;
        this.initialDetectionBuffer = '';
      } else if (this.initialDetectionBuffer.length > 8192) {
        this.safeLog('[ModelDetect] Phase 1 gave up after 8KB');
        this.initialDetectionDone = true;
        this.initialDetectionBuffer = '';
      }
    }

    // Phase 2: Switch detection (rolling buffer to handle PTY fragmentation)
    else {
      this.switchDetectionBuffer += data;
      // Keep only last 512 bytes to prevent unbounded growth
      if (this.switchDetectionBuffer.length > 512) {
        this.switchDetectionBuffer = this.switchDetectionBuffer.slice(-512);
      }
      const result = detectModelFromOutput(this.switchDetectionBuffer, false);
      if (result.model && result.model !== this.currentModel) {
        this.safeLog('[ModelDetect] Phase 2 detected:', result.model, '(was:', this.currentModel, ')');
        this.currentModel = result.model;
        this.switchDetectionBuffer = ''; // Reset after successful detection
        if (this.modelChangeCallback) {
          this.modelChangeCallback(result.model);
        }
      }
    }

    if (this.flushTimeout === null) {
      this.flushTimeout = setTimeout(() => {
        this.flushOutput();
      }, this.FLUSH_INTERVAL);
    }
  }

  private flushOutput(): void {
    if (this.outputBuffer && this.outputCallback) {
      this.outputCallback(this.outputBuffer);
    }
    this.outputBuffer = '';
    this.flushTimeout = null;
  }

  onOutput(callback: (data: string) => void): void {
    this.outputCallback = callback;
  }

  onExit(callback: (exitCode: number) => void): void {
    this.exitCallback = callback;
  }

  onModelChange(callback: (model: ClaudeModel) => void): void {
    this.modelChangeCallback = callback;
  }

  /**
   * Reset model detection state so Phase 1 starts fresh.
   * Called before launching Claude on pool sessions to discard
   * shell output that accumulated in the detection buffer.
   */
  resetDetectionState(): void {
    this.initialDetectionBuffer = '';
    this.initialDetectionDone = false;
    this.switchDetectionBuffer = '';
    this.currentModel = null;
  }

  write(data: string): void {
    if (this.ptyProcess && this._isRunning) {
      this.ptyProcess.write(data);
    }
  }

  resize(size: TerminalSize): void {
    if (this.ptyProcess && this._isRunning) {
      this.ptyProcess.resize(size.cols, size.rows);
    }
  }

  destroy(): void {
    this._isRunning = false;
    this._isInitialized = false;
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }
    if (this.ptyProcess) {
      this.ptyProcess.kill();
      this.ptyProcess = null;
    }
  }
}
