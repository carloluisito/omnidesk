import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useSessionPreviews } from './useSessionPreviews';

/** Minimal fake onOutput registrar mimicking the real IPC subscription shape. */
function makeEmitter() {
  let cb: ((sessionId: string, data: string) => void) | null = null;
  return {
    onOutput: (callback: (sessionId: string, data: string) => void) => {
      cb = callback;
      return () => {
        cb = null;
      };
    },
    emit: (sessionId: string, data: string) => cb?.(sessionId, data),
  };
}

describe('useSessionPreviews', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('collapses a \\r-driven progress bar to its last frame', () => {
    const { result } = renderHook(() => useSessionPreviews());
    const emitter = makeEmitter();
    act(() => {
      result.current.attach(emitter.onOutput);
    });

    act(() => {
      emitter.emit('s1', 'Progress 1%\rProgress 50%\rProgress 100%\n');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.outputSnapshots.s1).toEqual(['Progress 100%']);
  });

  it('collapses a progress bar whose frames arrive across separate writes', () => {
    const { result } = renderHook(() => useSessionPreviews());
    const emitter = makeEmitter();
    act(() => {
      result.current.attach(emitter.onOutput);
    });

    act(() => {
      emitter.emit('s1', 'Progress 1%\r');
      emitter.emit('s1', 'Progress 50%\r');
      emitter.emit('s1', 'Progress 100%\n');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.outputSnapshots.s1).toEqual(['Progress 100%']);
  });

  it('caps the carried partial line so a redraw-only stream cannot grow unbounded', () => {
    const { result } = renderHook(() => useSessionPreviews());
    const emitter = makeEmitter();
    act(() => {
      result.current.attach(emitter.onOutput);
    });

    // No \n at all - a spinner that keeps redrawing without ever terminating
    // the line. Send several writes, none of which flush a completed line,
    // and confirm the internal carry doesn't grow proportionally with the
    // amount of data seen: flush a final \n and check the surfaced line is
    // bounded by the cap rather than the full accumulated history.
    act(() => {
      for (let i = 0; i < 50; i++) {
        emitter.emit('s1', `frame-${i}-`.repeat(200)); // long junk with no \r or \n
      }
      emitter.emit('s1', '\n');
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    const lines = result.current.outputSnapshots.s1;
    expect(lines).toHaveLength(1);
    expect(lines[0].length).toBeLessThanOrEqual(4096);
  });

  it('leaves normal multi-line \\n output unchanged and keeps only the last MAX_LINES', () => {
    const { result } = renderHook(() => useSessionPreviews());
    const emitter = makeEmitter();
    act(() => {
      result.current.attach(emitter.onOutput);
    });

    act(() => {
      const lines = Array.from({ length: 10 }, (_, i) => `line ${i}`).join('\n') + '\n';
      emitter.emit('s1', lines);
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(result.current.outputSnapshots.s1).toEqual([
      'line 2', 'line 3', 'line 4', 'line 5', 'line 6', 'line 7', 'line 8', 'line 9',
    ]);
  });

  it('throttles state updates to a single flush per 200ms window and updates lastActivityAt', () => {
    const { result } = renderHook(() => useSessionPreviews());
    const emitter = makeEmitter();
    act(() => {
      result.current.attach(emitter.onOutput);
    });

    act(() => {
      emitter.emit('s1', 'a\n');
    });
    // Not flushed yet - throttle window hasn't elapsed.
    expect(result.current.outputSnapshots.s1).toBeUndefined();

    act(() => {
      emitter.emit('s1', 'b\n');
      vi.advanceTimersByTime(200);
    });

    expect(result.current.outputSnapshots.s1).toEqual(['a', 'b']);
    expect(result.current.lastActivityAt.s1).toBeGreaterThan(0);
  });

  it('prune drops all state for sessions no longer live, keeping the survivor intact', () => {
    const { result } = renderHook(() => useSessionPreviews());
    const emitter = makeEmitter();
    act(() => {
      result.current.attach(emitter.onOutput);
    });

    act(() => {
      emitter.emit('s1', 'session one line\n');
      emitter.emit('s2', 'session two line\n');
      vi.advanceTimersByTime(200);
    });

    expect(result.current.outputSnapshots.s1).toEqual(['session one line']);
    expect(result.current.outputSnapshots.s2).toEqual(['session two line']);
    expect(result.current.lastActivityAt.s1).toBeGreaterThan(0);
    expect(result.current.lastActivityAt.s2).toBeGreaterThan(0);

    act(() => {
      result.current.prune(['s1']);
    });

    expect(result.current.outputSnapshots.s1).toEqual(['session one line']);
    expect(result.current.outputSnapshots).not.toHaveProperty('s2');
    expect(result.current.lastActivityAt.s1).toBeGreaterThan(0);
    expect(result.current.lastActivityAt).not.toHaveProperty('s2');

    // Internal buffers for the pruned session are gone too: re-emitting for s2
    // after prune starts it fresh rather than appending to old (now-deleted)
    // buffered lines.
    act(() => {
      emitter.emit('s2', 'brand new after prune\n');
      vi.advanceTimersByTime(200);
    });
    expect(result.current.outputSnapshots.s2).toEqual(['brand new after prune']);
  });

  it('prune is a no-op (identity-stable) when nothing needs to be removed', () => {
    const { result } = renderHook(() => useSessionPreviews());
    const emitter = makeEmitter();
    act(() => {
      result.current.attach(emitter.onOutput);
    });

    act(() => {
      emitter.emit('s1', 'hello\n');
      vi.advanceTimersByTime(200);
    });

    const snapshotsBefore = result.current.outputSnapshots;
    const activityBefore = result.current.lastActivityAt;

    act(() => {
      result.current.prune(['s1']);
    });

    expect(result.current.outputSnapshots).toBe(snapshotsBefore);
    expect(result.current.lastActivityAt).toBe(activityBefore);
  });
});
