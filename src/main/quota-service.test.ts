import { describe, it, expect } from 'vitest';
import * as path from 'path';
import * as os from 'os';
import {
  filterPostReset,
  buildBurnRateResult,
  findSamplesWithDelta,
  computeBurnRate,
  resolveClaudeConfigDir,
} from './quota-service';
import type { QuotaAccountMapRule } from '../shared/ipc-types';

function makeSample(fiveHour: number, sevenDay: number, minutesAgo: number) {
  return {
    timestamp: new Date(Date.now() - minutesAgo * 60_000).toISOString(),
    fiveHour,
    sevenDay,
  };
}

describe('filterPostReset', () => {
  it('returns all samples when no reset detected', () => {
    const samples = [
      makeSample(10, 40, 5),
      makeSample(12, 41, 4),
      makeSample(15, 42, 3),
    ];
    expect(filterPostReset(samples)).toEqual(samples);
  });

  it('drops pre-reset samples when 5h quota resets', () => {
    const samples = [
      makeSample(28, 40, 5),
      makeSample(30, 41, 4),
      // --- reset happens here (30 → 1) ---
      makeSample(1, 42, 3),
      makeSample(3, 43, 2),
    ];
    const result = filterPostReset(samples);
    expect(result).toHaveLength(2);
    expect(result[0].fiveHour).toBe(1);
    expect(result[1].fiveHour).toBe(3);
  });

  it('drops pre-reset samples when 7d quota resets', () => {
    const samples = [
      makeSample(5, 50, 4),
      makeSample(6, 55, 3),
      // --- 7d reset (55 → 2) ---
      makeSample(7, 2, 2),
      makeSample(8, 3, 1),
    ];
    const result = filterPostReset(samples);
    expect(result).toHaveLength(2);
    expect(result[0].sevenDay).toBe(2);
  });

  it('uses the LAST reset if multiple resets occur', () => {
    const samples = [
      makeSample(30, 40, 6),
      makeSample(1, 41, 5),  // first reset
      makeSample(20, 42, 4),
      makeSample(2, 43, 3),  // second reset
      makeSample(5, 44, 2),
    ];
    const result = filterPostReset(samples);
    expect(result).toHaveLength(2);
    expect(result[0].fiveHour).toBe(2);
    expect(result[1].fiveHour).toBe(5);
  });

  it('returns input unchanged for single sample', () => {
    const samples = [makeSample(10, 40, 1)];
    expect(filterPostReset(samples)).toEqual(samples);
  });

  it('returns input unchanged for empty array', () => {
    expect(filterPostReset([])).toEqual([]);
  });

  it('ignores small drops (below threshold)', () => {
    const samples = [
      makeSample(12, 40, 3),
      makeSample(10, 39, 2), // small drop of 2, below threshold of 5
      makeSample(11, 40, 1),
    ];
    expect(filterPostReset(samples)).toEqual(samples);
  });
});

describe('buildBurnRateResult', () => {
  it('clamps negative 5h rate to 0', () => {
    const current = makeSample(1, 40, 0);
    const history = [makeSample(30, 38, 2), current];
    const result = buildBurnRateResult(-1621, -5, current, history);
    expect(result.ratePerHour5h).toBe(0);
    expect(result.ratePerHour7d).toBe(0);
  });

  it('returns on-track label for zero rate', () => {
    const current = makeSample(10, 40, 0);
    const history = [makeSample(10, 40, 5), current];
    const result = buildBurnRateResult(0, 0, current, history);
    expect(result.label).toBe('on-track');
    expect(result.projectedTimeToLimit5h).toBeNull();
  });

  it('returns critical label when projected < 60 min', () => {
    const current = makeSample(90, 40, 0);
    const history = [makeSample(80, 38, 5), current];
    // 90% used, rate=20%/hr → remaining 10% / 20 = 0.5hr = 30min
    const result = buildBurnRateResult(20, 1, current, history);
    expect(result.label).toBe('critical');
    expect(result.projectedTimeToLimit5h).toBe(30);
  });

  it('returns elevated label when projected 60-120 min', () => {
    const current = makeSample(80, 40, 0);
    const history = [makeSample(70, 38, 5), current];
    // 80% used, rate=12%/hr → remaining 20% / 12 = 1.67hr = 100min
    const result = buildBurnRateResult(12, 1, current, history);
    expect(result.label).toBe('elevated');
    expect(result.projectedTimeToLimit5h).toBe(100);
  });

  it('computes correct positive burn rate', () => {
    const current = makeSample(20, 45, 0);
    const history = [makeSample(10, 40, 60), current];
    const result = buildBurnRateResult(10, 5, current, history);
    expect(result.ratePerHour5h).toBe(10);
    expect(result.ratePerHour7d).toBe(5);
    expect(result.projectedTimeToLimit5h).toBe(480); // (80/10)*60
  });

  it('rounds rate to 1 decimal place', () => {
    const current = makeSample(15, 40, 0);
    const history = [current];
    const result = buildBurnRateResult(3.456, 1.234, current, history);
    expect(result.ratePerHour5h).toBe(3.5);
    expect(result.ratePerHour7d).toBe(1.2);
  });

  describe('trend', () => {
    it('is stable when history has fewer than 4 samples', () => {
      const current = makeSample(30, 40, 0);
      const history = [makeSample(10, 40, 20), current];
      const result = buildBurnRateResult(0, 0, current, history);
      expect(result.trend).toBe('stable');
    });

    it('is increasing when the recent delta exceeds the older delta by more than 0.5', () => {
      // olderRate = h[1]-h[0] = 1, recentRate = h[3]-h[2] = 2 → 2 > 1+0.5
      const history = [
        makeSample(10, 40, 40),
        makeSample(11, 40, 30),
        makeSample(15, 40, 20),
        makeSample(17, 40, 10),
      ];
      const current = history[3];
      const result = buildBurnRateResult(0, 0, current, history);
      expect(result.trend).toBe('increasing');
    });

    it('is decreasing when the recent delta falls short of the older delta by more than 0.5', () => {
      // olderRate = h[1]-h[0] = 5, recentRate = h[3]-h[2] = 0.5 → 0.5 < 5-0.5
      const history = [
        makeSample(10, 40, 40),
        makeSample(15, 40, 30),
        makeSample(20, 40, 20),
        makeSample(20.5, 40, 10),
      ];
      const current = history[3];
      const result = buildBurnRateResult(0, 0, current, history);
      expect(result.trend).toBe('decreasing');
    });

    it('is stable when the recent and older deltas are within 0.5 of each other', () => {
      // olderRate = h[1]-h[0] = 2, recentRate = h[3]-h[2] = 2.3 → diff 0.3, under threshold
      const history = [
        makeSample(10, 40, 40),
        makeSample(12, 40, 30),
        makeSample(20, 40, 20),
        makeSample(22.3, 40, 10),
      ];
      const current = history[3];
      const result = buildBurnRateResult(0, 0, current, history);
      expect(result.trend).toBe('stable');
    });

    it('reflects the real per-hour burn under non-uniform cadence instead of raw deltas', () => {
      // Older pair ~3min apart: Δ5h=1.5 → 30%/hr.
      // Recent pair ~15s apart (e.g. a session switch forced an uncached
      // refresh): Δ5h=0.2 → 48%/hr — a HIGHER real burn rate.
      // Raw-delta comparison would see 0.2 < 1.5 - 0.5 and wrongly report
      // 'decreasing'; time-normalized rates correctly report 'increasing'.
      const history = [
        makeSample(10, 40, 4), // 4 min ago
        makeSample(11.5, 40, 1), // 1 min ago (3 min after the previous sample)
        makeSample(11.6, 40, 0.25), // 15s ago
        makeSample(11.8, 40, 0), // now (15s after the previous sample)
      ];
      const current = history[3];
      const result = buildBurnRateResult(0, 0, current, history);
      expect(result.trend).toBe('increasing');
    });

    it('falls back to stable when adjacent samples share a timestamp (divide-by-zero guard)', () => {
      const dupTimestamp = new Date(Date.now() - 5 * 60_000).toISOString();
      const history = [
        { timestamp: dupTimestamp, fiveHour: 10, sevenDay: 40 },
        // Duplicate timestamp → olderDeltaMs is 0. Without a guard this
        // divides by zero (Infinity), which would otherwise force the
        // comparison below to report 'decreasing' regardless of the
        // recent pair's real rate.
        { timestamp: dupTimestamp, fiveHour: 15, sevenDay: 40 },
        makeSample(20, 40, 2),
        makeSample(25, 40, 1),
      ];
      const current = history[3];
      const result = buildBurnRateResult(0, 0, current, history);
      expect(result.trend).toBe('stable');
    });
  });

  describe('7d projection fallback', () => {
    it('estimates projectedTimeToLimit7d from the 5h rate when the 7d rate is ~0', () => {
      const current = makeSample(50, 30, 0);
      const history = [current];
      // remaining7d = 70; estimated7dRate = 20 * (5/168); projected = (70 / estimated7dRate) * 60 = 7056
      const result = buildBurnRateResult(20, 0, current, history);
      expect(result.projectedTimeToLimit7d).toBe(7056);
    });

    it('leaves projectedTimeToLimit7d null when both the 5h and 7d rates are 0', () => {
      const current = makeSample(50, 30, 0);
      const history = [current];
      const result = buildBurnRateResult(0, 0, current, history);
      expect(result.projectedTimeToLimit7d).toBeNull();
    });
  });
});

describe('findSamplesWithDelta', () => {
  it('returns null for an empty array', () => {
    expect(findSamplesWithDelta([], 60_000)).toBeNull();
  });

  it('returns null for a single sample', () => {
    const samples = [makeSample(10, 40, 0)];
    expect(findSamplesWithDelta(samples, 60_000)).toBeNull();
  });

  it('returns null when no earlier sample meets the delta threshold', () => {
    // Only other sample is 30s old; minDeltaMs is 1 minute.
    const samples = [makeSample(10, 40, 0.5), makeSample(12, 41, 0)];
    expect(findSamplesWithDelta(samples, 60_000)).toBeNull();
  });

  it('returns the nearest qualifying sample, not the oldest', () => {
    // Scanning backward from the newest sample (0 min ago), the 0.5-min-ago
    // sample doesn't meet the 1-minute threshold, but the 1-min-ago sample does —
    // that nearer sample should win over the older 2- and 3-min-ago samples.
    const samples = [
      makeSample(1, 40, 3),
      makeSample(2, 40, 2),
      makeSample(5, 40, 1),
      makeSample(6, 40, 0.5),
      makeSample(7, 40, 0),
    ];
    const result = findSamplesWithDelta(samples, 60_000);
    expect(result).not.toBeNull();
    expect(result!.first).toBe(samples[2]); // the 1-min-ago sample
    expect(result!.last).toBe(samples[4]);
  });

  it('includes a sample whose delta is exactly minDeltaMs (boundary)', () => {
    // Fixed timestamps (rather than the minutesAgo helper, which calls
    // Date.now() separately per sample and can drift by a millisecond)
    // to pin the delta at exactly 60_000ms.
    const base = Date.now();
    const samples = [
      { timestamp: new Date(base).toISOString(), fiveHour: 5, sevenDay: 40 },
      { timestamp: new Date(base + 60_000).toISOString(), fiveHour: 7, sevenDay: 40 },
    ];
    const result = findSamplesWithDelta(samples, 60_000);
    expect(result).not.toBeNull();
    expect(result!.deltaMs).toBe(60_000);
  });

  it('reports deltaMs as last.timestamp minus first.timestamp', () => {
    const samples = [makeSample(5, 40, 10), makeSample(7, 40, 0)];
    const result = findSamplesWithDelta(samples, 60_000);
    expect(result).not.toBeNull();
    const expectedDeltaMs =
      new Date(samples[1].timestamp).getTime() - new Date(samples[0].timestamp).getTime();
    expect(result!.deltaMs).toBe(expectedDeltaMs);
    expect(result!.first).toBe(samples[0]);
    expect(result!.last).toBe(samples[1]);
  });
});

describe('computeBurnRate', () => {
  // Fixed reference instant + explicit millisecond offsets, rather than the
  // minutesAgo-based makeSample() helper, so the 30-minute recency window and
  // the MIN_DELTA_MS (1 minute) threshold can be pinned exactly.
  const NOW = Date.parse('2026-01-01T12:00:00.000Z');

  function fixedSample(fiveHour: number, sevenDay: number, msAgo: number) {
    return {
      timestamp: new Date(NOW - msAgo).toISOString(),
      fiveHour,
      sevenDay,
    };
  }

  it('returns unknown with dataPoints=0 for an empty history', () => {
    const result = computeBurnRate([], NOW);
    expect(result.label).toBe('unknown');
    expect(result.trend).toBe('unknown');
    expect(result.dataPoints).toBe(0);
  });

  it('returns unknown with dataPoints=1 for a single-sample history', () => {
    const result = computeBurnRate([fixedSample(10, 40, 0)], NOW);
    expect(result.label).toBe('unknown');
    expect(result.dataPoints).toBe(1);
  });

  it('returns unknown when fewer than 2 samples remain after a reset', () => {
    // Reset drops fiveHour from 30 -> 1, leaving only one post-reset sample.
    const history = [
      fixedSample(28, 40, 120_000),
      fixedSample(30, 41, 60_000),
      fixedSample(1, 42, 0),
    ];
    const result = computeBurnRate(history, NOW);
    expect(result.label).toBe('unknown');
    expect(result.dataPoints).toBe(1);
  });

  it('computes the rate from the recent 30-minute window, ignoring older samples', () => {
    const history = [
      fixedSample(50, 60, 60 * 60_000), // 60 min ago — outside the 30-min window
      fixedSample(10, 40, 20 * 60_000), // 20 min ago — inside the window
      fixedSample(20, 42, 0),           // now
    ];
    const result = computeBurnRate(history, NOW);
    // Only the last two samples (20 min apart) should be used: delta 10 over 1/3 hour = 30/hr.
    expect(result.ratePerHour5h).toBe(30);
  });

  it('falls back to the full post-reset history when the recent window has too few samples', () => {
    const history = [
      fixedSample(5, 40, 50 * 60_000),  // 50 min ago — outside the window, used only via fallback
      fixedSample(15, 42, 40 * 60_000), // 40 min ago — also outside the window
      fixedSample(20, 44, 0),           // now — the only sample inside the 30-min window
    ];
    const result = computeBurnRate(history, NOW);
    // recentSamples has just the "now" sample, so findSamplesWithDelta returns null there
    // and the function falls back to the full history: 40 min ago -> now, delta 5 over 2/3 hour.
    expect(result.ratePerHour5h).toBe(7.5);
    expect(result.ratePerHour7d).toBe(3);
  });

  it('falls back to a stable zero rate when no samples have sufficient time delta anywhere', () => {
    const history = [
      fixedSample(10, 40, 20_000), // 20s ago
      fixedSample(11, 40, 10_000), // 10s ago
      fixedSample(12, 40, 0),      // now — all within MIN_DELTA_MS of each other
    ];
    const result = computeBurnRate(history, NOW);
    expect(result.ratePerHour5h).toBe(0);
    expect(result.ratePerHour7d).toBe(0);
    expect(result.label).toBe('on-track');
  });

  it('normalizes by elapsed time, not just value delta, when picking a rate', () => {
    // Same +10 fiveHour delta in both histories, but the elapsed time differs
    // by an order of magnitude, so the resulting hourly rates must differ too.
    const fast = [
      fixedSample(10, 40, 6 * 60_000), // 6 min ago — inside the 30-min window
      fixedSample(20, 42, 0),
    ];
    const slow = [
      fixedSample(10, 40, 60 * 60_000), // 60 min ago — outside the 30-min window, fallback used
      fixedSample(20, 42, 0),
    ];
    const fastResult = computeBurnRate(fast, NOW);
    const slowResult = computeBurnRate(slow, NOW);
    expect(fastResult.ratePerHour5h).toBe(100); // 10 delta / 0.1h
    expect(slowResult.ratePerHour5h).toBe(10);  // 10 delta / 1h
    expect(fastResult.ratePerHour5h).toBeGreaterThan(slowResult.ratePerHour5h);
  });

  it('delegates dataPoints and defaults consistently with getBurnRate defaults for <2 samples', () => {
    const result = computeBurnRate([fixedSample(5, 5, 0)], NOW);
    expect(result).toEqual({
      ratePerHour5h: null,
      ratePerHour7d: null,
      trend: 'unknown',
      projectedTimeToLimit5h: null,
      projectedTimeToLimit7d: null,
      label: 'unknown',
      dataPoints: 1,
    });
  });
});

describe('resolveClaudeConfigDir', () => {
  // quota-service.ts uses the real `os.homedir()` (not electron's mocked
  // app.getPath) for the default dir, so assert against the real value.
  const DEFAULT_DIR = path.join(os.homedir(), '.claude');
  // Custom configDir entries are tilde-expanded via app.getPath('home'),
  // which test/setup-main.ts mocks to '/mock/home'.
  const MOCK_HOME = '/mock/home';

  const accountMap: QuotaAccountMapRule[] = [
    { pathContains: '/repositories/work/', configDir: '~/.claude-work' },
    { pathContains: '/repositories/personal/', configDir: '~/.claude-personal' },
  ];

  it('returns the default dir when no mapping is provided', () => {
    expect(resolveClaudeConfigDir('/home/me/repositories/work/omnidesk')).toBe(DEFAULT_DIR);
  });

  it('returns the default dir when the mapping is an empty array', () => {
    expect(resolveClaudeConfigDir('/home/me/repositories/work/omnidesk', [])).toBe(DEFAULT_DIR);
  });

  it('returns the mapped dir for a working directory matching a rule', () => {
    expect(resolveClaudeConfigDir('/home/me/repositories/work/omnidesk', accountMap)).toBe(
      path.join(MOCK_HOME, '.claude-work')
    );
    expect(resolveClaudeConfigDir('/home/me/repositories/personal/omnidesk', accountMap)).toBe(
      path.join(MOCK_HOME, '.claude-personal')
    );
  });

  it('returns the default dir when the working directory matches no rule', () => {
    expect(resolveClaudeConfigDir('/home/me/repositories/other/omnidesk', accountMap)).toBe(DEFAULT_DIR);
  });

  it('matches case-insensitively and normalizes backslashes to forward slashes', () => {
    expect(resolveClaudeConfigDir('C:\\Users\\me\\Repositories\\WORK\\omnidesk', accountMap)).toBe(
      path.join(MOCK_HOME, '.claude-work')
    );
  });

  it('returns the default dir for an undefined or empty working directory, mapping or not', () => {
    expect(resolveClaudeConfigDir(undefined, accountMap)).toBe(DEFAULT_DIR);
    expect(resolveClaudeConfigDir('', accountMap)).toBe(DEFAULT_DIR);
    expect(resolveClaudeConfigDir()).toBe(DEFAULT_DIR);
  });

  it('supports a bare "~" configDir mapping to the home directory itself', () => {
    const rootMap: QuotaAccountMapRule[] = [{ pathContains: '/repositories/root/', configDir: '~' }];
    expect(resolveClaudeConfigDir('/home/me/repositories/root/omnidesk', rootMap)).toBe(MOCK_HOME);
  });
});
