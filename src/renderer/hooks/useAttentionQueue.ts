// Derives the cross-repo "who needs you" queue from session activity state and
// fires a notification when a backgrounded agent starts needing attention.
// This is the routing layer of the supervisory cockpit.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { TabData } from '../components/ui/Tab';
import type { SessionActivityState } from '../../shared/ipc-types';
import type { SessionPreviewsApi } from './useSessionPreviews';
import { dispatchToast } from '../components/ui/ToastContainer';

/** Attention states, most-urgent first. Sessions in any other state (working,
 *  idle, initializing, exited) are calm and never surface. */
const ATTENTION_PRIORITY: Partial<Record<SessionActivityState, number>> = {
  'awaiting-approval': 0,
  'awaiting-input': 1,
  errored: 2,
  done: 3,
};

/** States urgent enough to actively pull the user back with a toast. 'done' is
 *  surfaced in the queue but does not interrupt. */
const TOAST_STATES = new Set<SessionActivityState>(['awaiting-approval', 'awaiting-input', 'errored']);

/** The effective attention state of a session: a failed process is 'errored'
 *  regardless of any stale activityState; otherwise the classifier's state. */
export function effectiveAttentionState(s: TabData): SessionActivityState | undefined {
  if (s.status === 'error') return 'errored';
  if (s.status === 'exited') return undefined; // a stopped session doesn't nag
  return s.activityState;
}

export function isAttentionState(state: SessionActivityState | undefined): boolean {
  return state !== undefined && state in ATTENTION_PRIORITY;
}

export interface AttentionItem {
  session: TabData;
  repoId: string | null;
  repoName: string;
  state: SessionActivityState;
  preview: string;
  lastActivityAt: number;
  acknowledged: boolean;
}

export interface AttentionQueueApi {
  /** All attention-needing sessions, most-urgent first (acknowledged included, sorted last within rank). */
  items: AttentionItem[];
  /** Count of UNacknowledged attention sessions (for badges). */
  count: number;
  /** Mark a session seen so it stops re-alerting until its state changes again. */
  acknowledge: (sessionId: string) => void;
}

export interface UseAttentionQueueOptions {
  sessions: TabData[];
  repoOf: (s: TabData) => { id: string; name: string } | null;
  previews: SessionPreviewsApi;
  activeSessionId: string | null;
  onJump: (sessionId: string) => void;
}

function lastNonEmptyLine(lines: string[] | undefined): string {
  if (!lines) return '';
  for (let i = lines.length - 1; i >= 0; i--) {
    const t = lines[i].trim();
    if (t) return t;
  }
  return '';
}

export function useAttentionQueue(opts: UseAttentionQueueOptions): AttentionQueueApi {
  const { sessions, repoOf, previews, activeSessionId, onJump } = opts;

  // sessionId → the activityState at which it was acknowledged. A session is
  // suppressed only while its state still equals the acknowledged state.
  const [acked, setAcked] = useState<Record<string, SessionActivityState>>({});

  const acknowledge = useCallback((sessionId: string) => {
    const s = sessions.find(x => x.id === sessionId);
    const state = s && effectiveAttentionState(s);
    if (!state) return;
    setAcked(prev => ({ ...prev, [sessionId]: state }));
  }, [sessions]);

  const items = useMemo<AttentionItem[]>(() => {
    const list: AttentionItem[] = [];
    for (const s of sessions) {
      const state = effectiveAttentionState(s);
      if (!isAttentionState(state)) continue;
      const repo = repoOf(s);
      list.push({
        session: s,
        repoId: repo?.id ?? null,
        repoName: repo?.name ?? '',
        state: state!,
        preview: lastNonEmptyLine(previews.outputSnapshots[s.id]),
        lastActivityAt: previews.lastActivityAt[s.id] ?? 0,
        acknowledged: acked[s.id] === state,
      });
    }
    // Unacknowledged first, then by urgency, then longest-waiting first.
    return list.sort((a, b) => {
      if (a.acknowledged !== b.acknowledged) return a.acknowledged ? 1 : -1;
      const pa = ATTENTION_PRIORITY[a.state] ?? 9;
      const pb = ATTENTION_PRIORITY[b.state] ?? 9;
      if (pa !== pb) return pa - pb;
      return a.lastActivityAt - b.lastActivityAt;
    });
  }, [sessions, repoOf, previews.outputSnapshots, previews.lastActivityAt, acked]);

  const count = useMemo(() => items.filter(i => !i.acknowledged).length, [items]);

  // Fire a toast when a BACKGROUNDED session newly enters an urgent state.
  const prevStates = useRef<Map<string, SessionActivityState | undefined>>(new Map());
  const seeded = useRef(false);
  useEffect(() => {
    // First populated pass: seed prior states WITHOUT toasting, so pre-existing
    // states (a renderer reload, or a phone cold-attaching to running sessions)
    // aren't mistaken for fresh transitions.
    const seedingRun = !seeded.current && sessions.length > 0;

    for (const s of sessions) {
      const state = effectiveAttentionState(s);
      const prev = prevStates.current.get(s.id);
      prevStates.current.set(s.id, state);
      if (seedingRun) continue;
      if (state === prev) continue;
      if (!state || !TOAST_STATES.has(state)) continue;
      if (s.id === activeSessionId) continue;        // user is already looking at it
      if (acked[s.id] === state) continue;           // already acknowledged this state
      const label =
        state === 'awaiting-approval' ? 'needs your approval'
        : state === 'awaiting-input' ? 'is waiting for input'
        : 'hit an error';
      dispatchToast('', 'warning', 30000, {
        title: `${s.name} ${label}`,
        body: repoOf(s)?.name ?? '',
        actions: [{ label: 'Jump', onClick: () => onJump(s.id), variant: 'primary' }],
      });
    }
    if (seedingRun) seeded.current = true;

    // Drop prevStates for sessions that no longer exist.
    const live = new Set(sessions.map(s => s.id));
    for (const id of prevStates.current.keys()) {
      if (!live.has(id)) prevStates.current.delete(id);
    }

    // Re-arm acknowledgements: drop any acked entry whose session has LEFT the
    // acknowledged state (changed state, went calm, or closed), so the next
    // entry into an attention state alerts again instead of staying muted.
    const staleAcked = Object.keys(acked).filter(id => {
      const s = sessions.find(x => x.id === id);
      return !s || effectiveAttentionState(s) !== acked[id];
    });
    if (staleAcked.length > 0) {
      setAcked(prev => {
        const next = { ...prev };
        for (const id of staleAcked) delete next[id];
        return next;
      });
    }
  }, [sessions, activeSessionId, acked, repoOf, onJump]);

  return { items, count, acknowledge };
}
