// The integrations hub: consumes SessionManager's state tap, applies routing
// policy (toggles, per-repo mutes, edge/debounce), builds deep links from the
// live tunnel, and fans out through the rate-limited delivery queue.
// Design: docs/design/2026-07-19-integrations-platform-design.md
import * as path from 'path';
import type {
  ConnectorId,
  ConnectorTestResult,
  DeliveryStatus,
  IntegrationEvent,
  IntegrationEventType,
  IntegrationsSettings,
  OutboundMessage,
} from '../../shared/integration-types';
import type { SessionActivityState, SessionMetadata, SessionStateChangeEvent } from '../../shared/ipc-types';
import { AttentionPolicy } from './attention-policy';
import { ConnectorRegistry } from './connector-registry';
import { DeliveryQueue } from './delivery-queue';
import { formatMessage } from './message-format';

export interface IntegrationManagerDeps {
  getSettings(): IntegrationsSettings;
  listSessions(): SessionMetadata[];
  /** Non-null only while the remote tunnel is up. */
  getRemoteLink(): { baseUrl: string; token: string } | null;
  onDeliveryStatus?: (s: DeliveryStatus) => void;
}

const STATE_EVENT_TYPE: Partial<Record<SessionActivityState, IntegrationEventType>> = {
  'awaiting-input': 'attention',
  'awaiting-approval': 'attention',
  done: 'done',
  errored: 'errored',
};

export class IntegrationManager {
  private readonly deps: IntegrationManagerDeps;
  private readonly registry: ConnectorRegistry;
  private readonly queue: DeliveryQueue;
  private policy: AttentionPolicy;
  private policyDebounceMs: number;
  private readonly statuses = new Map<ConnectorId, DeliveryStatus>();
  private digestTimer: ReturnType<typeof setInterval> | null = null;

  constructor(deps: IntegrationManagerDeps, opts?: { registry?: ConnectorRegistry; queue?: DeliveryQueue }) {
    this.deps = deps;
    this.registry = opts?.registry ?? new ConnectorRegistry();
    this.queue =
      opts?.queue ??
      new DeliveryQueue({
        send: (connectorId, msg) => {
          const cfg = this.connectorConfig(connectorId);
          return this.registry.get(connectorId).deliver(cfg, msg);
        },
        onStatus: (s) => {
          this.statuses.set(s.connectorId, s);
          this.deps.onDeliveryStatus?.(s);
        },
      });
    this.policyDebounceMs = deps.getSettings().notify.debounceSeconds * 1000;
    this.policy = new AttentionPolicy({ debounceMs: this.policyDebounceMs });
    this.scheduleDigest();
  }

  /** SessionManager state-tap entry point. Must never throw. */
  handleStateChange(event: SessionStateChangeEvent, meta: SessionMetadata): void {
    try {
      const settings = this.deps.getSettings();
      const eventType = STATE_EVENT_TYPE[event.state];

      if (!eventType) {
        // Non-attention states still feed the policy so it re-arms.
        this.policy.shouldNotify(event.sessionId, event.state, event.at);
        return;
      }
      if (eventType === 'attention' && !settings.notify.attention) return;
      if (eventType === 'done' && !settings.notify.done) return;
      if (eventType === 'errored' && !settings.notify.errored) return;
      if (this.isMuted(settings, meta.workingDirectory)) return;
      if (!this.policy.shouldNotify(event.sessionId, event.state, event.at)) return;

      this.dispatch(settings, this.buildEvent(eventType, event, meta));
    } catch (err) {
      console.error('IntegrationManager.handleStateChange failed:', err);
    }
  }

  notifyPRCreated(meta: SessionMetadata, prUrl: string): void {
    const settings = this.deps.getSettings();
    if (!settings.shipit.notifyOnPR) return;
    if (this.isMuted(settings, meta.workingDirectory)) return;
    const repoName = path.basename(meta.workingDirectory);
    this.dispatch(settings, {
      type: 'pr-created',
      at: Date.now(),
      sessionId: meta.id,
      sessionName: meta.name,
      repoPath: meta.workingDirectory,
      repoName,
      summary: `PR created for ${repoName} · ${meta.name}: ${prUrl}`,
    });
  }

  async sendDigestNow(): Promise<void> {
    const settings = this.deps.getSettings();
    this.dispatch(settings, this.buildDigestEvent());
  }

  testConnector(id: ConnectorId, cfg: unknown): Promise<ConnectorTestResult> {
    return this.registry.get(id).test(cfg);
  }

  getDeliveryStatuses(): DeliveryStatus[] {
    return Array.from(this.statuses.values());
  }

  /** Call after settings change: refreshes debounce + digest schedule. */
  settingsChanged(): void {
    const debounceMs = this.deps.getSettings().notify.debounceSeconds * 1000;
    if (debounceMs !== this.policyDebounceMs) {
      this.policyDebounceMs = debounceMs;
      this.policy = new AttentionPolicy({ debounceMs });
    }
    this.scheduleDigest();
  }

  dispose(): void {
    if (this.digestTimer) clearInterval(this.digestTimer);
    this.digestTimer = null;
    this.queue.dispose();
  }

  // --- internals ---

  private connectorConfig(id: ConnectorId): unknown {
    return this.deps.getSettings().connectors[id];
  }

  private isMuted(settings: IntegrationsSettings, workingDirectory: string): boolean {
    return Object.entries(settings.perRepo).some(
      ([repoPath, cfg]) => cfg?.muted && workingDirectory.startsWith(repoPath)
    );
  }

  private buildLink(sessionId: string): string | undefined {
    const remote = this.deps.getRemoteLink();
    if (!remote) return undefined;
    const base = remote.baseUrl.replace(/\/+$/, '');
    return `${base}/?token=${remote.token}&session=${sessionId}`;
  }

  private buildEvent(
    type: IntegrationEventType,
    event: SessionStateChangeEvent,
    meta: SessionMetadata
  ): IntegrationEvent {
    return {
      type,
      at: event.at,
      sessionId: event.sessionId,
      sessionName: meta.name,
      sessionKind: meta.kind ?? 'agent',
      repoPath: meta.workingDirectory,
      repoName: path.basename(meta.workingDirectory),
      state: event.state,
      reason: event.reason,
      link: this.buildLink(event.sessionId),
    };
  }

  private buildDigestEvent(): IntegrationEvent {
    const sessions = this.deps.listSessions();
    const counts = { working: 0, needYou: 0, idle: 0, errored: 0 };
    const lines: string[] = [];
    for (const s of sessions) {
      const state = s.activityState ?? (s.status === 'error' ? 'errored' : 'idle');
      if (state === 'working' || state === 'initializing') counts.working++;
      else if (state === 'awaiting-input' || state === 'awaiting-approval' || state === 'done') counts.needYou++;
      else if (state === 'errored') counts.errored++;
      else if (state !== 'exited') counts.idle++;
      if (state !== 'idle' && state !== 'exited') {
        lines.push(`${path.basename(s.workingDirectory)} · ${s.name} — ${state}`);
      }
    }
    const head =
      sessions.length === 0
        ? 'OmniDesk fleet: no sessions'
        : `OmniDesk fleet: ${counts.working} working · ${counts.needYou} need you · ${counts.errored} errored · ${counts.idle} idle`;
    return {
      type: 'digest',
      at: Date.now(),
      summary: [head, ...lines].join('\n'),
    };
  }

  /** True when at least one session is in a non-idle, non-exited state. */
  private fleetActive(): boolean {
    return this.deps.listSessions().some((s) => {
      const state = s.activityState ?? (s.status === 'error' ? 'errored' : 'idle');
      return state !== 'idle' && state !== 'exited';
    });
  }

  private scheduleDigest(): void {
    if (this.digestTimer) clearInterval(this.digestTimer);
    this.digestTimer = null;
    const { digest } = this.deps.getSettings();
    if (!digest.enabled || digest.intervalMinutes <= 0) return;
    this.digestTimer = setInterval(() => {
      if (!this.fleetActive()) return; // skip-send when the whole fleet is idle
      this.dispatch(this.deps.getSettings(), this.buildDigestEvent());
    }, digest.intervalMinutes * 60_000);
    // Don't keep the process alive for digests.
    (this.digestTimer as { unref?: () => void }).unref?.();
  }

  private dispatch(settings: IntegrationsSettings, event: IntegrationEvent): void {
    const msg: OutboundMessage = { text: formatMessage(event), event };
    for (const { id } of this.registry.list()) {
      const cfg = settings.connectors[id] as { enabled?: boolean } | undefined;
      if (!cfg?.enabled) continue;
      if (!this.registry.get(id).isConfigured(cfg)) continue;
      this.queue.enqueue(id, msg);
    }
  }
}
