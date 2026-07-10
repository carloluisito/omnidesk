import { useCallback, useEffect, useRef, useState } from 'react';
import type { STTSettings, STTStatus } from '../../shared/ipc-types';
import { PcmRecorder } from '../terminal/pcm-recorder';
import { DEFAULT_STT_SETTINGS, STT_SETTINGS_CHANGED_EVENT } from '../stt-ui';

export type STTPhase = 'idle' | 'permission' | 'recording' | 'transcribing' | 'review' | 'error';

export function useSTT() {
  const [phase, setPhase] = useState<STTPhase>('idle');
  const [transcript, setTranscript] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<STTStatus | null>(null);
  const [settings, setSettingsState] = useState<STTSettings | null>(null);
  const recorderRef = useRef<PcmRecorder | null>(null);
  // Bumped on cancel and on each new recording; async continuations compare
  // the generation they started with and bail if it changed (cancel/restart),
  // so a late transcription can never overwrite a cancelled/reset state.
  const genRef = useRef(0);

  const refreshStatus = useCallback(async () => {
    try { setStatus(await window.electronAPI.getSTTStatus()); } catch { /* noop */ }
  }, []);

  const refreshSettings = useCallback(async () => {
    try {
      const app = await window.electronAPI.getSettings();
      setSettingsState(app.stt ?? DEFAULT_STT_SETTINGS);
    } catch { /* noop */ }
  }, []);

  useEffect(() => {
    void refreshStatus();
    void refreshSettings();
    const off = window.electronAPI.onSTTStatusChanged((s) => setStatus(s));
    // A settings change anywhere (panel, hideButton) refreshes every instance.
    const onChanged = () => { void refreshSettings(); void refreshStatus(); };
    window.addEventListener(STT_SETTINGS_CHANGED_EVENT, onChanged);
    return () => {
      off?.();
      window.removeEventListener(STT_SETTINGS_CHANGED_EVENT, onChanged);
    };
  }, [refreshStatus, refreshSettings]);

  const beginRecording = useCallback(async () => {
    setError(null);
    if (!PcmRecorder.isSupported()) { setError('Microphone not available'); setPhase('error'); return; }
    const gen = ++genRef.current;
    setPhase('permission');
    const rec = new PcmRecorder();
    try {
      await rec.start();
      if (genRef.current !== gen) { rec.dispose(); return; } // cancelled during permission
      recorderRef.current = rec;
      setPhase('recording');
    } catch (e) {
      rec.dispose();
      if (genRef.current !== gen) return;
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const endRecording = useCallback(async () => {
    const rec = recorderRef.current;
    if (!rec) return;
    recorderRef.current = null;
    const gen = genRef.current;
    setPhase('transcribing');
    try {
      const pcm = await rec.stop();
      if (genRef.current !== gen) return; // cancelled during stop
      const { text } = await window.electronAPI.transcribeSpeech({ pcm });
      if (genRef.current !== gen) return; // cancelled during transcription
      setTranscript(text);
      setPhase('review');
    } catch (e) {
      rec.dispose();
      if (genRef.current !== gen) return;
      setError(e instanceof Error ? e.message : String(e));
      setPhase('error');
    }
  }, []);

  const cancel = useCallback(() => {
    genRef.current++; // invalidate any in-flight begin/endRecording continuation
    recorderRef.current?.dispose();
    recorderRef.current = null;
    void window.electronAPI.cancelTranscribe().catch(() => { /* noop */ });
    setTranscript('');
    setError(null);
    setPhase('idle');
  }, []);

  const downloadModel = useCallback(async () => {
    try { setStatus(await window.electronAPI.downloadSTTModel()); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, []);

  const hideButton = useCallback(async () => {
    try {
      const app = await window.electronAPI.getSettings();
      const current = app.stt ?? DEFAULT_STT_SETTINGS;
      await window.electronAPI.setSettings({ stt: { ...current, showButton: false } });
      window.dispatchEvent(new Event(STT_SETTINGS_CHANGED_EVENT));
    } catch { /* noop */ }
  }, []);

  return {
    phase, transcript, error, status, settings,
    beginRecording, endRecording, cancel, setTranscript, downloadModel, refreshStatus, hideButton,
  };
}
