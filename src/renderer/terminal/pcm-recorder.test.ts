import { describe, it, expect, afterEach, vi } from 'vitest';
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

describe('PcmRecorder.start error handling', () => {
  const originalMedia = navigator.mediaDevices;
  const originalAudioCtx = (globalThis as any).AudioContext;
  const originalCreateObjURL = (globalThis as any).URL.createObjectURL;
  const originalRevokeObjURL = (globalThis as any).URL.revokeObjectURL;

  afterEach(() => {
    (navigator as any).mediaDevices = originalMedia;
    (globalThis as any).AudioContext = originalAudioCtx;
    (globalThis as any).URL.createObjectURL = originalCreateObjURL;
    (globalThis as any).URL.revokeObjectURL = originalRevokeObjURL;
  });

  function fakeStream() {
    const stop = vi.fn();
    return { stream: { getTracks: () => [{ stop }] } as unknown as MediaStream, stop };
  }

  it('rewrites a permission-denied getUserMedia error into an actionable message', async () => {
    (navigator as any).mediaDevices = {
      getUserMedia: () => Promise.reject(Object.assign(new Error('The user aborted a request.'), { name: 'NotAllowedError' })),
    };
    const rec = new PcmRecorder();
    await expect(rec.start()).rejects.toThrow(/blocked/i);
  });

  it('does not leak the raw worklet AbortError, and releases the mic', async () => {
    const { stream, stop } = fakeStream();
    (navigator as any).mediaDevices = { getUserMedia: () => Promise.resolve(stream) };
    (globalThis as any).URL.createObjectURL = () => 'blob:fake';
    (globalThis as any).URL.revokeObjectURL = () => {};
    // AudioContext whose worklet load fails the way a CSP block does.
    (globalThis as any).AudioContext = class {
      sampleRate = 48000;
      createMediaStreamSource() { return { connect() {} }; }
      audioWorklet = {
        addModule: () => Promise.reject(Object.assign(new Error('The user aborted a request.'), { name: 'AbortError' })),
      };
      close() {}
    };

    const rec = new PcmRecorder();
    // The raw browser message must not reach the caller verbatim.
    await expect(rec.start()).rejects.not.toThrow('The user aborted a request.');
    // The mic track opened before the failure must be stopped (no dangling capture).
    expect(stop).toHaveBeenCalled();
  });
});
