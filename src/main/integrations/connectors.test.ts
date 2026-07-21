import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHmac } from 'crypto';
import { TelegramConnector } from './connectors/telegram-connector';
import { SlackConnector } from './connectors/slack-connector';
import { DiscordConnector } from './connectors/discord-connector';
import { WebhookConnector } from './connectors/webhook-connector';
import { ConnectorRegistry } from './connector-registry';
import { formatSlack } from './message-format';
import { outcomeFromResponse, MAX_RETRY_AFTER_MS } from './connector';
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

  it('truncates text over the 4096 char limit without breaking HTML tags/entities', async () => {
    const fetchFn = mockFetch();
    const longMsg: OutboundMessage = {
      text: 'x',
      event: {
        type: 'attention',
        at: 1,
        sessionName: 'a<b>&c'.repeat(200), // forces escaping + long single "head" line
        repoName: 'omnidesk',
        state: 'awaiting-input',
        reason: Array.from({ length: 300 }, (_, i) => `line ${i}`).join('\n'),
      },
    };
    const out = await new TelegramConnector().deliver({ enabled: true, botToken: 't', chatId: 'c' }, longMsg);
    expect(out.ok).toBe(true);
    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.text.length).toBeLessThanOrEqual(4096);
    // No unclosed <b> tag and no split-in-half HTML entity.
    expect((body.text.match(/<b>/g) ?? []).length).toBe((body.text.match(/<\/b>/g) ?? []).length);
    expect(body.text).not.toMatch(/&(amp|lt|gt);?$/); // dangling partial entity at the cut
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
  it('posts {text} formatted via formatSlack (not the raw msg.text) to the webhook URL', async () => {
    const fetchFn = mockFetch();
    const out = await new SlackConnector().deliver({ enabled: true, webhookUrl: 'https://hooks.slack.com/x' }, msg);
    expect(out.ok).toBe(true);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toBe('https://hooks.slack.com/x');
    expect(JSON.parse(init.body)).toEqual({ text: formatSlack(msg.event) });
  });

  it('escapes &, <, > from session name and reason in the posted body', async () => {
    const fetchFn = mockFetch();
    const specialMsg: OutboundMessage = {
      text: 'unused',
      event: {
        type: 'attention', at: 1, sessionName: '<Button>', repoName: 'omnidesk',
        state: 'awaiting-input', reason: 'A & B',
      },
    };
    const out = await new SlackConnector().deliver({ enabled: true, webhookUrl: 'https://hooks.slack.com/x' }, specialMsg);
    expect(out.ok).toBe(true);
    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.text).toContain('&lt;Button&gt;');
    expect(body.text).toContain('A &amp; B');
    expect(body.text).not.toContain('<Button>');
  });
});

describe('DiscordConnector', () => {
  it('posts {content, allowed_mentions} to the webhook URL', async () => {
    const fetchFn = mockFetch(204);
    const out = await new DiscordConnector().deliver({ enabled: true, webhookUrl: 'https://discord.com/api/webhooks/x' }, msg);
    expect(out.ok).toBe(true);
    const [, init] = fetchFn.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ content: msg.text, allowed_mentions: { parse: [] } });
  });

  it('suppresses mentions even when the text contains @everyone', async () => {
    const fetchFn = mockFetch(204);
    const mentionMsg: OutboundMessage = { text: '@everyone check this out', event: msg.event };
    const out = await new DiscordConnector().deliver({ enabled: true, webhookUrl: 'https://discord.com/api/webhooks/x' }, mentionMsg);
    expect(out.ok).toBe(true);
    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.content).toContain('@everyone');
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it('truncates content over the 2000 char limit', async () => {
    const fetchFn = mockFetch(204);
    const longMsg: OutboundMessage = { text: 'y'.repeat(2500), event: msg.event };
    const out = await new DiscordConnector().deliver({ enabled: true, webhookUrl: 'https://discord.com/api/webhooks/x' }, longMsg);
    expect(out.ok).toBe(true);
    const [, init] = fetchFn.mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.content.length).toBeLessThanOrEqual(2000);
    expect(body.content).toContain('truncated');
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

describe('outcomeFromResponse — Retry-After parsing (#144)', () => {
  function res429(retryAfter: string | null) {
    return { status: 429, headers: { get: (n: string) => (n.toLowerCase() === 'retry-after' ? retryAfter : null) } };
  }

  it('missing header → retryAfterMs undefined (falls back to queue backoff)', () => {
    expect(outcomeFromResponse(res429(null))).toMatchObject({ ok: false, retryable: true, retryAfterMs: undefined });
  });

  it('non-numeric, non-date header → retryAfterMs undefined', () => {
    expect(outcomeFromResponse(res429('not-a-number-or-date')).retryAfterMs).toBeUndefined();
  });

  it('negative or zero seconds → retryAfterMs undefined', () => {
    expect(outcomeFromResponse(res429('-5')).retryAfterMs).toBeUndefined();
    expect(outcomeFromResponse(res429('0')).retryAfterMs).toBeUndefined();
  });

  it('sane mid-range seconds pass through unclamped', () => {
    expect(outcomeFromResponse(res429('30')).retryAfterMs).toBe(30_000);
  });

  it('out-of-range seconds (~317 years) clamp to MAX_RETRY_AFTER_MS, never overflow setTimeout', () => {
    const out = outcomeFromResponse(res429('9999999999'));
    expect(out.retryAfterMs).toBe(MAX_RETRY_AFTER_MS);
    expect(out.retryAfterMs!).toBeLessThan(2 ** 31 - 1);
  });

  it('HTTP-date form in the near future yields a positive, clamped delay', () => {
    const future = new Date(Date.now() + 10_000).toUTCString();
    const out = outcomeFromResponse(res429(future));
    expect(out.retryAfterMs).toBeGreaterThan(0);
    expect(out.retryAfterMs!).toBeLessThanOrEqual(MAX_RETRY_AFTER_MS);
  });

  it('HTTP-date form far in the future clamps to MAX_RETRY_AFTER_MS', () => {
    const farFuture = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toUTCString();
    expect(outcomeFromResponse(res429(farFuture)).retryAfterMs).toBe(MAX_RETRY_AFTER_MS);
  });

  it('HTTP-date form in the past → retryAfterMs undefined', () => {
    const past = new Date(Date.now() - 10_000).toUTCString();
    expect(outcomeFromResponse(res429(past)).retryAfterMs).toBeUndefined();
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
