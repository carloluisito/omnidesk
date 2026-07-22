import { EventEmitter } from 'events';
import { describe, it, expect, vi, beforeEach } from 'vitest';

type FakeChild = EventEmitter & {
  postMessage: ReturnType<typeof vi.fn>;
  kill: ReturnType<typeof vi.fn>;
};

// Module-level array populated by the mocked fork(); reset in beforeEach.
// Safe against vi.mock hoisting: fork()'s body only reads this array when
// actually *called* (inside a test), by which point beforeEach has run.
let forkedChildren: FakeChild[] = [];

vi.mock('electron', () => ({
  utilityProcess: {
    fork: vi.fn(() => {
      const child = new EventEmitter() as FakeChild;
      child.postMessage = vi.fn();
      // Mirror real utilityProcess: killing the child eventually fires 'exit'.
      child.kill = vi.fn(() => child.emit('exit'));
      forkedChildren.push(child);
      return child;
    }),
  },
}));

import { createUtilityEngine } from './utility-engine';

function lastChild(): FakeChild {
  return forkedChildren[forkedChildren.length - 1];
}

beforeEach(() => {
  forkedChildren = [];
});

describe('createUtilityEngine', () => {
  it('ensureLoaded posts exactly one load message and resolves on "loaded"', async () => {
    const engine = createUtilityEngine('/models');
    const p = engine.ensureLoaded('Xenova/whisper-base.en');
    const child = lastChild();

    expect(child.postMessage).toHaveBeenCalledTimes(1);
    expect(child.postMessage).toHaveBeenCalledWith({ type: 'load', modelPath: 'Xenova/whisper-base.en' });

    child.emit('message', { type: 'loaded' });
    await expect(p).resolves.toBeUndefined();
  });

  it('serializes two concurrent ensureLoaded(sameRef) calls into a single load message; both resolve', async () => {
    const engine = createUtilityEngine('/models');
    const p1 = engine.ensureLoaded('ref-a');
    const p2 = engine.ensureLoaded('ref-a');
    const child = lastChild();

    // Only the first call should have posted a load message; the second
    // waits on the shared loadPromise instead of racing a second one.
    expect(forkedChildren).toHaveLength(1);
    expect(child.postMessage).toHaveBeenCalledTimes(1);

    child.emit('message', { type: 'loaded' });
    await expect(Promise.all([p1, p2])).resolves.toEqual([undefined, undefined]);
    expect(child.postMessage).toHaveBeenCalledTimes(1);
  });

  it('a second ensureLoaded(sameRef) after a completed load is a no-op', async () => {
    const engine = createUtilityEngine('/models');
    const p1 = engine.ensureLoaded('ref-a');
    const child = lastChild();
    child.emit('message', { type: 'loaded' });
    await p1;

    await engine.ensureLoaded('ref-a');

    expect(forkedChildren).toHaveLength(1); // no new fork
    expect(child.postMessage).toHaveBeenCalledTimes(1); // no new load message
  });

  it('ensureLoaded(differentRef) after a load posts a fresh load message', async () => {
    const engine = createUtilityEngine('/models');
    const p1 = engine.ensureLoaded('ref-a');
    const child = lastChild();
    child.emit('message', { type: 'loaded' });
    await p1;

    const p2 = engine.ensureLoaded('ref-b');
    expect(child.postMessage).toHaveBeenCalledTimes(2);
    expect(child.postMessage).toHaveBeenLastCalledWith({ type: 'load', modelPath: 'ref-b' });

    child.emit('message', { type: 'loaded' });
    await expect(p2).resolves.toBeUndefined();
  });

  it('transcribe assigns a monotonic id and routes result/error to the matching promise', async () => {
    const engine = createUtilityEngine('/models');
    const load = engine.ensureLoaded('ref-a');
    const child = lastChild();
    child.emit('message', { type: 'loaded' });
    await load;

    const pcm1 = new ArrayBuffer(4);
    const pcm2 = new ArrayBuffer(4);
    const t1 = engine.transcribe(pcm1, 'en');
    const t2 = engine.transcribe(pcm2, 'es');

    const call1 = child.postMessage.mock.calls[1][0];
    const call2 = child.postMessage.mock.calls[2][0];
    expect(call1).toMatchObject({ type: 'transcribe', id: 1, language: 'en' });
    expect(call1.pcm).toBe(pcm1);
    expect(call2).toMatchObject({ type: 'transcribe', id: 2, language: 'es' });
    expect(call2.pcm).toBe(pcm2);

    child.emit('message', { type: 'result', id: 1, text: 'hello' });
    child.emit('message', { type: 'error', id: 2, message: 'boom' });

    await expect(t1).resolves.toBe('hello');
    await expect(t2).rejects.toThrow('boom');
  });

  it('transcribe before any spawn rejects immediately with "STT engine exited"', async () => {
    const engine = createUtilityEngine('/models');
    await expect(engine.transcribe(new ArrayBuffer(4), 'en')).rejects.toThrow('STT engine exited');
    expect(forkedChildren).toHaveLength(0);
  });

  it('on exit, rejects all pending transcribes and any in-flight ensureLoaded with "STT engine exited"', async () => {
    const engine = createUtilityEngine('/models');
    const load = engine.ensureLoaded('ref-a');
    const child = lastChild();
    child.emit('message', { type: 'loaded' });
    await load;

    const t1 = engine.transcribe(new ArrayBuffer(4), 'en');
    const t2 = engine.transcribe(new ArrayBuffer(4), 'en');

    child.emit('exit');

    await expect(t1).rejects.toThrow('STT engine exited');
    await expect(t2).rejects.toThrow('STT engine exited');
  });

  it('on exit during an in-flight ensureLoaded, the load promise rejects with "STT engine exited"', async () => {
    const engine = createUtilityEngine('/models');
    const load = engine.ensureLoaded('ref-a');
    const child = lastChild();

    child.emit('exit'); // fires before the worker ever reports 'loaded'

    await expect(load).rejects.toThrow('STT engine exited');
  });

  it('after exit, a subsequent transcribe rejects immediately until re-spawned via ensureLoaded', async () => {
    const engine = createUtilityEngine('/models');
    const load = engine.ensureLoaded('ref-a');
    const child = lastChild();
    child.emit('message', { type: 'loaded' });
    await load;

    child.emit('exit');

    await expect(engine.transcribe(new ArrayBuffer(4), 'en')).rejects.toThrow('STT engine exited');
    expect(forkedChildren).toHaveLength(1); // transcribe alone never respawns

    const reload = engine.ensureLoaded('ref-a');
    expect(forkedChildren).toHaveLength(2); // ensureLoaded respawns
    const child2 = lastChild();
    child2.emit('message', { type: 'loaded' });
    await expect(reload).resolves.toBeUndefined();
  });

  it('stop() kills the child and isAlive() returns false afterward', async () => {
    const engine = createUtilityEngine('/models');
    const load = engine.ensureLoaded('ref-a');
    const child = lastChild();

    expect(engine.isAlive()).toBe(true);
    engine.stop();

    expect(child.kill).toHaveBeenCalledTimes(1);
    expect(engine.isAlive()).toBe(false);
    // stop() -> kill() -> our fake emits 'exit', which rejects the still-pending load.
    await expect(load).rejects.toThrow('STT engine exited');
  });

  it('a load error with no id rejects the pending ensureLoaded, not a transcribe', async () => {
    const engine = createUtilityEngine('/models');
    const load = engine.ensureLoaded('ref-a');
    const child = lastChild();

    child.emit('message', { type: 'error', message: 'load failed' });

    await expect(load).rejects.toThrow('load failed');
  });
});
