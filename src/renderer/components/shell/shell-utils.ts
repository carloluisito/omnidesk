// Helpers shared across the Phase 4 shell components.
// Color tokens, status metadata, initials, agent letters.
import type { TabData } from '../ui/Tab';

export type RepoColor = 'accent' | 'info' | 'success' | 'warn' | 'error' | 'neutral';

export type SessionStatus = 'live' | 'thinking' | 'awaiting' | 'needs-approval' | 'errored' | 'done' | 'idle';

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
  // A decision is blocking the agent — highest attention. Non-pulsing (a
  // decision reads differently from "still running") but the most urgent chip.
  'needs-approval': { color: 'var(--warning)', label: 'needs approval', pulse: false, chip: 'warn' },
  errored:  { color: 'var(--error)',           label: 'errored',        pulse: false, chip: 'err' },
  done:     { color: 'var(--success)',         label: 'done',           pulse: false, chip: 'success' },
  idle:     { color: 'var(--text-tertiary)',   label: 'idle',           pulse: false, chip: '' },
};

/** Single source of truth for "the session's underlying process is gone"
 *  (exited cleanly or errored) — used by both SessionRail and SessionPane so
 *  the rail and the Focus-mode "restart" overlay can never disagree. A
 *  'starting' session is NOT stopped (it hasn't finished launching), which the
 *  previous `status !== 'running'` derivation got wrong. */
export function isSessionStopped(status: TabData['status']): boolean {
  return status === 'exited' || status === 'error';
}

/** Deterministic color from a string — used to color repos that don't have one assigned. */
export const colorFromString = (input: string): RepoColor => {
  const palette: RepoColor[] = ['accent', 'info', 'success', 'warn', 'error', 'neutral'];
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
};

/** Worktree creation request handed to the main process for a new session. */
export interface WorktreeRequest {
  mainRepoPath: string;
  branch: string;
  isNewBranch: boolean;
  baseBranch?: string;
}

/** Resolve the working directory + worktree request for a new session.
 *
 *  Existing mode on the repo's CURRENT branch must NOT create a worktree: git
 *  forbids a second worktree on an already-checked-out branch (it fails with
 *  "'<branch>' is already used by worktree at ..."), and a separate worktree
 *  would be pointless anyway. Run in the main checkout instead — exactly what
 *  the New Session sheet previews for this case. */
export function resolveSessionWorktree(
  form: {
    worktreeMode: 'new' | 'existing' | 'share' | 'current';
    branch?: string;
    baseBranch?: string;
  },
  repo: { path: string; branch?: string },
  shareWorkingDirectory?: string | null,
): { cwd: string; worktree?: WorktreeRequest } {
  const mainRepoPath = repo.path;

  switch (form.worktreeMode) {
    case 'new':
      if (form.branch) {
        return {
          cwd: mainRepoPath,
          worktree: {
            mainRepoPath,
            branch: form.branch,
            isNewBranch: true,
            baseBranch: form.baseBranch || undefined,
          },
        };
      }
      return { cwd: mainRepoPath };

    case 'existing':
      if (form.branch && form.branch !== repo.branch) {
        return {
          cwd: mainRepoPath,
          worktree: { mainRepoPath, branch: form.branch, isNewBranch: false },
        };
      }
      // Current branch (or none picked) → run in the main checkout, no worktree.
      return { cwd: mainRepoPath };

    case 'share':
      return { cwd: shareWorkingDirectory || mainRepoPath };

    case 'current':
    default:
      return { cwd: mainRepoPath };
  }
}

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
