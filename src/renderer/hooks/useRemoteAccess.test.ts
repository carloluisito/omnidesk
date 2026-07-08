import { describe, it, expect, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useRemoteAccess } from './useRemoteAccess';

const status = (
  over: Partial<import('../../shared/ipc-types').RemoteAccessStatus> = {},
): import('../../shared/ipc-types').RemoteAccessStatus => ({
  enabled: false,
  port: 8420,
  token: 't',
  url: 'http://localhost:8420',
  tunnel: { state: 'off' },
  cloudflaredInstalled: true,
  ...over,
});

describe('useRemoteAccess', () => {
  it('loads status on mount', async () => {
    const api = getElectronAPI();
    api.getRemoteStatus = vi.fn().mockResolvedValue(status());
    const { result } = renderHook(() => useRemoteAccess());
    await waitFor(() => expect(result.current.status?.port).toBe(8420));
    expect(result.current.loading).toBe(false);
  });

  it('enable calls the IPC and updates status', async () => {
    const api = getElectronAPI();
    api.getRemoteStatus = vi.fn().mockResolvedValue(status());
    api.enableRemoteAccess = vi.fn().mockResolvedValue(status({ enabled: true }));
    const { result } = renderHook(() => useRemoteAccess());
    await waitFor(() => expect(result.current.status).not.toBeNull());
    await act(async () => {
      await result.current.enable();
    });
    expect(api.enableRemoteAccess).toHaveBeenCalled();
    expect(result.current.status?.enabled).toBe(true);
  });

  it('install calls the IPC and updates status', async () => {
    const api = getElectronAPI();
    api.getRemoteStatus = vi.fn().mockResolvedValue(status({ cloudflaredInstalled: false }));
    api.installTunnel = vi.fn().mockResolvedValue(status({ cloudflaredInstalled: true, tunnel: { state: 'running', url: 'https://x.trycloudflare.com' } }));
    const { result } = renderHook(() => useRemoteAccess());
    await waitFor(() => expect(result.current.status?.cloudflaredInstalled).toBe(false));
    await act(async () => { await result.current.install(); });
    expect(api.installTunnel).toHaveBeenCalled();
    expect(result.current.status?.cloudflaredInstalled).toBe(true);
    expect(result.current.status?.tunnel.state).toBe('running');
  });

  it('regenerate swaps the token', async () => {
    const api = getElectronAPI();
    api.getRemoteStatus = vi.fn().mockResolvedValue(status({ token: 'old' }));
    api.regenerateRemoteToken = vi.fn().mockResolvedValue(status({ token: 'new' }));
    const { result } = renderHook(() => useRemoteAccess());
    await waitFor(() => expect(result.current.status?.token).toBe('old'));
    await act(async () => {
      await result.current.regenerate();
    });
    expect(result.current.status?.token).toBe('new');
  });
});
