import { describe, it, expect, vi } from 'vitest';
import { handleWorkerMessage } from './stt-worker-core';
import type { WhisperBinding, WorkerOut } from './engine-types';

function fakeBinding(text = 'hello world'): WhisperBinding {
  return {
    load: vi.fn().mockResolvedValue(undefined),
    transcribe: vi.fn().mockResolvedValue(text),
    free: vi.fn().mockResolvedValue(undefined),
  };
}

describe('handleWorkerMessage', () => {
  it('loads the model and posts loaded', async () => {
    const b = fakeBinding();
    const out: WorkerOut[] = [];
    await handleWorkerMessage(b, { type: 'load', modelPath: '/m.bin' }, (m) => out.push(m));
    expect(b.load).toHaveBeenCalledWith('/m.bin');
    expect(out).toContainEqual({ type: 'loaded' });
  });

  it('transcribes Int16 PCM and posts the result with matching id', async () => {
    const b = fakeBinding('do the thing');
    const out: WorkerOut[] = [];
    const pcm = new Int16Array([100, -100, 0]).buffer;
    await handleWorkerMessage(b, { type: 'transcribe', id: 7, pcm, language: 'en' }, (m) => out.push(m));
    expect(b.transcribe).toHaveBeenCalled();
    expect(out).toContainEqual({ type: 'result', id: 7, text: 'do the thing' });
  });

  it('posts an error when the binding throws', async () => {
    const b = fakeBinding();
    (b.transcribe as any).mockRejectedValue(new Error('boom'));
    const out: WorkerOut[] = [];
    await handleWorkerMessage(b, { type: 'transcribe', id: 1, pcm: new Int16Array([0]).buffer, language: 'en' }, (m) => out.push(m));
    expect(out).toContainEqual({ type: 'error', id: 1, message: 'boom' });
  });
});
