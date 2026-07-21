// Per-connector rate-limited delivery with bounded queues and retry/backoff.
// One in-flight send per connector; failures never propagate to callers.
import type {
  ConnectorId,
  DeliveryStatus,
  OutboundMessage,
  SendOutcome,
} from '../../shared/integration-types';

interface QueueItem {
  msg: OutboundMessage;
  attempts: number;
  notBefore: number; // epoch ms; 0 = immediately
}

interface ConnectorLane {
  tokens: number;
  lastRefill: number;
  queue: QueueItem[];
  timer: ReturnType<typeof setTimeout> | null;
  sending: boolean;
}

export interface DeliveryQueueOptions {
  send: (connectorId: ConnectorId, msg: OutboundMessage) => Promise<SendOutcome>;
  onStatus?: (s: DeliveryStatus) => void;
  ratePerMinute?: number; // token bucket capacity + refill rate (default 20)
  maxQueue?: number; // pending items per connector; oldest dropped beyond (default 50)
  maxRetries?: number; // retries after the initial attempt (default 3)
}

const BACKOFF_MS = [2_000, 8_000, 32_000];

/**
 * Defensive independent ceiling on any scheduled retry delay. connector.ts already clamps
 * retryAfterMs at the parse boundary, but this queue must not trust that a SendOutcome always
 * came from there — an out-of-range delay feeding straight into setTimeout is silently clamped
 * by Node to ~1ms above ~24.85 days (2^31 - 1 ms), which turns into an unbroken reschedule loop
 * on this lane. Kept equal to connector.ts's MAX_RETRY_AFTER_MS so behavior is consistent.
 */
const MAX_RETRY_DELAY_MS = 120_000;

export class DeliveryQueue {
  private readonly opts: Required<Pick<DeliveryQueueOptions, 'ratePerMinute' | 'maxQueue' | 'maxRetries'>> &
    Pick<DeliveryQueueOptions, 'send' | 'onStatus'>;
  private readonly lanes = new Map<ConnectorId, ConnectorLane>();
  private disposed = false;

  constructor(options: DeliveryQueueOptions) {
    this.opts = {
      send: options.send,
      onStatus: options.onStatus,
      ratePerMinute: options.ratePerMinute ?? 20,
      maxQueue: options.maxQueue ?? 50,
      maxRetries: options.maxRetries ?? 3,
    };
  }

  enqueue(connectorId: ConnectorId, msg: OutboundMessage): void {
    if (this.disposed) return;
    const lane = this.lane(connectorId);
    lane.queue.push({ msg, attempts: 0, notBefore: 0 });
    while (lane.queue.length > this.opts.maxQueue) {
      lane.queue.shift(); // drop oldest
    }
    this.schedule(connectorId, 0);
  }

  dispose(): void {
    this.disposed = true;
    for (const lane of this.lanes.values()) {
      if (lane.timer) clearTimeout(lane.timer);
      lane.timer = null;
      lane.queue.length = 0;
    }
  }

  private lane(id: ConnectorId): ConnectorLane {
    let lane = this.lanes.get(id);
    if (!lane) {
      lane = { tokens: this.opts.ratePerMinute, lastRefill: Date.now(), queue: [], timer: null, sending: false };
      this.lanes.set(id, lane);
    }
    return lane;
  }

  private refill(lane: ConnectorLane, now: number): void {
    const elapsed = Math.max(0, now - lane.lastRefill);
    lane.tokens = Math.min(
      this.opts.ratePerMinute,
      lane.tokens + (elapsed * this.opts.ratePerMinute) / 60_000
    );
    lane.lastRefill = now;
  }

  private schedule(id: ConnectorId, delayMs: number): void {
    const lane = this.lane(id);
    if (lane.timer || lane.sending || this.disposed) return;
    lane.timer = setTimeout(() => {
      lane.timer = null;
      void this.process(id);
    }, delayMs);
  }

  private async process(id: ConnectorId): Promise<void> {
    const lane = this.lane(id);
    if (this.disposed || lane.sending) return;
    const now = Date.now();
    this.refill(lane, now);

    const idx = lane.queue.findIndex((it) => it.notBefore <= now);
    if (idx === -1) {
      const soonest = lane.queue.reduce((m, it) => Math.min(m, it.notBefore), Infinity);
      if (soonest !== Infinity) this.schedule(id, Math.max(1, soonest - now));
      return;
    }

    if (lane.tokens < 1) {
      const waitMs = Math.ceil(((1 - lane.tokens) * 60_000) / this.opts.ratePerMinute);
      this.schedule(id, Math.max(1, waitMs));
      return;
    }

    const item = lane.queue.splice(idx, 1)[0];
    lane.tokens -= 1;
    lane.sending = true;

    let outcome: SendOutcome;
    try {
      outcome = await this.opts.send(id, item.msg);
    } catch (err) {
      outcome = { ok: false, retryable: true, error: err instanceof Error ? err.message : String(err) };
    }
    lane.sending = false;
    if (this.disposed) return;

    if (outcome.ok) {
      this.opts.onStatus?.({ connectorId: id, ok: true, at: Date.now() });
    } else if (outcome.retryable && item.attempts < this.opts.maxRetries) {
      const backoff = BACKOFF_MS[Math.min(item.attempts, BACKOFF_MS.length - 1)];
      const delay = Math.min(outcome.retryAfterMs ?? backoff, MAX_RETRY_DELAY_MS);
      lane.queue.unshift({ ...item, attempts: item.attempts + 1, notBefore: Date.now() + delay });
    } else {
      this.opts.onStatus?.({ connectorId: id, ok: false, error: outcome.error, at: Date.now() });
    }

    if (lane.queue.length > 0) this.schedule(id, 1);
  }
}
