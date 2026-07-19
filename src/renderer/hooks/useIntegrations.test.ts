import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useIntegrations } from './useIntegrations';
import { defaultIntegrationsSettings } from '../../shared/integration-types';
import type { DeliveryStatus } from '../../shared/integration-types';

describe('useIntegrations', () => {
  it('loads and merges settings on mount (malformed section → defaults)', async () => {
    const api = getElectronAPI();
    api.getSettings = vi.fn().mockResolvedValue({ version: 1, workspaces: [], integrations: { notify: { attention: false } } });
    const { result } = renderHook(() => useIntegrations());
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    expect(result.current.settings?.notify.attention).toBe(false);
    expect(result.current.settings?.notify.done).toBe(true); // default preserved
  });

  it('saveSettings deep-merges the patch and persists via setSettings', async () => {
    const api = getElectronAPI();
    api.getSettings = vi.fn().mockResolvedValue({ version: 1, workspaces: [], integrations: defaultIntegrationsSettings() });
    api.setSettings = vi.fn().mockImplementation(async (partial) => partial);
    const { result } = renderHook(() => useIntegrations());
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    await act(async () => {
      await result.current.saveSettings({
        connectors: { telegram: { enabled: true, botToken: 'T', chatId: 'C' } },
      });
    });

    const sent = (api.setSettings as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(sent.integrations.connectors.telegram).toEqual({ enabled: true, botToken: 'T', chatId: 'C' });
    expect(sent.integrations.notify.attention).toBe(true); // rest of section carried along
    expect(result.current.settings?.connectors.telegram?.botToken).toBe('T');
  });

  it('folds delivery status events into per-connector statuses', async () => {
    const api = getElectronAPI();
    api.getSettings = vi.fn().mockResolvedValue({ version: 1, workspaces: [] });
    let push: ((s: DeliveryStatus) => void) | null = null;
    api.onIntegrationDeliveryStatus = vi.fn().mockImplementation((cb) => {
      push = cb;
      return () => { push = null; };
    });
    const { result } = renderHook(() => useIntegrations());
    await waitFor(() => expect(result.current.settings).not.toBeNull());

    act(() => {
      push?.({ connectorId: 'slack', ok: false, error: 'rejected (HTTP 404)', at: 5 });
    });
    expect(result.current.statuses.slack).toMatchObject({ ok: false, error: 'rejected (HTTP 404)' });
  });

  it('testConnector delegates to the IPC with candidate config', async () => {
    const api = getElectronAPI();
    api.getSettings = vi.fn().mockResolvedValue({ version: 1, workspaces: [] });
    api.testIntegrationConnector = vi.fn().mockResolvedValue({ ok: true });
    const { result } = renderHook(() => useIntegrations());
    await waitFor(() => expect(result.current.settings).not.toBeNull());
    const res = await result.current.testConnector('telegram', { enabled: true, botToken: 't', chatId: 'c' });
    expect(res).toEqual({ ok: true });
    expect(api.testIntegrationConnector).toHaveBeenCalledWith('telegram', { enabled: true, botToken: 't', chatId: 'c' });
  });
});
