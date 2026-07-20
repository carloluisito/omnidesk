import { describe, it, expect } from 'vitest';
import { AttentionPolicy, ATTENTION_STATES } from './attention-policy';

const T0 = 1_750_000_000_000;

describe('ATTENTION_STATES', () => {
  it('contains exactly the four attention states', () => {
    expect([...ATTENTION_STATES].sort()).toEqual(['awaiting-approval', 'awaiting-input', 'done', 'errored']);
  });
});

describe('AttentionPolicy', () => {
  it('notifies on first entry into an attention state', () => {
    const p = new AttentionPolicy();
    expect(p.shouldNotify('s1', 'awaiting-input', T0)).toBe(true);
  });

  it('suppresses repeats of the same attention state (level, not edge)', () => {
    const p = new AttentionPolicy();
    p.shouldNotify('s1', 'awaiting-input', T0);
    expect(p.shouldNotify('s1', 'awaiting-input', T0 + 1000)).toBe(false);
    expect(p.shouldNotify('s1', 'awaiting-input', T0 + 60_000)).toBe(false);
  });

  it('suppresses a different attention state without re-arming (still disarmed)', () => {
    const p = new AttentionPolicy();
    p.shouldNotify('s1', 'awaiting-input', T0);
    expect(p.shouldNotify('s1', 'done', T0 + 1000)).toBe(false);
  });

  it('re-arms after leaving attention states, notifies on re-entry past debounce', () => {
    const p = new AttentionPolicy({ debounceMs: 15_000 });
    p.shouldNotify('s1', 'awaiting-input', T0);
    expect(p.shouldNotify('s1', 'working', T0 + 1000)).toBe(false); // non-attention: never notifies
    expect(p.shouldNotify('s1', 'awaiting-input', T0 + 20_000)).toBe(true);
  });

  it('suppresses re-entry within the debounce window even after re-arming', () => {
    const p = new AttentionPolicy({ debounceMs: 15_000 });
    p.shouldNotify('s1', 'awaiting-input', T0);
    p.shouldNotify('s1', 'working', T0 + 1000);
    expect(p.shouldNotify('s1', 'awaiting-input', T0 + 5000)).toBe(false);
    // and once the window has elapsed after another leave/enter cycle, it fires again
    p.shouldNotify('s1', 'working', T0 + 6000);
    expect(p.shouldNotify('s1', 'awaiting-input', T0 + 16_000)).toBe(true);
  });

  it('tracks sessions independently', () => {
    const p = new AttentionPolicy();
    expect(p.shouldNotify('s1', 'awaiting-input', T0)).toBe(true);
    expect(p.shouldNotify('s2', 'awaiting-input', T0)).toBe(true);
  });

  it('forget() resets a session', () => {
    const p = new AttentionPolicy();
    p.shouldNotify('s1', 'awaiting-input', T0);
    p.forget('s1');
    expect(p.shouldNotify('s1', 'awaiting-input', T0 + 100_000)).toBe(true);
  });
});
