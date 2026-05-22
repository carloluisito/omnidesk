// Helpers shared across the Phase 4 shell components.
// Color tokens, status metadata, initials, agent letters.

export type RepoColor = 'accent' | 'info' | 'success' | 'warn' | 'error' | 'neutral';

export type SessionStatus = 'live' | 'thinking' | 'awaiting' | 'errored' | 'done' | 'idle';

export const colorBg = (color: RepoColor | string | undefined): string => {
  switch (color) {
    case 'accent':  return 'rgba(0,201,167,.18)';
    case 'info':    return 'rgba(124,143,255,.18)';
    case 'success': return 'rgba(61,214,140,.18)';
    case 'warn':    return 'rgba(247,168,74,.18)';
    case 'error':   return 'rgba(247,103,142,.18)';
    case 'neutral':
    default:        return 'rgba(255,255,255,.08)';
  }
};

export const colorFg = (color: RepoColor | string | undefined): string => {
  switch (color) {
    case 'accent':  return 'var(--accent)';
    case 'info':    return 'var(--accent-2)';
    case 'success': return 'var(--success)';
    case 'warn':    return 'var(--warning)';
    case 'error':   return 'var(--error)';
    case 'neutral':
    default:        return 'var(--text-secondary)';
  }
};

export const initials = (name: string): string =>
  name
    .replace(/[^\w\s]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

export const agentLetter = (agent: string | undefined): string => {
  if (!agent) return '?';
  if (agent === 'claude') return 'C';
  if (agent === 'codex') return 'X';
  return agent[0].toUpperCase();
};

export const agentColor = (agent: string | undefined): string => {
  if (agent === 'claude') return 'var(--accent)';
  if (agent === 'codex')  return 'var(--accent-2)';
  return 'var(--text-secondary)';
};

export interface StatusMeta {
  color: string;
  label: string;
  pulse: boolean;
  chip: '' | 'success' | 'accent' | 'warn' | 'err';
}

export const STATUS_META: Record<SessionStatus, StatusMeta> = {
  live:     { color: 'var(--success)',         label: 'live',           pulse: true,  chip: 'success' },
  thinking: { color: 'var(--accent)',          label: 'thinking',       pulse: true,  chip: 'accent' },
  awaiting: { color: 'var(--warning)',         label: 'awaiting input', pulse: false, chip: 'warn' },
  errored:  { color: 'var(--error)',           label: 'errored',        pulse: false, chip: 'err' },
  done:     { color: 'var(--success)',         label: 'done',           pulse: false, chip: 'success' },
  idle:     { color: 'var(--text-tertiary)',   label: 'idle',           pulse: false, chip: '' },
};

/** Deterministic color from a string — used to color repos that don't have one assigned. */
export const colorFromString = (input: string): RepoColor => {
  const palette: RepoColor[] = ['accent', 'info', 'success', 'warn', 'error', 'neutral'];
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
};

/** Format a Date or epoch ms as "Nh ago", "Nd ago", etc. — used in rail meta. */
export const formatLastActive = (date: Date | number | undefined): string => {
  if (!date) return '—';
  const t = typeof date === 'number' ? date : date.getTime();
  const diff = Date.now() - t;
  if (diff < 0) return 'just now';
  const s = Math.floor(diff / 1000);
  if (s < 60)        return s <= 5 ? 'just now' : `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60)        return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 24)        return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7)         return `${d}d ago`;
  return new Date(t).toLocaleDateString();
};
