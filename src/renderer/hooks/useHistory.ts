// Thin wrapper around the window.electronAPI history IPC contract.
// Mirrors the loading/error/refresh shape of useRemoteAccess.ts. History is
// not live data (unlike remote-access tunnel status), so there is
// deliberately no polling here — callers refresh explicitly after mutating.
import { useState, useCallback, useEffect } from 'react';
import type {
  HistorySessionEntry,
  HistorySettings,
  HistorySearchResult,
  HistoryStats,
} from '../../shared/types/history-types';

export interface UseHistoryApi {
  sessions: HistorySessionEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  getContent: (id: string) => Promise<string | null>;
  search: (query: string, caseSensitive?: boolean) => Promise<HistorySearchResult[]>;
  remove: (id: string) => Promise<boolean>;
  removeAll: () => Promise<boolean>;
  exportMarkdown: (id: string, outputPath: string) => Promise<boolean>;
  exportJson: (id: string, outputPath: string) => Promise<boolean>;
  getSettings: () => Promise<HistorySettings | null>;
  updateSettings: (patch: Partial<HistorySettings>) => Promise<boolean>;
  getStats: () => Promise<HistoryStats | null>;
}

export function useHistory(): UseHistoryApi {
  const [sessions, setSessions] = useState<HistorySessionEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await window.electronAPI.listHistory();
      setSessions(list);
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

  const getContent = useCallback(async (id: string) => {
    try {
      const content = await window.electronAPI.getHistory(id);
      setError(null);
      return content;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const search = useCallback(async (query: string, caseSensitive?: boolean) => {
    try {
      const results = await window.electronAPI.searchHistory(query, caseSensitive);
      setError(null);
      return results;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return [];
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      const ok = await window.electronAPI.deleteHistory(id);
      setError(null);
      if (ok) await refresh();
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [refresh]);

  const removeAll = useCallback(async () => {
    try {
      const ok = await window.electronAPI.deleteAllHistory();
      setError(null);
      if (ok) await refresh();
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [refresh]);

  const exportMarkdown = useCallback(async (id: string, outputPath: string) => {
    try {
      const ok = await window.electronAPI.exportHistoryMarkdown(id, outputPath);
      setError(null);
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, []);

  const exportJson = useCallback(async (id: string, outputPath: string) => {
    try {
      const ok = await window.electronAPI.exportHistoryJson(id, outputPath);
      setError(null);
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, []);

  const getSettings = useCallback(async () => {
    try {
      const settings = await window.electronAPI.getHistorySettings();
      setError(null);
      return settings;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  const updateSettings = useCallback(async (patch: Partial<HistorySettings>) => {
    try {
      const ok = await window.electronAPI.updateHistorySettings(patch);
      setError(null);
      return ok;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, []);

  const getStats = useCallback(async () => {
    try {
      const stats = await window.electronAPI.getHistoryStats();
      setError(null);
      return stats;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    }
  }, []);

  return {
    sessions,
    loading,
    error,
    refresh,
    getContent,
    search,
    remove,
    removeAll,
    exportMarkdown,
    exportJson,
    getSettings,
    updateSettings,
    getStats,
  };
}
