import { spawn, execFile, type ChildProcess } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export type TunnelState = 'off' | 'starting' | 'running' | 'error';

export interface TunnelStatus {
  state: TunnelState;
  url?: string;
  error?: string;
}

/** Quick-tunnel URL cloudflared prints on startup, e.g. https://foo-bar.trycloudflare.com */
const TUNNEL_URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;

/** Extract the trycloudflare URL from a chunk of cloudflared output, or null. */
export function parseTunnelUrl(chunk: string): string | null {
  const m = chunk.match(TUNNEL_URL_RE);
  return m ? m[0] : null;
}

type Spawner = (cmd: string, args: string[]) => ChildProcess;

/**
 * Manages a single `cloudflared` quick tunnel child process. Spawns it, waits
 * for the public URL to appear in its output, and stops exactly the one child
 * it started (never a bulk/port kill — honours the process-safety rule).
 */
/** cloudflared logs this once the tunnel is actually connected to the edge and
 *  the hostname is live in DNS. We wait for it before declaring 'running' —
 *  the URL is printed several seconds earlier, before DNS resolves. */
const CONNECTED_RE = /registered tunnel connection|connection registered|each tunnel connection/i;

export class TunnelManager {
  private child: ChildProcess | null = null;
  private state: TunnelState = 'off';
  private url?: string;
  private error?: string;
  private logTail = '';
  private stopping = false;

  constructor(
    private bin: string,
    private spawner: Spawner = (cmd, args) => spawn(cmd, args, { windowsHide: true }),
  ) {}

  status(): TunnelStatus {
    return { state: this.state, url: this.url, error: this.error };
  }

  isRunning(): boolean {
    return this.state === 'running' || this.state === 'starting';
  }

  /**
   * Start the tunnel for the given local port. Resolves 'running' only once the
   * tunnel is actually connected (the URL is live in DNS), not merely when the
   * URL is printed. `graceMs` is a fallback: if the URL appears but no explicit
   * connection line is seen (cloudflared log format varies by version), we
   * declare running after this delay rather than hanging.
   */
  start(port: number, timeoutMs = 25_000, graceMs = 6_000): Promise<TunnelStatus> {
    if (this.child) return Promise.resolve(this.status());

    this.state = 'starting';
    this.url = undefined;
    this.error = undefined;
    this.logTail = '';
    this.stopping = false;

    return new Promise((resolve) => {
      let settled = false;
      let pendingUrl: string | null = null;
      let graceTimer: NodeJS.Timeout | null = null;

      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (graceTimer) clearTimeout(graceTimer);
        resolve(this.status());
      };

      const goRunning = (url: string) => {
        if (settled) return;
        this.url = url;
        this.state = 'running';
        settle();
      };

      const child = this.spawner(this.bin, [
        'tunnel',
        '--url',
        `http://localhost:${port}`,
        '--no-autoupdate',
      ]);
      this.child = child;

      // cloudflared prints the quick-tunnel URL and status to stderr; watch both.
      const onData = (buf: Buffer | string) => {
        this.logTail = (this.logTail + buf.toString()).slice(-4000);
        if (!pendingUrl) {
          const url = parseTunnelUrl(this.logTail);
          if (url) {
            pendingUrl = url;
            // Fallback: if no explicit "connected" line arrives, accept the URL
            // after a grace period so we don't hang on an unknown log format.
            graceTimer = setTimeout(() => goRunning(url), graceMs);
          }
        }
        // Prefer the real connection signal — means the hostname is live in DNS.
        if (pendingUrl && CONNECTED_RE.test(this.logTail)) {
          goRunning(pendingUrl);
        }
      };
      child.stdout?.on('data', onData);
      child.stderr?.on('data', onData);

      child.on('error', (err: Error) => {
        this.child = null;
        this.state = 'error';
        this.error = err.message;
        settle();
      });

      child.on('exit', (code) => {
        this.child = null;
        if (this.state === 'running') {
          this.state = this.stopping ? 'off' : 'error';
          if (!this.stopping) this.error = `cloudflared exited unexpectedly (code ${code ?? 'unknown'})`;
          this.url = this.stopping ? undefined : this.url;
        } else if (!this.stopping) {
          this.state = 'error';
          this.error = this.error ?? `cloudflared exited before the tunnel connected. ${tail(this.logTail)}`;
        } else {
          this.state = 'off';
        }
        settle();
      });

      const timer = setTimeout(() => {
        this.state = 'error';
        this.error = pendingUrl
          ? 'Tunnel URL was printed but never connected to Cloudflare. Check your network/firewall.'
          : `Timed out starting cloudflared. ${tail(this.logTail)}`;
        settle();
      }, timeoutMs);
    });
  }

  /** Stop the single child process we spawned. */
  async stop(): Promise<void> {
    const c = this.child;
    this.stopping = true;
    this.child = null;
    this.state = 'off';
    this.url = undefined;
    this.error = undefined;
    if (c) {
      try {
        c.kill();
      } catch {
        /* already gone */
      }
    }
  }
}

/** Last ~2 non-empty log lines, for surfacing cloudflared failures. */
function tail(log: string): string {
  const lines = log.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.slice(-2).join(' | ');
}

/**
 * Locate a usable cloudflared binary: PATH first, then a managed copy under
 * the app's data dir. Returns the resolved command/path, or null if none found.
 */
export function findCloudflared(managedPath: string): Promise<string | null> {
  const candidates = ['cloudflared'];
  if (fs.existsSync(managedPath)) candidates.push(managedPath);

  const probe = (cmd: string): Promise<boolean> =>
    new Promise((resolve) => {
      execFile(cmd, ['--version'], { timeout: 5000 }, (err) => resolve(!err));
    });

  return (async () => {
    for (const cmd of candidates) {
      if (await probe(cmd)) return cmd;
    }
    return null;
  })();
}

/** Default managed binary location inside the app data dir. */
export function managedCloudflaredPath(userDataDir: string): string {
  const name = process.platform === 'win32' ? 'cloudflared.exe' : 'cloudflared';
  return path.join(userDataDir, 'bin', name);
}
