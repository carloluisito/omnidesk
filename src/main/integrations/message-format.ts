// Pure message formatting for outbound integration events.
// Agent sessions only ever signal awaiting-input (terminal bell) — copy must
// never claim approval-level detail for them.
import type { IntegrationEvent } from '../../shared/integration-types';

const OFFLINE_LINE = 'OmniDesk remote is offline — open the desktop app.';

function stateLabel(event: IntegrationEvent): string {
  switch (event.state) {
    case 'awaiting-approval':
      return event.sessionKind === 'agent' ? 'needs your input' : 'needs approval';
    case 'awaiting-input':
      return 'needs your input';
    case 'errored':
      return 'errored';
    case 'done':
      return 'finished';
    default:
      break;
  }
  switch (event.type) {
    case 'done': return 'finished';
    case 'errored': return 'errored';
    default: return 'needs your input';
  }
}

function subject(event: IntegrationEvent): string {
  const parts: string[] = [];
  if (event.repoName) parts.push(event.repoName);
  if (event.sessionName) parts.push(event.sessionName);
  return parts.join(' · ');
}

function linkLine(event: IntegrationEvent): string {
  return event.link ?? OFFLINE_LINE;
}

export function formatMessage(event: IntegrationEvent): string {
  if (event.type === 'digest' || event.type === 'pr-created' || event.type === 'test') {
    return event.summary ?? '';
  }
  const lines: string[] = [];
  const head = subject(event);
  lines.push(head ? `${head} — ${stateLabel(event)}` : stateLabel(event));
  if (event.reason && event.reason !== 'bell') lines.push(event.reason);
  lines.push(linkLine(event));
  return lines.join('\n');
}

function escapeHTML(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function formatTelegramHTML(event: IntegrationEvent): string {
  if (event.type === 'digest' || event.type === 'pr-created' || event.type === 'test') {
    return escapeHTML(event.summary ?? '');
  }
  const lines: string[] = [];
  const repo = event.repoName ? `${escapeHTML(event.repoName)} · ` : '';
  const name = event.sessionName ? `<b>${escapeHTML(event.sessionName)}</b>` : '';
  const head = `${repo}${name}`.trim();
  lines.push(head ? `${head} — ${escapeHTML(stateLabel(event))}` : escapeHTML(stateLabel(event)));
  if (event.reason && event.reason !== 'bell') lines.push(escapeHTML(event.reason));
  lines.push(event.link ? escapeHTML(event.link) : escapeHTML(OFFLINE_LINE));
  return lines.join('\n');
}

const DEFAULT_TRUNCATION_MARKER = '\n… (truncated)';

/**
 * Truncates plain text to at most `maxLength` characters, keeping the head
 * and dropping from the tail. Appends `marker` when truncation occurs, and
 * the returned string is always `<= maxLength` characters. Safe for bodies
 * with no markup to preserve (Discord's `content`).
 */
export function truncatePlainText(
  text: string,
  maxLength: number,
  marker: string = DEFAULT_TRUNCATION_MARKER
): string {
  if (text.length <= maxLength) return text;
  const budget = Math.max(0, maxLength - marker.length);
  return text.slice(0, budget) + marker.slice(0, maxLength - budget);
}

/**
 * Truncates an HTML-formatted string to at most `maxLength` characters by
 * dropping whole trailing lines — never cutting inside a line. This keeps
 * HTML entities and tags intact because `formatTelegramHTML` always keeps
 * them self-contained within a single line (e.g. a full `<b>…</b>` span, or
 * a fully-escaped `&amp;`), so a `\n` boundary is always a safe cut point.
 *
 * In the pathological case where the very first line alone exceeds
 * `maxLength`, tags are stripped before a hard character slice so the result
 * can never leave an unclosed tag (which Telegram's HTML parse mode would
 * reject outright). The length guarantee (`<= maxLength`) always holds.
 */
export function truncateHtmlByLines(
  text: string,
  maxLength: number,
  marker: string = DEFAULT_TRUNCATION_MARKER
): string {
  if (text.length <= maxLength) return text;
  const budget = maxLength - marker.length;
  const lines = text.split('\n');
  const kept: string[] = [];
  let used = 0;
  for (const line of lines) {
    const addLen = line.length + (kept.length > 0 ? 1 : 0); // +1 for the joining '\n'
    if (used + addLen > budget) break;
    kept.push(line);
    used += addLen;
  }
  if (kept.length > 0) return kept.join('\n') + marker;
  // Even the head line alone doesn't fit: strip tags to avoid an unclosed
  // tag, then hard-slice as plain text.
  const stripped = lines[0].replace(/<\/?[a-z]+>/gi, '');
  return truncatePlainText(stripped, maxLength, marker);
}
