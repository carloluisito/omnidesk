// Stateless message connector abstraction. Config is passed per call —
// persisted settings remain the single source of truth.
import type {
  ConnectorId,
  ConnectorTestResult,
  OutboundMessage,
  SendOutcome,
} from '../../shared/integration-types';

export interface IConnector<C = unknown> {
  readonly id: ConnectorId;
  readonly displayName: string;
  isConfigured(cfg: C | undefined): boolean;
  test(cfg: C): Promise<ConnectorTestResult>;
  deliver(cfg: C, msg: OutboundMessage): Promise<SendOutcome>;
}

/** Map an HTTP response to a SendOutcome. Never leaks tokens/URLs into errors. */
export function outcomeFromResponse(res: { status: number; headers?: { get(name: string): string | null } }): SendOutcome {
  if (res.status >= 200 && res.status < 300) return { ok: true };
  if (res.status === 429) {
    const retryAfter = res.headers?.get('retry-after');
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    return {
      ok: false,
      retryable: true,
      retryAfterMs: Number.isFinite(seconds) ? seconds * 1000 : undefined,
      error: 'rate limited (429)',
    };
  }
  if (res.status >= 400 && res.status < 500) {
    return { ok: false, retryable: false, error: `rejected (HTTP ${res.status}) — check the connector configuration` };
  }
  return { ok: false, retryable: true, error: `service error (HTTP ${res.status})` };
}

export function outcomeFromNetworkError(err: unknown): SendOutcome {
  return { ok: false, retryable: true, error: err instanceof Error ? err.message : 'network error' };
}
