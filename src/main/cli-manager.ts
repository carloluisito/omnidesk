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
   * Creates PTY and initializes shell, but does NOT inject directory lock or launch Claude.
   */
  async spawnShell(): Promise<void> {
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.options.workingDirectory,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        CLAUDEDESK_LOCKED_DIR: this.options.workingDirectory,
      } as { [key: string]: string },
    });

    this._isRunning = true;

    this.ptyProcess.onData((data: string) => {
      this.bufferOutput(data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this._isRunning = false;
      this._isInitialized = false;
      this.flushOutput(); // Flush any remaining output
      if (this.exitCallback) {
        this.exitCallback(exitCode);
      }
    });

    // Wait for shell to initialize (150ms)
    await new Promise(resolve => setTimeout(resolve, 150));
  }

  /**
   * Phase 2: Activate session (for pool claim).
   * Updates working directory and permission mode, injects directory lock, and launches Claude.
   */
  async initializeSession(workingDirectory: string, permissionMode: PermissionMode): Promise<void> {
    if (!this._isRunning || this._isInitialized) {
      throw new Error('Cannot initialize: session is not in correct state');
    }

    // Update options with actual session parameters
    this.options.workingDirectory = workingDirectory;
    this.options.permissionMode = permissionMode;

    // Change to the target directory first (shell was spawned at process.cwd())
    if (process.platform === 'win32') {
      const escapedDir = workingDirectory.replace(/'/g, "''");
      this.write(`Set-Location '${escapedDir}'\r`);
    } else {
      const escapedDir = workingDirectory.replace(/'/g, "'\\''");
      this.write(`cd '${escapedDir}'\r`);
    }

    // Update the CLAUDEDESK_LOCKED_DIR env var for the running shell
    if (process.platform === 'win32') {
      const escapedDir = workingDirectory.replace(/\\/g, '\\\\');
      this.write(`$env:CLAUDEDESK_LOCKED_DIR="${escapedDir}"\r`);
    } else {
      this.write(`export CLAUDEDESK_LOCKED_DIR="${workingDirectory}"\r`);
    }

    // Inject directory lock and launch Claude
    this.injectDirectoryLock();
    this.launchClaudeCommand();

    this._isInitialized = true;

    // Wait for Claude to launch (200ms)
    await new Promise(resolve => setTimeout(resolve, 200));
  }

  /**
   * Existing spawn method (backward compatible, synchronous).
   * Creates shell and launches Claude immediately for direct session creation.
   */
  spawn(): void {
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash';

    this.ptyProcess = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols: 80,
      rows: 24,
      cwd: this.options.workingDirectory,
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        CLAUDEDESK_LOCKED_DIR: this.options.workingDirectory,
      } as { [key: string]: string },
    });

    this._isRunning = true;

    this.ptyProcess.onData((data: string) => {
      this.bufferOutput(data);
    });

    this.ptyProcess.onExit(({ exitCode }) => {
      this._isRunning = false;
      this._isInitialized = false;
      this.flushOutput(); // Flush any remaining output
      if (this.exitCallback) {
        this.exitCallback(exitCode);
      }
    });

    // Inject directory lock and launch Claude immediately (synchronous for backward compatibility)
    this.injectDirectoryLock();
    this.launchClaudeCommand();
    this._isInitialized = true;
  }

  private injectDirectoryLock(): void {
    const lockedDir = this.options.workingDirectory;

    if (process.platform === 'win32') {
      // PowerShell: Compact prompt hook for directory locking
      const escapedDir = lockedDir.replace(/\\/g, '\\\\');
      this.write(`$env:CLAUDEDESK_LOCKED_DIR="${escapedDir}"\r`);
      this.write(`function global:prompt{if($PWD.Path -ne $env:CLAUDEDESK_LOCKED_DIR){sl $env:CLAUDEDESK_LOCKED_DIR -EA silent;Write-Host "Directory locked to: $env:CLAUDEDESK_LOCKED_DIR" -F Red}"PS $($PWD.Path)> "}\r`);
    } else {
      // Bash/Zsh: Compact directory lock setup
      const bashInit = `export CLAUDEDESK_LOCKED_DIR="${lockedDir}"\rPROMPT_COMMAND='if [ "$PWD" != "$CLAUDEDESK_LOCKED_DIR" ]; then cd "$CLAUDEDESK_LOCKED_DIR" 2>/dev/null; echo -e "\\033[0;31mError: Directory change blocked. Locked to: $CLAUDEDESK_LOCKED_DIR\\033[0m" >&2; fi'\rcd() { echo -e "\\033[0;31mError: cd disabled. Locked to: $CLAUDEDESK_LOCKED_DIR\\033[0m" >&2; return 1; }\rpushd() { echo -e "\\033[0;31mError: pushd disabled. Locked to: $CLAUDEDESK_LOCKED_DIR\\033[0m" >&2; return 1; }\rpopd() { echo -e "\\033[0;31mError: popd disabled. Locked to: $CLAUDEDESK_LOCKED_DIR\\033[0m" >&2; return 1; }\r`;
      this.write(bashInit);
    }
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
