import type { ConnectorTestResult, OutboundMessage, SendOutcome, TelegramConfig } from '../../../shared/integration-types';
import { CONNECTOR_FETCH_TIMEOUT_MS, IConnector, outcomeFromNetworkError, outcomeFromResponse } from '../connector';
import { formatTelegramHTML, truncateHtmlByLines } from '../message-format';

// Telegram sendMessage `text` field hard limit — over this the API returns HTTP 400.
const TELEGRAM_MAX_LENGTH = 4096;

export class TelegramConnector implements IConnector<TelegramConfig> {
  readonly id = 'telegram' as const;
  readonly displayName = 'Telegram';

  isConfigured(cfg: TelegramConfig | undefined): boolean {
    return Boolean(cfg?.botToken && cfg?.chatId);
  }

  async test(cfg: TelegramConfig): Promise<ConnectorTestResult> {
    if (!this.isConfigured(cfg)) return { ok: false, error: 'Bot token and chat id are required' };
    try {
      const me = await fetch(`https://api.telegram.org/bot${cfg.botToken}/getMe`, {
        signal: AbortSignal.timeout(CONNECTOR_FETCH_TIMEOUT_MS),
      });
      if (!me.ok) return { ok: false, error: `getMe failed (HTTP ${me.status}) — check the bot token` };
      const send = await this.deliver(cfg, {
        text: 'OmniDesk test ping ✓',
        event: { type: 'test', at: Date.now(), summary: 'OmniDesk test ping ✓' },
      });
      return send.ok ? { ok: true } : { ok: false, error: send.error };
    } catch (err) {
      return { ok: false, error: err instanceof Error ? err.message : 'network error' };
    }
  }

  async deliver(cfg: TelegramConfig, msg: OutboundMessage): Promise<SendOutcome> {
    try {
      const res = await fetch(`https://api.telegram.org/bot${cfg.botToken}/sendMessage`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          chat_id: cfg.chatId,
          text: truncateHtmlByLines(formatTelegramHTML(msg.event), TELEGRAM_MAX_LENGTH),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
        signal: AbortSignal.timeout(CONNECTOR_FETCH_TIMEOUT_MS),
      });
      return outcomeFromResponse(res);
    } catch (err) {
      return outcomeFromNetworkError(err);
    }
  }
}
