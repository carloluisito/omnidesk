import { useState, useEffect } from 'react';
import { BrandMark } from './BrandMark';
import { ProgressBar } from './ProgressBar';

interface ClaudeReadinessProgressProps {
  isVisible: boolean;
  providerName?: string; /* e.g. "Claude Code", "Codex CLI" — for provider-aware copy */
}

export function ClaudeReadinessProgress({ isVisible, providerName }: ClaudeReadinessProgressProps) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setStage(0);
      return;
    }

    // Progress through stages over 5 seconds — same timing as before
    const timers = [
      setTimeout(() => setStage(1), 800),   // "Starting shell..." → "Loading {provider}..."
      setTimeout(() => setStage(2), 2500),  // "Loading {provider}..." → "Almost ready..."
    ];

    return () => {
      timers.forEach(timer => clearTimeout(timer));
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const providerLabel = providerName ?? 'CLI';

  const stageMessages = [
    'Starting shell...',
    `Loading ${providerLabel}...`,
    'Almost ready...',
  ];

  // stage 0 = 33%, stage 1 = 66%, stage 2 = 99%
  const progressValue = ((stage + 1) / 3) * 100;

  // Title: "Initializing {providerName}" or "Starting session..." if no provider
  const title = providerName ? `Initializing ${providerName}` : 'Starting session...';

  return (
    <div
      className="session-readiness-overlay"
      aria-label={providerName ? `Initializing ${providerName}` : 'Session initializing'}
    >
      <div className="readiness-content">
        <div className="readiness-brandmark">
          <BrandMark size={48} color="var(--accent-primary)" />
        </div>

        <h2 className="readiness-title">{title}</h2>

        <div style={{ width: '280px' }}>
          <ProgressBar
            value={progressValue}
            max={100}
            height={4}
            label="Session initialization progress"
            color="var(--accent-primary)"
          />
        </div>

        <p className="readiness-status" key={stage} role="status" aria-live="polite">
          {stageMessages[stage]}
        </p>
      </div>

      <style>{`
        .session-readiness-overlay {
          position: absolute;
          inset: 0;
          background: color-mix(in srgb, var(--surface-overlay) 92%, transparent);
          backdrop-filter: blur(8px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 100;
          animation: overlay-fade-in var(--duration-slow, 300ms) var(--ease-out, ease) both;
        }

        @keyframes overlay-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        .readiness-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: var(--space-5, 20px);
          animation: content-slide-up var(--duration-slow, 300ms) var(--ease-out, ease) both;
        }

        @keyframes content-slide-up {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .readiness-brandmark {
          filter: drop-shadow(var(--shadow-glow-accent, 0 0 16px #00C9A730));
          animation: brandmark-pulse 2.4s var(--ease-inout, ease-in-out) infinite;
        }

        @keyframes brandmark-pulse {
          0%, 100% { filter: drop-shadow(0 0 8px var(--accent-primary-muted, #00C9A714)); }
          50%       { filter: drop-shadow(0 0 20px #00C9A740); }
        }

        .readiness-title {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-lg, 16px);
          font-weight: var(--weight-semibold, 600);
          color: var(--text-primary, #E2E4F0);
          margin: 0;
          letter-spacing: var(--tracking-tight, -0.01em);
          text-align: center;
        }

        .readiness-status {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-regular, 400);
          color: var(--text-secondary, #9DA3BE);
          margin: 0;
          min-height: 18px;
          animation: status-fade-in var(--duration-fast, 150ms) var(--ease-out, ease) both;
        }

        @keyframes status-fade-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .readiness-brandmark {
            animation: none;
          }
          .session-readiness-overlay,
          .readiness-content,
          .readiness-status {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
