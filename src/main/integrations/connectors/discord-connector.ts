import type { ConnectorTestResult, DiscordConfig, OutboundMessage, SendOutcome } from '../../../shared/integration-types';
import { CONNECTOR_FETCH_TIMEOUT_MS, IConnector, outcomeFromNetworkError, outcomeFromResponse } from '../connector';
import { truncatePlainText } from '../message-format';

// Discord webhook `content` field hard limit — over this the API returns HTTP 400.
const DISCORD_MAX_LENGTH = 2000;

export class DiscordConnector implements IConnector<DiscordConfig> {
  readonly id = 'discord' as const;
  readonly displayName = 'Discord';

  isConfigured(cfg: DiscordConfig | undefined): boolean {
    return Boolean(cfg?.webhookUrl);
  }

  async test(cfg: DiscordConfig): Promise<ConnectorTestResult> {
    if (!this.isConfigured(cfg)) return { ok: false, error: 'Webhook URL is required' };
    const send = await this.deliver(cfg, {
      text: 'OmniDesk test ping ✓',
      event: { type: 'test', at: Date.now(), summary: 'OmniDesk test ping ✓' },
    });
    return send.ok ? { ok: true } : { ok: false, error: send.error };
  }

  async deliver(cfg: DiscordConfig, msg: OutboundMessage): Promise<SendOutcome> {
    try {
      const res = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          content: truncatePlainText(msg.text, DISCORD_MAX_LENGTH),
          allowed_mentions: { parse: [] },
        }),
        signal: AbortSignal.timeout(CONNECTOR_FETCH_TIMEOUT_MS),
      });
      return outcomeFromResponse(res);
    } catch (err) {
      return outcomeFromNetworkError(err);
    }
  }
}
