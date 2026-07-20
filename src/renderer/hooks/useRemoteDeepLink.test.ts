import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useRemoteDeepLink } from './useRemoteDeepLink';

type RemoteWindow = Window & { __OMNIDESK_REMOTE__?: boolean };

function setUrl(search: string) {
  window.history.replaceState({}, '', `/${search}`);
}

describe('useRemoteDeepLink', () => {
  beforeEach(() => {
    (window as RemoteWindow).__OMNIDESK_REMOTE__ = true;
  });
  afterEach(() => {
    delete (window as RemoteWindow).__OMNIDESK_REMOTE__;
    setUrl('');
  });

  it('jumps to the session from ?session= once sessions hydrate, and strips the param', () => {
    setUrl('?session=abc');
    const onJump = vi.fn();
    const { rerender } = renderHook(
      ({ ids }) => useRemoteDeepLink({ sessionIds: ids, onJump }),
      { initialProps: { ids: [] as string[] } }
    );
    expect(onJump).not.toHaveBeenCalled(); // not hydrated yet

    rerender({ ids: ['abc', 'def'] });
    expect(onJump).toHaveBeenCalledExactlyOnceWith('abc');
    expect(window.location.search).toBe('');
  });

  it('fires at most once even if sessions keep changing', () => {
    setUrl('?session=abc');
    const onJump = vi.fn();
    const { rerender } = renderHook(
      ({ ids }) => useRemoteDeepLink({ sessionIds: ids, onJump }),
      { initialProps: { ids: ['abc'] } }
    );
    rerender({ ids: ['abc', 'xyz'] });
    rerender({ ids: ['xyz'] });
    expect(onJump).toHaveBeenCalledTimes(1);
  });

  it('unknown session id: strips the param but does not jump', () => {
    setUrl('?session=ghost');
    const onJump = vi.fn();
    renderHook(() => useRemoteDeepLink({ sessionIds: ['abc'], onJump }));
    expect(onJump).not.toHaveBeenCalled();
    expect(window.location.search).toBe('');
  });

  it('preserves other query params when stripping', () => {
    setUrl('?keep=1&session=abc');
    renderHook(() => useRemoteDeepLink({ sessionIds: ['abc'], onJump: vi.fn() }));
    expect(window.location.search).toBe('?keep=1');
  });

  it('does nothing on the desktop (no __OMNIDESK_REMOTE__)', () => {
    delete (window as RemoteWindow).__OMNIDESK_REMOTE__;
    setUrl('?session=abc');
    const onJump = vi.fn();
    renderHook(() => useRemoteDeepLink({ sessionIds: ['abc'], onJump }));
    expect(onJump).not.toHaveBeenCalled();
    expect(window.location.search).toBe('?session=abc'); // untouched
  });
});
