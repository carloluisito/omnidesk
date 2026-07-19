import { describe, it, expect } from 'vitest';
import { formatMessage, formatTelegramHTML } from './message-format';
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
