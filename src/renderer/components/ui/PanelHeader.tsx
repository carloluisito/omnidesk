import { ReactNode } from 'react';

interface PanelHeaderProps {
  title: string;
  onClose: () => void;
  actions?: ReactNode[];
}

export function PanelHeader({ title, onClose, actions = [] }: PanelHeaderProps) {
  return (
    <div className="panel-header">
      <h2 className="panel-title">{title}</h2>
      <div className="panel-actions">
        {actions.map((action, index) => (
          <div key={index} className="action-item">
            {action}
          </div>
        ))}
        <button
          className="panel-close-btn"
          onClick={onClose}
          aria-label="Close panel"
          title="Close"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18" strokeLinecap="round" strokeLinejoin="round" />
            <line x1="6" y1="6" x2="18" y2="18" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <style>{`
        .panel-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: var(--space-5, 20px) var(--space-6, 24px);
          border-bottom: 1px solid var(--border-default, #292E44);
          background: var(--surface-raised, #13141C);
          flex-shrink: 0;
        }

        .panel-title {
          font-size: var(--text-lg, 16px);
          font-weight: var(--weight-semibold, 600);
          color: var(--text-primary, #E2E4F0);
          margin: 0;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
        }

        .panel-actions {
          display: flex;
          align-items: center;
          gap: var(--space-3, 12px);
        }

        .action-item {
          display: flex;
        }

        .panel-close-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 28px;
          height: 28px;
          background: transparent;
          border: none;
          color: var(--text-tertiary, #5C6080);
          cursor: pointer;
          border-radius: var(--radius-md, 6px);
          transition: background var(--duration-fast, 150ms) ease,
                      color var(--duration-fast, 150ms) ease;
          flex-shrink: 0;
        }

        .panel-close-btn:hover {
          background: var(--state-hover, #FFFFFF0A);
          color: var(--text-primary, #E2E4F0);
        }

        .panel-close-btn:active {
          transform: scale(0.95);
        }
      `}</style>
    </div>
  );
}
