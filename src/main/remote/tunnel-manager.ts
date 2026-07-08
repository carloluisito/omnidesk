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
export class TunnelManager {
  private child: ChildProcess | null = null;
  private state: TunnelState = 'off';
  private url?: string;
  private error?: string;

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

  /** Start the tunnel for the given local port. Resolves once the public URL is
   *  known, the process exits, errors, or the timeout elapses. */
  start(port: number, timeoutMs = 25_000): Promise<TunnelStatus> {
    if (this.child) return Promise.resolve(this.status());

    this.state = 'starting';
    this.url = undefined;
    this.error = undefined;

    return new Promise((resolve) => {
      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(this.status());
      };

      const child = this.spawner(this.bin, [
        'tunnel',
        '--url',
        `http://localhost:${port}`,
        '--no-autoupdate',
      ]);
      this.child = child;

      // cloudflared prints the quick-tunnel URL to stderr; watch both streams.
      const onData = (buf: Buffer | string) => {
        const url = parseTunnelUrl(buf.toString());
        if (url && this.state === 'starting') {
          this.url = url;
          this.state = 'running';
          settle();
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
        if (this.state !== 'running') {
          this.state = 'error';
          this.error = this.error ?? `cloudflared exited (code ${code ?? 'unknown'})`;
        } else {
          this.state = 'off';
          this.url = undefined;
        }
        settle();
      });

      const timer = setTimeout(() => {
        this.state = 'error';
        this.error = 'Timed out waiting for the tunnel URL. Is cloudflared able to reach the internet?';
        settle();
      }, timeoutMs);
    });
  }

  /** Stop the single child process we spawned. */
  async stop(): Promise<void> {
    const c = this.child;
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
