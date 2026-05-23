/**
 * FieldError — field-level validation error caption.
 *
 * Renders below a form input with:
 * - Error icon + message in --v2-error color, mono font
 * - The associated input gets a red ring via data-error="true" attribute
 *
 * Usage:
 *   <input data-error={!!error} ... />
 *   {error && <FieldError>{error}</FieldError>}
 *
 * The `data-error="true"` attribute on the input triggers the error-ring CSS
 * rule in globals.css (added by this component's global style injection).
 *
 * Per phase-2/09-toast.jsx FieldError spec.
 */
import React from 'react';

export interface FieldErrorProps {
  children: React.ReactNode;
  /** id to set on the error element — pass to input's aria-describedby */
  id?: string;
  style?: React.CSSProperties;
  className?: string;
}

export function FieldError({ children, id, style, className }: FieldErrorProps) {
  return (
    <>
      <div
        id={id}
        role="alert"
        aria-live="polite"
        className={className}
        style={{
          color:      'var(--v2-error)',
          fontSize:   'var(--text-xs)',
          marginTop:  6,
          display:    'flex',
          alignItems: 'flex-start',
          gap:        6,
          fontFamily: 'var(--font-mono)',
          lineHeight: 1.4,
          ...style,
        }}
      >
        {/* Error icon */}
        <svg
          width="12" height="12" viewBox="0 0 24 24"
          fill="none" stroke="var(--v2-error)" strokeWidth="2"
          strokeLinecap="round" strokeLinejoin="round"
          aria-hidden="true"
          style={{ flexShrink: 0, marginTop: 1 }}
        >
          <circle cx="12" cy="12" r="10" />
          <path d="M15 9l-6 6M9 9l6 6" />
        </svg>
        <span>{children}</span>
      </div>

      {/* Global style: data-error="true" on an input applies the error ring */}
      <style>{`
        input[data-error="true"],
        select[data-error="true"],
        textarea[data-error="true"] {
          border-color: var(--v2-error) !important;
          box-shadow:   0 0 0 2px var(--v2-surface-low, #11131C),
                        0 0 0 4px var(--v2-error) !important;
          outline:      none;
        }
      `}</style>
    </>
  );
}
