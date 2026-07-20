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
