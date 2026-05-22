// useSessionPreviews — capture the last N lines of stdout per session
// for the Grid tiles. Strips ANSI escape sequences. Tracks last-activity
// timestamp per session as a side effect.
import { useEffect, useRef, useState, useCallback } from 'react';

const MAX_LINES = 8;
const ANSI_RE = /\x1b\[[0-9;?]*[A-Za-z]/g;

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, '').replace(/\r/g, '');
}

export interface SessionPreviewsApi {
  outputSnapshots: Record<string, string[]>;
  lastActivityAt: Record<string, number>;
  /** Pass-through wrapper: subscribe to onOutput and feed snapshots. */
  attach: (
    onOutput: (callback: (sessionId: string, data: string) => void) => () => void
  ) => () => void;
}

export function useSessionPreviews(): SessionPreviewsApi {
  const [outputSnapshots, setOutputSnapshots] = useState<Record<string, string[]>>({});
  const [lastActivityAt, setLastActivityAt] = useState<Record<string, number>>({});

  // Per-session line buffer (not in state — high-frequency writes would thrash).
  const linesRef = useRef<Map<string, string[]>>(new Map());
  // Carry between writes (partial last line).
  const carryRef = useRef<Map<string, string>>(new Map());
  // Throttle state updates per session.
  const pendingRef = useRef<Set<string>>(new Set());
  const flushTimerRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
      flushTimerRef.current = null;
    }
    if (pendingRef.current.size === 0) return;

    const patchSnap: Record<string, string[]> = {};
    const patchTime: Record<string, number> = {};
    const now = Date.now();
    pendingRef.current.forEach(id => {
      const buf = linesRef.current.get(id);
      if (buf) patchSnap[id] = [...buf];
      patchTime[id] = now;
    });
    pendingRef.current.clear();

    setOutputSnapshots(prev => ({ ...prev, ...patchSnap }));
    setLastActivityAt(prev => ({ ...prev, ...patchTime }));
  }, []);

  const schedule = useCallback(() => {
    if (flushTimerRef.current !== null) return;
    flushTimerRef.current = window.setTimeout(flush, 200);
  }, [flush]);

  const ingest = useCallback((sessionId: string, data: string) => {
    const carry = carryRef.current.get(sessionId) ?? '';
    const combined = carry + stripAnsi(data);
    const segments = combined.split('\n');
    const next = segments.slice(0, -1);
    const remainder = segments[segments.length - 1] ?? '';
    carryRef.current.set(sessionId, remainder);

    if (next.length === 0) {
      pendingRef.current.add(sessionId);
      schedule();
      return;
    }

    const buf = linesRef.current.get(sessionId) ?? [];
    for (const line of next) {
      buf.push(line.trimEnd());
      if (buf.length > MAX_LINES) buf.shift();
    }
    linesRef.current.set(sessionId, buf);
    pendingRef.current.add(sessionId);
    schedule();
  }, [schedule]);

  const attach = useCallback(
    (onOutput: (cb: (id: string, data: string) => void) => () => void): (() => void) => {
      return onOutput(ingest);
    },
    [ingest]
  );

  useEffect(() => () => {
    if (flushTimerRef.current !== null) {
      window.clearTimeout(flushTimerRef.current);
    }
  }, []);

  return { outputSnapshots, lastActivityAt, attach };
}
