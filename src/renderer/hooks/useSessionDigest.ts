// Thin wrapper around the window.electronAPI.getSessionDigest IPC call.
// Mirrors the loading/error shape of useHistory.ts. Unlike useHistory, there
// is no automatic mount-time fetch: a digest is only meaningful once a
// specific session has been selected, so callers (HistoryPanel) explicitly
// call fetch(sessionId) when selection changes and clear() when it's cleared.
import { useState, useCallback } from 'react';
import type { SessionDigest } from '../../shared/types/history-types';

export interface UseSessionDigestApi {
  digest: SessionDigest | null;
  loading: boolean;
  error: string | null;
  fetch: (sessionId: string, since?: number) => Promise<void>;
  clear: () => void;
}

export function useSessionDigest(): UseSessionDigestApi {
  const [digest, setDigest] = useState<SessionDigest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async (sessionId: string, since?: number) => {
    setLoading(true);
    try {
      const result = await window.electronAPI.getSessionDigest(sessionId, since);
      setDigest(result);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setDigest(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const clear = useCallback(() => {
    setDigest(null);
    setError(null);
    setLoading(false);
  }, []);

  return { digest, loading, error, fetch, clear };
}
