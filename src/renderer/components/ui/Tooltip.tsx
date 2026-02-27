/**
 * Tooltip — hover tooltip, 400ms delay.
 *
 * Default placement: right. Configurable: top, right, bottom, left.
 * Background: surface-high, text-sm, radius-sm, shadow-md.
 */
import { useState, useRef, useCallback } from 'react';

export type TooltipPlacement = 'top' | 'right' | 'bottom' | 'left';

interface TooltipProps {
  content: React.ReactNode;
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

export function Tooltip({ content, placement = 'right', delay = 400, disabled = false, children }: TooltipProps) {
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
            backgroundColor: 'var(--surface-high)',
            color:           'var(--text-secondary)',
            fontSize:        'var(--text-sm)',
            fontFamily:      'var(--font-ui)',
            lineHeight:      'var(--leading-normal)' as any,
            padding:         '4px 8px',
            borderRadius:    'var(--radius-sm)',
            boxShadow:       'var(--shadow-md)',
            border:          '1px solid var(--border-default)',
            whiteSpace:      'nowrap',
            pointerEvents:   'none',
            animation:       'fade-in var(--duration-fast) var(--ease-out) both',
          }}
        >
          {content}
        </span>
      )}
    </span>
  );
}
