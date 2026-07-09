import { describe, it, expect, afterEach } from 'vitest';
import { PcmRecorder } from './pcm-recorder';

describe('PcmRecorder.isSupported', () => {
  const original = navigator.mediaDevices;
  afterEach(() => { (navigator as any).mediaDevices = original; });

  it('is false when mediaDevices is absent', () => {
    (navigator as any).mediaDevices = undefined;
    expect(PcmRecorder.isSupported()).toBe(false);
  });

  it('is true when getUserMedia exists', () => {
    (navigator as any).mediaDevices = { getUserMedia: () => Promise.resolve({} as MediaStream) };
    expect(PcmRecorder.isSupported()).toBe(true);
  });
});
