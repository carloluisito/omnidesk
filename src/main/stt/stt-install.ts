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

function fetchToFile(
  url: string,
  dest: string,
  expectedSha: string,
  onProgress: ((received: number, total: number) => void) | undefined,
  redirects = 5,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects < 0) { reject(new Error('Too many redirects')); return; }
    https.get(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status >= 300 && status < 400 && res.headers.location) {
        res.resume();
        fetchToFile(res.headers.location, dest, expectedSha, onProgress, redirects - 1).then(resolve, reject);
        return;
      }
      if (status !== 200) { res.resume(); reject(new Error(`Download failed (HTTP ${status})`)); return; }

      const total = Number(res.headers['content-length'] ?? 0);
      let received = 0;
      const tmp = `${dest}.download`;
      const file = fs.createWriteStream(tmp);
      const hash = crypto.createHash('sha256');

      // Any stream error must reject (an unhandled write-stream 'error' would
      // otherwise throw as an uncaught exception and can crash the main process).
      // Destroy the write stream BEFORE removing the temp file — on Windows,
      // deleting a file with an open handle fails and leaks the .download temp.
      const fail = (e: Error) => { file.destroy(); fs.rm(tmp, { force: true }, () => reject(e)); };

      res.on('data', (chunk: Buffer) => { hash.update(chunk); received += chunk.length; onProgress?.(received, total); });
      res.on('error', fail);
      file.on('error', fail);
      res.pipe(file); // pipe handles backpressure

      file.on('finish', () => {
        file.close(() => {
          const actual = hash.digest('hex');
          if (expectedSha && !expectedSha.startsWith('PLACEHOLDER') && actual !== expectedSha) {
            fs.rm(tmp, { force: true }, () => reject(new Error(`Checksum mismatch for ${dest}`)));
            return;
          }
          try { fs.renameSync(tmp, dest); resolve(); }
          catch (e) { reject(e as Error); }
        });
      });
    }).on('error', reject);
  });
}

export async function downloadModel(
  model: STTModel,
  destDir: string,
  onProgress?: (received: number, total: number) => void,
): Promise<string> {
  fs.mkdirSync(destDir, { recursive: true });
  const finalPath = modelPath(destDir, model);
  await fetchToFile(modelUrl(model), finalPath, modelSha256(model), onProgress);
  return finalPath;
}
