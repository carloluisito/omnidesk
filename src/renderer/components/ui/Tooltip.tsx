/**
 * Tooltip — hover tooltip, 400ms delay.
 *
 * Default placement: right. Configurable: top, right, bottom, left.
 * Background: surface-high, text-sm, radius-sm, shadow-md.
 *
 * Wave 03 — shortcut hint slot:
 *   shortcut?: string  — rendered right-aligned in mono, --v2-text-tertiary.
 *   When absent, renders exactly as before (backward compat).
 */
import { useState, useRef, useCallback } from 'react';

export type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left';

interface TooltipProps {
  content: React.ReactNode;
  /** Optional keyboard shortcut hint shown right-aligned in mono inside the tooltip. */
  shortcut?: string;
  placement?: TooltipPlacement;
  delay?: number;       /* ms, default 400 */
  disabled?: boolean;
  children: React.ReactElement;
}

const PLACEMENT_STYLES: Record<TooltipPlacement, React.CSSProperties> = {
  right: {
    left:      'calc(100% + 8px)',
    top:       '50%',
    transform: 'translateY(-50%)',
  },
  left: {
    right:     'calc(100% + 8px)',
    top:       '50%',
    transform: 'translateY(-50%)',
  },
  top: {
    bottom:    'calc(100% + 8px)',
    left:      '50%',
    transform: 'translateX(-50%)',
  },
  bottom: {
    top:       'calc(100% + 8px)',
    left:      '50%',
    transform: 'translateX(-50%)',
  },
};

export function Tooltip({ content, shortcut, placement = 'right', delay = 400, disabled = false, children }: TooltipProps) {
  const [visible, setVisible]   = useState(false);
  const timerRef                = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback(() => {
    if (disabled) return;
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay, disabled]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(false);
  }, []);

  return (
    <span
      style={{ position: 'relative', display: 'inline-flex' }}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && !disabled && (
        <span
          role="tooltip"
          style={{
            position:        'absolute',
            ...PLACEMENT_STYLES[placement],
            zIndex:          'var(--z-tooltip)' as any,
            backgroundColor: 'var(--v2-surface-high)',
            color:           'var(--v2-text-secondary)',
            fontSize:        'var(--text-sm)',
            fontFamily:      'var(--font-ui)',
            lineHeight:      'var(--leading-normal)' as any,
            padding:         '4px 8px',
            borderRadius:    'var(--radius-sm)',
            boxShadow:       'var(--shadow-md)',
            border:          '1px solid var(--v2-border-default)',
            whiteSpace:      'nowrap',
            pointerEvents:   'none',
            animation:       'fade-in var(--duration-fast) var(--ease-out) both',
            // When shortcut is present, lay out as a row with gap
            display:         shortcut ? 'inline-flex' : undefined,
            alignItems:      shortcut ? 'center' : undefined,
            gap:             shortcut ? 8 : undefined,
          }}
        >
          <span>{content}</span>
          {shortcut && (
            <span
              style={{
                fontFamily:  'var(--font-mono-ui, "JetBrains Mono", monospace)',
                fontSize:    'var(--text-2xs, 10px)',
                color:       'var(--v2-text-tertiary, var(--v2-text-tertiary))',
                background:  'var(--v2-surface-low, var(--v2-surface-low))',
                border:      '1px solid var(--v2-border-subtle, var(--v2-border-subtle))',
                borderRadius: 'var(--radius-sm)',
                padding:     '1px 4px',
                lineHeight:  1.4,
                letterSpacing: '0.02em',
                flexShrink:  0,
              }}
            >
              {shortcut}
            </span>
          )}
        </span>
      )}
    </span>
  );
}
