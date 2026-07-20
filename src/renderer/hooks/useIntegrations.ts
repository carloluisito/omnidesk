// Renderer state for the Integrations settings panel: the persisted
// integrations section (tolerant-merged), connector test pings, live
// delivery statuses, and GitHub preflight.
import { useCallback, useEffect, useState } from 'react';
import {
  ConnectorId,
  ConnectorTestResult,
  DeliveryStatus,
  GitHubPreflight,
  IntegrationsSettings,
  mergeIntegrationsSettings,
} from '../../shared/integration-types';

export interface UseIntegrationsApi {
  settings: IntegrationsSettings | null;
  saveSettings(patch: Partial<IntegrationsSettings>): Promise<void>;
  testConnector(id: ConnectorId, cfg: unknown): Promise<ConnectorTestResult>;
  statuses: Partial<Record<ConnectorId, DeliveryStatus>>;
  sendDigestNow(): Promise<void>;
  preflight(dir: string): Promise<GitHubPreflight>;
}

export function useIntegrations(): UseIntegrationsApi {
  const [settings, setSettings] = useState<IntegrationsSettings | null>(null);
  const [statuses, setStatuses] = useState<Partial<Record<ConnectorId, DeliveryStatus>>>({});

  useEffect(() => {
    let cancelled = false;
    window.electronAPI
      .getSettings()
      .then((all) => {
        if (!cancelled) setSettings(mergeIntegrationsSettings(all.integrations));
      })
      .catch((err) => console.error('Failed to load integrations settings:', err));

    window.electronAPI
      .getIntegrationDeliveryStatuses?.()
      .then((list) => {
        if (cancelled || !list) return;
        setStatuses(Object.fromEntries(list.map((s) => [s.connectorId, s])));
      })
      .catch(() => { /* statuses are cosmetic — ignore */ });

    const unsubscribe = window.electronAPI.onIntegrationDeliveryStatus?.((s) => {
      setStatuses((prev) => ({ ...prev, [s.connectorId]: s }));
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, []);

  const saveSettings = useCallback(
    async (patch: Partial<IntegrationsSettings>) => {
      const base = settings ?? mergeIntegrationsSettings(undefined);
      const next: IntegrationsSettings = {
        ...base,
        ...patch,
        connectors: { ...base.connectors, ...(patch.connectors ?? {}) },
        notify: { ...base.notify, ...(patch.notify ?? {}) },
        digest: { ...base.digest, ...(patch.digest ?? {}) },
        perRepo: { ...base.perRepo, ...(patch.perRepo ?? {}) },
        shipit: { ...base.shipit, ...(patch.shipit ?? {}) },
      };
      setSettings(next); // optimistic — the panel reflects the change immediately
      await window.electronAPI.setSettings({ integrations: next });
    },
    [settings]
  );

  const testConnector = useCallback(
    (id: ConnectorId, cfg: unknown) => window.electronAPI.testIntegrationConnector(id, cfg),
    []
  );

  const sendDigestNow = useCallback(async () => {
    await window.electronAPI.sendIntegrationDigestNow();
  }, []);

  const preflight = useCallback(
    (dir: string) => window.electronAPI.githubPreflight(dir),
    []
  );

  return { settings, saveSettings, testConnector, statuses, sendDigestNow, preflight };
}
