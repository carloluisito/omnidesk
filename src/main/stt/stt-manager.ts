import * as fs from 'fs';
import * as path from 'path';
import type { STTModel, STTSettings, STTStatus, STTTranscribeResult } from '../../shared/ipc-types';

export interface EngineHandle {
  ensureLoaded(modelRef: string): Promise<void>;
  transcribe(pcm: ArrayBuffer, language: string): Promise<string>;
  stop(): void;
  isAlive(): boolean;
}
export type EngineFactory = () => EngineHandle;

/** transformers.js Whisper model id for a settings model, e.g. 'Xenova/whisper-base.en'. */
export function modelIdFor(model: STTModel): string {
  return `Xenova/whisper-${model}`;
}

/** transformers.js caches a model under <cacheDir>/Xenova/whisper-<model>/. */
export function modelCacheDir(modelsDir: string, model: STTModel): string {
  return path.join(modelsDir, 'Xenova', `whisper-${model}`);
}

export function isModelCached(modelsDir: string, model: STTModel): boolean {
  try {
    const dir = modelCacheDir(modelsDir, model);
    return fs.statSync(dir).isDirectory() && fs.readdirSync(dir).length > 0;
  } catch {
    return false;
  }
}

interface Deps {
  getSettings: () => STTSettings;
  modelsDir: string;
  engineFactory: EngineFactory;
  onStatusChanged?: (s: STTStatus) => void;
}

export class STTManager {
  private engine: EngineHandle | null = null;
  private busy = false;
  private downloading = false;
  private engineError?: string;

  constructor(private deps: Deps) {}

  getStatus(): STTStatus {
    const s = this.deps.getSettings();
    const base = { model: s.model, modelPresent: isModelCached(this.deps.modelsDir, s.model) };
    if (this.engineError) return { available: false, reason: 'engine-error', error: this.engineError, ...base };
    if (!s.enabled) return { available: false, reason: 'disabled', ...base };
    if (this.downloading) return { available: false, reason: 'downloading', ...base };
    if (!base.modelPresent) return { available: false, reason: 'model-missing', ...base };
    return { available: true, reason: 'ready', ...base };
  }

  private emit(): void {
    this.deps.onStatusChanged?.(this.getStatus());
  }

  private ensureEngine(): EngineHandle {
    if (!this.engine || !this.engine.isAlive()) this.engine = this.deps.engineFactory();
    return this.engine;
  }

  async downloadModel(): Promise<STTStatus> {
    if (this.downloading) return this.getStatus();
    const s = this.deps.getSettings();
    this.downloading = true;
    this.emit();
    try {
      // Loading the pipeline downloads + caches the model on first use.
      await this.ensureEngine().ensureLoaded(modelIdFor(s.model));
    } catch (e) {
      this.engineError = e instanceof Error ? e.message : String(e);
    } finally {
      this.downloading = false;
      this.emit();
    }
    return this.getStatus();
  }

  async transcribe(pcm: ArrayBuffer, language?: 'auto' | 'en'): Promise<STTTranscribeResult> {
    if (this.busy) throw new Error('STT busy: a transcription is already in progress');
    const status = this.getStatus();
    if (!status.available) throw new Error(`STT not available: ${status.reason}`);
    this.busy = true;
    try {
      const engine = this.ensureEngine();
      await engine.ensureLoaded(modelIdFor(this.deps.getSettings().model));
      const text = await engine.transcribe(pcm, language ?? this.deps.getSettings().language);
      return { text };
    } catch (e) {
      this.engineError = e instanceof Error ? e.message : String(e);
      this.emit();
      throw e;
    } finally {
      this.busy = false;
    }
  }

  cancel(): void {
    if (this.engine) {
      this.engine.stop();
      this.engine = null;
      this.busy = false;
    }
  }

  async warmUp(): Promise<void> {
    if (this.getStatus().reason !== 'ready') return;
    try {
      await this.ensureEngine().ensureLoaded(modelIdFor(this.deps.getSettings().model));
    } catch (e) {
      this.engineError = e instanceof Error ? e.message : String(e);
    }
    this.emit();
  }

  shutdown(): void {
    this.engine?.stop();
    this.engine = null;
  }
}
