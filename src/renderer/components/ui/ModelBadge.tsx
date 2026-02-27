import { useEffect, useState } from 'react';
import type { ClaudeModel } from '../../../shared/ipc-types';
import type { ProviderId } from '../../../shared/types/provider-types';

interface ModelBadgeProps {
  model: ClaudeModel | null;
  isLoading?: boolean;
  size?: 'small' | 'medium'; // small=PaneHeader, medium=Tab
  providerId?: ProviderId;
}

// Model label mapping — shown in badge
const MODEL_LABELS: Record<ClaudeModel, string> = {
  haiku:  'HKU',
  sonnet: 'SNT',
  opus:   'OPS',
  auto:   'AUTO',
};

// Full names for tooltip
const MODEL_NAMES: Record<ClaudeModel, string> = {
  haiku:  'Haiku',
  sonnet: 'Sonnet',
  opus:   'Opus',
  auto:   'Auto',
};

export function ModelBadge({ model, isLoading = false, size = 'medium', providerId }: ModelBadgeProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [prevModel, setPrevModel] = useState(model);

  // Trigger animation on model change
  useEffect(() => {
    if (model !== prevModel && model !== null) {
      setIsAnimating(true);
      setTimeout(() => setIsAnimating(false), 500);
      setPrevModel(model);
    }
  }, [model, prevModel]);

  // Hide when provider is not Claude (Claude-specific feature)
  if (providerId && providerId !== 'claude') return null;

  if (!model && !isLoading) return null;

  const fontSize = size === 'small' ? 'var(--text-2xs, 10px)' : 'var(--text-xs, 11px)';
  const height   = size === 'small' ? '14px' : '16px';
  const displayText = isLoading ? '···' : (model ? MODEL_LABELS[model] : 'UNK');
  const title = model ? `Current model: ${MODEL_NAMES[model]}` : 'Unknown model';

  return (
    <span
      className={`model-badge${isAnimating ? ' model-badge-animating' : ''}`}
      style={{
        display:         'inline-flex',
        alignItems:      'center',
        padding:         '0 var(--space-1, 4px)',
        borderRadius:    'var(--radius-sm, 3px)',
        fontFamily:      'var(--font-mono-ui, "JetBrains Mono", monospace)',
        fontSize,
        height,
        fontWeight:      'var(--weight-semibold, 600)' as any,
        color:           isLoading ? 'var(--text-tertiary, #5C6080)' : 'var(--text-secondary, #9DA3BE)',
        backgroundColor: isLoading ? 'var(--surface-float, #222435)' : 'var(--surface-high, #2A2D42)',
        border:          '1px solid var(--border-default, #292E44)',
        lineHeight:      1,
        transition:      'all var(--duration-fast, 150ms) var(--ease-inout, ease)',
        letterSpacing:   'var(--tracking-wide, 0.04em)',
        userSelect:      'none',
      }}
      title={title}
      role="status"
      aria-live="polite"
    >
      {displayText}
      <style>{`
        .model-badge-animating {
          animation: badge-pulse 0.5s var(--ease-out, ease) both;
        }
        @keyframes badge-pulse {
          0%   { opacity: 0; transform: scale(0.8); }
          50%  { transform: scale(1.05); }
          100% { opacity: 1; transform: scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          .model-badge-animating {
            animation: none;
          }
        }
      `}</style>
    </span>
  );
}
