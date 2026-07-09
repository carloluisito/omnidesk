import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSTT } from './useSTT';

// `start`/`stop`/`dispose` on the real PcmRecorder are class fields (assigned per-instance
// in the constructor), not prototype methods. Reassigning `PcmRecorder.prototype.start`
// after construction would never take effect since the instance's own field always shadows
// it — so a mid-test prototype patch can't reliably simulate a rejecting `start()`. Instead,
// the mock exposes a settable flag that the constructed instance's `start` consults, giving
// a real (not merely mock-was-called) permission-error path through the hook.
vi.mock('../terminal/pcm-recorder', () => {
  let shouldFailStart = false;
  class MockPcmRecorder {
    static isSupported() { return true; }
    static __setShouldFailStart(value: boolean) { shouldFailStart = value; }
    start = vi.fn().mockImplementation(() =>
      shouldFailStart ? Promise.reject(new Error('denied')) : Promise.resolve(undefined)
    );
    stop = vi.fn().mockResolvedValue(new Int16Array([1, 2]).buffer);
    dispose = vi.fn();
  }
  return { PcmRecorder: MockPcmRecorder };
});

beforeEach(() => {
  (window as any).electronAPI = {
    getSTTStatus: vi.fn().mockResolvedValue({ available: true, reason: 'ready', model: 'base.en', modelPresent: true }),
    transcribeSpeech: vi.fn().mockResolvedValue({ text: 'run the tests' }),
    downloadSTTModel: vi.fn(),
    cancelTranscribe: vi.fn(),
    onSTTStatusChanged: vi.fn().mockReturnValue(() => {}),
  };
});

describe('useSTT', () => {
  it('records then transcribes into review phase', async () => {
    const { result } = renderHook(() => useSTT());
    await act(async () => { await result.current.beginRecording(); });
    expect(result.current.phase).toBe('recording');
    await act(async () => { await result.current.endRecording(); });
    await waitFor(() => expect(result.current.phase).toBe('review'));
    expect(result.current.transcript).toBe('run the tests');
  });

  it('surfaces permission errors when the recorder rejects on start', async () => {
    const { PcmRecorder } = await import('../terminal/pcm-recorder');
    (PcmRecorder as any).__setShouldFailStart(true);

    const { result } = renderHook(() => useSTT());
    await act(async () => { await result.current.beginRecording(); });
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error).toMatch(/denied/);

    (PcmRecorder as any).__setShouldFailStart(false);
  });
});
