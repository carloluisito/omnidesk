import type { ConnectorTestResult, OutboundMessage, SendOutcome, SlackConfig } from '../../../shared/integration-types';
import { IConnector, outcomeFromNetworkError, outcomeFromResponse } from '../connector';

export class SlackConnector implements IConnector<SlackConfig> {
  readonly id = 'slack' as const;
  readonly displayName = 'Slack';

  isConfigured(cfg: SlackConfig | undefined): boolean {
    return Boolean(cfg?.webhookUrl);
  }

  async test(cfg: SlackConfig): Promise<ConnectorTestResult> {
    if (!this.isConfigured(cfg)) return { ok: false, error: 'Webhook URL is required' };
    const send = await this.deliver(cfg, {
      text: 'OmniDesk test ping ✓',
      event: { type: 'test', at: Date.now(), summary: 'OmniDesk test ping ✓' },
    });
    return send.ok ? { ok: true } : { ok: false, error: send.error };
  }

  async deliver(cfg: SlackConfig, msg: OutboundMessage): Promise<SendOutcome> {
    try {
      const res = await fetch(cfg.webhookUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: msg.text }),
      });
      return outcomeFromResponse(res);
    } catch (err) {
      return outcomeFromNetworkError(err);
    }
  }
}
