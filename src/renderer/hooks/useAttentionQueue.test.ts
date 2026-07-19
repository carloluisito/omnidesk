import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import {
  useAttentionQueue,
  effectiveAttentionState,
  isAttentionState,
} from './useAttentionQueue';
import type { TabData } from '../components/ui/Tab';
import type { SessionActivityState } from '../../shared/ipc-types';

function tab(id: string, status: TabData['status'], activityState?: SessionActivityState): TabData {
  return { id, name: id, workingDirectory: '/x', permissionMode: 'standard', status, activityState };
}

const previews = { outputSnapshots: {}, lastActivityAt: {}, attach: vi.fn() } as any;
const repoOf = (s: TabData) => ({ id: 'r1', name: 'repo-one' });

describe('effectiveAttentionState', () => {
  it('maps a failed process to errored regardless of activityState', () => {
    expect(effectiveAttentionState(tab('a', 'error', 'working'))).toBe('errored');
  });
  it('a stopped session does not nag', () => {
    expect(effectiveAttentionState(tab('a', 'exited', 'done'))).toBeUndefined();
  });
  it('a running session uses its classifier state', () => {
    expect(effectiveAttentionState(tab('a', 'running', 'awaiting-approval'))).toBe('awaiting-approval');
  });
});

describe('isAttentionState', () => {
  it('true for the four attention states', () => {
    for (const s of ['awaiting-approval', 'awaiting-input', 'errored', 'done'] as SessionActivityState[]) {
      expect(isAttentionState(s)).toBe(true);
    }
  });
  it('false for calm states', () => {
    for (const s of ['working', 'idle', 'initializing', 'exited', undefined] as (SessionActivityState | undefined)[]) {
      expect(isAttentionState(s)).toBe(false);
    }
  });
});

describe('useAttentionQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('surfaces only attention sessions, most-urgent first', () => {
    const sessions = [
      tab('calm', 'running', 'working'),
      tab('finished', 'running', 'done'),
      tab('blocked', 'running', 'awaiting-approval'),
      tab('broken', 'running', 'errored'),
    ];
    const { result } = renderHook(() =>
      useAttentionQueue({ sessions, repoOf, previews, activeSessionId: null, onJump: vi.fn() }),
    );
    expect(result.current.items.map(i => i.session.id)).toEqual(['blocked', 'broken', 'finished']);
    expect(result.current.count).toBe(3);
  });

  it('acknowledge suppresses a session from the count until its state changes', () => {
    const sessions = [tab('blocked', 'running', 'awaiting-approval')];
    const { result, rerender } = renderHook(
      ({ s }) => useAttentionQueue({ sessions: s, repoOf, previews, activeSessionId: null, onJump: vi.fn() }),
      { initialProps: { s: sessions } },
    );
    expect(result.current.count).toBe(1);
    act(() => result.current.acknowledge('blocked'));
    expect(result.current.count).toBe(0);
    expect(result.current.items[0].acknowledged).toBe(true);

    // State changes → resurfaces.
    rerender({ s: [tab('blocked', 'running', 'errored')] });
    expect(result.current.count).toBe(1);
  });

  it('fires a toast when a backgrounded session enters an urgent state', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');
    const onJump = vi.fn();
    const { rerender } = renderHook(
      ({ s }) => useAttentionQueue({ sessions: s, repoOf, previews, activeSessionId: 'other', onJump }),
      { initialProps: { s: [tab('blocked', 'running', 'working')] } },
    );
    spy.mockClear();
    rerender({ s: [tab('blocked', 'running', 'awaiting-approval')] });
    expect(spy).toHaveBeenCalled();
  });

  it('does NOT toast for the currently-active session', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');
    const { rerender } = renderHook(
      ({ s }) => useAttentionQueue({ sessions: s, repoOf, previews, activeSessionId: 'blocked', onJump: vi.fn() }),
      { initialProps: { s: [tab('blocked', 'running', 'working')] } },
    );
    spy.mockClear();
    rerender({ s: [tab('blocked', 'running', 'awaiting-approval')] });
    expect(spy).not.toHaveBeenCalled();
  });

  it('does NOT toast for a state that already exists on first mount (cold-attach)', () => {
    const spy = vi.spyOn(window, 'dispatchEvent');
    // Session is ALREADY awaiting-approval on the very first populated render —
    // a phone cold-attaching, not a fresh transition.
    renderHook(() =>
      useAttentionQueue({
        sessions: [tab('blocked', 'running', 'awaiting-approval')],
        repoOf, previews, activeSessionId: 'other', onJump: vi.fn(),
      }),
    );
    expect(spy).not.toHaveBeenCalled();
  });

  it('re-arms after Dismiss: a session that leaves then re-enters the same state re-surfaces', () => {
    const { result, rerender } = renderHook(
      ({ s }) => useAttentionQueue({ sessions: s, repoOf, previews, activeSessionId: null, onJump: vi.fn() }),
      { initialProps: { s: [tab('blocked', 'running', 'awaiting-approval')] } },
    );
    act(() => result.current.acknowledge('blocked'));
    expect(result.current.count).toBe(0);

    // Agent proceeds (leaves the approval state) …
    rerender({ s: [tab('blocked', 'running', 'working')] });
    // … then hits another approval. It must re-surface, not stay muted.
    rerender({ s: [tab('blocked', 'running', 'awaiting-approval')] });
    expect(result.current.count).toBe(1);
    expect(result.current.items[0].acknowledged).toBe(false);
  });
});
