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

/**
 * Ceiling for a parsed Retry-After delay. A hostile/misconfigured endpoint (the generic
 * WebhookConnector posts to an arbitrary user-configured URL) can return an out-of-range
 * Retry-After; without a cap that value flows straight into `setTimeout`, which silently
 * clamps anything above ~24.85 days (2^31 - 1 ms) down to ~1ms — causing an unbroken
 * reschedule loop that pins a core. 2 minutes is comfortably above the queue's own
 * backoff ceiling (32s) while staying far below the setTimeout limit.
 */
export const MAX_RETRY_AFTER_MS = 120_000;

/**
 * Parse a Retry-After header value (RFC 7231: either delta-seconds or an HTTP-date) into a
 * positive, clamped millisecond delay. Returns undefined for missing, non-numeric/non-date,
 * negative, zero, or past values so the caller falls back to its own backoff schedule.
 */
function parseRetryAfterMs(retryAfter: string | null | undefined): number | undefined {
  if (!retryAfter) return undefined;
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds)) {
    return seconds > 0 ? Math.min(seconds * 1000, MAX_RETRY_AFTER_MS) : undefined;
  }
  const dateMs = Date.parse(retryAfter);
  if (Number.isFinite(dateMs)) {
    const deltaMs = dateMs - Date.now();
    return deltaMs > 0 ? Math.min(deltaMs, MAX_RETRY_AFTER_MS) : undefined;
  }
  return undefined;
}

/** Map an HTTP response to a SendOutcome. Never leaks tokens/URLs into errors. */
export function outcomeFromResponse(res: { status: number; headers?: { get(name: string): string | null } }): SendOutcome {
  if (res.status >= 200 && res.status < 300) return { ok: true };
  if (res.status === 429) {
    return {
      ok: false,
      retryable: true,
      retryAfterMs: parseRetryAfterMs(res.headers?.get('retry-after')),
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
