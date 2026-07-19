import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { IntegrationManager, IntegrationManagerDeps } from './integration-manager';
import { ConnectorRegistry } from './connector-registry';
import type { IConnector } from './connector';
import {
  defaultIntegrationsSettings,
  IntegrationsSettings,
  OutboundMessage,
} from '../../shared/integration-types';
import type { SessionMetadata, SessionStateChangeEvent } from '../../shared/ipc-types';

function meta(partial: Partial<SessionMetadata>): SessionMetadata {
  return {
    id: 's1',
    name: 'fix-bug',
    workingDirectory: 'C:\\repos\\omnidesk',
    permissionMode: 'standard',
    status: 'running',
    createdAt: 0,
    kind: 'agent',
    ...partial,
  } as SessionMetadata;
}

function evt(partial: Partial<SessionStateChangeEvent>): SessionStateChangeEvent {
  return { sessionId: 's1', state: 'awaiting-input', at: Date.now(), ...partial };
}

/** Registry with spy connectors that always succeed. */
function fakeRegistry() {
  const delivered: Array<{ id: string; msg: OutboundMessage }> = [];
  const mk = (id: string): IConnector<unknown> => ({
    id: id as never,
    displayName: id,
    isConfigured: (cfg) => Boolean(cfg),
    test: async () => ({ ok: true }),
    deliver: async (_cfg, msg) => {
      delivered.push({ id, msg });
      return { ok: true };
    },
  });
  const registry = new ConnectorRegistry();
  registry.register(mk('telegram'));
  registry.register(mk('slack'));
  registry.register(mk('discord'));
  registry.register(mk('webhook'));
  return { registry, delivered };
}

function makeDeps(settings: IntegrationsSettings, opts?: {
  sessions?: SessionMetadata[];
  remote?: { baseUrl: string; token: string } | null;
}): IntegrationManagerDeps {
  return {
    getSettings: () => settings,
    listSessions: () => opts?.sessions ?? [],
    getRemoteLink: () => opts?.remote ?? null,
  };
}

function settingsWith(over: Partial<IntegrationsSettings>): IntegrationsSettings {
  const s = defaultIntegrationsSettings();
  return {
    ...s,
    ...over,
    connectors: { telegram: { enabled: true, botToken: 't', chatId: 'c' }, ...(over.connectors ?? {}) },
  };
}

describe('IntegrationManager', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('fans an attention event out to enabled+configured connectors only', async () => {
    const { registry, delivered } = fakeRegistry();
    const settings = settingsWith({
      connectors: {
        telegram: { enabled: true, botToken: 't', chatId: 'c' },
        slack: { enabled: false, webhookUrl: 'https://x' }, // disabled
        discord: undefined as never, // not configured
      },
    });
    const m = new IntegrationManager(makeDeps(settings), { registry });
    m.handleStateChange(evt({}), meta({}));
    await vi.runAllTimersAsync();
    expect(delivered.map((d) => d.id)).toEqual(['telegram']);
    expect(delivered[0].msg.event).toMatchObject({ type: 'attention', sessionId: 's1', repoName: 'omnidesk' });
    m.dispose();
  });

  it('mutes sessions whose workingDirectory is under a muted repo path', async () => {
    const { registry, delivered } = fakeRegistry();
    const settings = settingsWith({ perRepo: { 'C:\\repos\\omnidesk': { muted: true } } });
    const m = new IntegrationManager(makeDeps(settings), { registry });
    m.handleStateChange(evt({}), meta({ workingDirectory: 'C:\\repos\\omnidesk\\.claude\\worktrees\\feat-x' }));
    await vi.runAllTimersAsync();
    expect(delivered).toEqual([]);
    m.dispose();
  });

  it('gates done/errored on their toggles without consuming the attention arm', async () => {
    const { registry, delivered } = fakeRegistry();
    const settings = settingsWith({ notify: { attention: true, done: false, errored: true, debounceSeconds: 0 } });
    const m = new IntegrationManager(makeDeps(settings), { registry });
    m.handleStateChange(evt({ state: 'done', at: 1000 }), meta({}));
    await vi.runAllTimersAsync();
    expect(delivered).toEqual([]); // done gated off
    m.handleStateChange(evt({ state: 'errored', at: 2000 }), meta({}));
    await vi.runAllTimersAsync();
    expect(delivered.length).toBe(1); // errored still fires — arm not consumed by gated done
    m.dispose();
  });

  it('applies the edge/debounce policy (second identical state is silent)', async () => {
    const { registry, delivered } = fakeRegistry();
    const m = new IntegrationManager(makeDeps(settingsWith({})), { registry });
    m.handleStateChange(evt({ at: 1000 }), meta({}));
    m.handleStateChange(evt({ at: 2000 }), meta({}));
    await vi.runAllTimersAsync();
    expect(delivered.length).toBe(1);
    m.dispose();
  });

  it('includes a deep link only when the remote tunnel is up', async () => {
    const { registry, delivered } = fakeRegistry();
    const withRemote = new IntegrationManager(
      makeDeps(settingsWith({}), { remote: { baseUrl: 'https://x.trycloudflare.com/', token: 'tok' } }),
      { registry }
    );
    withRemote.handleStateChange(evt({}), meta({}));
    await vi.runAllTimersAsync();
    expect(delivered[0].msg.event.link).toBe('https://x.trycloudflare.com/?token=tok&session=s1');
    withRemote.dispose();

    delivered.length = 0;
    const withoutRemote = new IntegrationManager(makeDeps(settingsWith({}), { remote: null }), { registry });
    withoutRemote.handleStateChange(evt({ at: 999_999 }), meta({ id: 's2' }));
    await vi.runAllTimersAsync();
    expect(delivered[0].msg.event.link).toBeUndefined();
    withoutRemote.dispose();
  });

  it('sendDigestNow posts a fleet snapshot', async () => {
    const { registry, delivered } = fakeRegistry();
    const sessions = [
      meta({ id: 'a', name: 'one', activityState: 'working' }),
      meta({ id: 'b', name: 'two', activityState: 'awaiting-input' }),
      meta({ id: 'c', name: 'three', activityState: 'idle' }),
    ];
    const m = new IntegrationManager(makeDeps(settingsWith({}), { sessions }), { registry });
    await m.sendDigestNow();
    await vi.runAllTimersAsync();
    expect(delivered.length).toBe(1);
    const text = delivered[0].msg.text;
    expect(text).toContain('1 working');
    expect(text).toContain('1 need');
    m.dispose();
  });

  it('scheduled digest skips when the whole fleet is idle', async () => {
    const { registry, delivered } = fakeRegistry();
    const sessions = [meta({ id: 'a', activityState: 'idle' }), meta({ id: 'b', activityState: 'exited' })];
    const settings = settingsWith({ digest: { enabled: true, intervalMinutes: 1 } });
    const m = new IntegrationManager(makeDeps(settings, { sessions }), { registry });
    m.settingsChanged();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(delivered).toEqual([]);
    m.dispose();
  });

  it('scheduled digest fires when something is active', async () => {
    const { registry, delivered } = fakeRegistry();
    const sessions = [meta({ id: 'a', activityState: 'working' })];
    const settings = settingsWith({ digest: { enabled: true, intervalMinutes: 1 } });
    const m = new IntegrationManager(makeDeps(settings, { sessions }), { registry });
    m.settingsChanged();
    await vi.advanceTimersByTimeAsync(61_000);
    expect(delivered.length).toBeGreaterThanOrEqual(1);
    m.dispose();
  });

  it('notifyPRCreated respects shipit.notifyOnPR', async () => {
    const { registry, delivered } = fakeRegistry();
    const off = new IntegrationManager(
      makeDeps(settingsWith({ shipit: { notifyOnPR: false } })),
      { registry }
    );
    off.notifyPRCreated(meta({}), 'https://github.com/a/b/pull/7');
    await vi.runAllTimersAsync();
    expect(delivered).toEqual([]);
    off.dispose();

    const on = new IntegrationManager(makeDeps(settingsWith({})), { registry });
    on.notifyPRCreated(meta({}), 'https://github.com/a/b/pull/7');
    await vi.runAllTimersAsync();
    expect(delivered.length).toBe(1);
    expect(delivered[0].msg.text).toContain('pull/7');
    on.dispose();
  });

  it('records delivery statuses and forwards them to the deps callback', async () => {
    const { registry } = fakeRegistry();
    const statuses: unknown[] = [];
    const deps = { ...makeDeps(settingsWith({})), onDeliveryStatus: (s: unknown) => statuses.push(s) };
    const m = new IntegrationManager(deps, { registry });
    m.handleStateChange(evt({}), meta({}));
    await vi.runAllTimersAsync();
    expect(statuses.length).toBe(1);
    expect(m.getDeliveryStatuses()).toMatchObject([{ connectorId: 'telegram', ok: true }]);
    m.dispose();
  });

  it('testConnector delegates to the connector with the candidate config', async () => {
    const { registry } = fakeRegistry();
    const m = new IntegrationManager(makeDeps(settingsWith({})), { registry });
    await expect(m.testConnector('slack', { enabled: true, webhookUrl: 'https://x' })).resolves.toEqual({ ok: true });
    m.dispose();
  });
});
