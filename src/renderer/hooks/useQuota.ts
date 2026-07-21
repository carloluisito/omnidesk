/**
 * useQuota - Quota Data Hook
 *
 * Fetches and manages Claude API quota data for the BudgetPanel.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { ClaudeUsageQuota, BurnRateData } from '../../shared/ipc-types';

export interface UseQuotaReturn {
  quota: ClaudeUsageQuota | null;
  burnRate: BurnRateData | null;
  isLoading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
}

export function useQuota(activeSessionId?: string | null): UseQuotaReturn {
  const [quota, setQuota] = useState<ClaudeUsageQuota | null>(null);
  const [burnRate, setBurnRate] = useState<BurnRateData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  // Monotonic request id. Only the fetch that currently owns the latest id
  // may commit state - guards against three independent triggers (initial
  // mount, session-change refetch, 3-min interval) resolving out of order,
  // which would otherwise let a slower/earlier fetch overwrite a newer
  // session's quota. Bumped on unmount too, so a late-resolving fetch can
  // never setState after the hook is gone.
  const fetchIdRef = useRef(0);

  const fetchQuota = useCallback(async (forceRefresh = false) => {
    if (!window.electronAPI) {
      setError('Electron API not available');
      return;
    }

    const fetchId = ++fetchIdRef.current;

    try {
      setIsLoading(true);
      setError(null);

      // Fetch quota and burn rate in parallel
      // The main process resolves the correct config dir from the active session
      const [quotaResult, burnRateResult] = await Promise.all([
        forceRefresh
          ? window.electronAPI.refreshQuota()
          : window.electronAPI.getQuota(),
        window.electronAPI.getBurnRate(),
      ]);

      if (fetchId !== fetchIdRef.current) return; // superseded by a newer fetch - drop this result

      setQuota(quotaResult);
      setBurnRate(burnRateResult);

      if (!quotaResult) {
        setError('No quota data available - check Claude Code credentials');
      }
    } catch (err) {
      if (fetchId !== fetchIdRef.current) return; // superseded - don't surface a stale error either

      console.error('Failed to fetch quota:', err);
      setError(err instanceof Error ? err.message : 'Failed to load quota data');
    } finally {
      if (fetchId === fetchIdRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  // Invalidate any in-flight fetch on unmount so a late resolution can never
  // commit state (setState-after-unmount) once this hook instance is gone.
  useEffect(() => {
    return () => {
      fetchIdRef.current += 1;
    };
  }, []);

  // Initial fetch
  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchQuota();
    }
  }, [fetchQuota]);

  // Re-fetch when active session changes (different account may apply)
  const prevSessionId = useRef(activeSessionId);
  useEffect(() => {
    if (prevSessionId.current !== activeSessionId && hasFetched.current) {
      prevSessionId.current = activeSessionId;
      fetchQuota(true);
    }
  }, [activeSessionId, fetchQuota]);

  // Auto-refresh every 3 minutes
  useEffect(() => {
    const interval = setInterval(() => fetchQuota(false), 3 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchQuota]);

  const refresh = useCallback(async () => {
    await fetchQuota(true);
  }, [fetchQuota]);

  return {
    quota,
    burnRate,
    isLoading,
    error,
    refresh,
  };
}

export default useQuota;
