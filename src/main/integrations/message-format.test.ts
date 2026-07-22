import { describe, it, expect } from 'vitest';
import { formatMessage, formatTelegramHTML, formatSlack, truncatePlainText, truncateHtmlByLines } from './message-format';
import type { IntegrationEvent } from '../../shared/integration-types';

function evt(partial: Partial<IntegrationEvent>): IntegrationEvent {
  return { type: 'attention', at: 1750000000000, ...partial };
}

describe('formatMessage', () => {
  it('agent awaiting-input says "needs your input" and never mentions approval', () => {
    const text = formatMessage(evt({
      sessionKind: 'agent', state: 'awaiting-input', reason: 'bell',
      repoName: 'omnidesk', sessionName: 'fix-terminal-garble',
    }));
    expect(text).toContain('omnidesk');
    expect(text).toContain('fix-terminal-garble');
    expect(text).toContain('needs your input');
    expect(text.toLowerCase()).not.toContain('approval');
  });

  it('shell awaiting-approval says "needs approval"', () => {
    const text = formatMessage(evt({
      sessionKind: 'shell', state: 'awaiting-approval',
      repoName: 'omnidesk', sessionName: 'deploy',
    }));
    expect(text).toContain('needs approval');
  });

  it('agent awaiting-approval says "needs approval" and is not downgraded to "needs your input"', () => {
    const text = formatMessage(evt({
      sessionKind: 'agent', state: 'awaiting-approval',
      repoName: 'omnidesk', sessionName: 'fix-terminal-garble',
    }));
    expect(text).toContain('needs approval');
    expect(text).not.toContain('needs your input');
  });

  it('agent done says "finished"', () => {
    const text = formatMessage(evt({
      sessionKind: 'agent', type: 'done', state: 'done', sessionName: 's',
    }));
    expect(text).toContain('finished');
  });

  it('done and errored have distinct copy', () => {
    expect(formatMessage(evt({ type: 'done', state: 'done', sessionName: 's' }))).toContain('finished');
    expect(formatMessage(evt({ type: 'errored', state: 'errored', sessionName: 's' }))).toContain('errored');
  });

  it('appends the deep link when present', () => {
    const text = formatMessage(evt({ sessionName: 's', state: 'awaiting-input', link: 'https://x.trycloudflare.com/?token=t&session=abc' }));
    expect(text).toContain('https://x.trycloudflare.com/?token=t&session=abc');
    expect(text).not.toContain('offline');
  });

  it('appends the offline line when link is absent', () => {
    const text = formatMessage(evt({ sessionName: 's', state: 'awaiting-input' }));
    expect(text).toContain('remote is offline');
  });

  it('digest / pr-created / test use summary', () => {
    expect(formatMessage(evt({ type: 'digest', summary: '2 working · 1 needs you' }))).toContain('2 working · 1 needs you');
    expect(formatMessage(evt({ type: 'pr-created', summary: 'https://github.com/a/b/pull/7' }))).toContain('pull/7');
    expect(formatMessage(evt({ type: 'test', summary: 'OmniDesk test ping' }))).toContain('test ping');
  });
});

describe('formatTelegramHTML', () => {
  it('escapes HTML in names', () => {
    const text = formatTelegramHTML(evt({ sessionName: 'a<b&c', repoName: 'r<p', state: 'awaiting-input' }));
    expect(text).toContain('a&lt;b&amp;c');
    expect(text).toContain('r&lt;p');
    expect(text).not.toMatch(/<b&c/);
  });

  it('bolds the session name', () => {
    const text = formatTelegramHTML(evt({ sessionName: 'sess', state: 'awaiting-input' }));
    expect(text).toContain('<b>sess</b>');
  });
});

describe('formatSlack', () => {
  it('escapes &, <, > in names and reason, with & escaped first', () => {
    const text = formatSlack(evt({
      sessionName: '<Button>', repoName: 'a<b&c', reason: 'A & B', state: 'awaiting-input',
    }));
    expect(text).toContain('&lt;Button&gt;');
    expect(text).toContain('a&lt;b&amp;c');
    expect(text).toContain('A &amp; B');
    expect(text).not.toMatch(/<Button>/);
    expect(text).not.toMatch(/&(?!amp;|lt;|gt;)/); // no unescaped bare "&"
  });

  it('does not bold the session name (no HTML markup for Slack)', () => {
    const text = formatSlack(evt({ sessionName: 'sess', state: 'awaiting-input' }));
    expect(text).not.toContain('<b>');
    expect(text).toContain('sess');
  });

  it('leaves the deep link raw/unescaped so Slack can auto-link it', () => {
    const text = formatSlack(evt({
      sessionName: 's', state: 'awaiting-input',
      link: 'https://x.trycloudflare.com/?token=t&session=abc',
    }));
    expect(text).toContain('https://x.trycloudflare.com/?token=t&session=abc');
    expect(text).not.toContain('&amp;session=abc');
  });

  it('digest / pr-created / test escape the summary', () => {
    expect(formatSlack(evt({ type: 'digest', summary: '<all> & done' }))).toContain('&lt;all&gt; &amp; done');
  });
});

describe('truncatePlainText', () => {
  it('returns the text unchanged when under the limit', () => {
    expect(truncatePlainText('short', 100)).toBe('short');
  });

  it('truncates to at most maxLength and appends the marker', () => {
    const result = truncatePlainText('x'.repeat(2500), 2000);
    expect(result.length).toBeLessThanOrEqual(2000);
    expect(result.endsWith('(truncated)')).toBe(true);
  });

  it('never exceeds maxLength even when the marker itself is long', () => {
    const result = truncatePlainText('x'.repeat(50), 10, '\n… (truncated)');
    expect(result.length).toBeLessThanOrEqual(10);
  });
});

describe('truncateHtmlByLines', () => {
  it('returns the text unchanged when under the limit', () => {
    const text = 'head\nbody\nfoot';
    expect(truncateHtmlByLines(text, 100)).toBe(text);
  });

  it('drops whole trailing lines and never splits an HTML entity or tag', () => {
    const lines = ['<b>head</b>', ...Array.from({ length: 500 }, (_, i) => `line ${i} &amp; more`)];
    const text = lines.join('\n');
    const result = truncateHtmlByLines(text, 200);
    expect(result.length).toBeLessThanOrEqual(200);
    // Every kept line (all but the appended marker) must be one of the original whole lines.
    const marker = '\n… (truncated)';
    const withoutMarker = result.endsWith(marker) ? result.slice(0, -marker.length) : result;
    const keptLines = withoutMarker.split('\n');
    for (const line of keptLines) {
      expect(lines).toContain(line);
    }
    expect(result).not.toMatch(/&(?!amp;)/); // no dangling/partial "&" entity
  });

  it('falls back to a stripped, hard-sliced plain-text cut when the first line alone exceeds maxLength', () => {
    const hugeLine = `<b>${'z'.repeat(300)}</b>`;
    const result = truncateHtmlByLines(hugeLine, 100);
    expect(result.length).toBeLessThanOrEqual(100);
    // Tags must be stripped in this fallback — no unclosed <b> left dangling.
    expect(result).not.toContain('<b>');
    expect(result).not.toContain('</b>');
  });
});
