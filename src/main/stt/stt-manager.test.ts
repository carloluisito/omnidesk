import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { STTManager, modelCacheDir, type EngineHandle } from './stt-manager';

function fakeEngine(text = 'hi'): EngineHandle {
  return {
    ensureLoaded: vi.fn().mockResolvedValue(undefined),
    transcribe: vi.fn().mockResolvedValue(text),
    stop: vi.fn(),
    isAlive: vi.fn().mockReturnValue(true),
  };
}

function makeMgr(overrides: Record<string, unknown> = {}, present = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sttm-'));
  if (present) {
    const cacheDir = modelCacheDir(dir, 'base.en');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'config.json'), '{}');
  }
  const engine = fakeEngine();
  const m = new STTManager({
    getSettings: () => ({ enabled: true, model: 'base.en', hotkey: 'x', language: 'en' }),
    modelsDir: dir,
    engineFactory: () => engine,
    ...overrides,
  });
  return { m, engine, dir };
}

describe('STTManager', () => {
  it('reports ready when enabled + model cached', () => {
    const { m } = makeMgr();
    expect(m.getStatus()).toMatchObject({ available: true, reason: 'ready', modelPresent: true });
  });

  it('reports disabled when settings.enabled is false', () => {
    const { m } = makeMgr({ getSettings: () => ({ enabled: false, model: 'base.en', hotkey: 'x', language: 'en' }) });
    expect(m.getStatus()).toMatchObject({ available: false, reason: 'disabled' });
  });

  it('reports model-missing when enabled but not cached', () => {
    const { m } = makeMgr({}, false);
    expect(m.getStatus()).toMatchObject({ available: false, reason: 'model-missing' });
  });

  it('transcribe returns text and loads the model', async () => {
    const { m, engine } = makeMgr();
    const buf = new Int16Array([1, 2, 3]).buffer;
    expect(await m.transcribe(buf)).toEqual({ text: 'hi' });
    expect(engine.ensureLoaded).toHaveBeenCalledWith('Xenova/whisper-base.en');
  });

  it('rejects a concurrent transcribe with busy', async () => {
    const { m, engine } = makeMgr();
    (engine.transcribe as ReturnType<typeof vi.fn>).mockImplementation(
      () => new Promise((r) => setTimeout(() => r('later'), 20)),
    );
    const p1 = m.transcribe(new Int16Array([0]).buffer);
    await expect(m.transcribe(new Int16Array([0]).buffer)).rejects.toThrow(/busy/i);
    await p1;
  });

  it('shutdown stops exactly the engine handle', () => {
    const { m, engine } = makeMgr();
    void m.transcribe(new Int16Array([0]).buffer); // create the engine
    m.shutdown();
    expect(engine.stop).toHaveBeenCalledTimes(1);
  });
});
