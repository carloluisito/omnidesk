import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getElectronAPI, resetElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useQuota } from './useQuota';
import type { ClaudeUsageQuota, BurnRateData } from '../../shared/ipc-types';

function makeQuota(overrides: Partial<ClaudeUsageQuota> = {}): ClaudeUsageQuota {
  return {
    five_hour: { utilization: 0.1, resets_at: '2026-01-01T00:00:00.000Z' },
    seven_day: { utilization: 0.2, resets_at: '2026-01-07T00:00:00.000Z' },
    lastUpdated: '2026-01-01T00:00:00.000Z',
    ...overrides,
  } as ClaudeUsageQuota;
}

function makeBurnRate(overrides: Partial<BurnRateData> = {}): BurnRateData {
  return {
    ratePerHour5h: 0.01,
    ratePerHour7d: 0.001,
    trend: 'stable',
    projectedTimeToLimit5h: null,
    projectedTimeToLimit7d: null,
    label: 'on-track',
    dataPoints: 1,
    ...overrides,
  } as BurnRateData;
}

/** Deferred promise helper so a test can control exactly when a fetch resolves. */
function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

describe('useQuota', () => {
  beforeEach(() => {
    resetElectronAPI();
  });

  it('populates quota and burnRate from the initial fetch', async () => {
    const api = getElectronAPI();
    const quotaA = makeQuota({ five_hour: { utilization: 0.42, resets_at: '2026-01-01T00:00:00.000Z' } });
    const burnA = makeBurnRate({ ratePerHour5h: 0.03 });
    api.getQuota = vi.fn().mockResolvedValue(quotaA);
    api.getBurnRate = vi.fn().mockResolvedValue(burnA);

    const { result } = renderHook(() => useQuota(null));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.quota).toEqual(quotaA);
    expect(result.current.burnRate).toEqual(burnA);
    expect(result.current.error).toBeNull();
    expect(api.getQuota).toHaveBeenCalledTimes(1);
  });

  it('re-fetches via refreshQuota when the active session changes', async () => {
    const api = getElectronAPI();
    api.getQuota = vi.fn().mockResolvedValue(makeQuota());
    api.refreshQuota = vi.fn().mockResolvedValue(
      makeQuota({ five_hour: { utilization: 0.99, resets_at: '2026-01-01T00:00:00.000Z' } })
    );
    api.getBurnRate = vi.fn().mockResolvedValue(makeBurnRate());

    const { result, rerender } = renderHook(({ sessionId }) => useQuota(sessionId), {
      initialProps: { sessionId: 'session-a' as string | null },
    });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(api.refreshQuota).not.toHaveBeenCalled();

    rerender({ sessionId: 'session-b' });

    await waitFor(() => expect(api.refreshQuota).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.quota?.five_hour.utilization).toBe(0.99));
  });

  it('drops an out-of-order response: a slower earlier fetch cannot overwrite a newer one', async () => {
    const api = getElectronAPI();

    const quotaA = deferred<ClaudeUsageQuota | null>();
    const quotaB = deferred<ClaudeUsageQuota | null>();
    const burnRate = makeBurnRate();

    // First call (mount) returns the slow "A" promise, second call
    // (forced session-switch refetch) returns the fast "B" promise.
    api.getQuota = vi.fn().mockReturnValueOnce(quotaA.promise);
    api.refreshQuota = vi.fn().mockReturnValueOnce(quotaB.promise);
    api.getBurnRate = vi.fn().mockResolvedValue(burnRate);

    const { result, rerender } = renderHook(({ sessionId }) => useQuota(sessionId), {
      initialProps: { sessionId: 'session-a' as string | null },
    });

    // Mount fetch (A) is in flight. Now switch sessions to trigger a second,
    // overlapping forced fetch (B) before A resolves.
    rerender({ sessionId: 'session-b' });
    await waitFor(() => expect(api.refreshQuota).toHaveBeenCalledTimes(1));

    // B (the newer request) resolves first...
    act(() => {
      quotaB.resolve(makeQuota({ five_hour: { utilization: 0.77, resets_at: '2026-01-01T00:00:00.000Z' } }));
    });
    await waitFor(() => expect(result.current.quota?.five_hour.utilization).toBe(0.77));

    // ...then A (the older, superseded request) resolves late. Without the
    // request-id guard this would clobber B's already-committed result.
    act(() => {
      quotaA.resolve(makeQuota({ five_hour: { utilization: 0.11, resets_at: '2026-01-01T00:00:00.000Z' } }));
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(result.current.quota?.five_hour.utilization).toBe(0.77);
  });

  it('sets error and clears isLoading when the fetch rejects', async () => {
    const api = getElectronAPI();
    api.getQuota = vi.fn().mockRejectedValue(new Error('boom'));
    api.getBurnRate = vi.fn().mockResolvedValue(makeBurnRate());

    const { result } = renderHook(() => useQuota(null));

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.error).toBe('boom');
  });
});
