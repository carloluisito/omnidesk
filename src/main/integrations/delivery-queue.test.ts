import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DeliveryQueue } from './delivery-queue';
import type { OutboundMessage, SendOutcome, DeliveryStatus } from '../../shared/integration-types';

function msg(text: string): OutboundMessage {
  return { text, event: { type: 'test', at: 0, summary: text } };
}

describe('DeliveryQueue', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('delivers enqueued messages in order', async () => {
    const sent: string[] = [];
    const q = new DeliveryQueue({
      send: async (_id, m) => { sent.push(m.text); return { ok: true }; },
    });
    q.enqueue('slack', msg('a'));
    q.enqueue('slack', msg('b'));
    await vi.runAllTimersAsync();
    expect(sent).toEqual(['a', 'b']);
    q.dispose();
  });

  it('rate-limits past the per-minute budget, then refills', async () => {
    const sent: string[] = [];
    const q = new DeliveryQueue({
      ratePerMinute: 2,
      send: async (_id, m) => { sent.push(m.text); return { ok: true }; },
    });
    q.enqueue('slack', msg('1'));
    q.enqueue('slack', msg('2'));
    q.enqueue('slack', msg('3'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent).toEqual(['1', '2']);
    await vi.advanceTimersByTimeAsync(61_000);
    expect(sent).toEqual(['1', '2', '3']);
    q.dispose();
  });

  it('buckets are per connector', async () => {
    const sent: string[] = [];
    const q = new DeliveryQueue({
      ratePerMinute: 1,
      send: async (id, m) => { sent.push(`${id}:${m.text}`); return { ok: true }; },
    });
    q.enqueue('slack', msg('a'));
    q.enqueue('discord', msg('b'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(sent.sort()).toEqual(['discord:b', 'slack:a']);
    q.dispose();
  });

  it('drops oldest beyond maxQueue', async () => {
    const sent: string[] = [];
    const q = new DeliveryQueue({
      maxQueue: 2,
      send: async (_id, m) => { sent.push(m.text); return { ok: true }; },
    });
    q.enqueue('slack', msg('old'));
    q.enqueue('slack', msg('mid'));
    q.enqueue('slack', msg('new')); // exceeds maxQueue=2 → 'old' dropped before anything sends
    await vi.runAllTimersAsync();
    expect(sent).toEqual(['mid', 'new']);
    q.dispose();
  });

  it('retries retryable failures with retryAfterMs override, then succeeds', async () => {
    let attempts = 0;
    const outcomes: SendOutcome[] = [
      { ok: false, retryable: true, retryAfterMs: 5_000, error: '429' },
      { ok: true },
    ];
    const statuses: DeliveryStatus[] = [];
    const q = new DeliveryQueue({
      send: async () => { attempts++; return outcomes.shift()!; },
      onStatus: (s) => statuses.push(s),
    });
    q.enqueue('telegram', msg('x'));
    await vi.advanceTimersByTimeAsync(1000);
    expect(attempts).toBe(1);
    await vi.advanceTimersByTimeAsync(5_100);
    expect(attempts).toBe(2);
    expect(statuses.at(-1)?.ok).toBe(true);
    q.dispose();
  });

  it('gives up after maxRetries and reports failure status', async () => {
    let attempts = 0;
    const statuses: DeliveryStatus[] = [];
    const q = new DeliveryQueue({
      maxRetries: 2,
      send: async () => { attempts++; return { ok: false, retryable: true, error: 'boom' }; },
      onStatus: (s) => statuses.push(s),
    });
    q.enqueue('telegram', msg('x'));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(attempts).toBe(3); // initial + 2 retries
    expect(statuses.at(-1)).toMatchObject({ connectorId: 'telegram', ok: false, error: 'boom' });
    q.dispose();
  });

  it('does not retry non-retryable failures', async () => {
    let attempts = 0;
    const statuses: DeliveryStatus[] = [];
    const q = new DeliveryQueue({
      send: async () => { attempts++; return { ok: false, retryable: false, error: 'bad token' }; },
      onStatus: (s) => statuses.push(s),
    });
    q.enqueue('telegram', msg('x'));
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(attempts).toBe(1);
    expect(statuses.at(-1)?.ok).toBe(false);
    q.dispose();
  });

  it('a throwing send() is treated as a retryable failure, never escapes enqueue', async () => {
    let attempts = 0;
    const q = new DeliveryQueue({
      maxRetries: 1,
      send: async () => { attempts++; throw new Error('net down'); },
    });
    expect(() => q.enqueue('webhook', msg('x'))).not.toThrow();
    await vi.advanceTimersByTimeAsync(5 * 60_000);
    expect(attempts).toBe(2);
    q.dispose();
  });
});
