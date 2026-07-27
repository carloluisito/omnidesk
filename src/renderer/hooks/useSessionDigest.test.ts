import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { getElectronAPI, resetElectronAPI } from '../../../test/helpers/electron-api-mock';
import type { SessionDigest } from '../../shared/types/history-types';
import { useSessionDigest } from './useSessionDigest';

function makeDigest(overrides: Partial<SessionDigest> = {}): SessionDigest {
  return {
    sessionId: 'session-1',
    windowStart: 1000,
    windowEnd: 5000,
    activeDurationMs: 4000,
    restartSegments: 0,
    outputBytes: 4242,
    checkpointsCreated: 2,
    approvalPromptsHit: null,
    errorsDetected: null,
    ...overrides,
  };
}

describe('useSessionDigest', () => {
  beforeEach(() => {
    resetElectronAPI();
  });

  it('starts with no digest, not loading, no error', () => {
    const { result } = renderHook(() => useSessionDigest());

    expect(result.current.digest).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('fetch loads a digest and calls electronAPI with sessionId and since', async () => {
    const api = getElectronAPI();
    const digest = makeDigest();
    api.getSessionDigest = vi.fn().mockResolvedValue(digest);

    const { result } = renderHook(() => useSessionDigest());

    await act(async () => {
      await result.current.fetch('session-1', 500);
    });

    expect(api.getSessionDigest).toHaveBeenCalledWith('session-1', 500);
    expect(result.current.digest).toEqual(digest);
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('fetch works without a since argument', async () => {
    const api = getElectronAPI();
    const digest = makeDigest();
    api.getSessionDigest = vi.fn().mockResolvedValue(digest);

    const { result } = renderHook(() => useSessionDigest());

    await act(async () => {
      await result.current.fetch('session-1');
    });

    expect(api.getSessionDigest).toHaveBeenCalledWith('session-1', undefined);
    expect(result.current.digest).toEqual(digest);
  });

  it('sets loading true while the fetch is in flight', async () => {
    const api = getElectronAPI();
    let resolveFetch: (value: SessionDigest) => void = () => {};
    api.getSessionDigest = vi.fn().mockImplementation(
      () =>
        new Promise<SessionDigest>((resolve) => {
          resolveFetch = resolve;
        })
    );

    const { result } = renderHook(() => useSessionDigest());

    let fetchPromise: Promise<void>;
    act(() => {
      fetchPromise = result.current.fetch('session-1');
    });

    await waitFor(() => expect(result.current.loading).toBe(true));

    resolveFetch(makeDigest());
    await act(async () => {
      await fetchPromise!;
    });

    expect(result.current.loading).toBe(false);
    expect(result.current.digest).not.toBeNull();
  });

  it('sets an error and clears the digest on rejection', async () => {
    const api = getElectronAPI();
    api.getSessionDigest = vi.fn().mockResolvedValue(makeDigest());

    const { result } = renderHook(() => useSessionDigest());

    await act(async () => {
      await result.current.fetch('session-1');
    });
    expect(result.current.digest).not.toBeNull();

    api.getSessionDigest = vi.fn().mockRejectedValue(new Error('session not found'));
    await act(async () => {
      await result.current.fetch('missing-session');
    });

    expect(result.current.digest).toBeNull();
    expect(result.current.error).toBe('session not found');
    expect(result.current.loading).toBe(false);
  });

  it('clear resets digest, error, and loading', async () => {
    const api = getElectronAPI();
    api.getSessionDigest = vi.fn().mockResolvedValue(makeDigest());

    const { result } = renderHook(() => useSessionDigest());

    await act(async () => {
      await result.current.fetch('session-1');
    });
    expect(result.current.digest).not.toBeNull();

    act(() => {
      result.current.clear();
    });

    expect(result.current.digest).toBeNull();
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });

  it('preserves null approvalPromptsHit and errorsDetected fields from the API result', async () => {
    const api = getElectronAPI();
    api.getSessionDigest = vi.fn().mockResolvedValue(
      makeDigest({ approvalPromptsHit: null, errorsDetected: null })
    );

    const { result } = renderHook(() => useSessionDigest());

    await act(async () => {
      await result.current.fetch('session-1');
    });

    expect(result.current.digest?.approvalPromptsHit).toBeNull();
    expect(result.current.digest?.errorsDetected).toBeNull();
  });
});
