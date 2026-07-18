import { int16ToFloat32 } from '../../shared/pcm-math';
import type { WhisperBinding, WorkerIn, WorkerOut } from './engine-types';

export async function handleWorkerMessage(
  binding: WhisperBinding,
  msg: WorkerIn,
  post: (out: WorkerOut) => void,
): Promise<void> {
  try {
    if (msg.type === 'load') {
      await binding.load(msg.modelPath);
      post({ type: 'loaded' });
      return;
    }
    if (msg.type === 'transcribe') {
      const pcm = int16ToFloat32(msg.pcm);
      const text = (await binding.transcribe(pcm, msg.language)).trim();
      post({ type: 'result', id: msg.id, text });
      return;
    }
  } catch (e) {
    const id = msg.type === 'transcribe' ? msg.id : undefined;
    post({ type: 'error', id, message: e instanceof Error ? e.message : String(e) });
  }
}
