import * as pty from 'node-pty';
import * as os from 'os';
import { execFileSync } from 'child_process';
import * as fs from 'fs';
import { TerminalSize, PermissionMode, ClaudeModel } from '../shared/ipc-types';
import { detectModelFromOutput } from '../shared/model-detector';
import type { IProvider } from './providers/provider';

/**
 * Read a fresh set of environment variables from the Windows registry.
 *
 * When a user opens a new CMD window, Windows builds the environment from
 * Machine + User registry keys (via explorer.exe).  Electron's process.env
 * is a snapshot from launch time and may be stale or contaminated by the
 * parent process (e.g. running inside a Claude Code session with personal
 * account vars).  This function gives us the same env a fresh CMD would get.
 *
 * Cached after first call – subsequent invocations are instant.
 */
let _freshWinEnvCache: Record<string, string> | null = null;

function getFreshWindowsEnvironment(): Record<string, string> | null {
  if (_freshWinEnvCache) return _freshWinEnvCache;

  try {
    // PowerShell reads Machine + User env directly from registry.
    // PATH is special: Machine PATH ; User PATH (concatenated).
    const script = [
      '$m=[Environment]::GetEnvironmentVariables("Machine")',
      '$u=[Environment]::GetEnvironmentVariables("User")',
      '$r=@{}',
      'foreach($e in $m.GetEnumerator()){$r[$e.Key]=$e.Value}',
      'foreach($e in $u.GetEnumerator()){if($e.Key -ieq "Path"){$r[$e.Key]=$r[$e.Key]+";"+$e.Value}else{$r[$e.Key]=$e.Value}}',
      'foreach($e in $r.GetEnumerator()){[Console]::Out.WriteLine($e.Key+"="+$e.Value)}',
    ].join(';');

    const output = execFileSync('powershell.exe', [
      '-NoProfile', '-NonInteractive', '-Command', script,
    ], { encoding: 'utf-8', timeout: 10000, windowsHide: true });

    const env: Record<string, string> = {};
    for (const line of output.split(/\r?\n/)) {
      const idx = line.indexOf('=');
      if (idx > 0) {
        env[line.substring(0, idx)] = line.substring(idx + 1);
      }
    }

    // Volatile / session vars are NOT in Machine/User registry keys.
    // They live in HKCU\Volatile Environment and are set at logon.
    // Fall back to process.env for these essential vars if missing.
    const volatileKeys = [
      'USERPROFILE', 'APPDATA', 'LOCALAPPDATA', 'TEMP', 'TMP',
      'HOMEPATH', 'HOMEDRIVE', 'HOME',
      'SYSTEMROOT', 'SYSTEMDRIVE', 'WINDIR',
      'COMPUTERNAME', 'USERNAME', 'USERDOMAIN', 'USERDOMAIN_ROAMINGPROFILE',
      'COMSPEC', 'PROGRAMDATA', 'PROGRAMFILES', 'PROGRAMFILES(X86)',
      'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)', 'PUBLIC',
      'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS',
      'PATHEXT', 'LOGONSERVER', 'SESSIONNAME',
    ];
    for (const key of volatileKeys) {
      if (!env[key] && process.env[key]) {
        env[key] = process.env[key]!;
      }
    }

    console.log(`[CLIManager] Fresh Windows env loaded (${Object.keys(env).length} vars)`);
    _freshWinEnvCache = env;
    return env;
  } catch (err) {
    console.error('[CLIManager] Failed to read fresh Windows env, falling back to process.env:', err);
    return null;
  }
}

/**
 * Read a fresh set of environment variables from the user's login shell.
 *
 * On macOS/Linux a fresh terminal gets its environment by sourcing the user's
 * shell profiles (.zshrc, .bash_profile, /etc/profile, etc.).  Electron's
 * process.env is a snapshot from launch time and may be stale — for example,
 * nvm/conda/pyenv paths or API keys added after app launch won't be present.
 *
 * This function spawns a login shell with `env -0` (or `env` for fish) and
 * parses the resulting environment.  Cached after first call.
 */
let _freshUnixEnvCache: Record<string, string> | null = null;

function getFreshUnixEnvironment(): Record<string, string> | null {
  if (_freshUnixEnvCache) return _freshUnixEnvCache;

  try {
    // Resolve user's login shell with a fallback chain
    let shell = process.env.SHELL;
    if (!shell) {
      const platform = os.platform();
      if (platform === 'darwin') {
        shell = fs.existsSync('/bin/zsh') ? '/bin/zsh' : '/bin/bash';
      } else {
        shell = fs.existsSync('/bin/bash') ? '/bin/bash' : '/bin/sh';
      }
    }

    const isFish = shell.includes('fish');

    let output: string;
    const env: Record<string, string> = {};

    if (isFish) {
      // fish doesn't support POSIX-style `-lc`; use `fish -l -c 'env'`
      // and split on newlines instead of null bytes.
      output = execFileSync(shell, ['-l', '-c', 'env'], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      for (const line of output.split('\n')) {
        // Validate: proper env var lines only (KEY=VALUE)
        if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(line)) {
          const idx = line.indexOf('=');
          env[line.substring(0, idx)] = line.substring(idx + 1);
        }
      }
    } else {
      // POSIX shells: run as login shell with `env -0` for null-delimited output
      output = execFileSync(shell, ['-lc', 'env -0'], {
        encoding: 'utf-8',
        timeout: 10000,
      });
      for (const entry of output.split('\0')) {
        const idx = entry.indexOf('=');
        if (idx > 0) {
          env[entry.substring(0, idx)] = entry.substring(idx + 1);
        }
      }
    }

    // Volatile / session-specific vars that may not be in shell profiles.
    // Fall back to process.env for these if the login shell didn't provide them.
    const volatileKeys = [
      'SSH_AUTH_SOCK', 'SSH_AGENT_PID', 'DBUS_SESSION_BUS_ADDRESS',
      'DISPLAY', 'WAYLAND_DISPLAY', 'XDG_RUNTIME_DIR', 'XDG_SESSION_TYPE',
      'TMPDIR', 'LANG', 'LC_ALL', 'LC_CTYPE',
      'USER', 'LOGNAME', 'HOME', 'SHELL',
    ];
    for (const key of volatileKeys) {
      if (!env[key] && process.env[key]) {
        env[key] = process.env[key]!;
      }
    }

    console.log(`[CLIManager] Fresh Unix env loaded (${Object.keys(env).length} vars, shell: ${shell})`);
    _freshUnixEnvCache = env;
    return env;
  } catch (err) {
    console.error('[CLIManager] Failed to read fresh Unix env, falling back to process.env:', err);
    return null;
  }
}

export interface CLIManagerOptions {
  workingDirectory: string;
  permissionMode: PermissionMode;
  model?: ClaudeModel;
  enableAgentTeams?: boolean;
  provider?: IProvider;
}

export class CLIManager {
  private ptyProcess: pty.IPty | null = null;
  private outputCallback: ((data: string) => void) | null = null;
  private exitCallback: ((exitCode: number) => void) | null = null;
  private modelChangeCallback: ((model: ClaudeModel) => void) | null = null;
  private outputBuffer: string = '';
  private flushTimeout: NodeJS.Timeout | null = null;
  private readonly FLUSH_INTERVAL = 16; // ~60fps, prevents IPC flooding
  private readonly WRITE_CHUNK_SIZE = 1024; // 1KB chunks for large pastes
  private readonly WRITE_CHUNK_DELAY = 5;   // 5ms between chunks
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
  async initializeSession(workingDirectory: string, permissionMode: PermissionMode, model?: ClaudeModel, provider?: IProvider): Promise<void> {
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
    if (provider !== undefined) {
      this.options.provider = provider;
    }

    // Change to the target directory (shell was spawned at process.cwd())
    if (process.platform === 'win32') {
      this.write(`cd /d "${workingDirectory}"\r`);
    } else {
      const escapedDir = workingDirectory.replace(/'/g, "'\\''");
      this.write(`cd '${escapedDir}'\r`);
    }

    this.launchProviderCommand();
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
    this.launchProviderCommand();
    this._isInitialized = true;
  }

  /**
   * Shared PTY creation: spawn a lightweight shell, wire handlers, wait for readiness.
   * Uses cmd.exe on Windows (fast startup, no .NET overhead) and user's shell on Unix.
   */
  private async createPtyProcess(): Promise<void> {
    const shell = process.platform === 'win32' ? 'cmd.exe' : process.env.SHELL || '/bin/bash';

    // On Windows, read a fresh environment from the registry so the PTY
    // gets the same vars a newly-opened CMD window would have.  This avoids
    // stale or contaminated vars from Electron's process.env (e.g. personal
    // account auth leaking when the app was launched from a Claude session).
    // On other platforms, use process.env as before.
    const baseEnv = (process.platform === 'win32'
      ? getFreshWindowsEnvironment()
      : getFreshUnixEnvironment()
    ) ?? process.env;

    // Filter out vars that interfere with child CLI processes:
    // - ELECTRON_*: Electron internals that break child processes
    // - ORIGINAL_*: Electron's saved copies of overridden vars
    // - CLAUDECODE: Prevents "cannot launch inside another session" error
    const cleanEnv: { [key: string]: string } = {};
    for (const [key, value] of Object.entries(baseEnv)) {
      if (value !== undefined
        && !key.startsWith('ELECTRON_')
        && !key.startsWith('ORIGINAL_')
        && key !== 'CLAUDECODE'
      ) {
        cleanEnv[key] = value;
      }
    }

    const ptyEnv: { [key: string]: string } = {
      ...cleanEnv,
      TERM: 'xterm-256color',
      COLORTERM: 'truecolor',
    };
    if (this.options.provider) {
      // Use provider-supplied env vars (provider is responsible for agent teams flag)
      const providerEnv = this.options.provider.getEnvironmentVariables({
        enableAgentTeams: this.options.enableAgentTeams !== false,
      });
      Object.assign(ptyEnv, providerEnv);
    } else {
      // Fallback: Claude-specific agent teams flag
      if (this.options.enableAgentTeams !== false) {
        ptyEnv.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = '1';
      }
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

  private launchProviderCommand(): void {
    let command: string;

    if (this.options.provider) {
      // Provider-aware path: delegate command building to the provider
      command = this.options.provider.buildCommand({
        workingDirectory: this.options.workingDirectory,
        permissionMode: this.options.permissionMode,
        model: this.options.model,
      });
    } else {
      // Fallback path: existing Claude command building (unchanged behavior)
      command = this.options.permissionMode === 'skip-permissions'
        ? 'claude --dangerously-skip-permissions'
        : 'claude';

      // Add model flag if specified (skip for 'auto' — let CLI decide)
      if (this.options.model && this.options.model !== 'auto') {
        command += ` --model ${this.options.model}`;
      }
    }

    this.write(`${command}\r`);
  }

  private bufferOutput(data: string): void {
    this.outputBuffer += data;

    // Resolve provider-specific detection options (undefined = use built-in Claude patterns)
    const providerPatterns = this.options.provider
      ? this.options.provider.getModelDetectionPatterns()
      : undefined;
    const providerNormalizer = this.options.provider
      ? (raw: string) => this.options.provider!.normalizeModel(raw)
      : undefined;

    // Phase 1: Initial detection (try on each chunk, give up after 8KB)
    if (!this.initialDetectionDone) {
      this.initialDetectionBuffer += data;
      const result = detectModelFromOutput(this.initialDetectionBuffer, true, providerPatterns, providerNormalizer);
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
      const result = detectModelFromOutput(this.switchDetectionBuffer, false, providerPatterns, providerNormalizer);
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

  /**
   * Write data to the PTY, chunking large payloads to prevent pipe buffer
   * overflow that causes silent data loss (especially on Windows conpty).
   * Small writes (normal keystrokes) pass through immediately.
   */
  write(data: string): void {
    if (!this.ptyProcess || !this._isRunning) return;

    if (data.length <= this.WRITE_CHUNK_SIZE) {
      this.ptyProcess.write(data);
      return;
    }

    // Large payload (paste): split into chunks with small delays
    // so the PTY pipe buffer can drain between writes
    let offset = 0;
    const writeNextChunk = () => {
      if (!this.ptyProcess || !this._isRunning) return;
      const end = Math.min(offset + this.WRITE_CHUNK_SIZE, data.length);
      this.ptyProcess.write(data.substring(offset, end));
      offset = end;
      if (offset < data.length) {
        setTimeout(writeNextChunk, this.WRITE_CHUNK_DELAY);
      }
    };
    writeNextChunk();
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
