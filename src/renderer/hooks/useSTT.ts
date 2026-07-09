import { useCallback, useEffect, useRef, useState } from 'react';
import type { STTStatus } from '../../shared/ipc-types';
import { PcmRecorder } from '../terminal/pcm-recorder';

export type STTPhase = 'idle' | 'permission' | 'recording' | 'transcribing' | 'review' | 'error';

export function useSTT() {
  const [phase, setPhase] = useState<STTPhase>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<STTStatus | null>(null);
  const recorderRef = useRef<PcmRecorder | null>(null);

  const refreshStatus = useCallback(async () => {
    try { setStatus(await window.electronAPI.getSTTStatus()); } catch { /* noop */ }
  }, []);

  useEffect(() => {
    void refreshStatus();
    const off = window.electronAPI.onSTTStatusChanged((s) => setStatus(s));
    return off;
  }, [refreshStatus]);

  const beginRecording = useCallback(async () => {
    setError(null);
    if (!PcmRecorder.isSupported()) { setError('Microphone not available'); setPhase('error'); return; }
    setPhase('permission');
    try {
      const rec = new PcmRecorder();
      await rec.start();
      recorderRef.current = rec;
      setPhase('recording');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const endRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    setPhase('transcribing');
    try {
      const pcm = await rec.stop();
      const { text } = await window.electronAPI.transcribeSpeech({ pcm });
      setTranscript(text);
      setPhase('review');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const cancel = useCallback(() => {
    recorderRef.current?.dispose();
    recorderRef.current = null;
    void window.electronAPI.cancelTranscribe().catch(() => { /* noop */ });
    setTranscript('');
    setError(null);
    setPhase('idle');
  }, []);

  const downloadModel = useCallback(async () => {
    setStatus(await window.electronAPI.downloadSTTModel());
  }, []);

  return { phase, transcript, error, status, beginRecording, endRecording, cancel, setTranscript, downloadModel, refreshStatus };
}
