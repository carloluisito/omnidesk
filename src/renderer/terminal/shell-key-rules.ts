import type { SessionKind } from '../../shared/ipc-types';

/** Legacy-mode Ctrl+C opens the close-confirm dialog only for agent sessions.
 *  Shell sessions must let Ctrl+C through to interrupt the foreground command. */
export function shouldShowCloseDialog(
  data: string,
  kittyFlags: number,
  kind: SessionKind | undefined,
): boolean {
  return data === '\x03' && kittyFlags === 0 && kind !== 'shell';
}

/** Ctrl/Shift/Alt/Cmd+Enter inserts a literal newline — a Claude-input
 *  affordance. Shell sessions want a real Enter, so this is agent-only. */
export function isNewlineChord(
  e: { key: string; ctrlKey: boolean; shiftKey: boolean; altKey: boolean; metaKey: boolean },
  kind: SessionKind | undefined,
): boolean {
  return kind !== 'shell'
    && e.key === 'Enter'
    && (e.ctrlKey || e.shiftKey || e.altKey || e.metaKey);
}
