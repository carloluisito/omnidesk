import { BrowserWindow } from 'electron';
import { execFile, spawn, ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { CONFIG_DIR } from './config-dir';
import { IPCEmitter } from './ipc-emitter';
import type {
  TunnelInfo,
  TunnelCreateRequest,
  TunnelSettings,
  TunnelAccountInfo,
  TunnelUsageStats,
  TunnelRequestLog,
  TunnelOperationResult,
  TunnelStatus,
  TunnelProtocol,
} from '../shared/types/tunnel-types';

function mapApiStatus(s: string): TunnelStatus {
  switch (s) {
    case 'active':
    case 'connected': return 'active';
    case 'terminated': return 'stopped';
    case 'starting': return 'creating';
    case 'error': return 'error';
    default: return 'stopped';
  }
}

interface ApiTunnel {
  id: string;
  name: string;
  url: string;
  protocol: string;
  port?: number;
  local_address?: string;
  subdomain?: string;
  status: string;
  created_at: string;
}

const SETTINGS_FILE = path.join(CONFIG_DIR, 'tunnel-settings.json');
const TUNNEL_LIST_CACHE_TTL_MS = 30_000;
const DEFAULT_API_BASE_URL = 'https://api.launchtunnel.dev/api';

const DEFAULT_SETTINGS: TunnelSettings = {
  apiKey: '',
  apiBaseUrl: DEFAULT_API_BASE_URL,
  autoRefreshIntervalMs: 30_000,
  defaultProtocol: 'http',
};

interface LocalTunnelProcess {
  pid: number;
  process: ChildProcess;
  tunnelId: string;
  port: number;
  name: string;
  protocol: string;
  createdAt: string;
  url: string;
  status: TunnelStatus;
}

export class TunnelManager {
  private emitter: IPCEmitter | null = null;
  private settings: TunnelSettings = { ...DEFAULT_SETTINGS };
  private settingsLoaded = false;
  private ltBinary: string | null = null;
  private localProcesses: Map<string, LocalTunnelProcess> = new Map();
  private cachedList: TunnelInfo[] | null = null;
  private cacheTimestamp = 0;

  constructor() {
    this.loadSettings();
    this.detectLtBinary();
  }

  setMainWindow(window: BrowserWindow): void {
    this.emitter = new IPCEmitter(window);
  }

  destroy(): void {
    for (const [tunnelId, proc] of this.localProcesses) {
      this.killProcess(proc);
      this.emitter?.emit('onTunnelStopped', { tunnelId });
    }
    this.localProcesses.clear();
    this.emitter = null;
  }

  // ── Settings persistence ──

  private ensureConfigDir(): void {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
  }

  private loadSettings(): void {
    if (this.settingsLoaded) return;
    this.settingsLoaded = true;

    try {
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        const saved = JSON.parse(raw) as Partial<TunnelSettings>;
        this.settings = { ...DEFAULT_SETTINGS, ...saved };
        console.log('[TunnelManager] Settings loaded');
      }
    } catch (err) {
      console.error('[TunnelManager] Failed to load settings:', err);
    }
  }

  private saveSettings(): void {
    try {
      this.ensureConfigDir();
      const tempFile = `${SETTINGS_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.settings, null, 2), 'utf-8');
      fs.renameSync(tempFile, SETTINGS_FILE);
    } catch (err) {
      console.error('[TunnelManager] Failed to save settings:', err);
    }
  }

  // ── Binary detection ──

  private detectLtBinary(): void {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const candidates = this.settings.ltBinaryPath
      ? [this.settings.ltBinaryPath]
      : ['lt'];

    const tryNext = (index: number): void => {
      if (index >= candidates.length) {
        console.warn('[TunnelManager] lt binary not found');
        this.ltBinary = null;
        return;
      }
      const candidate = candidates[index];
      try {
        execFile(cmd, [candidate], { timeout: 5000 }, (err, stdout) => {
          if (!err && stdout.trim()) {
            this.ltBinary = stdout.trim().split('\n')[0].trim();
            console.log('[TunnelManager] Found lt binary:', this.ltBinary);
          } else {
            tryNext(index + 1);
          }
        });
      } catch {
        tryNext(index + 1);
      }
    };

    tryNext(0);
  }

  // ── REST API helpers ──

  private async apiRequest<T>(
    method: string,
    endpoint: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.settings.apiBaseUrl}${endpoint}`;
    const headers: Record<string, string> = {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
    };

    if (this.settings.apiKey) {
      headers['Authorization'] = `Bearer ${this.settings.apiKey}`;
    }

    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`API ${method} ${endpoint} failed (${response.status}): ${text}`);
    }

    return response.json() as Promise<T>;
  }

  // ── Tunnel list with caching ──

  private isCacheValid(): boolean {
    return this.cachedList !== null && (Date.now() - this.cacheTimestamp) < TUNNEL_LIST_CACHE_TTL_MS;
  }

  private mergeWithLocal(apiTunnels: TunnelInfo[]): TunnelInfo[] {
    const result = [...apiTunnels];
    const apiIds = new Set(apiTunnels.map(t => t.id));

    for (const [tunnelId, proc] of this.localProcesses) {
      if (!apiIds.has(tunnelId)) {
        result.push({
          id: tunnelId,
          name: proc.name,
          port: proc.port,
          protocol: proc.protocol as 'http' | 'tcp',
          url: proc.url,
          status: proc.status,
          createdAt: proc.createdAt,
          pid: proc.pid,
          isLocal: true,
        });
      }
    }

    return result;
  }

  async list(forceRefresh = false): Promise<TunnelInfo[]> {
    if (!forceRefresh && this.isCacheValid()) {
      return this.cachedList!;
    }

    if (!this.settings.apiKey) {
      // No API key — return only local processes
      const local = this.mergeWithLocal([]);
      this.cachedList = local;
      this.cacheTimestamp = Date.now();
      return local;
    }

    try {
      interface ApiListResponse { tunnels: ApiTunnel[]; }
      const data = await this.apiRequest<ApiListResponse>('GET', '/v1/tunnels');
      const mapped: TunnelInfo[] = (data.tunnels || []).map(t => ({
        id: t.id,
        name: t.name || '',
        url: t.url || '',
        port: t.port || parseInt(t.local_address?.split(':')[1] || '0'),
        protocol: (t.protocol || 'http') as TunnelProtocol,
        status: mapApiStatus(t.status),
        createdAt: t.created_at,
        subdomain: t.subdomain,
        isLocal: false,
      }));
      const merged = this.mergeWithLocal(mapped);
      this.cachedList = merged;
      this.cacheTimestamp = Date.now();
      return merged;
    } catch (err) {
      console.error('[TunnelManager] Failed to list tunnels:', err);
      return this.mergeWithLocal([]);
    }
  }

  async getInfo(tunnelId: string): Promise<TunnelInfo | null> {
    const local = this.localProcesses.get(tunnelId);
    if (local) {
      return {
        id: local.tunnelId,
        name: local.name,
        port: local.port,
        protocol: local.protocol as 'http' | 'tcp',
        url: local.url,
        status: local.status,
        createdAt: local.createdAt,
        pid: local.pid,
        isLocal: true,
      };
    }

    if (!this.settings.apiKey) return null;

    try {
      const raw = await this.apiRequest<ApiTunnel>('GET', `/v1/tunnels/${tunnelId}`);
      return {
        id: raw.id,
        name: raw.name || '',
        url: raw.url || '',
        port: raw.port || parseInt(raw.local_address?.split(':')[1] || '0'),
        protocol: (raw.protocol || 'http') as TunnelProtocol,
        status: mapApiStatus(raw.status),
        createdAt: raw.created_at,
        subdomain: raw.subdomain,
        isLocal: false,
      };
    } catch {
      return null;
    }
  }

  // ── Tunnel creation via lt CLI ──

  async create(request: TunnelCreateRequest): Promise<TunnelOperationResult> {
    if (!this.ltBinary) {
      return { success: false, message: 'lt binary not found. Install LaunchTunnel CLI (npm install -g @launchtunnel/cli).', errorCode: 'CLI_NOT_FOUND' };
    }

    const tunnelId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const name = request.name || `tunnel-${request.port}`;
    const protocol = request.protocol || this.settings.defaultProtocol;
    const createdAt = new Date().toISOString();

    const args = ['preview', '--port', String(request.port)];
    if (request.subdomain) args.push('--subdomain', request.subdomain);
    if (request.auth) args.push('--local-host', request.auth);

    console.log('[TunnelManager] Spawning lt with args:', args);

    try {
      const proc = spawn(this.ltBinary, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: false,
        shell: true,
      });

      if (!proc.pid) {
        return { success: false, message: 'Failed to spawn lt process', errorCode: 'UNKNOWN' };
      }

      const localProc: LocalTunnelProcess = {
        pid: proc.pid,
        process: proc,
        tunnelId,
        port: request.port,
        name,
        protocol,
        createdAt,
        url: '',
        status: 'creating',
      };
      this.localProcesses.set(tunnelId, localProc);

      // Parse stdout line-by-line for the tunnel URL
      let urlResolved = false;
      const urlPromise = new Promise<string>((resolve, reject) => {
        const timeout = setTimeout(() => {
          if (!urlResolved) reject(new Error('Timeout waiting for tunnel URL'));
        }, 30_000);

        proc.stdout?.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          this.emitter?.emit('onTunnelOutput', { tunnelId, data: text });

          const lines = text.split('\n');
          for (const line of lines) {
            // lt outputs "URL:        https://..." or "your url is: https://..."
            const match = line.match(/URL:\s+(https?:\/\/\S+)/i) ||
                          line.match(/your url is:\s*(https?:\/\/\S+)/i);
            if (match && !urlResolved) {
              urlResolved = true;
              clearTimeout(timeout);
              resolve(match[1].trim());
            }
          }
        });

        proc.stderr?.on('data', (chunk: Buffer) => {
          const text = chunk.toString();
          this.emitter?.emit('onTunnelOutput', { tunnelId, data: text });
        });

        proc.on('error', (err) => {
          clearTimeout(timeout);
          reject(err);
        });

        proc.on('exit', (code) => {
          if (!urlResolved) {
            clearTimeout(timeout);
            reject(new Error(`lt process exited with code ${code} before providing URL`));
          }
        });
      });

      // Set up lifecycle handlers after URL is captured
      proc.on('exit', (code) => {
        const entry = this.localProcesses.get(tunnelId);
        if (entry) {
          entry.status = 'stopped';
        }
        this.localProcesses.delete(tunnelId);
        this.emitter?.emit('onTunnelStopped', { tunnelId });
        console.log(`[TunnelManager] Tunnel ${tunnelId} process exited (code ${code})`);
      });

      proc.on('error', (err) => {
        const entry = this.localProcesses.get(tunnelId);
        if (entry) {
          entry.status = 'error';
        }
        this.emitter?.emit('onTunnelError', { tunnelId, error: err.message });
        this.localProcesses.delete(tunnelId);
      });

      const url = await urlPromise;
      localProc.url = url;
      localProc.status = 'active';

      const tunnelInfo: TunnelInfo = {
        id: tunnelId,
        name,
        port: request.port,
        protocol: protocol as 'http' | 'tcp',
        url,
        status: 'active',
        createdAt,
        pid: proc.pid,
        isLocal: true,
        subdomain: request.subdomain,
        hasAuth: !!request.auth,
        hasInspect: !!request.inspect,
      };

      this.emitter?.emit('onTunnelCreated', { tunnel: tunnelInfo });
      this.cachedList = null; // Invalidate cache

      console.log(`[TunnelManager] Tunnel created: ${tunnelId} → ${url}`);
      return { success: true, message: `Tunnel created: ${url}` };
    } catch (err) {
      this.localProcesses.delete(tunnelId);
      const message = err instanceof Error ? err.message : String(err);
      console.error('[TunnelManager] Failed to create tunnel:', message);
      this.emitter?.emit('onTunnelError', { tunnelId, error: message });
      return { success: false, message, errorCode: 'UNKNOWN' };
    }
  }

  // ── Stop tunnel ──

  async stop(tunnelId: string): Promise<TunnelOperationResult> {
    const local = this.localProcesses.get(tunnelId);
    if (local) {
      local.status = 'stopping';
      this.killProcess(local);
      this.localProcesses.delete(tunnelId);
      this.emitter?.emit('onTunnelStopped', { tunnelId });
      this.cachedList = null;
      return { success: true, message: 'Tunnel stopped' };
    }

    if (!this.settings.apiKey) {
      return { success: false, message: 'Tunnel not found', errorCode: 'UNKNOWN' };
    }

    try {
      await this.apiRequest('DELETE', `/v1/tunnels/${tunnelId}`);
      this.emitter?.emit('onTunnelStopped', { tunnelId });
      this.cachedList = null;
      return { success: true, message: 'Tunnel stopped' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message, errorCode: 'NETWORK_ERROR' };
    }
  }

  async stopAll(): Promise<TunnelOperationResult> {
    let failed = 0;
    for (const [tunnelId] of this.localProcesses) {
      const result = await this.stop(tunnelId);
      if (!result.success) failed++;
    }

    if (this.settings.apiKey) {
      try {
        await this.apiRequest('DELETE', '/v1/tunnels');
      } catch (err) {
        console.error('[TunnelManager] Failed to stop remote tunnels:', err);
        failed++;
      }
    }

    this.cachedList = null;
    return failed > 0
      ? { success: false, message: `Failed to stop ${failed} tunnel(s)`, errorCode: 'UNKNOWN' }
      : { success: true, message: 'All tunnels stopped' };
  }

  // ── Kill process helper ──

  private killProcess(proc: LocalTunnelProcess): void {
    try {
      if (process.platform === 'win32') {
        execFile('taskkill', ['/F', '/T', '/PID', String(proc.pid)], () => { /* ignore */ });
      } else {
        proc.process.kill('SIGTERM');
      }
    } catch (err) {
      console.warn('[TunnelManager] Failed to kill process:', err);
    }
  }

  // ── Request logs ──

  async getLogs(tunnelId: string, limit = 100): Promise<TunnelRequestLog[]> {
    if (!this.settings.apiKey) return [];

    try {
      interface ApiLog {
        id: string; method: string; path: string;
        status_code: number; duration_ms: number;
        request_bytes: number; response_bytes: number; timestamp: string;
      }
      interface ApiLogsResponse { logs: ApiLog[]; }
      const data = await this.apiRequest<ApiLogsResponse>('GET', `/v1/tunnels/${tunnelId}/logs?limit=${limit}`);
      return (data.logs || []).map(l => ({
        id: l.id,
        method: l.method,
        path: l.path,
        statusCode: l.status_code,
        timestamp: l.timestamp,
        duration: l.duration_ms,
        size: (l.request_bytes || 0) + (l.response_bytes || 0),
      }));
    } catch {
      return [];
    }
  }

  // ── Account info ──

  async getAccount(): Promise<TunnelAccountInfo | null> {
    if (!this.settings.apiKey) return null;

    try {
      interface ApiAccountResponse {
        user: { email?: string; plan?: string; status?: string; };
      }
      const data = await this.apiRequest<ApiAccountResponse>('GET', '/v1/account/me');
      const u = data.user;
      return { email: u.email, plan: u.plan, status: u.status };
    } catch (err) {
      console.error('[TunnelManager] Failed to get account:', err);
      return null;
    }
  }

  // ── Usage stats ──

  async getUsage(tunnelId: string): Promise<TunnelUsageStats | null> {
    if (!this.settings.apiKey) return null;

    try {
      const data = await this.apiRequest<TunnelUsageStats>('GET', `/v1/tunnels/${tunnelId}/usage`);
      return data;
    } catch {
      return null;
    }
  }

  // ── Settings management ──

  getSettings(): TunnelSettings {
    return { ...this.settings };
  }

  updateSettings(partial: Partial<TunnelSettings>): TunnelSettings {
    this.settings = { ...this.settings, ...partial };
    this.saveSettings();

    // Re-detect binary if path changed
    if (partial.ltBinaryPath !== undefined) {
      this.ltBinary = null;
      this.detectLtBinary();
    }

    // Invalidate cache if API settings changed
    if (partial.apiKey !== undefined || partial.apiBaseUrl !== undefined) {
      this.cachedList = null;
      this.cacheTimestamp = 0;
    }

    return { ...this.settings };
  }

  // ── Binary detection ──

  detectBinary(): boolean {
    return this.ltBinary !== null;
  }

  // ── API key validation ──

  async validateKey(apiKey: string): Promise<TunnelOperationResult> {
    if (!apiKey) {
      return { success: false, message: 'API key is required', errorCode: 'NO_API_KEY' };
    }

    try {
      const url = `${this.settings.apiBaseUrl}/v1/account/me`;
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
      });

      if (response.status === 401 || response.status === 403) {
        return { success: false, message: 'Invalid API key', errorCode: 'INVALID_API_KEY' };
      }

      if (!response.ok) {
        return { success: false, message: `API error (${response.status})`, errorCode: 'NETWORK_ERROR' };
      }

      return { success: true, message: 'API key is valid' };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { success: false, message, errorCode: 'NETWORK_ERROR' };
    }
  }

  // ── Force refresh ──

  async refresh(): Promise<TunnelInfo[]> {
    this.cachedList = null;
    this.cacheTimestamp = 0;
    return this.list(true);
  }
}
