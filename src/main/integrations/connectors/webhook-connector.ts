import { createHmac } from 'crypto';
import type { ConnectorTestResult, OutboundMessage, SendOutcome, WebhookConfig } from '../../../shared/integration-types';
import { CONNECTOR_FETCH_TIMEOUT_MS, IConnector, outcomeFromNetworkError, outcomeFromResponse } from '../connector';

/** Generic webhook: POSTs the raw IntegrationEvent JSON — the escape hatch for
 * custom plumbing (n8n, Zapier, home-grown bots). */
export class WebhookConnector implements IConnector<WebhookConfig> {
  readonly id = 'webhook' as const;
  readonly displayName = 'Webhook';

  isConfigured(cfg: WebhookConfig | undefined): boolean {
    return Boolean(cfg?.url);
  }

  async test(cfg: WebhookConfig): Promise<ConnectorTestResult> {
    if (!this.isConfigured(cfg)) return { ok: false, error: 'URL is required' };
    const send = await this.deliver(cfg, {
      text: 'OmniDesk test ping ✓',
      event: { type: 'test', at: Date.now(), summary: 'OmniDesk test ping ✓' },
    });
    return send.ok ? { ok: true } : { ok: false, error: send.error };
  }

  async deliver(cfg: WebhookConfig, msg: OutboundMessage): Promise<SendOutcome> {
    try {
      const body = JSON.stringify(msg.event);
      const headers: Record<string, string> = {
        'content-type': 'application/json',
        'x-omnidesk-event': msg.event.type,
      };
      if (cfg.secret) {
        headers['x-omnidesk-signature'] = `sha256=${createHmac('sha256', cfg.secret).update(body).digest('hex')}`;
      }
      const res = await fetch(cfg.url, {
        method: 'POST',
        headers,
        body,
        signal: AbortSignal.timeout(CONNECTOR_FETCH_TIMEOUT_MS),
      });
      return outcomeFromResponse(res);
    } catch (err) {
      return outcomeFromNetworkError(err);
    }
  }
}
