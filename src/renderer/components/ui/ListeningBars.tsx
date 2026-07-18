import { useEffect, useRef, type MutableRefObject } from 'react';

interface ListeningBarsProps {
  /** Live input level in 0..1, updated out-of-band (no re-render). */
  levelRef?: MutableRefObject<number>;
  bars?: number;
}

const MIN_H = 3; // px — resting/flatline height on silence
const MAX_H = 22; // px — tallest bar at full level

// Center bars reach higher than the edges (classic VU shape).
function weightFor(i: number, n: number): number {
  const center = (n - 1) / 2;
  const dist = Math.abs(i - center) / (center || 1);
  return 0.55 + 0.45 * (1 - dist);
}

/**
 * Live input-level equalizer shown while recording. Bar heights are driven from
 * `levelRef` (0..1) by a single rAF loop that writes straight to the DOM — no
 * React state, so it never re-renders. Silence (level → 0) collapses every bar
 * to MIN_H (flatline); that is the diagnostic — it tells the user the mic hears
 * nothing. Under prefers-reduced-motion the per-bar oscillation is dropped, so
 * the bars still track level but do not animate.
 */
export function ListeningBars({ levelRef, bars = 9 }: ListeningBarsProps) {
  const refs = useRef<(HTMLSpanElement | null)[]>([]);

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    let raf = 0;
    const tick = () => {
      const level = levelRef?.current ?? 0;
      const t = performance.now() / 1000;
      const els = refs.current;
      for (let i = 0; i < els.length; i++) {
        const el = els[i];
        if (!el) continue;
        // Oscillation gives the bars life but is scaled by level, so it fully
        // vanishes on silence. Reduced-motion drops it (static but reactive).
        const osc = reduced ? 1 : 0.55 + 0.45 * Math.abs(Math.sin(t * (6 + i) + i));
        const h = MIN_H + (MAX_H - MIN_H) * level * weightFor(i, els.length) * osc;
        el.style.height = `${h}px`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [levelRef]);

  return (
    <span
      aria-hidden="true"
      style={{ display: 'inline-flex', alignItems: 'center', gap: 2, height: MAX_H }}
    >
      {Array.from({ length: bars }).map((_, i) => (
        <span
          key={i}
          ref={(el) => { refs.current[i] = el; }}
          style={{
            width: 3,
            height: MIN_H,
            borderRadius: 2,
            background: 'var(--term-red, #F7678E)',
            transition: 'none',
          }}
        />
      ))}
    </span>
  );
}
