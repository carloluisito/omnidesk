import { useCallback, useEffect } from 'react';
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
  if (phase === 'recording') return 'Listening… release to transcribe';
  if (phase === 'transcribing') return 'Transcribing…';
  switch (reason) {
    case 'ready': return `Hold to dictate (${hotkey})`;
    case 'downloading': return 'Downloading voice model…';
    case 'model-missing': return 'Download a voice model to dictate';
    case 'engine-error': return errorMsg ? `Voice error: ${errorMsg}` : 'Voice error — click to set up';
    default: return 'Voice input — click to set up';
  }
}

export function VoiceControls({ readOnly, onInject }: VoiceControlsProps) {
  const stt = useSTT();
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

  // Push-to-talk hotkey: only armed when ready. Ignore auto-repeat.
  useEffect(() => {
    if (!visible || !ready) return;
    const down = (e: KeyboardEvent) => { if (!e.repeat && matchesHotkey(e, hotkey) && stt.phase === 'idle') { e.preventDefault(); void stt.beginRecording(); } };
    const up = (e: KeyboardEvent) => { if (matchesHotkey(e, hotkey) && stt.phase === 'recording') { e.preventDefault(); void stt.endRecording(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [visible, ready, hotkey, stt]);

  if (!visible) return null;

  const holdStart = () => { if (ready && stt.phase === 'idle') void stt.beginRecording(); };
  const holdEnd = () => { if (ready && stt.phase === 'recording') void stt.endRecording(); };

  const recording = stt.phase === 'recording';
  const background = recording
    ? 'var(--term-red, #F7678E)'
    : ready ? 'color-mix(in srgb, var(--v2-accent) 22%, var(--v2-surface-overlay))'
    : 'var(--v2-surface-overlay)';

  return (
    <>
      <button
        aria-label="Voice input"
        title={tooltipFor(reason, stt.phase, hotkey, stt.status?.error)}
        onMouseDown={holdStart}
        onMouseUp={holdEnd}
        onMouseLeave={() => { if (ready && stt.phase === 'recording') void stt.endRecording(); }}
        onTouchStart={(e) => { if (ready) { e.preventDefault(); holdStart(); } }}
        onTouchEnd={(e) => { if (ready) { e.preventDefault(); holdEnd(); } }}
        onClick={() => { if (!ready) openSettings(); }}
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
        onChange={stt.setTranscript}
        onSubmit={submit}
        onDiscard={stt.cancel}
        onRetry={() => { stt.cancel(); void stt.beginRecording(); }}
      />
    </>
  );
}
