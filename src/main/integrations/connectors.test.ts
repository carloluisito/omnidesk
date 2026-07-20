import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { TelegramConnector } from './connectors/telegram-connector';
import { SlackConnector } from './connectors/slack-connector';
import { DiscordConnector } from './connectors/discord-connector';
import { WebhookConnector } from './connectors/webhook-connector';
import { ConnectorRegistry } from './connector-registry';
import type { OutboundMessage } from '../../shared/integration-types';

const msg: OutboundMessage = {
  text: 'omnidesk · sess — needs your input',
  event: { type: 'attention', at: 1, sessionName: 'sess', repoName: 'omnidesk', state: 'awaiting-input' },
};

function mockFetch(status = 200, headers: Record<string, string> = {}) {
  const fn = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: (n: string) => headers[n.toLowerCase()] ?? null },
    text: async () => 'ok',
  });
  vi.stubGlobal('fetch', fn);
  return fn;
}

beforeEach(() => vi.unstubAllGlobals());
afterEach(() => vi.unstubAllGlobals());

describe('TelegramConnector', () => {
  it('posts sendMessage with HTML text and chat id', async () => {
    const fetchFn = mockFetch();
    const c = new TelegramConnector();
    const out = await c.deliver({ enabled: true, botToken: 'TOK', chatId: '42' }, msg);
    expect(out.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://api.telegram.org/botTOK/sendMessage');
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe('42');
    expect(body.parse_mode).toBe('HTML');
    expect(body.text).toContain('<b>sess</b>');
  });

  it('maps 429 with Retry-After to a retryable outcome', async () => {
    mockFetch(429, { 'retry-after': '7' });
    const out = await new TelegramConnector().deliver({ enabled: true, botToken: 't', chatId: 'c' }, msg);
    expect(out).toMatchObject({ ok: false, retryable: true, retryAfterMs: 7000 });
  });

  it('maps 401 to non-retryable without leaking the token', async () => {
    mockFetch(401);
    const out = await new TelegramConnector().deliver({ enabled: true, botToken: 'SECRET', chatId: 'c' }, msg);
    expect(out.ok).toBe(false);
    if (!out.ok) {
      expect(out.retryable).toBe(false);
      expect(out.error).not.toContain('SECRET');
    }
  });

  it('isConfigured requires token and chat id', () => {
    const c = new TelegramConnector();
    expect(c.isConfigured(undefined)).toBe(false);
    expect(c.isConfigured({ enabled: true, botToken: 't', chatId: '' })).toBe(false);
    expect(c.isConfigured({ enabled: true, botToken: 't', chatId: 'c' })).toBe(true);
  });
});

describe('SlackConnector', () => {
  it('posts {text} to the webhook URL', async () => {
    const fetchFn = mockFetch();
    const out = await new SlackConnector().deliver({ enabled: true, webhookUrl: 'https://hooks.slack.com/x' }, msg);
    expect(out.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/x');
    expect(JSON.parse(init.body)).toEqual({ text: msg.text });
  });
});

describe('DiscordConnector', () => {
  it('posts {content} to the webhook URL', async () => {
    const fetchFn = mockFetch(204);
    const out = await new DiscordConnector().deliver({ enabled: true, webhookUrl: 'https://discord.com/api/webhooks/x' }, msg);
    expect(out.ok).toBe(true);
    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ content: msg.text });
  });
});

describe('WebhookConnector', () => {
  it('posts the raw event with event-type header', async () => {
    const fetchFn = mockFetch();
    const out = await new WebhookConnector().deliver({ enabled: true, url: 'https://example.com/hook' }, msg);
    expect(out.ok).toBe(true);
    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual(msg.event);
    expect(init.headers['x-omnidesk-event']).toBe('attention');
    expect(init.headers['x-omnidesk-signature']).toBeUndefined();
  });

  it('signs the body with HMAC-SHA256 when a secret is set', async () => {
    const fetchFn = mockFetch();
    await new WebhookConnector().deliver({ enabled: true, url: 'https://example.com/hook', secret: 's3cr3t' }, msg);
    const [, init] = fetchFn.mock.calls[0];
    const expected = `sha256=${createHmac('sha256', 's3cr3t').update(init.body).digest('hex')}`;
    expect(init.headers['x-omnidesk-signature']).toBe(expected);
  });

  it('network failure maps to retryable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
    const out = await new WebhookConnector().deliver({ enabled: true, url: 'https://example.com/hook' }, msg);
    expect(out).toMatchObject({ ok: false, retryable: true });
  });
});

describe('ConnectorRegistry', () => {
  it('registers the four built-in connectors', () => {
    const reg = new ConnectorRegistry();
    expect(reg.list().map((c) => c.id).sort()).toEqual(['discord', 'slack', 'telegram', 'webhook']);
    expect(reg.get('telegram').displayName).toBe('Telegram');
    expect(() => reg.get('nope' as never)).toThrow('Connector not found');
  });
});
