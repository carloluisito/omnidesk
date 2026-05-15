/**
 * SurfaceCard — a surface-tier container primitive.
 *
 * Variant maps to the v2 surface token tier:
 *   base | low | mid | high | overlay
 *
 * elevated adds --shadow-md (raised card feel).
 * as prop lets callers pick the rendered tag (default: div).
 */
import { type ElementType, type ComponentPropsWithoutRef } from 'react';

type SurfaceVariant = 'base' | 'low' | 'mid' | 'high' | 'overlay';

const SURFACE_TOKENS: Record<SurfaceVariant, string> = {
  base:    'var(--v2-surface-base)',
  low:     'var(--v2-surface-low)',
  mid:     'var(--v2-surface-mid)',
  high:    'var(--v2-surface-high)',
  overlay: 'var(--v2-surface-overlay)',
};

interface SurfaceCardOwnProps {
  variant?:   SurfaceVariant;
  elevated?:  boolean;
  className?: string;
  as?:        ElementType;
}

// Merge own props with the HTML element's props (excluding collisions)
type SurfaceCardProps<T extends ElementType = 'div'> =
  SurfaceCardOwnProps &
  Omit<ComponentPropsWithoutRef<T>, keyof SurfaceCardOwnProps>;

export function SurfaceCard<T extends ElementType = 'div'>({
  variant  = 'mid',
  elevated = false,
  className,
  as,
  style,
  children,
  ...rest
}: SurfaceCardProps<T>) {
  const Tag = (as ?? 'div') as ElementType;

  const baseStyle: React.CSSProperties = {
    backgroundColor: SURFACE_TOKENS[variant],
    borderRadius:    'var(--radius-lg)',
    boxShadow:       elevated ? 'var(--shadow-md)' : undefined,
    ...((style as React.CSSProperties) ?? {}),
  };

  return (
    <Tag className={className} style={baseStyle} {...rest}>
      {children}
    </Tag>
  );
}
