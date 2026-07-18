/** Average N channel buffers (equal length) into one mono buffer. */
export function downmixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array(0);
  if (channels.length === 1) return channels[0];
  const len = channels[0].length;
  const out = new Float32Array(len);
  for (let i = 0; i < len; i++) {
    let sum = 0;
    for (const ch of channels) sum += ch[i];
    out[i] = sum / channels.length;
  }
  return out;
}

/** Linear-interpolation resample. Adequate for speech STT input. */
export function resampleLinear(input: Float32Array, inRate: number, outRate: number): Float32Array {
  if (inRate === outRate) return input;
  const ratio = inRate / outRate;
  const outLen = Math.floor(input.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const idx = Math.floor(pos);
    const frac = pos - idx;
    const a = input[idx] ?? 0;
    const b = input[idx + 1] ?? a;
    out[i] = a + (b - a) * frac;
  }
  return out;
}

export function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

export function int16ToFloat32(buf: ArrayBuffer): Float32Array {
  const i16 = new Int16Array(buf);
  const out = new Float32Array(i16.length);
  for (let i = 0; i < i16.length; i++) out[i] = i16[i] / 0x8000;
  return out;
}

/** Root-mean-square amplitude of a sample buffer (0 for empty input). */
export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0;
  let sum = 0;
  for (let i = 0; i < samples.length; i++) sum += samples[i] * samples[i];
  return Math.sqrt(sum / samples.length);
}

// Perceptual meter range. Speech RMS is tiny (~0.01–0.2), so a linear scale
// barely moves a bar; map dBFS instead so the meter spreads across its travel.
const LEVEL_MIN_DB = -60;
const LEVEL_MAX_DB = -10;

/**
 * Map a linear RMS amplitude to a 0..1 meter level. Converts to dBFS and maps
 * [-60dB, -10dB] → [0,1], clamped. rms <= 0 → 0 (flatline on silence).
 */
export function normalizeLevel(rmsValue: number): number {
  if (rmsValue <= 0) return 0;
  const db = 20 * Math.log10(rmsValue);
  const t = (db - LEVEL_MIN_DB) / (LEVEL_MAX_DB - LEVEL_MIN_DB);
  return Math.max(0, Math.min(1, t));
}
