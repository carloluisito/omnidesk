import { describe, it, expect, vi } from 'vitest';
import { ClientHub } from './client-hub';

function fakeSocket(open = true) {
  return { readyState: open ? 1 : 3, OPEN: 1, send: vi.fn() };
}

describe('ClientHub', () => {
  it('broadcasts an event frame to open clients only', () => {
    const hub = new ClientHub();
    const a = fakeSocket(true);
    const b = fakeSocket(false);
    hub.add(a as never);
    hub.add(b as never);
    hub.broadcast('session:output', { sessionId: 's', data: 'hi' });
    expect(a.send).toHaveBeenCalledWith(
      JSON.stringify({ t: 'event', channel: 'session:output', payload: { sessionId: 's', data: 'hi' } })
    );
    expect(b.send).not.toHaveBeenCalled();
  });

  it('remove drops a client and size reflects it', () => {
    const hub = new ClientHub();
    const a = fakeSocket();
    hub.add(a as never);
    expect(hub.size()).toBe(1);
    hub.remove(a as never);
    expect(hub.size()).toBe(0);
    hub.broadcast('x', 1);
    expect(a.send).not.toHaveBeenCalled();
  });

  it('drops a client whose send throws', () => {
    const hub = new ClientHub();
    const a = fakeSocket();
    a.send = vi.fn(() => {
      throw new Error('dead');
    });
    hub.add(a as never);
    hub.broadcast('x', 1);
    expect(hub.size()).toBe(0);
  });
});
