import { describe, it, expect } from 'vitest';
import { channels } from './ipc-contract';

describe('STT contract', () => {
  it('maps STT methods to stt:* channels', () => {
    expect(channels.getSTTStatus).toBe('stt:status');
    expect(channels.transcribeSpeech).toBe('stt:transcribe');
    expect(channels.downloadSTTModel).toBe('stt:downloadModel');
    expect(channels.cancelTranscribe).toBe('stt:cancel');
    expect(channels.onSTTStatusChanged).toBe('stt:statusChanged');
  });
});
