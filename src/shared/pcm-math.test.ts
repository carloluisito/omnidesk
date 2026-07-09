import { describe, it, expect } from 'vitest';
import { downmixToMono, resampleLinear, floatToInt16, int16ToFloat32 } from './pcm-math';

describe('pcm-math', () => {
  it('downmixes stereo to mono by averaging', () => {
    const l = new Float32Array([1, 0, -1]);
    const r = new Float32Array([1, 1, -1]);
    expect(Array.from(downmixToMono([l, r]))).toEqual([1, 0.5, -1]);
  });

  it('downmixToMono returns empty for no channels', () => {
    expect(downmixToMono([]).length).toBe(0);
  });

  it('resampleLinear halves length when output rate is half input rate', () => {
    const input = new Float32Array([0, 1, 0, 1, 0, 1, 0, 1]); // 8 @ 32000
    const out = resampleLinear(input, 32000, 16000);
    expect(out.length).toBe(4);
  });

  it('resampleLinear interpolates at fractional positions', () => {
    // ratio = 3/2 = 1.5; outLen = floor(4/1.5) = 2
    // i=0: pos=0 -> 0 ; i=1: pos=1.5 -> input[1]=10 + (20-10)*0.5 = 15
    const out = resampleLinear(new Float32Array([0, 10, 20, 30]), 3, 2);
    expect(out.length).toBe(2);
    expect(out[0]).toBeCloseTo(0, 5);
    expect(out[1]).toBeCloseTo(15, 5);
  });

  it('floatToInt16 clamps and scales', () => {
    const out = floatToInt16(new Float32Array([0, 1, -1, 2]));
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(32767);
    expect(out[2]).toBe(-32768);
    expect(out[3]).toBe(32767); // clamped
  });

  it('int16ToFloat32 round-trips within tolerance', () => {
    const i16 = floatToInt16(new Float32Array([0.5, -0.5]));
    const f = int16ToFloat32(i16.buffer);
    expect(f[0]).toBeCloseTo(0.5, 2);
    expect(f[1]).toBeCloseTo(-0.5, 2);
  });
});
