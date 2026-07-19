// Edge-triggered notification policy with per-session debounce.
// Notify only when a session ENTERS an attention state while armed; notifying
// disarms; leaving the attention set re-arms; re-entry within debounceMs of the
// last notification stays suppressed (flap protection).
import type { SessionActivityState } from '../../shared/ipc-types';

export const ATTENTION_STATES: ReadonlySet<SessionActivityState> = new Set([
  'awaiting-input',
  'awaiting-approval',
  'errored',
  'done',
]);

interface SessionRecord {
  armed: boolean;
  lastNotifyAt: number;
}

export class AttentionPolicy {
  private readonly debounceMs: number;
  private readonly sessions = new Map<string, SessionRecord>();

  constructor(opts?: { debounceMs?: number }) {
    this.debounceMs = opts?.debounceMs ?? 15_000;
  }

  shouldNotify(sessionId: string, state: SessionActivityState, now: number): boolean {
    let rec = this.sessions.get(sessionId);
    if (!rec) {
      rec = { armed: true, lastNotifyAt: -Infinity };
      this.sessions.set(sessionId, rec);
    }

    if (!ATTENTION_STATES.has(state)) {
      rec.armed = true;
      return false;
    }

    if (!rec.armed) return false;
    if (now - rec.lastNotifyAt < this.debounceMs) return false;

    rec.armed = false;
    rec.lastNotifyAt = now;
    return true;
  }

  forget(sessionId: string): void {
    this.sessions.delete(sessionId);
  }
}
