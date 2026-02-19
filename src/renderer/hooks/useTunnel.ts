import { useState, useCallback, useEffect, useRef } from 'react';
import type {
  TunnelInfo,
  TunnelCreateRequest,
  TunnelSettings,
  TunnelAccountInfo,
  TunnelRequestLog,
  TunnelOperationResult,
} from '../../shared/types/tunnel-types';

const DEFAULT_AUTO_REFRESH_MS = 30000;

export interface UseTunnelReturn {
  // State
  tunnels: TunnelInfo[];
  settings: TunnelSettings | null;
  account: TunnelAccountInfo | null;
  selectedTunnel: TunnelInfo | null;
  requestLogs: TunnelRequestLog[];
  isLoading: boolean;
  operationInProgress: string | null;
  error: string | null;
  isConfigured: boolean;
  cliStatus: { found: boolean; path?: string } | null;

  // Actions
  createTunnel: (request: TunnelCreateRequest) => Promise<TunnelOperationResult | null>;
  stopTunnel: (id: string) => Promise<TunnelOperationResult | null>;
  deleteTunnel: (id: string) => Promise<void>;
  refreshTunnels: () => Promise<void>;
  loadRequestLogs: (tunnelId: string) => Promise<void>;
  selectTunnel: (tunnel: TunnelInfo | null) => void;
  updateSettings: (partial: Partial<TunnelSettings>) => Promise<void>;
  validateApiKey: (key: string) => Promise<TunnelOperationResult | null>;
  loadAccount: () => Promise<void>;
}

export function useTunnel(): UseTunnelReturn {
  const [tunnels, setTunnels] = useState<TunnelInfo[]>([]);
  const [settings, setSettings] = useState<TunnelSettings | null>(null);
  const [account, setAccount] = useState<TunnelAccountInfo | null>(null);
  const [selectedTunnel, setSelectedTunnel] = useState<TunnelInfo | null>(null);
  const [requestLogs, setRequestLogs] = useState<TunnelRequestLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [operationInProgress, setOperationInProgress] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isConfigured, setIsConfigured] = useState(false);
  const [cliStatus, setCliStatus] = useState<{ found: boolean; path?: string } | null>(null);

  // Streaming output from tunnels — stored in a ref to avoid re-renders per data event
  const tunnelOutputRef = useRef<Map<string, string>>(new Map());

  // Prevent double-fetch in React 18 strict mode
  const hasFetched = useRef(false);

  // ── Mount effect: load settings + detect CLI ──────────────────────
  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const init = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const s = await window.electronAPI.tunnelGetSettings();
        setSettings(s);
        setIsConfigured(typeof s.apiKey === 'string' && s.apiKey.trim().length > 0);

        const binaryFound = await window.electronAPI.tunnelDetectBinary();
        setCliStatus({ found: binaryFound });
      } catch (err) {
        console.error('Failed to initialize tunnel settings:', err);
        setError('Failed to load tunnel settings');
      } finally {
        setIsLoading(false);
      }
    };

    init();
  }, []);

  // ── Event subscriptions ───────────────────────────────────────────
  useEffect(() => {
    const unsubCreated = window.electronAPI.onTunnelCreated((event) => {
      setTunnels((prev) => {
        const exists = prev.some((t) => t.id === event.tunnel.id);
        if (exists) {
          return prev.map((t) => (t.id === event.tunnel.id ? event.tunnel : t));
        }
        return [...prev, event.tunnel];
      });
      setOperationInProgress(null);
    });

    const unsubStopped = window.electronAPI.onTunnelStopped((event) => {
      setTunnels((prev) =>
        prev.map((t) =>
          t.id === event.tunnelId ? { ...t, status: 'stopped' as const } : t
        )
      );
    });

    const unsubError = window.electronAPI.onTunnelError((event) => {
      setError(event.error);
      setOperationInProgress(null);
    });

    const unsubOutput = window.electronAPI.onTunnelOutput((event) => {
      const existing = tunnelOutputRef.current.get(event.tunnelId) ?? '';
      tunnelOutputRef.current.set(event.tunnelId, existing + event.data);
    });

    return () => {
      unsubCreated();
      unsubStopped();
      unsubError();
      unsubOutput();
    };
  }, []);

  // ── Auto-refresh interval ─────────────────────────────────────────
  useEffect(() => {
    if (!isConfigured) return;

    const intervalMs =
      settings?.autoRefreshIntervalMs ?? DEFAULT_AUTO_REFRESH_MS;

    const id = setInterval(() => {
      refreshTunnels();
    }, intervalMs);

    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConfigured, settings?.autoRefreshIntervalMs]);

  // ── Actions ───────────────────────────────────────────────────────

  const refreshTunnels = useCallback(async () => {
    try {
      const list = await window.electronAPI.tunnelRefresh();
      setTunnels(list);
    } catch (err) {
      console.error('Failed to refresh tunnels:', err);
    }
  }, []);

  const createTunnel = useCallback(async (request: TunnelCreateRequest): Promise<TunnelOperationResult | null> => {
    setOperationInProgress('creating');
    setError(null);
    try {
      const result = await window.electronAPI.tunnelCreate(request);
      if (!result.success) {
        setError(result.message);
      }
      return result;
    } catch (err) {
      console.error('Failed to create tunnel:', err);
      setError('Failed to create tunnel');
      return null;
    } finally {
      // operationInProgress is cleared by onTunnelCreated or onTunnelError events;
      // only clear here if the IPC call itself threw (result.success=false doesn't
      // emit an event from the main process for the creation path).
      setOperationInProgress(null);
    }
  }, []);

  const stopTunnel = useCallback(async (id: string): Promise<TunnelOperationResult | null> => {
    setOperationInProgress('stopping');
    setError(null);
    try {
      const result = await window.electronAPI.tunnelStop(id);
      if (!result.success) {
        setError(result.message);
        setOperationInProgress(null);
      }
      return result;
    } catch (err) {
      console.error('Failed to stop tunnel:', err);
      setError('Failed to stop tunnel');
      setOperationInProgress(null);
      return null;
    }
  }, []);

  const deleteTunnel = useCallback(async (id: string): Promise<void> => {
    // Optimistically remove from list
    setTunnels((prev) => prev.filter((t) => t.id !== id));
    setSelectedTunnel((prev) => (prev?.id === id ? null : prev));
    try {
      await window.electronAPI.tunnelStop(id);
    } catch (err) {
      console.error('Failed to delete tunnel:', err);
    }
  }, []);

  const loadRequestLogs = useCallback(async (tunnelId: string): Promise<void> => {
    try {
      const logs = await window.electronAPI.tunnelGetLogs(tunnelId);
      setRequestLogs(logs);
    } catch (err) {
      console.error('Failed to load request logs:', err);
    }
  }, []);

  const selectTunnel = useCallback((tunnel: TunnelInfo | null): void => {
    setSelectedTunnel(tunnel);
    if (tunnel) {
      loadRequestLogs(tunnel.id);
    } else {
      setRequestLogs([]);
    }
  }, [loadRequestLogs]);

  const updateSettings = useCallback(async (partial: Partial<TunnelSettings>): Promise<void> => {
    try {
      const updated = await window.electronAPI.tunnelUpdateSettings(partial);
      setSettings(updated);
      setIsConfigured(typeof updated.apiKey === 'string' && updated.apiKey.trim().length > 0);
    } catch (err) {
      console.error('Failed to update tunnel settings:', err);
      setError('Failed to update tunnel settings');
    }
  }, []);

  const validateApiKey = useCallback(async (key: string): Promise<TunnelOperationResult | null> => {
    try {
      const result = await window.electronAPI.tunnelValidateKey(key);
      return result;
    } catch (err) {
      console.error('Failed to validate API key:', err);
      return null;
    }
  }, []);

  const loadAccount = useCallback(async (): Promise<void> => {
    try {
      const info = await window.electronAPI.tunnelGetAccount();
      setAccount(info);
    } catch (err) {
      console.error('Failed to load tunnel account:', err);
    }
  }, []);

  return {
    tunnels,
    settings,
    account,
    selectedTunnel,
    requestLogs,
    isLoading,
    operationInProgress,
    error,
    isConfigured,
    cliStatus,
    createTunnel,
    stopTunnel,
    deleteTunnel,
    refreshTunnels,
    loadRequestLogs,
    selectTunnel,
    updateSettings,
    validateApiKey,
    loadAccount,
  };
}
