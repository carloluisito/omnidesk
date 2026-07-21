import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProviderInfo, ProviderCapabilities, ProviderId } from '../../shared/types/provider-types';

export function useProvider() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([]);
  const capabilitiesCache = useRef<Map<ProviderId, ProviderCapabilities>>(new Map());

  useEffect(() => {
    // Load providers on mount. Guard against a resolved value of undefined
    // (e.g. an unconfigured IPC mock in tests) so consumers can always rely
    // on these being arrays.
    window.electronAPI.listProviders().then(res => setProviders(res ?? []));
    window.electronAPI.getAvailableProviders().then(res => setAvailableProviders(res ?? []));
  }, []);

  const getCapabilities = useCallback(async (providerId: ProviderId): Promise<ProviderCapabilities> => {
    const cached = capabilitiesCache.current.get(providerId);
    if (cached) return cached;
    const caps = await window.electronAPI.getProviderCapabilities(providerId);
    capabilitiesCache.current.set(providerId, caps);
    return caps;
  }, []);

  return { providers, availableProviders, getCapabilities };
}
