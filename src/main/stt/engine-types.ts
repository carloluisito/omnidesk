export interface WhisperBinding {
  load(modelPath: string): Promise<void>;
  transcribe(pcm: Float32Array, language: string): Promise<string>;
  free(): Promise<void>;
}

export type WorkerIn =
  | { type: 'load'; modelPath: string }
  | { type: 'transcribe'; id: number; pcm: ArrayBuffer; language: string };

export type WorkerOut =
  | { type: 'loaded' }
  | { type: 'result'; id: number; text: string }
  | { type: 'error'; id?: number; message: string };
