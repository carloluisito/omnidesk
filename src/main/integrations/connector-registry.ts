// Mirrors ProviderRegistry: constructor self-registers the built-in connectors.
import type { ConnectorId } from '../../shared/integration-types';
import { IConnector } from './connector';
import { TelegramConnector } from './connectors/telegram-connector';
import { SlackConnector } from './connectors/slack-connector';
import { DiscordConnector } from './connectors/discord-connector';
import { WebhookConnector } from './connectors/webhook-connector';

export class ConnectorRegistry {
  private readonly connectors = new Map<ConnectorId, IConnector<unknown>>();

  constructor() {
    this.register(new TelegramConnector() as IConnector<unknown>);
    this.register(new SlackConnector() as IConnector<unknown>);
    this.register(new DiscordConnector() as IConnector<unknown>);
    this.register(new WebhookConnector() as IConnector<unknown>);
  }

  register(connector: IConnector<unknown>): void {
    this.connectors.set(connector.id, connector);
  }

  get(id: ConnectorId): IConnector<unknown> {
    const connector = this.connectors.get(id);
    if (!connector) throw new Error(`Connector not found: ${id}`);
    return connector;
  }

  list(): { id: ConnectorId; displayName: string }[] {
    return Array.from(this.connectors.values()).map((c) => ({ id: c.id, displayName: c.displayName }));
  }
}
