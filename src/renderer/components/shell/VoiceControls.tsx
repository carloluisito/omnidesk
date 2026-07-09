import { useCallback, useEffect } from 'react';
import { Mic } from 'lucide-react';
import { useSTT } from '../../hooks/useSTT';
import { DictationOverlay } from './DictationOverlay';

interface VoiceControlsProps {
  sessionId: string;
  enabled: boolean;         // settings.stt.enabled && !readOnly
  readOnly: boolean;
  hotkey: string;           // e.g. 'Ctrl+Shift+Space'
  onInject: (text: string) => void;
}

function matchesHotkey(e: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.toLowerCase().split('+').map((p) => p.trim());
  const need = { ctrl: parts.includes('ctrl'), shift: parts.includes('shift'), alt: parts.includes('alt'), meta: parts.includes('cmd') || parts.includes('meta') };
  const key = parts[parts.length - 1];
  const pressed = key === 'space' ? e.code === 'Space' : e.key.toLowerCase() === key;
  return pressed && e.ctrlKey === need.ctrl && e.shiftKey === need.shift && e.altKey === need.alt && e.metaKey === need.meta;
}

export function VoiceControls({ sessionId: _sessionId, enabled, readOnly, hotkey, onInject }: VoiceControlsProps) {
  const stt = useSTT();
  const active = enabled && !readOnly;

  const submit = useCallback((text: string) => {
    if (text.trim()) onInject(text);
    stt.cancel();
  }, [onInject, stt]);

  // Push-to-talk hotkey: keydown starts, keyup transcribes. Ignore auto-repeat.
  useEffect(() => {
    if (!active) return;
    const down = (e: KeyboardEvent) => { if (!e.repeat && matchesHotkey(e, hotkey) && stt.phase === 'idle') { e.preventDefault(); void stt.beginRecording(); } };
    const up = (e: KeyboardEvent) => { if (matchesHotkey(e, hotkey) && stt.phase === 'recording') { e.preventDefault(); void stt.endRecording(); } };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [active, hotkey, stt]);

  if (!active) return null;

  const holdStart = () => { if (stt.phase === 'idle') void stt.beginRecording(); };
  const holdEnd = () => { if (stt.phase === 'recording') void stt.endRecording(); };

  return (
    <>
      <button
        aria-label="Dictate (voice)"
        title={`Hold to dictate (${hotkey})`}
        onMouseDown={holdStart}
        onMouseUp={holdEnd}
        onMouseLeave={() => { if (stt.phase === 'recording') void stt.endRecording(); }}
        onTouchStart={(e) => { e.preventDefault(); holdStart(); }}
        onTouchEnd={(e) => { e.preventDefault(); holdEnd(); }}
        style={{
          position: 'absolute', bottom: 'var(--space-3)', right: 'var(--space-3)', zIndex: 15,
          width: 40, height: 40, borderRadius: '50%',
          background: stt.phase === 'recording' ? 'var(--term-red, #F7678E)' : 'var(--v2-surface-overlay)',
          border: '1px solid var(--v2-border-default)', color: 'var(--v2-text-primary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
        }}
      >
        <Mic size={18} />
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
