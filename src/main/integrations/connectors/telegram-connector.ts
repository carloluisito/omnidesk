import type { ConnectorTestResult, OutboundMessage, SendOutcome, TelegramConfig } from '../../../shared/integration-types';
import { IConnector, outcomeFromNetworkError, outcomeFromResponse } from '../connector';
import { formatTelegramHTML } from '../message-format';

export class TelegramConnector implements IConnector<TelegramConfig> {
  readonly id = 'telegram' as const;
  readonly displayName = 'Telegram';

  isConfigured(cfg: TelegramConfig | undefined): boolean {
    return Boolean(cfg?.botToken && cfg?.chatId);
  }

  async test(cfg: TelegramConfig): Promise<ConnectorTestResult> {
    if (!this.isConfigured(cfg)) return { ok: false, error: 'Bot token and chat id are required' };
    try {
      const me = await fetch(`https://api.telegram.org/bot${cfg.botToken}/getMe`);
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
          text: formatTelegramHTML(msg.event),
          parse_mode: 'HTML',
          disable_web_page_preview: true,
        }),
      });
      return outcomeFromResponse(res);
    } catch (err) {
      return outcomeFromNetworkError(err);
    }
  }
}
