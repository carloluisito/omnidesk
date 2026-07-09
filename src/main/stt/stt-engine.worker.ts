/**
 * STT engine worker — runs INSIDE an Electron `utilityProcess` (crash-isolated
 * from the main process, so a hang/crash here never touches the app or port
 * 9876). It wraps transformers.js (Whisper via ONNX/WASM) behind the
 * engine-agnostic `WhisperBinding` interface and pumps `WorkerIn`/`WorkerOut`
 * messages through the pure `handleWorkerMessage` handler.
 *
 * Three deliberate, non-obvious choices — do not "simplify" them away:
 *
 *  1. ESM import under CommonJS emit. `@xenova/transformers` is ESM-only, but
 *     this file compiles to CommonJS (tsconfig.main.json `module: CommonJS`). A
 *     normal `await import(...)` is downleveled by tsc to `require(...)` and
 *     crashes at runtime with ERR_REQUIRE_ESM. The `new Function('return
 *     import(s)')` indirection hides the import from tsc so a genuine dynamic
 *     ESM import survives to runtime, independent of the emit target.
 *
 *  2. Messaging uses `process.parentPort` (an Electron MessagePortMain), NOT
 *     `worker_threads.parentPort`. utilityProcess children receive messages as
 *     `{ data }` events on `process.parentPort` and reply via its `postMessage`.
 *
 *  3. Our models are all English-only (`*.en`). English-only Whisper models
 *     reject the `language`/`task` options, so `transcribe` passes neither.
 *
 * This file is thin glue with no native compile step; it is verified via
 * manual/e2e runtime testing, not unit tests. See task notes for the
 * onnxruntime-under-utilityProcess runtime caveat.
 */
import { handleWorkerMessage } from './stt-worker-core';
import type { WhisperBinding, WorkerIn, WorkerOut } from './engine-types';

/** Minimal shape of the Electron utilityProcess parent port (avoids depending
 *  on the ambient electron process augmentation being present at compile time). */
interface ParentPortLike {
  postMessage(message: unknown): void;
  on(event: 'message', listener: (messageEvent: { data: WorkerIn }) => void): void;
}
const parentPort = (process as unknown as { parentPort?: ParentPortLike }).parentPort;

/** Preserve a real dynamic ESM import through CommonJS emit (see header note 1). */
const importESM = new Function('specifier', 'return import(specifier)') as (
  specifier: string,
) => Promise<{
  env: { cacheDir?: string; allowRemoteModels?: boolean; allowLocalModels?: boolean };
  pipeline: (
    task: string,
    model: string,
  ) => Promise<(pcm: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>>;
}>;

function createTransformersBinding(): WhisperBinding {
  let transcriber:
    | ((pcm: Float32Array, opts: Record<string, unknown>) => Promise<{ text: string } | Array<{ text: string }>>)
    | null = null;

  return {
    async load(modelId: string): Promise<void> {
      const t = await importESM('@xenova/transformers');
      // Cache models under the dir the main process passes when it forks us,
      // so downloads persist across restarts and work offline afterward.
      const cacheDir = process.env.STT_MODEL_CACHE_DIR;
      if (cacheDir) t.env.cacheDir = cacheDir;
      t.env.allowRemoteModels = true; // download on first use
      t.env.allowLocalModels = true; // reuse the cache afterward (offline)
      transcriber = await t.pipeline('automatic-speech-recognition', modelId);
    },
    async transcribe(pcm: Float32Array, _language: string): Promise<string> {
      if (!transcriber) throw new Error('STT model not loaded');
      // English-only (*.en) models: do NOT pass language/task (they reject it).
      const out = await transcriber(pcm, { chunk_length_s: 30, stride_length_s: 5 });
      const text = Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
      return (text ?? '').trim();
    },
    async free(): Promise<void> {
      transcriber = null;
    },
  };
}

const binding = createTransformersBinding();
const post = (out: WorkerOut): void => parentPort?.postMessage(out);

parentPort?.on('message', (messageEvent) => {
  void handleWorkerMessage(binding, messageEvent.data, post);
});
