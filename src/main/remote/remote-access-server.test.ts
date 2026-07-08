import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import WebSocket from 'ws';
import { RemoteAccessServer } from './remote-access-server';
import { RemoteAuth } from './remote-auth';
import { ClientHub } from './client-hub';
import type { IPCRegistry } from '../ipc-registry';

// End-to-end: boot the real server on an ephemeral port and drive it over real
// HTTP + WebSocket. The IPC registry is stubbed (its own routing is unit-tested
// in ws-router.test.ts); everything else — auth, cookie, static serve, bridge
// injection, WS upgrade, invoke round-trip, broadcast — is exercised for real.

describe('RemoteAccessServer (integration)', () => {
  let server: RemoteAccessServer;
  let auth: RemoteAuth;
  let hub: ClientHub;
  let rendererDir: string;
  let base: string;

  beforeAll(async () => {
    rendererDir = fs.mkdtempSync(path.join(os.tmpdir(), 'omnidesk-remote-'));
    fs.writeFileSync(
      path.join(rendererDir, 'index.html'),
      '<html><head></head><body>OMNIDESK_TEST_BODY</body></html>',
    );

    auth = new RemoteAuth();
    hub = new ClientHub();
    const registry = {
      invokeMethod: async (method: string, args: unknown[]) => ({ echoed: method, args }),
      sendMethod: () => {},
    } as unknown as IPCRegistry;

    server = new RemoteAccessServer({ port: 0, rendererDir, registry, auth, hub });
    await server.start();
    base = `http://127.0.0.1:${server.getPort()}`;
  });

  afterAll(async () => {
    await server.stop();
    fs.rmSync(rendererDir, { recursive: true, force: true });
  });

  it('binds an ephemeral port and reports it', () => {
    expect(server.isRunning()).toBe(true);
    expect(server.getPort()).toBeGreaterThan(0);
  });

  it('serves the login page without a cookie', async () => {
    const res = await fetch(`${base}/`, { redirect: 'manual' });
    const html = await res.text();
    expect(html).toContain('Access token');
    expect(html).not.toContain('OMNIDESK_TEST_BODY');
  });

  it('serves the web bridge script pre-auth', async () => {
    const res = await fetch(`${base}/__omnidesk/web-bridge.js`);
    const js = await res.text();
    expect(js).toContain('window.electronAPI');
  });

  it('rejects a bad token and accepts the real one (issuing a cookie)', async () => {
    const bad = await fetch(`${base}/__omnidesk/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'token=wrong',
      redirect: 'manual',
    });
    expect(bad.status).toBe(401);

    const good = await fetch(`${base}/__omnidesk/auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `token=${encodeURIComponent(auth.getToken())}`,
      redirect: 'manual',
    });
    expect(good.status).toBe(302);
    expect(good.headers.get('set-cookie') ?? '').toContain(RemoteAuth.COOKIE);
  });

  it('serves the injected index once authenticated', async () => {
    const cookie = `${RemoteAuth.COOKIE}=${auth.getToken()}`;
    const res = await fetch(`${base}/`, { headers: { Cookie: cookie }, redirect: 'manual' });
    const html = await res.text();
    expect(html).toContain('OMNIDESK_TEST_BODY');
    expect(html).toContain('/__omnidesk/web-bridge.js');
  });

  it('redirects a valid ?token= link to a clean URL with a cookie (QR sign-in)', async () => {
    const res = await fetch(`${base}/?token=${encodeURIComponent(auth.getToken())}`, {
      redirect: 'manual',
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/');
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(RemoteAuth.COOKIE);
    expect(cookie).toContain('Secure'); // https tunnel → Secure cookie
  });

  it('shows the login page (not 404) for a bad ?token=', async () => {
    const res = await fetch(`${base}/?token=nope`, { redirect: 'manual' });
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('Access token');
  });

  it('rejects a WebSocket upgrade without a valid cookie', async () => {
    await new Promise<void>((resolve, reject) => {
      const ws = new WebSocket(`ws://127.0.0.1:${server.getPort()}/__omnidesk/ws`);
      ws.on('open', () => { ws.close(); reject(new Error('should not have opened')); });
      ws.on('error', () => resolve());
      ws.on('unexpected-response', () => resolve());
    });
  });

  it('round-trips an invoke and delivers a broadcast over an authed socket', async () => {
    const cookie = `${RemoteAuth.COOKIE}=${auth.getToken()}`;
    const ws = new WebSocket(`ws://127.0.0.1:${server.getPort()}/__omnidesk/ws`, {
      headers: { Cookie: cookie },
    });

    const messages: any[] = [];
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('timeout')), 4000);
      ws.on('open', () => {
        ws.send(JSON.stringify({ t: 'invoke', id: 1, method: 'listSessions', args: [] }));
      });
      ws.on('message', (data) => {
        messages.push(JSON.parse(data.toString()));
        const result = messages.find((m) => m.t === 'result' && m.id === 1);
        const event = messages.find((m) => m.t === 'event' && m.channel === 'session:closed');
        if (result && !event) {
          // Server received the socket; now broadcast and expect it to arrive.
          hub.broadcast('session:closed', 'sess-broadcast');
        }
        if (result && event) {
          clearTimeout(timer);
          resolve();
        }
      });
      ws.on('error', reject);
    });

    ws.close();

    const result = messages.find((m) => m.t === 'result' && m.id === 1);
    expect(result.ok).toBe(true);
    expect(result.value).toEqual({ echoed: 'listSessions', args: [] });

    const event = messages.find((m) => m.t === 'event' && m.channel === 'session:closed');
    expect(event.payload).toBe('sess-broadcast');
  });
});
