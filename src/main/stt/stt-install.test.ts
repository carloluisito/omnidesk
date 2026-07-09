import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { modelFileName, modelPath, isModelPresent } from './stt-install';

describe('stt-install', () => {
  it('maps model → ggml filename', () => {
    expect(modelFileName('base.en')).toBe('ggml-base.en.bin');
    expect(modelFileName('tiny.en')).toBe('ggml-tiny.en.bin');
  });

  it('isModelPresent is false when file absent', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stt-'));
    expect(isModelPresent(dir, 'base.en')).toBe(false);
    fs.writeFileSync(modelPath(dir, 'base.en'), 'x');
    expect(isModelPresent(dir, 'base.en')).toBe(true);
  });
});
