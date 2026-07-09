import { utilityProcess, type UtilityProcess } from 'electron';
import * as path from 'path';
import type { EngineHandle } from './stt-manager';
import type { WorkerIn, WorkerOut } from './engine-types';

/**
 * Real EngineHandle: forks the STT utilityProcess (stt-engine.worker.js) and
 * speaks WorkerIn/WorkerOut. The model cache dir is passed via env so the
 * worker's transformers.js caches models there. Stops exactly its one child.
 */
export function createUtilityEngine(modelsDir: string): EngineHandle {
  let child: UtilityProcess | null = null;
  let loaded = false;
  let loadedRef = '';
  let nextId = 1;
  const pending = new Map<number, { resolve: (t: string) => void; reject: (e: Error) => void }>();
  let loadWaiter: { resolve: () => void; reject: (e: Error) => void } | null = null;

  function spawn(): void {
    child = utilityProcess.fork(path.join(__dirname, 'stt-engine.worker.js'), [], {
      env: { ...process.env, STT_MODEL_CACHE_DIR: modelsDir },
    });
    child.on('message', (msg: WorkerOut) => {
      if (msg.type === 'loaded') {
        loaded = true;
        loadWaiter?.resolve();
        loadWaiter = null;
      } else if (msg.type === 'result') {
        pending.get(msg.id)?.resolve(msg.text);
        pending.delete(msg.id);
      } else if (msg.type === 'error') {
        if (msg.id != null) {
          pending.get(msg.id)?.reject(new Error(msg.message));
          pending.delete(msg.id);
        } else {
          loadWaiter?.reject(new Error(msg.message));
          loadWaiter = null;
        }
      }
    });
    child.on('exit', () => {
      loaded = false;
      child = null;
      pending.forEach((p) => p.reject(new Error('STT engine exited')));
      pending.clear();
      loadWaiter?.reject(new Error('STT engine exited'));
      loadWaiter = null;
    });
  }

  return {
    async ensureLoaded(modelRef: string): Promise<void> {
      if (!child) {
        spawn();
        loaded = false;
      }
      if (loaded && loadedRef === modelRef) return;
      await new Promise<void>((resolve, reject) => {
        loadWaiter = { resolve, reject };
        (child as UtilityProcess).postMessage({ type: 'load', modelPath: modelRef } as WorkerIn);
      });
      loadedRef = modelRef;
    },
    transcribe(pcm: ArrayBuffer, language: string): Promise<string> {
      const id = nextId++;
      return new Promise<string>((resolve, reject) => {
        pending.set(id, { resolve, reject });
        (child as UtilityProcess).postMessage({ type: 'transcribe', id, pcm, language } as WorkerIn);
      });
    },
    stop(): void {
      child?.kill();
      child = null;
      loaded = false;
    },
    isAlive(): boolean {
      return child !== null;
    },
  };
}
