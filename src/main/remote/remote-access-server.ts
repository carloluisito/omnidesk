import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer } from 'ws';
import type { IPCRegistry } from '../ipc-registry';
import { RemoteAuth } from './remote-auth';
import { ClientHub } from './client-hub';
import { generateWebBridgeScript } from './web-bridge';
import { handleWsMessage } from './ws-router';
import { injectBridgeScript, mimeFor } from './http-util';
import { channels, contractKinds } from '../../shared/ipc-contract';

export interface RemoteServerOptions {
  port: number;
  rendererDir: string;
  registry: IPCRegistry;
  auth: RemoteAuth;
  hub: ClientHub;
  /** In dev, the Vite dev-server origin (e.g. http://localhost:9742). When set,
   *  authed requests are proxied there instead of served from rendererDir —
   *  otherwise dist/renderer is stale/empty in dev and every page 404s. */
  devServerUrl?: string;
}

const LOGIN_HTML = `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>OmniDesk Remote</title><style>body{font-family:system-ui,sans-serif;background:#0A0B11;color:#e6e6e6;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0}form{display:flex;flex-direction:column;gap:12px;width:min(320px,90vw)}h2{margin:0 0 8px}input{padding:10px;border-radius:8px;border:1px solid #333;background:#14151d;color:#fff}button{padding:10px;border-radius:8px;border:0;background:#00C9A7;color:#03211c;font-weight:600;cursor:pointer}</style></head><body><form method="POST" action="/__omnidesk/auth"><h2>OmniDesk Remote</h2><input name="token" type="password" placeholder="Access token" autofocus autocomplete="off" /><button type="submit">Connect</button></form></body></html>`;

/**
 * Embedded HTTP + WebSocket server for remote access. Binds 127.0.0.1 only;
 * the user exposes it via a tunnel. Serves the built renderer with the web
 * bridge injected, gates everything behind a token cookie, and upgrades
 * /__omnidesk/ws into the IPC-over-WebSocket transport.
 */
export class RemoteAccessServer {
  private server: http.Server | null = null;
  private wss: WebSocketServer | null = null;
  private boundPort: number | null = null;

  constructor(private opts: RemoteServerOptions) {}

  isRunning(): boolean {
    return this.server !== null;
  }

  /** The actual listening port. When configured with port 0 the OS assigns one,
   *  so we read it back after listen rather than echoing the requested value. */
  getPort(): number {
    return this.boundPort ?? this.opts.port;
  }

  start(): Promise<void> {
    if (this.server) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        void this.handleHttp(req, res);
      });
      this.wss = new WebSocketServer({ noServer: true });

      server.on('upgrade', (req, socket, head) => {
        if (req.url !== '/__omnidesk/ws' || !this.opts.auth.cookieValid(req.headers.cookie)) {
          socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
          socket.destroy();
          return;
        }
        this.wss!.handleUpgrade(req, socket, head, (ws) => {
          this.opts.hub.add(ws as never);
          ws.on('message', (data) => handleWsMessage(data.toString(), ws as never, this.opts.registry));
          ws.on('close', () => this.opts.hub.remove(ws as never));
        });
      });

      server.on('error', (err) => {
        this.server = null;
        reject(err);
      });
      server.listen(this.opts.port, '127.0.0.1', () => {
        const addr = server.address();
        if (addr && typeof addr === 'object') this.boundPort = addr.port;
        this.server = server;
        const source = this.opts.devServerUrl
          ? `dev proxy → ${this.opts.devServerUrl}`
          : this.opts.rendererDir;
        console.log(`[remote] listening on 127.0.0.1:${this.getPort()} — serving ${source}`);
        if (!this.opts.devServerUrl && !fs.existsSync(path.join(this.opts.rendererDir, 'index.html'))) {
          console.warn(`[remote] WARNING: no index.html at ${this.opts.rendererDir}. Run a production build (npm run build) or launch via npm start.`);
        }
        resolve();
      });
    });
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      this.wss?.close();
      this.wss = null;
      if (!this.server) return resolve();
      this.server.close(() => {
        this.server = null;
        resolve();
      });
    });
  }

  private isSecure(req: http.IncomingMessage): boolean {
    return req.headers['x-forwarded-proto'] === 'https';
  }

  private clientIp(req: http.IncomingMessage): string {
    const fwd = req.headers['x-forwarded-for'];
    if (typeof fwd === 'string' && fwd.length) return fwd.split(',')[0].trim();
    return req.socket.remoteAddress ?? 'unknown';
  }

  private async handleHttp(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    const auth = this.opts.auth;

    // Health/diagnostics (public, no secrets) — confirms which build & mode is
    // actually running. Visit http://localhost:<port>/__omnidesk/health.
    if (url.pathname === '/__omnidesk/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' }).end(
        JSON.stringify({
          ok: true,
          build: 'remote-devproxy-1',
          mode: this.opts.devServerUrl ? 'dev' : 'prod',
          devServerUrl: this.opts.devServerUrl ?? null,
          rendererIndexExists: this.opts.devServerUrl
            ? null
            : fs.existsSync(path.join(this.opts.rendererDir, 'index.html')),
        }),
      );
      return;
    }

    // Bridge script is public (contains no secrets) so it can load pre-auth.
    if (url.pathname === '/__omnidesk/web-bridge.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript' });
      res.end(generateWebBridgeScript(channels, contractKinds));
      return;
    }

    // POST token → set cookie.
    if (req.method === 'POST' && url.pathname === '/__omnidesk/auth') {
      if (auth.rateLimited(this.clientIp(req))) {
        res.writeHead(429).end('Too many attempts');
        return;
      }
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 4096) req.destroy();
      });
      req.on('end', () => {
        const token = new URLSearchParams(body).get('token') ?? '';
        if (auth.verify(token)) {
          res.writeHead(302, { 'Set-Cookie': auth.buildSetCookie(this.isSecure(req)), Location: '/' }).end();
        } else {
          res.writeHead(401, { 'Content-Type': 'text/html' }).end(LOGIN_HTML);
        }
      });
      return;
    }

    // token in query (QR / deep-link convenience) → set cookie, redirect to clean URL.
    if (url.pathname === '/' && url.searchParams.has('token')) {
      if (auth.rateLimited(this.clientIp(req))) {
        res.writeHead(429).end('Too many attempts');
        return;
      }
      if (auth.verify(url.searchParams.get('token') ?? '')) {
        res.writeHead(302, { 'Set-Cookie': auth.buildSetCookie(this.isSecure(req)), Location: '/' }).end();
        return;
      }
    }

    // Everything else requires a valid cookie.
    if (!auth.cookieValid(req.headers.cookie)) {
      res.writeHead(200, { 'Content-Type': 'text/html' }).end(LOGIN_HTML);
      return;
    }

    // Dev: proxy to the Vite dev server (dist/renderer is stale/empty in dev).
    if (this.opts.devServerUrl) {
      await this.proxyToDev(url, res);
      return;
    }

    // Prod: serve the built SPA. '/' → injected index.html; assets → file;
    // unknown → index (SPA fallback).
    const rel = url.pathname === '/' ? '/index.html' : url.pathname;
    const safeRel = path.normalize(rel).replace(/^(\.\.[/\\])+/, '');
    const rendererDir = path.resolve(this.opts.rendererDir);
    const filePath = path.join(rendererDir, safeRel);

    if (!filePath.startsWith(rendererDir)) {
      res.writeHead(403).end('Forbidden');
      return;
    }

    fs.readFile(filePath, (err, data) => {
      if (err) {
        // SPA fallback: serve injected index.html for client-side routes.
        fs.readFile(path.join(rendererDir, 'index.html'), (e2, html) => {
          if (e2) {
            console.error(`[remote] renderer not found at ${rendererDir} (requested ${url.pathname})`);
            res.writeHead(500, { 'Content-Type': 'text/html' }).end(
              `<h1>OmniDesk renderer build not found</h1><p>The remote server expected the built UI at <code>${rendererDir}</code> but it isn't there.</p><p>Launch OmniDesk with <code>npm start</code> (production build), not a dev command.</p>`,
            );
            return;
          }
          res.writeHead(200, { 'Content-Type': 'text/html' }).end(injectBridgeScript(html.toString()));
        });
        return;
      }
      const ext = path.extname(filePath);
      if (ext === '.html') {
        res.writeHead(200, { 'Content-Type': 'text/html' }).end(injectBridgeScript(data.toString()));
      } else {
        res.writeHead(200, { 'Content-Type': mimeFor(ext) }).end(data);
      }
    });
  }

  /** Proxy an authed request to the Vite dev server, injecting the bridge into
   *  HTML responses so window.electronAPI exists over the WebSocket. */
  private async proxyToDev(url: URL, res: http.ServerResponse): Promise<void> {
    const target = this.opts.devServerUrl!.replace(/\/$/, '') + url.pathname + url.search;
    try {
      const upstream = await fetch(target, { headers: { accept: '*/*' } });
      const ct = upstream.headers.get('content-type') ?? 'application/octet-stream';
      if (ct.includes('text/html')) {
        const html = await upstream.text();
        res.writeHead(upstream.status, { 'Content-Type': 'text/html' }).end(injectBridgeScript(html));
      } else {
        const body = Buffer.from(await upstream.arrayBuffer());
        res.writeHead(upstream.status, { 'Content-Type': ct }).end(body);
      }
    } catch (e) {
      res.writeHead(502, { 'Content-Type': 'text/html' }).end(
        `<h1>Dev server unreachable</h1><p>Remote access is running in dev mode and proxies to <code>${this.opts.devServerUrl}</code>, which didn't respond (${(e as Error).message}).</p><p>Start the Vite dev server, or launch via <code>npm start</code> for a production build.</p>`,
      );
    }
  }
}
