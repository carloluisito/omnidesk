import { useState, useEffect, useCallback, useRef } from 'react';
import type { ProviderInfo, ProviderCapabilities, ProviderId } from '../../shared/types/provider-types';

export function useProvider() {
  const [providers, setProviders] = useState<ProviderInfo[]>([]);
  const [availableProviders, setAvailableProviders] = useState<ProviderInfo[]>([]);
  const capabilitiesCache = useRef<Map<ProviderId, ProviderCapabilities>>(new Map());

  useEffect(() => {
    // Load providers on mount
    window.electronAPI.listProviders().then(setProviders);
    window.electronAPI.getAvailableProviders().then(setAvailableProviders);
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
