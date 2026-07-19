import { ProviderId, ProviderInfo } from '../../shared/types/provider-types';
import type { LaunchMode } from '../../shared/ipc-types';
import type { StateSignals } from '../../shared/session-state-types';

export interface ProviderCommandOptions {
  workingDirectory: string;
  permissionMode: string;
  model?: string;
  /**
   * Claude-specific launch mode. Optional; consumed only inside `ClaudeProvider`.
   * Other providers must ignore this field.
   */
  launchMode?: LaunchMode;
}

export interface IProvider {
  getId(): ProviderId;
  getInfo(): ProviderInfo;
  isAvailable(): Promise<boolean>;
  buildCommand(options: ProviderCommandOptions): string;
  getReadinessPatterns(): string[];
  getModelDetectionPatterns(): { welcome: RegExp[]; switch: RegExp[] };
  /**
   * Regex tables the session-state classifier matches against this provider's
   * terminal output to derive live activity state (working / awaiting-approval
   * / awaiting-input / errored). Same idiom as getModelDetectionPatterns.
   */
  getStateSignals(): StateSignals;
  getEnvironmentVariables(options?: { enableAgentTeams?: boolean }): Record<string, string>;
  normalizeModel(raw: string): string | null;
}
