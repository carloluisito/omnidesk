import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useSTT } from './useSTT';
import { PcmRecorder } from '../terminal/pcm-recorder';

// `start`/`stop`/`dispose` on the real PcmRecorder are class fields (assigned per-instance
// in the constructor), not prototype methods. Reassigning `PcmRecorder.prototype.start`
// after construction would never take effect since the instance's own field always shadows
// it — so a mid-test prototype patch can't reliably simulate a rejecting `start()`. Instead,
// the mock exposes settable flags that each constructed instance consults, giving a real
// (not merely mock-was-called) path through the hook. Flags are module-scoped, so an
// afterEach resets them to keep tests order-independent.
vi.mock('../terminal/pcm-recorder', () => {
  let shouldFailStart = false;
  let supported = true;
  class MockPcmRecorder {
    static isSupported() { return supported; }
    static __setShouldFailStart(value: boolean) { shouldFailStart = value; }
    static __setSupported(value: boolean) { supported = value; }
    static __reset() { shouldFailStart = false; supported = true; }
    start = vi.fn().mockImplementation(() =>
      shouldFailStart ? Promise.reject(new Error('denied')) : Promise.resolve(undefined)
    );
    stop = vi.fn().mockResolvedValue(new Int16Array([1, 2]).buffer);
    dispose = vi.fn();
  }
  return { PcmRecorder: MockPcmRecorder };
});

// A promise whose resolve is exposed, so a test can hold a call pending and release it later.
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}

const flushMicrotasks = async () => { await Promise.resolve(); await Promise.resolve(); };

beforeEach(() => {
  (window as any).electronAPI = {
    getSTTStatus: vi.fn().mockResolvedValue({ available: true, reason: 'ready', model: 'base.en', modelPresent: true }),
    transcribeSpeech: vi.fn().mockResolvedValue({ text: 'run the tests' }),
    downloadSTTModel: vi.fn(),
    cancelTranscribe: vi.fn().mockResolvedValue(undefined),
    onSTTStatusChanged: vi.fn().mockReturnValue(() => {}),
  };
});

afterEach(() => {
  (PcmRecorder as any).__reset();
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
    (PcmRecorder as any).__setShouldFailStart(true);

    const { result } = renderHook(() => useSTT());
    await act(async () => { await result.current.beginRecording(); });
    await waitFor(() => expect(result.current.phase).toBe('error'));
    expect(result.current.error).toMatch(/denied/);
  });

  it('discards a late transcription result if cancelled while transcribing', async () => {
    // transcribeSpeech stays pending until we release it, so we can cancel mid-flight.
    const pending = deferred<{ text: string }>();
    (window as any).electronAPI.transcribeSpeech = vi.fn().mockReturnValue(pending.promise);

    const { result } = renderHook(() => useSTT());
    await act(async () => { await result.current.beginRecording(); });
    expect(result.current.phase).toBe('recording');

    // Kick off endRecording but do NOT await it to completion — let it advance to the
    // point where it is awaiting the (still-pending) transcription.
    let endPromise: Promise<void>;
    await act(async () => {
      endPromise = result.current.endRecording();
      await flushMicrotasks();
    });
    expect(result.current.phase).toBe('transcribing');
    expect((window as any).electronAPI.transcribeSpeech).toHaveBeenCalledTimes(1);

    // Cancel while the transcription is in flight.
    act(() => { result.current.cancel(); });
    expect(result.current.phase).toBe('idle');

    // Now release the late transcription result. It must be discarded — the generation
    // guard means it cannot resurrect the review phase or overwrite the cleared transcript.
    await act(async () => {
      pending.resolve({ text: 'late' });
      await endPromise;
      await flushMicrotasks();
    });
    expect(result.current.phase).toBe('idle');
    expect(result.current.transcript).toBe('');
  });

  it('goes to error phase when the microphone is unsupported', async () => {
    (PcmRecorder as any).__setSupported(false);

    const { result } = renderHook(() => useSTT());
    await act(async () => { await result.current.beginRecording(); });
    expect(result.current.phase).toBe('error');
    expect(result.current.error).toBeTruthy();
  });
});
