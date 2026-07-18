import { useCallback, useEffect, useRef } from 'react';
import { Mic } from 'lucide-react';
import { useSTT } from '../../hooks/useSTT';
import { DictationOverlay } from './DictationOverlay';
import { DEFAULT_STT_SETTINGS, STT_OPEN_SETTINGS_EVENT } from '../../stt-ui';

interface VoiceControlsProps {
  readOnly: boolean;
  onInject: (text: string) => void;
}

function matchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.toLowerCase().split('+').map((p) => p.trim());
  const need = { ctrl: parts.includes('ctrl'), shift: parts.includes('shift'), alt: parts.includes('alt'), meta: parts.includes('cmd') || parts.includes('meta') };
  const key = parts[parts.length - 1];
  const pressed = key === 'space' ? e.code === 'Space' : e.key.toLowerCase() === key;
  return pressed && e.ctrlKey === need.ctrl && e.shiftKey === need.shift && e.altKey === need.alt && e.metaKey === need.meta;
}

function tooltipFor(reason: string | undefined, phase: string, hotkey: string, errorMsg?: string): string {
  if (phase === 'recording') return 'Recording — click to stop';
  if (phase === 'transcribing') return 'Transcribing…';
  switch (reason) {
    case 'ready': return `Click to dictate (${hotkey})`;
    case 'downloading': return 'Downloading voice model…';
    case 'model-missing': return 'Download a voice model to dictate';
    case 'engine-error': return errorMsg ? `Voice error: ${errorMsg}` : 'Voice error — click to set up';
    default: return 'Voice input — click to set up';
  }
}

export function VoiceControls({ readOnly, onInject }: VoiceControlsProps) {
  const stt = useSTT();
  const btnRef = useRef<HTMLButtonElement>(null);
  const isRemote = !!(window as unknown as { __OMNIDESK_REMOTE__?: boolean }).__OMNIDESK_REMOTE__;
  const settings = stt.settings ?? DEFAULT_STT_SETTINGS;
  const hotkey = settings.hotkey || DEFAULT_STT_SETTINGS.hotkey;
  const visible = !readOnly && !isRemote && settings.showButton;

  const reason = stt.status?.reason;
  const ready = reason === 'ready';
  const attention = reason === 'model-missing' || reason === 'downloading' || reason === 'engine-error';

  const submit = useCallback((text: string) => {
    if (text.trim()) onInject(text);
    stt.cancel();
  }, [onInject, stt]);

  const openSettings = useCallback(() => {
    window.dispatchEvent(new Event(STT_OPEN_SETTINGS_EVENT));
  }, []);

  // Toggle dictation: start when idle, stop (→ transcribe) when recording.
  // Ignores transient phases (permission/transcribing/review) so double-clicks
  // while a request is in flight are no-ops.
  const toggle = useCallback(() => {
    if (!ready) { openSettings(); return; }
    if (stt.phase === 'idle') void stt.beginRecording();
    else if (stt.phase === 'recording') void stt.endRecording();
  }, [ready, openSettings, stt]);

  // Hotkey mirrors the click: press once to start, press again to stop (not hold).
  useEffect(() => {
    if (!visible || !ready) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || !matchesHotkey(e, hotkey)) return;
      e.preventDefault();
      if (stt.phase === 'idle') void stt.beginRecording();
      else if (stt.phase === 'recording') void stt.endRecording();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, ready, hotkey, stt]);

  // Pulse the mic button in proportion to live input level while recording, so
  // feedback is visible even when the dictation pill isn't in view. Driven by
  // an rAF loop reading levelRef (no re-render). The glow is data-reactive
  // rather than a decorative loop, so it stays meaningful under reduced motion.
  useEffect(() => {
    const el = btnRef.current;
    if (!el || stt.phase !== 'recording') { if (el) el.style.boxShadow = ''; return; }
    let raf = 0;
    const tick = () => {
      const lvl = stt.levelRef?.current ?? 0; // 0..1
      const spread = 2 + lvl * 14;
      const alpha = 0.25 + lvl * 0.5;
      el.style.boxShadow = `0 0 ${spread}px rgba(247,103,142,${alpha})`;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); if (el) el.style.boxShadow = ''; };
  }, [stt.phase, stt.levelRef]);

  if (!visible) return null;

  const recording = stt.phase === 'recording';
  const background = recording
    ? 'var(--term-red, #F7678E)'
    : ready ? 'color-mix(in srgb, var(--v2-accent) 22%, var(--v2-surface-overlay))'
    : 'var(--v2-surface-overlay)';

  return (
    <>
      <button
        ref={btnRef}
        aria-label="Voice input"
        title={tooltipFor(reason, stt.phase, hotkey, stt.status?.error)}
        onClick={toggle}
        onContextMenu={(e) => { e.preventDefault(); void stt.hideButton(); }}
        style={{
          position: 'absolute', bottom: 'var(--space-3)', right: 'var(--space-3)', zIndex: 15,
          width: 40, height: 40, borderRadius: '50%',
          background,
          border: '1px solid var(--v2-border-default)',
          color: ready || recording ? 'var(--v2-text-primary)' : 'var(--v2-text-tertiary)',
          opacity: ready || recording ? 1 : 0.7,
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <Mic size={18} />
        {attention && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute', top: 2, right: 2, width: 8, height: 8, borderRadius: '50%',
              background: reason === 'engine-error' ? 'var(--v2-error, #F7678E)' : 'var(--v2-accent)',
              border: '1px solid var(--v2-surface-base, #0D0E14)',
            }}
          />
        )}
      </button>

      <DictationOverlay
        phase={stt.phase}
        transcript={stt.transcript}
        error={stt.error}
        downloadProgress={stt.status?.downloadProgress}
        levelRef={stt.levelRef}
        onChange={stt.setTranscript}
        onSubmit={submit}
        onDiscard={stt.cancel}
        onRetry={() => { stt.cancel(); if (ready) void stt.beginRecording(); }}
      />
    </>
  );
}
