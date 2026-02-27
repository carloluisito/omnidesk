import { ReactNode } from 'react';

interface QuickActionCardProps {
  icon: ReactNode;
  title: string;
  description: string;
  onClick: () => void;
  /* accentColor prop removed — all cards use --border-accent on hover per Obsidian spec */
}

export function QuickActionCard({
  icon,
  title,
  description,
  onClick,
}: QuickActionCardProps) {
  return (
    <button type="button" className="quick-action-card" onClick={onClick}>
      <div className="card-icon">
        {icon}
      </div>
      <h3 className="card-title">{title}</h3>
      <p className="card-description">{description}</p>

      <style>{`
        .quick-action-card {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          padding: var(--space-5, 20px);
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-lg, 10px);
          cursor: pointer;
          transition:
            border-color var(--duration-fast, 150ms) var(--ease-inout, ease),
            box-shadow var(--duration-fast, 150ms) var(--ease-inout, ease),
            transform var(--duration-fast, 150ms) var(--ease-out, ease);
          width: 260px;
          text-align: left;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          animation: card-fade-in 0.5s var(--ease-out, ease) backwards;
        }

        .quick-action-card:nth-child(1) {
          animation-delay: 0.1s;
        }

        .quick-action-card:nth-child(2) {
          animation-delay: 0.2s;
        }

        .quick-action-card:nth-child(3) {
          animation-delay: 0.3s;
        }

        @keyframes card-fade-in {
          from {
            opacity: 0;
            transform: translateY(12px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .quick-action-card:hover {
          transform: translateY(-3px);
          border-color: var(--border-accent, #00C9A7);
          box-shadow: var(--shadow-glow-accent, 0 0 16px #00C9A730);
        }

        .quick-action-card:active {
          transform: translateY(-1px);
        }

        .quick-action-card:focus-visible {
          outline: 2px solid var(--state-focus, #00C9A740);
          outline-offset: 2px;
        }

        .card-icon {
          width: 36px;
          height: 36px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-primary-muted, #00C9A714);
          border-radius: var(--radius-md, 6px);
          margin-bottom: var(--space-3, 12px);
          color: var(--text-accent, #00C9A7);
        }

        .card-title {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-base, 13px);
          font-weight: var(--weight-semibold, 600);
          color: var(--text-primary, #E2E4F0);
          margin: 0 0 var(--space-2, 8px) 0;
        }

        .card-description {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-regular, 400);
          color: var(--text-secondary, #9DA3BE);
          margin: 0;
          line-height: var(--leading-normal, 1.5);
        }

        @media (prefers-reduced-motion: reduce) {
          .quick-action-card {
            animation: none;
          }
        }
      `}</style>
    </button>
  );
}
