// useSessionPreviews — capture the last N lines of stdout per session
// for the Grid tiles. Strips ANSI escape sequences. Tracks last-activity
// timestamp per session as a side effect.
//
// Carriage-return handling: a lone \r (not part of a \r\n line ending) means
// "move cursor to column 0 and overwrite" — the classic progress-bar redraw.
// We normalize \r\n to \n (real line endings) up front, then collapse any
// remaining \r within a line down to the text after the last \r, so a
// progress bar that redraws in place collapses to its final frame instead of
// leaking every intermediate frame as its own preview line.
import { useEffect, useRef, useState, useCallback } from 'react';
import { stripAnsiCodes } from '../../shared/ansi-strip';

const MAX_LINES = 8;
// Defense-in-depth cap on the carried (not-yet-newline-terminated) partial
// line, in case a session emits an unbounded stream of \r-redraws with no
// \n and no \r (e.g. a hung spinner with no terminator).
const CARRY_LIMIT = 4096;

/** Keep only the text after the last \r in a line — the final overwrite. */
function collapseCR(segment: string): string {
  const idx = segment.lastIndexOf('\r');
  return idx === -1 ? segment : segment.slice(idx + 1);
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
    const combined = (carry + stripAnsiCodes(data)).replace(/\r\n/g, '\n');
    const segments = combined.split('\n');
    const next = segments.slice(0, -1);
    let remainder = collapseCR(segments[segments.length - 1] ?? '');
    if (remainder.length > CARRY_LIMIT) {
      remainder = remainder.slice(remainder.length - CARRY_LIMIT);
    }
    carryRef.current.set(sessionId, remainder);

    if (next.length === 0) {
      pendingRef.current.add(sessionId);
      schedule();
      return;
    }

    const buf = linesRef.current.get(sessionId) ?? [];
    for (const line of next) {
      buf.push(collapseCR(line).trimEnd());
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
