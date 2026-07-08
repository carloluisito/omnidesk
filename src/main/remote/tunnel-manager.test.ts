import { describe, it, expect, vi } from 'vitest';
import { EventEmitter } from 'events';
import { parseTunnelUrl, TunnelManager, managedCloudflaredPath } from './tunnel-manager';

describe('parseTunnelUrl', () => {
  it('extracts a trycloudflare URL from a cloudflared log line', () => {
    const line = '2026-07-08 INF |  https://calm-forest-1234.trycloudflare.com  |';
    expect(parseTunnelUrl(line)).toBe('https://calm-forest-1234.trycloudflare.com');
  });

  it('returns null when there is no URL', () => {
    expect(parseTunnelUrl('INF Starting tunnel...')).toBeNull();
  });
});

/** Minimal fake child process for injecting into TunnelManager. */
function fakeChild() {
  const child = new EventEmitter() as EventEmitter & {
    stdout: EventEmitter;
    stderr: EventEmitter;
    kill: () => void;
    killed: boolean;
  };
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  child.killed = false;
  child.kill = vi.fn(() => { child.killed = true; }) as unknown as () => void;
  return child;
}

describe('TunnelManager', () => {
  it('resolves running with the URL parsed from stderr', async () => {
    const child = fakeChild();
    const mgr = new TunnelManager('cloudflared', () => child as never);
    const p = mgr.start(8420, 1000);
    child.stderr.emit('data', Buffer.from('INF https://happy-sky-99.trycloudflare.com ready'));
    const status = await p;
    expect(status.state).toBe('running');
    expect(status.url).toBe('https://happy-sky-99.trycloudflare.com');
    expect(mgr.isRunning()).toBe(true);
  });

  it('resolves error when the process exits before a URL appears', async () => {
    const child = fakeChild();
    const mgr = new TunnelManager('cloudflared', () => child as never);
    const p = mgr.start(8420, 1000);
    child.emit('exit', 1);
    const status = await p;
    expect(status.state).toBe('error');
    expect(status.error).toContain('exited');
  });

  it('resolves error when spawning fails', async () => {
    const child = fakeChild();
    const mgr = new TunnelManager('missing', () => child as never);
    const p = mgr.start(8420, 1000);
    child.emit('error', new Error('ENOENT'));
    const status = await p;
    expect(status.state).toBe('error');
    expect(status.error).toContain('ENOENT');
  });

  it('stop kills the single spawned child and resets state', async () => {
    const child = fakeChild();
    const mgr = new TunnelManager('cloudflared', () => child as never);
    const p = mgr.start(8420, 1000);
    child.stderr.emit('data', 'https://x-y-z.trycloudflare.com');
    await p;
    await mgr.stop();
    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(mgr.status().state).toBe('off');
  });
});

describe('managedCloudflaredPath', () => {
  it('puts the binary under <userData>/bin', () => {
    const p = managedCloudflaredPath('/data');
    expect(p.includes('bin')).toBe(true);
    expect(p).toMatch(/cloudflared(\.exe)?$/);
  });
});
