import { describe, it, expect } from 'vitest';
import { detectStateFromTail } from './state-detector';
import type { StateSignals, DetectContext } from './session-state-types';

// Synthetic, order-revealing signal tables. Each table matches a distinct,
// non-overlapping keyword so priority-order tests are unambiguous.
const signals: StateSignals = {
  working: [/WORKING_SPINNER/],
  approval: [/Do you want to proceed\?/, /APPROVAL_MARK/],
  awaitingInput: [/AWAIT_INPUT_MARK/, /\? .*›/],
  fatalError: [/FATAL_ERROR_MARK/, /rate limit/i],
};

function ctx(over: Partial<DetectContext> = {}): DetectContext {
  return { hadOutputSinceView: false, interruptAffordance: false, ...over };
}

describe('detectStateFromTail', () => {
  describe('rule 1: interrupt-affordance veto', () => {
    it('returns working when interruptAffordance is set, even with no tail', () => {
      expect(
        detectStateFromTail('', signals, ctx({ interruptAffordance: true })),
      ).toBe('working');
    });

    it('beats an approval match in the tail', () => {
      const tail = 'Do you want to proceed?';
      expect(
        detectStateFromTail(tail, signals, ctx({ interruptAffordance: true })),
      ).toBe('working');
    });

    it('beats an awaiting-input match in the tail', () => {
      const tail = 'AWAIT_INPUT_MARK';
      expect(
        detectStateFromTail(tail, signals, ctx({ interruptAffordance: true })),
      ).toBe('working');
    });

    it('beats a fatal-error match in the tail', () => {
      const tail = 'FATAL_ERROR_MARK';
      expect(
        detectStateFromTail(tail, signals, ctx({ interruptAffordance: true })),
      ).toBe('working');
    });

    it('beats a done classification (had output)', () => {
      expect(
        detectStateFromTail(
          'some output',
          signals,
          ctx({ interruptAffordance: true, hadOutputSinceView: true }),
        ),
      ).toBe('working');
    });
  });

  describe('rule 2: priority order (approval > awaiting-input > fatal error)', () => {
    it('approval beats awaiting-input when both present', () => {
      const tail = 'AWAIT_INPUT_MARK\nAPPROVAL_MARK';
      expect(detectStateFromTail(tail, signals, ctx())).toBe(
        'awaiting-approval',
      );
    });

    it('approval beats fatal error when both present', () => {
      const tail = 'FATAL_ERROR_MARK\nAPPROVAL_MARK';
      expect(detectStateFromTail(tail, signals, ctx())).toBe(
        'awaiting-approval',
      );
    });

    it('awaiting-input beats fatal error when both present', () => {
      const tail = 'FATAL_ERROR_MARK\nAWAIT_INPUT_MARK';
      expect(detectStateFromTail(tail, signals, ctx())).toBe('awaiting-input');
    });

    it('all three present resolves to approval', () => {
      const tail = 'FATAL_ERROR_MARK\nAWAIT_INPUT_MARK\nAPPROVAL_MARK';
      expect(detectStateFromTail(tail, signals, ctx())).toBe(
        'awaiting-approval',
      );
    });

    it('lone approval → awaiting-approval', () => {
      expect(
        detectStateFromTail('Do you want to proceed?', signals, ctx()),
      ).toBe('awaiting-approval');
    });

    it('lone awaiting-input → awaiting-input', () => {
      expect(
        detectStateFromTail('What is your name? foo ›', signals, ctx()),
      ).toBe('awaiting-input');
    });

    it('lone fatal error → errored', () => {
      expect(
        detectStateFromTail('rate limit exceeded', signals, ctx()),
      ).toBe('errored');
    });
  });

  describe('tail-end anchoring', () => {
    it('does NOT match a keyword buried far above the last 12 non-empty lines', () => {
      const lines = [
        'APPROVAL_MARK', // line 0 — far up, should be scrolled past
      ];
      for (let i = 0; i < 20; i++) {
        lines.push(`filler output line ${i}`);
      }
      const tail = lines.join('\n');
      // 20 filler lines sit between the mark and the end → mark is outside the
      // trailing 12-line window. Had output, so falls through to 'done'.
      expect(
        detectStateFromTail(tail, signals, ctx({ hadOutputSinceView: true })),
      ).toBe('done');
    });

    it('DOES match the same keyword when it sits at the tail end', () => {
      const lines: string[] = [];
      for (let i = 0; i < 20; i++) {
        lines.push(`filler output line ${i}`);
      }
      lines.push('APPROVAL_MARK'); // at the very end — inside the window
      const tail = lines.join('\n');
      expect(
        detectStateFromTail(tail, signals, ctx({ hadOutputSinceView: true })),
      ).toBe('awaiting-approval');
    });

    it('ignores empty/blank lines when counting the trailing window', () => {
      // Mark, then 11 non-empty lines but padded with many blank lines. Since
      // blank lines are not counted, the mark stays inside the 12 non-empty
      // window and still fires.
      const lines = ['APPROVAL_MARK'];
      for (let i = 0; i < 11; i++) {
        lines.push('');
        lines.push(`content ${i}`);
        lines.push('');
      }
      const tail = lines.join('\n');
      expect(detectStateFromTail(tail, signals, ctx())).toBe(
        'awaiting-approval',
      );
    });

    it('drops the mark once >12 non-empty lines follow it', () => {
      const lines = ['APPROVAL_MARK'];
      for (let i = 0; i < 13; i++) {
        lines.push(`content ${i}`);
      }
      const tail = lines.join('\n');
      expect(
        detectStateFromTail(tail, signals, ctx({ hadOutputSinceView: true })),
      ).toBe('done');
    });
  });

  describe('rule 3: done vs idle fallback', () => {
    it('no match + hadOutputSinceView → done (bias to surface)', () => {
      expect(
        detectStateFromTail(
          'just some finished output\nnothing special',
          signals,
          ctx({ hadOutputSinceView: true }),
        ),
      ).toBe('done');
    });

    it('no match + no output since view → idle', () => {
      expect(
        detectStateFromTail(
          'just some finished output\nnothing special',
          signals,
          ctx({ hadOutputSinceView: false }),
        ),
      ).toBe('idle');
    });

    it('empty tail with no output → idle', () => {
      expect(detectStateFromTail('', signals, ctx())).toBe('idle');
    });

    it('empty tail with output flag → done', () => {
      expect(
        detectStateFromTail('', signals, ctx({ hadOutputSinceView: true })),
      ).toBe('done');
    });

    it('whitespace-only tail with no output → idle', () => {
      expect(
        detectStateFromTail('   \n\n  \n', signals, ctx()),
      ).toBe('idle');
    });
  });

  describe('working table is not consulted by the pure detector', () => {
    it('a working-spinner match without interruptAffordance does NOT force working', () => {
      // The pure detector only promotes to 'working' via interruptAffordance;
      // the working table is owned by the stateful classifier's leading edge.
      expect(
        detectStateFromTail(
          'WORKING_SPINNER',
          signals,
          ctx({ hadOutputSinceView: true }),
        ),
      ).toBe('done');
    });
  });

  describe('tail-end anchoring preserves original line order', () => {
    // A multi-line signal (like the real Claude approval triad "1. Yes … 2. Yes,")
    // must match across lines in READING order. Regression: the anchor used to
    // reverse the kept lines, which broke ordered multi-line patterns.
    const orderedSignals: StateSignals = {
      working: [],
      approval: [/\b1\.\s*Yes\b[\s\S]{0,120}\b2\.\s*Yes,/i],
      awaitingInput: [],
      fatalError: [],
    };

    it('matches a multi-line approval pattern when lines are in reading order', () => {
      const tail = [
        'Do you want to proceed?',
        '❯ 1. Yes',
        '  2. Yes, and don\'t ask again',
        '  3. No',
      ].join('\n');
      expect(detectStateFromTail(tail, orderedSignals, ctx())).toBe('awaiting-approval');
    });

    it('only considers the last TAIL_END_LINES — a far-up match does not fire', () => {
      const noise = Array.from({ length: 30 }, (_, i) => `log line ${i}`);
      const tail = ['APPROVAL_MARK', ...noise].join('\n'); // marker scrolled far up
      expect(detectStateFromTail(tail, signals, ctx({ hadOutputSinceView: true }))).toBe('done');
    });

    it('matches the same marker when it is at the tail end', () => {
      const noise = Array.from({ length: 5 }, (_, i) => `log line ${i}`);
      const tail = [...noise, 'APPROVAL_MARK'].join('\n');
      expect(detectStateFromTail(tail, signals, ctx())).toBe('awaiting-approval');
    });
  });

  describe('purity: repeated calls are stable', () => {
    it('same inputs yield same output across calls (no regex state leak)', () => {
      const tail = 'FATAL_ERROR_MARK';
      const c = ctx();
      const first = detectStateFromTail(tail, signals, c);
      const second = detectStateFromTail(tail, signals, c);
      expect(first).toBe('errored');
      expect(second).toBe('errored');
    });
  });
});
