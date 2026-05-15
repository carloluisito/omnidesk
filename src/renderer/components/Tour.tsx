/**
 * Tour.tsx — 4-step anchored tour overlay.
 *
 * Trigger: first-run user has dismissed WelcomeScreen AND tourDismissed !== true.
 * Single-dismiss-forever: writes settings key 'tourDismissed' = true
 * via window.electronAPI.setSettings() on "Got it" (last step) or "Skip tour".
 *
 * Fallback: if setSettings is unavailable, writes localStorage key 'tourDismissed'
 * as a secondary guard (survives renderer restarts between main process rebuilds).
 *
 * Steps (4 anchored):
 *   1. Activity bar     — selector: [data-tour="activity-bar"]
 *   2. Tab bar          — selector: [data-tour="tab-bar"]
 *   3. Command palette  — selector: [data-tour="cmd-k-hint"]
 *   4. Status bar       — selector: [data-tour="status-bar"]
 *
 * Each step anchor gets a pulsing ring overlay. The popover positions itself
 * relative to the anchor's bounding rect. If an anchor is not found in the DOM,
 * the popover centers on screen (graceful fallback).
 *
 * Persistence path:
 *   Read:  window.electronAPI.getSettings() → check settings.tourDismissed
 *   Write: window.electronAPI.setSettings({ tourDismissed: true })
 *   Fallback: localStorage.setItem('tourDismissed', 'true')
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, X } from 'lucide-react';

// ─── Step definitions ─────────────────────────────────────────────────────────

interface TourStep {
  anchor:   string;         // CSS selector for the anchor element
  title:    string;
  body:     string;
  position: 'right' | 'bottom' | 'top' | 'left';
}

const STEPS: TourStep[] = [
  {
    anchor:   '[data-tour="activity-bar"]',
    title:    'This is where the powerful stuff lives.',
    body:     'Every icon opens a panel — tasks, git, history, snapshots, agent teams, playbooks, tunnels. Hover any icon to see what it does.',
    position: 'right',
  },
  {
    anchor:   '[data-tour="tab-bar"]',
    title:    'Sessions, side by side.',
    body:     'Each tab is an independent AI session. Open as many as you need. Drag a tab to the edge to split the view.',
    position: 'bottom',
  },
  {
    anchor:   '[data-tour="cmd-k-hint"]',
    title:    'The answer to everything.',
    body:     '⌘K opens the command palette — search sessions, run custom commands, jump to settings, and more.',
    position: 'bottom',
  },
  {
    anchor:   '[data-tour="status-bar"]',
    title:    'Status at a glance.',
    body:     'Each pill shows live session state. Click any pill to open the related panel. The burn-rate pill opens your quota dashboard.',
    position: 'top',
  },
];

// ─── Popover positioning ──────────────────────────────────────────────────────

interface PopoverPos {
  top:   number;
  left:  number;
}

function computePopoverPos(
  anchorRect: DOMRect | null,
  popoverW:   number,
  popoverH:   number,
  position:   TourStep['position'],
  margin = 16,
): PopoverPos {
  if (!anchorRect) {
    return {
      top:  (window.innerHeight - popoverH) / 2,
      left: (window.innerWidth  - popoverW) / 2,
    };
  }
  const { top, left, right, bottom, width, height } = anchorRect;
  switch (position) {
    case 'right':
      return { top: top + height / 2 - popoverH / 2, left: right + margin };
    case 'left':
      return { top: top + height / 2 - popoverH / 2, left: left - popoverW - margin };
    case 'bottom':
      return { top: bottom + margin, left: left + width / 2 - popoverW / 2 };
    case 'top':
      return { top: top - popoverH - margin, left: left + width / 2 - popoverW / 2 };
  }
}

// ─── Anchor ring ──────────────────────────────────────────────────────────────

function AnchorRing({ rect }: { rect: DOMRect }) {
  const pad = 4;
  return (
    <div
      style={{
        position:     'fixed',
        top:          rect.top    - pad,
        left:         rect.left   - pad,
        width:        rect.width  + pad * 2,
        height:       rect.height + pad * 2,
        border:       '2px solid var(--v2-accent, var(--accent-primary))',
        borderRadius: 'var(--radius-md)',
        boxShadow:    '0 0 0 4px rgba(0,201,167,.15), inset 0 0 0 2px rgba(0,201,167,.1)',
        animation:    'anim-status-pulse 1.6s ease-in-out infinite',
        pointerEvents: 'none',
        zIndex:       10001,
      }}
    />
  );
}

// ─── Popover card ─────────────────────────────────────────────────────────────

function TourPopover({
  step,
  stepNum,
  total,
  pos,
  onNext,
  onSkip,
}: {
  step:    TourStep;
  stepNum: number;
  total:   number;
  pos:     PopoverPos;
  onNext:  () => void;
  onSkip:  () => void;
}) {
  const isLast = stepNum === total;
  return (
    <div
      style={{
        position:     'fixed',
        top:          Math.max(8, Math.min(pos.top,  window.innerHeight - 220)),
        left:         Math.max(8, Math.min(pos.left, window.innerWidth  - 360)),
        width:        340,
        background:   'var(--v2-surface-overlay, var(--surface-overlay))',
        border:       '1px solid var(--v2-border-default, var(--border-default))',
        borderRadius: 'var(--radius-lg)',
        boxShadow:    'var(--shadow-xl)',
        padding:      20,
        zIndex:       10002,
        fontFamily:   'var(--font-ui)',
      }}
    >
      {/* Step label */}
      <div style={{
        fontFamily:    'var(--font-mono-ui, "JetBrains Mono", monospace)',
        fontSize:      10,
        color:         'var(--v2-accent, var(--accent-primary))',
        letterSpacing: '.14em',
        textTransform: 'uppercase',
        marginBottom:  8,
      }}>
        Step {stepNum} of {total} · {STEPS[stepNum - 1].anchor.replace(/\[data-tour="(.+)"\]/, '$1').replace(/-/g, ' ')}
      </div>

      {/* Title */}
      <div style={{
        color:        'var(--v2-text-primary, var(--text-primary))',
        fontSize:     'var(--text-md)',
        fontWeight:   600,
        marginBottom: 8,
        lineHeight:   1.3,
      }}>
        {step.title}
      </div>

      {/* Body */}
      <div style={{
        color:        'var(--v2-text-secondary, var(--text-secondary))',
        fontSize:     'var(--text-sm)',
        marginBottom: 16,
        lineHeight:   1.6,
        maxWidth:     300,
      }}>
        {step.body}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          onClick={onSkip}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          4,
            padding:      '6px 12px',
            background:   'transparent',
            color:        'var(--v2-text-tertiary, var(--text-tertiary))',
            border:       '1px solid var(--v2-border-default, var(--border-default))',
            borderRadius: 'var(--radius-sm)',
            fontSize:     'var(--text-sm)',
            cursor:       'pointer',
            fontFamily:   'var(--font-ui)',
          }}
        >
          <X size={11} /> Skip tour
        </button>
        <button
          onClick={onNext}
          style={{
            display:      'flex',
            alignItems:   'center',
            gap:          4,
            padding:      '6px 14px',
            background:   'var(--v2-accent, var(--accent-primary))',
            color:        '#000',
            border:       'none',
            borderRadius: 'var(--radius-sm)',
            fontSize:     'var(--text-sm)',
            fontWeight:   600,
            cursor:       'pointer',
            fontFamily:   'var(--font-ui)',
          }}
        >
          {isLast ? 'Got it' : 'Next'} {!isLast && <ArrowRight size={11} />}
        </button>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface TourProps {
  onDismiss: () => void;
}

async function persistTourDismissed() {
  // Primary: settings IPC
  try {
    if (typeof window.electronAPI?.setSettings === 'function') {
      await window.electronAPI.setSettings({ tourDismissed: true });
    }
  } catch { /* ignore */ }
  // Defense-in-depth: localStorage fallback
  try {
    localStorage.setItem('tourDismissed', 'true');
  } catch { /* ignore */ }
}

export async function isTourDismissed(): Promise<boolean> {
  // Check localStorage fast-path first
  if (localStorage.getItem('tourDismissed') === 'true') return true;
  // Check settings
  try {
    if (typeof window.electronAPI?.getSettings === 'function') {
      const s = await window.electronAPI.getSettings();
      if (s.tourDismissed === true) return true;
    }
  } catch { /* ignore */ }
  return false;
}

export function Tour({ onDismiss }: TourProps) {
  const [stepIndex, setStepIndex] = useState(0);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const currentStep = STEPS[stepIndex];

  // Resolve anchor rect on step change
  useEffect(() => {
    const el = document.querySelector(currentStep.anchor);
    if (el) {
      setAnchorRect(el.getBoundingClientRect());
    } else {
      setAnchorRect(null);
    }
  }, [stepIndex, currentStep.anchor]);

  // Recompute on resize
  useEffect(() => {
    const handler = () => {
      const el = document.querySelector(currentStep.anchor);
      setAnchorRect(el ? el.getBoundingClientRect() : null);
    };
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, [currentStep.anchor]);

  const dismiss = useCallback(async () => {
    await persistTourDismissed();
    onDismiss();
  }, [onDismiss]);

  const handleNext = useCallback(async () => {
    if (stepIndex >= STEPS.length - 1) {
      await dismiss();
    } else {
      setStepIndex(i => i + 1);
    }
  }, [stepIndex, dismiss]);

  const popoverW = 340;
  const popoverH = 200; // approximate
  const pos = computePopoverPos(anchorRect, popoverW, popoverH, currentStep.position);

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        style={{
          position:   'fixed',
          inset:      0,
          background: 'rgba(0,0,0,0.4)',
          zIndex:     10000,
          pointerEvents: 'none',
        }}
      />

      {/* Anchor ring */}
      {anchorRect && <AnchorRing rect={anchorRect} />}

      {/* Popover */}
      <div ref={popoverRef}>
        <TourPopover
          step={currentStep}
          stepNum={stepIndex + 1}
          total={STEPS.length}
          pos={pos}
          onNext={handleNext}
          onSkip={dismiss}
        />
      </div>
    </>,
    document.body
  );
}
