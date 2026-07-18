import { useEffect, useLayoutEffect, useRef, type MutableRefObject } from 'react';
import type { STTPhase } from '../../hooks/useSTT';
import { ListeningBars } from '../ui/ListeningBars';

interface DictationOverlayProps {
  phase: STTPhase;
  transcript: string;
  error: string | null;
  downloadProgress?: number;
  levelRef?: MutableRefObject<number>;
  onChange: (t: string) => void;
  onSubmit: (t: string) => void;
  onDiscard: () => void;
  onRetry: () => void;
}

export function DictationOverlay({
  phase, transcript, error, downloadProgress, levelRef, onChange, onSubmit, onDiscard, onRetry,
}: DictationOverlayProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => { if (phase === 'review') ref.current?.focus(); }, [phase]);

  // Grow the review textarea to fit the transcript, capped at 40% of the
  // viewport; past the cap it scrolls internally.
  useLayoutEffect(() => {
    const el = ref.current;
    if (phase !== 'review' || !el) return;
    const cap = Math.round(window.innerHeight * 0.4);
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, cap)}px`;
    el.style.overflowY = el.scrollHeight > cap ? 'auto' : 'hidden';
  }, [phase, transcript]);

  if (phase === 'idle') return null;

  const btn = {
    fontFamily: 'inherit',
    fontSize: 'var(--text-xs)',
    padding: 'var(--space-1) var(--space-2)',
    borderRadius: 'var(--radius-sm)',
    border: '1px solid var(--v2-border-default)',
    background: 'var(--v2-surface-base, #0D0E14)',
    color: 'var(--v2-text-primary)',
    cursor: 'pointer',
  } as const;
  const btnPrimary = { ...btn, border: '1px solid var(--v2-accent)', color: 'var(--v2-accent)' } as const;

  const wrap = {
    position: 'absolute', bottom: 'var(--space-4)', left: '50%', transform: 'translateX(-50%)',
    zIndex: 20, minWidth: '340px', maxWidth: '70%',
    // Review shows a full editable transcript — give it a fixed reading
    // column (clamped by maxWidth) instead of shrink-to-fit.
    ...(phase === 'review' ? { width: '720px' } : {}),
    background: 'color-mix(in srgb, var(--v2-surface-overlay) 94%, transparent)',
    border: '1px solid var(--v2-border-default)', borderRadius: 'var(--radius-md)',
    padding: 'var(--space-3)', fontFamily: '"JetBrains Mono", monospace',
    color: 'var(--v2-text-primary)', boxShadow: 'var(--shadow-lg, 0 8px 32px rgba(0,0,0,0.4))',
  } as const;

  const label = (text: string, color = 'var(--v2-accent)') => (
    <span style={{ fontSize: 'var(--text-xs)', color }}>{text}</span>
  );

  return (
    <div style={wrap} role="dialog" aria-label="Voice dictation">
      {phase === 'recording' && (
        <div role="status" aria-label="Recording" style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
          <ListeningBars levelRef={levelRef} />
          {label('click the mic to stop', 'var(--v2-text-tertiary)')}
        </div>
      )}
      {phase === 'permission' && label('Requesting microphone…')}
      {phase === 'transcribing' && label('Transcribing…')}
      {phase === 'error' && (
        <div>
          {label(error ?? 'Something went wrong', 'var(--v2-error, #F7678E)')}
          <button type="button" onClick={onRetry} style={{ ...btn, marginLeft: 'var(--space-2)' }}>Retry</button>
        </div>
      )}
      {typeof downloadProgress === 'number' && phase !== 'review' &&
        label(`Downloading model… ${Math.round(downloadProgress * 100)}%`)}
      {phase === 'review' && (
        <>
          <textarea
            ref={ref}
            value={transcript}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSubmit(transcript); }
              if (e.key === 'Escape') { e.preventDefault(); onDiscard(); }
            }}
            rows={2}
            style={{
              width: '100%', background: 'var(--v2-surface-base, #0D0E14)',
              color: 'var(--v2-text-primary)', border: '1px solid var(--v2-border-subtle)',
              borderRadius: 'var(--radius-sm)', padding: 'var(--space-2)',
              fontFamily: 'inherit', fontSize: 'var(--text-sm)', resize: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 'var(--space-2)', marginTop: 'var(--space-2)', justifyContent: 'flex-end' }}>
            <button type="button" onClick={onDiscard} style={btn}>Discard (Esc)</button>
            <button type="button" onClick={onRetry} style={btn}>Re-record</button>
            <button type="button" onClick={() => onSubmit(transcript)} style={btnPrimary}>Send (Enter)</button>
          </div>
        </>
      )}
    </div>
  );
}
