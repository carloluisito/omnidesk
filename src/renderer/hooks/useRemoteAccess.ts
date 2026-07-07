import { useCallback, useEffect, useState } from 'react';
import type { RemoteAccessStatus } from '../../shared/ipc-types';

/**
 * Renderer-side controller for the remote access server. Loads status on mount
 * and exposes enable/disable/regenerate/refresh, each returning the updated
 * status from the main process.
 */
export function useRemoteAccess() {
  const [status, setStatus] = useState<RemoteAccessStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const s = await window.electronAPI.getRemoteStatus();
      setStatus(s);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const enable = useCallback(async () => {
    try {
      setStatus(await window.electronAPI.enableRemoteAccess());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  const disable = useCallback(async () => {
    setStatus(await window.electronAPI.disableRemoteAccess());
  }, []);

  const regenerate = useCallback(async () => {
    setStatus(await window.electronAPI.regenerateRemoteToken());
  }, []);

  return { status, loading, error, enable, disable, regenerate, refresh };
}
