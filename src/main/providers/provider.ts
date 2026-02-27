import { ProviderId, ProviderInfo } from '../../shared/types/provider-types';

export interface ProviderCommandOptions {
  workingDirectory: string;
  permissionMode: string;
  model?: string;
}

export interface IProvider {
  getId(): ProviderId;
  getInfo(): ProviderInfo;
  isAvailable(): Promise<boolean>;
  buildCommand(options: ProviderCommandOptions): string;
  getReadinessPatterns(): string[];
  getModelDetectionPatterns(): { welcome: RegExp[]; switch: RegExp[] };
  getEnvironmentVariables(options?: { enableAgentTeams?: boolean }): Record<string, string>;
  normalizeModel(raw: string): string | null;
}
