import { IProvider } from './provider';
import { ClaudeProvider } from './claude-provider';
import { CodexProvider } from './codex-provider';
import { ProviderId, ProviderInfo } from '../../shared/types/provider-types';
import { getCachedAgentViewAvailability } from '../agent-view/availability-cache';

export class ProviderRegistry {
  private providers: Map<ProviderId, IProvider> = new Map();

  constructor() {
    // Auto-register built-in providers.
    // ClaudeProvider receives a getter so buildCommand always reads the live
    // cached availability (including updates from the delayed-init probe).
    this.register(new ClaudeProvider(() => getCachedAgentViewAvailability()));
    this.register(new CodexProvider());
  }

  register(provider: IProvider): void {
    this.providers.set(provider.getId(), provider);
  }

  get(id: ProviderId): IProvider {
    const provider = this.providers.get(id);
    if (!provider) {
      throw new Error(`Provider not found: ${id}`);
    }
    return provider;
  }

  list(): ProviderInfo[] {
    return Array.from(this.providers.values()).map(p => p.getInfo());
  }

  async getAvailable(): Promise<ProviderInfo[]> {
    const results: ProviderInfo[] = [];
    for (const provider of this.providers.values()) {
      const available = await provider.isAvailable();
      if (available) {
        results.push(provider.getInfo());
      }
    }
    return results;
  }
}
