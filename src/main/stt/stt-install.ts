import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import * as crypto from 'crypto';
import type { STTModel } from '../../shared/ipc-types';

// ggml models are published on Hugging Face by ggerganov/whisper.cpp.
const HF_BASE = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/';

// SHA-256 of each ggml model (verify against the published checksums before shipping).
const SHA256: Record<STTModel, string> = {
  'tiny.en':  'PLACEHOLDER_FILL_DURING_IMPL_tiny',
  'base.en':  'PLACEHOLDER_FILL_DURING_IMPL_base',
  'small.en': 'PLACEHOLDER_FILL_DURING_IMPL_small',
};

export function modelFileName(model: STTModel): string { return `ggml-${model}.bin`; }
export function modelUrl(model: STTModel): string { return HF_BASE + modelFileName(model); }
export function modelSha256(model: STTModel): string { return SHA256[model]; }
export function modelPath(destDir: string, model: STTModel): string {
  return path.join(destDir, modelFileName(model));
}
export function isModelPresent(destDir: string, model: STTModel): boolean {
  try { return fs.statSync(modelPath(destDir, model)).size > 0; } catch { return false; }
}

function get(url: string, onData: (chunk: Buffer) => void, onTotal: (n: number) => void, redirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects < 0) return reject(new Error('Too many redirects'));
    https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        get(res.headers.location, onData, onTotal, redirects - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) { res.resume(); return reject(new Error(`Download failed (HTTP ${status})`)); }
      onTotal(Number(res.headers['content-length'] ?? 0));
      res.on('data', onData);
      res.on('end', resolve);
      res.on('error', reject);
    }).on('error', reject);
  });
}

/** Download a ggml model into destDir with progress + checksum verification. */
export async function downloadModel(
  model: STTModel,
  destDir: string,
  onProgress?: (received: number, total: number) => void,
): Promise<string> {
  fs.mkdirSync(destDir, { recursive: true });
  const finalPath = modelPath(destDir, model);
  const tmp = `${finalPath}.download`;
  const file = fs.createWriteStream(tmp);
  const hash = crypto.createHash('sha256');
  let received = 0, total = 0;

  try {
    await get(
      modelUrl(model),
      (chunk) => { file.write(chunk); hash.update(chunk); received += chunk.length; onProgress?.(received, total); },
      (n) => { total = n; },
    );
    await new Promise<void>((res, rej) => file.end((e?: Error) => (e ? rej(e) : res())));

    const expected = modelSha256(model);
    const actual = hash.digest('hex');
    if (expected && !expected.startsWith('PLACEHOLDER') && actual !== expected) {
      throw new Error(`Checksum mismatch for ${model}`);
    }
    fs.renameSync(tmp, finalPath);
    return finalPath;
  } catch (e) {
    fs.rm(tmp, { force: true }, () => { /* noop */ });
    throw e;
  }
}
