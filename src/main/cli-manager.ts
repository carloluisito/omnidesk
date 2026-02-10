import * as pty from 'node-pty';
import { TerminalSize, PermissionMode } from '../shared/ipc-types';

export interface CLIManagerOptions {
  workingDirectory: string;
  permissionMode: PermissionMode;
}

export class CLIManager {
  private ptyProcess: pty.IPty | null = null;
  private outputCallback: ((data: string) => void) | null = null;
  private exitCallback: ((exitCode: number) => void) | null = null;
  private outputBuffer: string = '';
  private flushTimeout: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 16; // ~60fps, prevents IPC flooding
  private options: CLIManagerOptions;
  private _isRunning: boolean = false;
  private _isInitialized: boolean = false;

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
  async initializeSession(workingDirectory: string, permissionMode: PermissionMode): Promise<void> {
    if (!this._isRunning || this._isInitialized) {
      throw new Error('Cannot initialize: session is not in correct state');
    }

    // Update options with actual session parameters
    this.options.workingDirectory = workingDirectory;
    this.options.permissionMode = permissionMode;

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

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.options.workingDirectory,
      env: {
        ...cleanEnv,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1',
      },
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
    const claudeCommand = this.options.permissionMode === 'skip-permissions'
      ? 'claude --dangerously-skip-permissions'
      : 'claude';

    this.write(`${claudeCommand}\r`);
  }

  private bufferOutput(data: string): void {
    this.outputBuffer += data;

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
