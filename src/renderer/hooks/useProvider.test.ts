import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { getElectronAPI, resetElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useProvider } from './useProvider';
import type { ProviderInfo, ProviderCapabilities } from '../../shared/types/provider-types';

function makeProviderInfo(id: 'claude' | 'codex'): ProviderInfo {
  return {
    id,
    displayName: id,
    cliCommand: id,
    capabilities: {
      modelSwitching: true,
      agentTeams: false,
      quota: false,
      readinessDetection: true,
      permissionModes: ['standard'],
    },
  };
}

function makeCapabilities(overrides: Partial<ProviderCapabilities> = {}): ProviderCapabilities {
  return {
    modelSwitching: true,
    agentTeams: false,
    quota: false,
    readinessDetection: true,
    permissionModes: ['standard'],
    ...overrides,
  };
}

describe('useProvider', () => {
  let api: ReturnType<typeof getElectronAPI>;

  beforeEach(() => {
    api = resetElectronAPI();
  });

  describe('mount loading', () => {
    it('populates providers and availableProviders from listProviders/getAvailableProviders', async () => {
      const providers = [makeProviderInfo('claude'), makeProviderInfo('codex')];
      const available = [makeProviderInfo('claude')];
      api.listProviders.mockResolvedValue(providers);
      api.getAvailableProviders.mockResolvedValue(available);

      const { result } = renderHook(() => useProvider());

      await waitFor(() => expect(result.current.providers).toEqual(providers));
      expect(result.current.availableProviders).toEqual(available);
    });

    it('falls back to [] when listProviders/getAvailableProviders resolve undefined', async () => {
      // Default mock resolves undefined (see electron-api-mock buildElectronAPIMock);
      // this exercises the `?? []` guard called out in issue #186.
      const { result } = renderHook(() => useProvider());

      await waitFor(() => expect(result.current.providers).toEqual([]));
      expect(result.current.availableProviders).toEqual([]);
    });
  });

  describe('getCapabilities cache', () => {
    it('calls getProviderCapabilities exactly once per providerId and returns the cached value after', async () => {
      const caps = makeCapabilities();
      api.getProviderCapabilities.mockResolvedValue(caps);

      const { result } = renderHook(() => useProvider());
      // Flush the mount effect's provider-loading state updates before driving
      // getCapabilities, so React state updates don't leak outside act().
      await waitFor(() => expect(result.current.providers).toEqual([]));

      const first = await result.current.getCapabilities('claude');
      const second = await result.current.getCapabilities('claude');
      const third = await result.current.getCapabilities('claude');

      expect(first).toEqual(caps);
      expect(second).toEqual(caps);
      expect(third).toEqual(caps);
      expect(api.getProviderCapabilities).toHaveBeenCalledTimes(1);
      expect(api.getProviderCapabilities).toHaveBeenCalledWith('claude');
    });

    it('caches two distinct providerIds independently', async () => {
      const claudeCaps = makeCapabilities({ modelSwitching: true });
      const codexCaps = makeCapabilities({ modelSwitching: false });
      api.getProviderCapabilities.mockImplementation(async (id: string) =>
        id === 'claude' ? claudeCaps : codexCaps
      );

      const { result } = renderHook(() => useProvider());
      await waitFor(() => expect(result.current.providers).toEqual([]));

      const claudeFirst = await result.current.getCapabilities('claude');
      const codexFirst = await result.current.getCapabilities('codex');
      const claudeSecond = await result.current.getCapabilities('claude');
      const codexSecond = await result.current.getCapabilities('codex');

      expect(claudeFirst).toEqual(claudeCaps);
      expect(codexFirst).toEqual(codexCaps);
      expect(claudeSecond).toEqual(claudeCaps);
      expect(codexSecond).toEqual(codexCaps);
      expect(api.getProviderCapabilities).toHaveBeenCalledTimes(2);
      expect(api.getProviderCapabilities).toHaveBeenNthCalledWith(1, 'claude');
      expect(api.getProviderCapabilities).toHaveBeenNthCalledWith(2, 'codex');
    });
  });
});
