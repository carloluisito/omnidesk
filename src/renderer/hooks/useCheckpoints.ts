// Thin wrapper around the window.electronAPI checkpoint IPC contract.
// Combines the loading/error/refresh shape of useRemoteAccess.ts with the
// live-event-subscription-with-cleanup shape of useIntegrations.ts: checkpoint
// creation/deletion can happen from other surfaces (e.g. another window or a
// keyboard shortcut elsewhere), so local state stays in sync via
// onCheckpointCreated / onCheckpointDeleted rather than polling.
import { useState, useCallback, useEffect } from 'react';
import type {
  Checkpoint,
  CheckpointCreateRequest,
  CheckpointExportFormat,
} from '../../shared/types/checkpoint-types';

export interface UseCheckpointsApi {
  checkpoints: Checkpoint[];
  loading: boolean;
  error: string | null;
  refresh: (sessionId?: string) => Promise<void>;
  create: (request: CheckpointCreateRequest) => Promise<Checkpoint | null>;
  get: (id: string) => Promise<Checkpoint | null>;
  remove: (id: string) => Promise<boolean>;
  update: (
    id: string,
    patch: Partial<Pick<Checkpoint, 'name' | 'description' | 'tags' | 'isTemplate'>>,
  ) => Promise<Checkpoint | null>;
  exportCheckpoint: (id: string, format: CheckpointExportFormat) => Promise<string | null>;
  count: (sessionId: string) => Promise<number>;
}

export function useCheckpoints(sessionId?: string): UseCheckpointsApi {
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (forSessionId?: string) => {
    try {
      const list = await window.electronAPI.listCheckpoints(forSessionId ?? sessionId);
      setCheckpoints(list);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  useEffect(() => {
    void refresh();

    const unsubscribeCreated = window.electronAPI.onCheckpointCreated?.((checkpoint) => {
      if (sessionId && checkpoint.sessionId !== sessionId) return;
      setCheckpoints((prev) => [...prev, checkpoint]);
    });
    const unsubscribeDeleted = window.electronAPI.onCheckpointDeleted?.((id) => {
      setCheckpoints((prev) => prev.filter((c) => c.id !== id));
    });

    return () => {
      unsubscribeCreated?.();
      unsubscribeDeleted?.();
    };
  }, [refresh, sessionId]);

  const create = useCallback(async (request: CheckpointCreateRequest) => {
    try {
      const checkpoint = await window.electronAPI.createCheckpoint(request);
      setError(null);
      return checkpoint;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const get = useCallback(async (id: string) => {
    try {
      const checkpoint = await window.electronAPI.getCheckpoint(id);
      setError(null);
      return checkpoint;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      const ok = await window.electronAPI.deleteCheckpoint(id);
      setError(null);
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, []);

  const update = useCallback(
    async (
      id: string,
      patch: Partial<Pick<Checkpoint, 'name' | 'description' | 'tags' | 'isTemplate'>>,
    ) => {
      try {
        const checkpoint = await window.electronAPI.updateCheckpoint(id, patch);
        setError(null);
        if (checkpoint) {
          setCheckpoints((prev) => prev.map((c) => (c.id === id ? checkpoint : c)));
        }
        return checkpoint;
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        return null;
      }
    },
    [],
  );

  const exportCheckpoint = useCallback(async (id: string, format: CheckpointExportFormat) => {
    try {
      const content = await window.electronAPI.exportCheckpoint(id, format);
      setError(null);
      return content;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const count = useCallback(async (forSessionId: string) => {
    try {
      const n = await window.electronAPI.getCheckpointCount(forSessionId);
      setError(null);
      return n;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return 0;
    }
  }, []);

  return {
    checkpoints,
    loading,
    error,
    refresh,
    create,
    get,
    remove,
    update,
    exportCheckpoint,
    count,
  };
}
