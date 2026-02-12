import { describe, it, expect } from 'vitest';
import { filterPostReset, buildBurnRateResult } from './quota-service';

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
});
