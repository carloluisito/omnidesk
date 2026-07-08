import { describe, it, expect, vi } from 'vitest';
import { handleWsMessage } from './ws-router';

function makeWs() {
  return {
    sent: [] as string[],
    send(d: string) {
      this.sent.push(d);
    },
  };
}

describe('handleWsMessage', () => {
  it('routes invoke and replies with the result', async () => {
    const ws = makeWs();
    const registry = { invokeMethod: vi.fn().mockResolvedValue({ sessions: [] }), sendMethod: vi.fn() };
    handleWsMessage(JSON.stringify({ t: 'invoke', id: 7, method: 'listSessions', args: [] }), ws, registry);
    await new Promise((r) => setTimeout(r, 0));
    expect(registry.invokeMethod).toHaveBeenCalledWith('listSessions', []);
    expect(JSON.parse(ws.sent[0])).toEqual({ t: 'result', id: 7, ok: true, value: { sessions: [] } });
  });

  it('replies ok:false when the handler throws', async () => {
    const ws = makeWs();
    const registry = { invokeMethod: vi.fn().mockRejectedValue(new Error('boom')), sendMethod: vi.fn() };
    handleWsMessage(JSON.stringify({ t: 'invoke', id: 9, method: 'x', args: [] }), ws, registry);
    await new Promise((r) => setTimeout(r, 0));
    const reply = JSON.parse(ws.sent[0]);
    expect(reply).toMatchObject({ t: 'result', id: 9, ok: false });
    expect(reply.error).toContain('boom');
  });

  it('routes send without replying', () => {
    const ws = makeWs();
    const registry = { invokeMethod: vi.fn(), sendMethod: vi.fn() };
    handleWsMessage(JSON.stringify({ t: 'send', method: 'sessionReady', args: ['s1'] }), ws, registry);
    expect(registry.sendMethod).toHaveBeenCalledWith('sessionReady', ['s1']);
    expect(ws.sent).toHaveLength(0);
  });

  it('ignores malformed frames', () => {
    const ws = makeWs();
    const registry = { invokeMethod: vi.fn(), sendMethod: vi.fn() };
    expect(() => handleWsMessage('not json', ws, registry)).not.toThrow();
    expect(registry.invokeMethod).not.toHaveBeenCalled();
  });
});
