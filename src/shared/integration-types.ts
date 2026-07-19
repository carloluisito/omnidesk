// Outbound integrations platform — shared types.
// See docs/design/2026-07-19-integrations-platform-design.md
import type { SessionActivityState, SessionKind } from './ipc-types';

export type ConnectorId = 'telegram' | 'slack' | 'discord' | 'webhook';

export type IntegrationEventType = 'attention' | 'done' | 'errored' | 'digest' | 'pr-created' | 'test';

export interface IntegrationEvent {
  type: IntegrationEventType;
  at: number;
  sessionId?: string;
  sessionName?: string;
  sessionKind?: SessionKind;
  repoPath?: string;
  repoName?: string;
  state?: SessionActivityState;
  reason?: string;
  link?: string; // deep link into the remote PWA; present only while the tunnel is up
  summary?: string; // digest body / PR URL / test text
}

export interface OutboundMessage {
  text: string;
  event: IntegrationEvent;
}

export interface ConnectorTestResult {
  ok: boolean;
  error?: string;
}

export interface DeliveryStatus {
  connectorId: ConnectorId;
  ok: boolean;
  error?: string;
  at: number;
}

export type SendOutcome =
  | { ok: true }
  | { ok: false; retryable: boolean; retryAfterMs?: number; error: string };

export interface TelegramConfig {
  enabled: boolean;
  botToken: string;
  chatId: string;
}

export interface SlackConfig {
  enabled: boolean;
  webhookUrl: string;
}

export interface DiscordConfig {
  enabled: boolean;
  webhookUrl: string;
}

export interface WebhookConfig {
  enabled: boolean;
  url: string;
  secret?: string;
}

export interface ConnectorConfigs {
  telegram?: TelegramConfig;
  slack?: SlackConfig;
  discord?: DiscordConfig;
  webhook?: WebhookConfig;
}

export interface IntegrationsSettings {
  connectors: ConnectorConfigs;
  notify: {
    attention: boolean;
    done: boolean;
    errored: boolean;
    debounceSeconds: number;
  };
  digest: {
    enabled: boolean;
    intervalMinutes: number;
  };
  perRepo: Record<string, { muted: boolean }>;
  shipit: {
    notifyOnPR: boolean;
  };
}

export function defaultIntegrationsSettings(): IntegrationsSettings {
  return {
    connectors: {},
    notify: { attention: true, done: true, errored: true, debounceSeconds: 15 },
    digest: { enabled: false, intervalMinutes: 60 },
    perRepo: {},
    shipit: { notifyOnPR: true },
  };
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** Tolerant deep-merge of persisted (possibly stale/malformed) settings over defaults. */
export function mergeIntegrationsSettings(saved: unknown): IntegrationsSettings {
  const d = defaultIntegrationsSettings();
  if (!isRecord(saved)) return d;

  if (isRecord(saved.connectors)) {
    d.connectors = saved.connectors as ConnectorConfigs;
  }
  if (isRecord(saved.notify)) {
    d.notify = { ...d.notify, ...(saved.notify as Partial<IntegrationsSettings['notify']>) };
  }
  if (isRecord(saved.digest)) {
    d.digest = { ...d.digest, ...(saved.digest as Partial<IntegrationsSettings['digest']>) };
  }
  if (isRecord(saved.perRepo)) {
    d.perRepo = saved.perRepo as IntegrationsSettings['perRepo'];
  }
  if (isRecord(saved.shipit)) {
    d.shipit = { ...d.shipit, ...(saved.shipit as Partial<IntegrationsSettings['shipit']>) };
  }
  return d;
}

// GitHub (ship-it / work intake) — actions provided via the `gh` CLI, not a message connector.

export interface GitHubPreflight {
  installed: boolean;
  authenticated: boolean;
  hasRemote: boolean;
  error?: string;
}

export interface GitHubIssue {
  number: number;
  title: string;
  body: string;
  labels: string[];
  url: string;
}

export interface ShipItPreview {
  branch: string;
  baseBranch: string;
  filesChanged: number;
  insertions: number;
  deletions: number;
  commits: string[];
  existingPrUrl?: string;
}

export interface CreatePRRequest {
  title: string;
  body: string;
  draft: boolean;
}

export interface CreatePRResult {
  url: string;
}
