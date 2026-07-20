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

/**
 * Last-line-of-defense charset check for a model token immediately before it
 * is shell-interpolated into a `--model <value>` flag and written to a PTY
 * (see claude-provider.ts#buildCommand and cli-manager.ts#launchProviderCommand).
 *
 * `request.model` is untrusted input reachable over the remote WS bridge with
 * only a token as gate (see issue #116). The primary defense is gating at the
 * trust boundary in session-manager.ts via `provider.normalizeModel()`, but
 * every later interpolation site guards with this as well so a bypass of one
 * layer doesn't translate into command injection.
 */
export const MODEL_TOKEN_PATTERN = /^[a-z0-9.\-]+$/i;

export function isSafeModelToken(value: string | undefined): value is string {
  return typeof value === 'string' && value.length > 0 && MODEL_TOKEN_PATTERN.test(value);
}
