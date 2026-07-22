import { describe, it, expect, beforeEach } from 'vitest';
import { ConnectorRegistry } from './connector-registry';
import { TelegramConnector } from './connectors/telegram-connector';
import { SlackConnector } from './connectors/slack-connector';
import { DiscordConnector } from './connectors/discord-connector';
import { WebhookConnector } from './connectors/webhook-connector';
import type { IConnector } from './connector';
import type { ConnectorId, ConnectorTestResult, OutboundMessage, SendOutcome } from '../../shared/integration-types';

describe('ConnectorRegistry', () => {
  let registry: ConnectorRegistry;

  beforeEach(() => {
    registry = new ConnectorRegistry();
  });

  it('auto-registers the Telegram connector on construction', () => {
    expect(registry.get('telegram')).toBeInstanceOf(TelegramConnector);
  });

  it('auto-registers the Slack connector on construction', () => {
    expect(registry.get('slack')).toBeInstanceOf(SlackConnector);
  });

  it('auto-registers the Discord connector on construction', () => {
    expect(registry.get('discord')).toBeInstanceOf(DiscordConnector);
  });

  it('auto-registers the Webhook connector on construction', () => {
    expect(registry.get('webhook')).toBeInstanceOf(WebhookConnector);
  });

  it('list() returns info for all four built-in connectors', () => {
    const list = registry.list();
    expect(list).toHaveLength(4);
    const ids = list.map((c) => c.id);
    expect(ids).toContain('telegram');
    expect(ids).toContain('slack');
    expect(ids).toContain('discord');
    expect(ids).toContain('webhook');
  });

  it('get() on an unknown id throws "Connector not found: <id>"', () => {
    expect(() => registry.get('unknown' as ConnectorId)).toThrow('Connector not found: unknown');
  });

  it('register() makes a newly registered connector retrievable via get()', () => {
    const fakeConnector: IConnector<unknown> = {
      id: 'webhook',
      displayName: 'Fake Webhook',
      isConfigured: () => true,
      test: async (): Promise<ConnectorTestResult> => ({ ok: true }),
      deliver: async (_cfg: unknown, _msg: OutboundMessage): Promise<SendOutcome> => ({ ok: true }),
    };

    registry.register(fakeConnector);

    expect(registry.get('webhook')).toBe(fakeConnector);
  });
});
