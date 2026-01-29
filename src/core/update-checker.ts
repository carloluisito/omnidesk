/**
 * UpdateChecker - Checks npm registry for newer versions of ClaudeDesk
 *
 * Periodically polls the npm registry, compares versions via semver,
 * detects install method, and broadcasts availability via WebSocket.
 */

import { execSync, spawn } from 'child_process';
import { existsSync, readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { wsManager } from './ws-manager.js';
import { terminalSessionManager } from './terminal-session.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export type InstallMethod = 'global-npm' | 'npx' | 'docker' | 'source' | 'unknown';

export interface UpdateInfo {
  updateAvailable: boolean;
  currentVersion: string;
  latestVersion: string | null;
  checkedAt: string | null;
  installMethod: InstallMethod;
  canAutoUpdate: boolean;
  error?: string;
}

interface UpdateSettings {
  autoCheck: boolean;
  checkIntervalHours: number;
}

// Semver comparison: returns 1 if a > b, -1 if a < b, 0 if equal
function compareSemver(a: string, b: string): number {
  const pa = a.replace(/^v/, '').split('.').map(Number);
  const pb = b.replace(/^v/, '').split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) > (pb[i] || 0)) return 1;
    if ((pa[i] || 0) < (pb[i] || 0)) return -1;
  }
  return 0;
}

// Validate version string
function isValidSemver(version: string): boolean {
  return /^\d+\.\d+\.\d+(-[\w.]+)?$/.test(version);
}

class UpdateChecker {
  private currentVersion: string = '0.0.0';
  private latestVersion: string | null = null;
  private checkedAt: string | null = null;
  private installMethod: InstallMethod = 'unknown';
  private checkTimer: ReturnType<typeof setInterval> | null = null;
  private isUpdating = false;
  private error: string | null = null;

  constructor() {
    this.currentVersion = this.readCurrentVersion();
    this.installMethod = this.detectInstallMethod();
  }

  private readCurrentVersion(): string {
    try {
      const packageJsonPath = join(__dirname, '..', '..', 'package.json');
      const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
      return packageJson.version || '0.0.0';
    } catch {
      return '0.0.0';
    }
  }

  private detectInstallMethod(): InstallMethod {
    // Check for Docker
    try {
      if (existsSync('/.dockerenv') || (existsSync('/proc/1/cgroup') && readFileSync('/proc/1/cgroup', 'utf-8').includes('docker'))) {
        return 'docker';
      }
    } catch {
      // Not in Docker or can't read cgroup
    }

    // Check for npx (look for _npx in the process path)
    const execPath = process.argv[1] || '';
    if (execPath.includes('_npx') || execPath.includes('.npm/_npx')) {
      return 'npx';
    }

    // Check for global npm install
    try {
      const globalRoot = execSync('npm root -g', { encoding: 'utf-8', timeout: 5000 }).trim();
      if (execPath.includes(globalRoot) || execPath.includes('node_modules/claudedesk')) {
        return 'global-npm';
      }
    } catch {
      // npm not available or timed out
    }

    // Check if running from source (has tsconfig.json in project root)
    try {
      const projectRoot = join(__dirname, '..', '..');
      if (existsSync(join(projectRoot, 'tsconfig.json')) && existsSync(join(projectRoot, 'src'))) {
        return 'source';
      }
    } catch {
      // Can't determine
    }

    // Fallback: if node_modules/claudedesk exists in path, likely npm
    if (execPath.includes('claudedesk')) {
      return 'global-npm';
    }

    return 'unknown';
  }

  /**
   * Start periodic update checks
   */
  startAutoCheck(settings: UpdateSettings): void {
    this.stopAutoCheck();

    if (!settings.autoCheck) return;

    const intervalMs = Math.max(1, Math.min(168, settings.checkIntervalHours)) * 60 * 60 * 1000;

    // First check after 30 seconds
    setTimeout(() => {
      this.checkForUpdate().catch((err) => {
        console.warn('[UpdateChecker] Initial check failed:', err.message);
      });
    }, 30_000);

    // Periodic checks
    this.checkTimer = setInterval(() => {
      this.checkForUpdate().catch((err) => {
        console.warn('[UpdateChecker] Periodic check failed:', err.message);
      });
    }, intervalMs);

    console.log(`[UpdateChecker] Auto-check enabled (every ${settings.checkIntervalHours}h)`);
  }

  /**
   * Stop periodic checks
   */
  stopAutoCheck(): void {
    if (this.checkTimer) {
      clearInterval(this.checkTimer);
      this.checkTimer = null;
    }
  }

  /**
   * Check npm registry for a newer version
   */
  async checkForUpdate(): Promise<UpdateInfo> {
    this.error = null;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const response = await fetch('https://registry.npmjs.org/claudedesk/latest', {
        signal: controller.signal,
        headers: { Accept: 'application/json' },
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Registry returned ${response.status}`);
      }

      const data = await response.json() as { version?: string };
      const remoteVersion = data.version;

      if (!remoteVersion || !isValidSemver(remoteVersion)) {
        throw new Error('Invalid version from registry');
      }

      this.latestVersion = remoteVersion;
      this.checkedAt = new Date().toISOString();

      const updateAvailable = compareSemver(remoteVersion, this.currentVersion) > 0;

      if (updateAvailable) {
        wsManager.broadcastAll({
          type: 'system:update-available',
          latestVersion: remoteVersion,
          currentVersion: this.currentVersion,
        });
      }

      return this.getInfo();
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      this.error = `Could not reach npm registry: ${errorMsg}`;
      console.warn(`[UpdateChecker] ${this.error}`);
      return this.getInfo();
    }
  }

  /**
   * Get current update info
   */
  getInfo(): UpdateInfo {
    const updateAvailable = this.latestVersion
      ? compareSemver(this.latestVersion, this.currentVersion) > 0
      : false;

    return {
      updateAvailable,
      currentVersion: this.currentVersion,
      latestVersion: this.latestVersion,
      checkedAt: this.checkedAt,
      installMethod: this.installMethod,
      canAutoUpdate: this.installMethod === 'global-npm',
      ...(this.error ? { error: this.error } : {}),
    };
  }

  /**
   * Perform the update (global npm only)
   */
  async performUpdate(): Promise<{ success: boolean; message: string; stoppedSessions?: number }> {
    if (this.isUpdating) {
      return { success: false, message: 'Update already in progress' };
    }

    // Non-updatable methods return instructions
    if (this.installMethod !== 'global-npm') {
      const instructions: Record<string, string> = {
        docker: 'Pull the latest image: docker pull ghcr.io/carloluisito/claudedesk:latest and recreate the container.',
        npx: 'You are running via npx. Restart with npx claudedesk@latest to get the new version.',
        source: 'You appear to be running from source. Run git pull && npm run build to update.',
        unknown: 'Could not determine install method. Try: npm install -g claudedesk@latest',
      };

      return {
        success: true,
        message: instructions[this.installMethod] || instructions.unknown,
      };
    }

    if (!this.latestVersion || !isValidSemver(this.latestVersion)) {
      return { success: false, message: 'No valid update version available. Run a check first.' };
    }

    this.isUpdating = true;

    try {
      // Stage 1: Stop sessions
      wsManager.broadcastAll({
        type: 'system:update-starting',
        stoppingSessionCount: terminalSessionManager.getAllSessions().length,
      });
      wsManager.broadcastAll({
        type: 'system:update-progress',
        stage: 'stopping-sessions',
        detail: 'Stopping active sessions...',
      });

      const sessions = terminalSessionManager.getAllSessions();
      let stoppedSessions = 0;
      for (const session of sessions) {
        try {
          terminalSessionManager.cancelSession(session.id);
          stoppedSessions++;
        } catch {
          // Continue with other sessions
        }
      }

      // Wait briefly for sessions to stop
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Stage 2: Install
      wsManager.broadcastAll({
        type: 'system:update-progress',
        stage: 'installing',
        detail: `Installing claudedesk@${this.latestVersion}...`,
      });

      const targetVersion = this.latestVersion;
      const installResult = await new Promise<{ success: boolean; output: string }>((resolve) => {
        const child = spawn('npm', ['install', '-g', `claudedesk@${targetVersion}`], {
          stdio: ['pipe', 'pipe', 'pipe'],
          shell: true,
          timeout: 120_000,
        });

        let stdout = '';
        let stderr = '';

        child.stdout?.on('data', (data) => { stdout += data.toString(); });
        child.stderr?.on('data', (data) => { stderr += data.toString(); });

        child.on('close', (code) => {
          resolve({
            success: code === 0,
            output: code === 0 ? stdout : stderr || stdout,
          });
        });

        child.on('error', (err) => {
          resolve({ success: false, output: err.message });
        });
      });

      if (!installResult.success) {
        this.isUpdating = false;
        const errorMsg = installResult.output.includes('EACCES')
          ? `Permission denied. Try: sudo npm install -g claudedesk@${targetVersion}`
          : `npm install failed: ${installResult.output.slice(0, 200)}`;

        wsManager.broadcastAll({
          type: 'system:update-complete',
          success: false,
          error: errorMsg,
        });

        return { success: false, message: errorMsg, stoppedSessions };
      }

      // Stage 3: Restart
      wsManager.broadcastAll({
        type: 'system:update-progress',
        stage: 'restarting',
        detail: 'Restarting server...',
      });

      // Write restart marker
      const markerPath = join(process.cwd(), '.update-pending');
      writeFileSync(markerPath, JSON.stringify({
        previousVersion: this.currentVersion,
        targetVersion,
        timestamp: new Date().toISOString(),
      }));

      wsManager.broadcastAll({
        type: 'system:update-complete',
        success: true,
        newVersion: targetVersion,
      });

      // Exit after brief delay to allow WebSocket message to send
      setTimeout(() => process.exit(0), 1000);

      return {
        success: true,
        message: `Installing claudedesk@${targetVersion}. The server will restart automatically.`,
        stoppedSessions,
      };
    } catch (err) {
      this.isUpdating = false;
      const errorMsg = err instanceof Error ? err.message : String(err);

      wsManager.broadcastAll({
        type: 'system:update-complete',
        success: false,
        error: errorMsg,
      });

      return { success: false, message: errorMsg };
    }
  }

  /**
   * Check for and clear the update-pending marker on startup
   */
  checkUpdateMarker(): void {
    const markerPath = join(process.cwd(), '.update-pending');
    if (existsSync(markerPath)) {
      try {
        const marker = JSON.parse(readFileSync(markerPath, 'utf-8'));
        console.log(`[UpdateChecker] Successfully updated from v${marker.previousVersion} to v${this.currentVersion}`);
        unlinkSync(markerPath);
      } catch {
        try { unlinkSync(markerPath); } catch { /* ignore */ }
      }
    }
  }

  /**
   * Cleanup
   */
  shutdown(): void {
    this.stopAutoCheck();
  }
}

// Singleton
export const updateChecker = new UpdateChecker();
