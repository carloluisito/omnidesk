/**
 * Button — variants: primary, secondary, ghost, danger.
 * Sizes: sm, md, lg.
 * States: default, hover, active, focus, disabled, loading.
 */
import { forwardRef } from 'react';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize    = 'sm' | 'md' | 'lg';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:  ButtonVariant;
  size?:     ButtonSize;
  loading?:  boolean;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
}

const SIZE_STYLES: Record<ButtonSize, React.CSSProperties> = {
  sm: {
    height:     '24px',
    padding:    '0 var(--space-2)',
    fontSize:   'var(--text-sm)',
    borderRadius: 'var(--radius-sm)',
    gap:        'var(--space-1)',
  },
  md: {
    height:     '32px',
    padding:    '0 var(--space-3)',
    fontSize:   'var(--text-base)',
    borderRadius: 'var(--radius-md)',
    gap:        'var(--space-2)',
  },
  lg: {
    height:     '40px',
    padding:    '0 var(--space-4)',
    fontSize:   'var(--text-md)',
    borderRadius: 'var(--radius-md)',
    gap:        'var(--space-2)',
  },
};

const VARIANT_STYLES: Record<ButtonVariant, React.CSSProperties> = {
  primary: {
    backgroundColor: 'var(--accent-primary)',
    color:           'var(--text-inverse)',
    border:          '1px solid transparent',
  },
  secondary: {
    backgroundColor: 'transparent',
    color:           'var(--text-secondary)',
    border:          '1px solid var(--border-default)',
  },
  ghost: {
    backgroundColor: 'transparent',
    color:           'var(--text-secondary)',
    border:          '1px solid transparent',
  },
  danger: {
    backgroundColor: 'var(--semantic-error)',
    color:           '#FFFFFF',
    border:          '1px solid transparent',
  },
};

function Spinner() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      className="animate-spin"
      aria-hidden="true"
    >
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.5" strokeDasharray="26" strokeDashoffset="18" strokeLinecap="round" />
    </svg>
  );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant  = 'secondary',
    size     = 'md',
    loading  = false,
    leftIcon,
    rightIcon,
    children,
    disabled,
    style,
    ...props
  },
  ref
) {
  const isDisabled = disabled || loading;

  return (
    <>
      <button
        ref={ref}
        disabled={isDisabled}
        className="omni-btn"
        data-variant={variant}
        data-size={size}
        style={{
          ...SIZE_STYLES[size],
          ...VARIANT_STYLES[variant],
          display:        'inline-flex',
          alignItems:     'center',
          justifyContent: 'center',
          fontFamily:     'var(--font-ui)',
          fontWeight:     'var(--weight-medium)' as any,
          lineHeight:     'var(--leading-tight)' as any,
          cursor:         isDisabled ? 'not-allowed' : 'pointer',
          opacity:        isDisabled ? 0.5 : 1,
          transition:     [
            `background-color var(--duration-fast) var(--ease-inout)`,
            `border-color var(--duration-fast) var(--ease-inout)`,
            `color var(--duration-fast) var(--ease-inout)`,
            `opacity var(--duration-fast) var(--ease-inout)`,
          ].join(', '),
          userSelect:     'none',
          whiteSpace:     'nowrap',
          outline:        'none',
          ...style,
        }}
        {...props}
      >
        {loading ? <Spinner /> : leftIcon}
        {children}
        {!loading && rightIcon}
      </button>

      <style>{`
        .omni-btn:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .omni-btn[data-variant="secondary"]:hover:not(:disabled) {
          background-color: var(--surface-float);
          border-color: var(--border-strong);
          color: var(--text-primary);
        }

        .omni-btn[data-variant="ghost"]:hover:not(:disabled) {
          background-color: var(--state-hover);
          color: var(--text-primary);
        }

        .omni-btn[data-variant="primary"]:hover:not(:disabled) {
          background-color: var(--accent-primary-dim);
          filter: none;
        }

        .omni-btn[data-variant="danger"]:hover:not(:disabled) {
          filter: brightness(1.1);
        }

        .omni-btn:active:not(:disabled) {
          transform: scale(0.98);
        }

        .omni-btn:focus-visible {
          outline: 2px solid var(--state-focus);
          outline-offset: 2px;
        }
      `}</style>
    </>
  );
});
