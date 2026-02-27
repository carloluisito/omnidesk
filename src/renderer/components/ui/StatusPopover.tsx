import { useState, useEffect } from 'react';
import { SessionStatus } from './SessionStatusIndicator';

interface StatusPopoverProps {
  sessionId: string;
  sessionName: string;
  status: SessionStatus;
  isOpen: boolean;
  onClose: () => void;
  onOpenBudget?: () => void;
  onOpenHistory?: () => void;
  onCreateCheckpoint?: () => void;
}

interface SessionStats {
  duration: string;
  model: string;
  apiCalls: number;
  tokensUsed: number;
  budgetUsage: number;
}

export function StatusPopover({
  sessionId,
  sessionName,
  status,
  isOpen,
  onClose,
  onOpenBudget,
  onOpenHistory,
  onCreateCheckpoint,
}: StatusPopoverProps) {
  const [stats, setStats] = useState<SessionStats>({
    duration: '0m',
    model: 'Claude Sonnet 4.5',
    apiCalls: 0,
    tokensUsed: 0,
    budgetUsage: 0,
  });

  useEffect(() => {
    if (!isOpen) return;

    // TODO: Load actual session stats from IPC
    // For now, use placeholder data
    setStats({
      duration: '12m',
      model: 'Claude Sonnet 4.5',
      apiCalls: 8,
      tokensUsed: 4521,
      budgetUsage: 35,
    });
  }, [isOpen, sessionId]);

  if (!isOpen) return null;

  const getStatusColor = () => {
    switch (status) {
      case 'ready': return 'var(--semantic-success, #3DD68C)';
      case 'initializing': return 'var(--semantic-warning, #F7A84A)';
      case 'error': return 'var(--semantic-error, #F7678E)';
      case 'warning': return 'var(--semantic-warning, #F7A84A)';
      case 'idle': return 'var(--text-tertiary, #5C6080)';
      default: return 'var(--text-tertiary, #5C6080)';
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'ready': return 'Claude Ready';
      case 'initializing': return 'Initializing...';
      case 'error': return 'Connection Error';
      case 'warning': return 'Budget Warning';
      case 'idle': return 'Idle';
      default: return 'Unknown';
    }
  };

  return (
    <>
      <div className="status-popover-overlay" onClick={onClose} />
      <div className="status-popover">
        <div className="popover-header">
          <h3 className="popover-title">Session Status</h3>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div className="status-badge" style={{ borderColor: getStatusColor() }}>
          <div className="status-dot" style={{ backgroundColor: getStatusColor() }} />
          <span className="status-label">{getStatusLabel()}</span>
        </div>

        <div className="stats-grid">
          <div className="stat-item">
            <div className="stat-label">Session</div>
            <div className="stat-value">{sessionName}</div>
          </div>

          <div className="stat-item">
            <div className="stat-label">Duration</div>
            <div className="stat-value">{stats.duration}</div>
          </div>

          <div className="stat-item">
            <div className="stat-label">Model</div>
            <div className="stat-value">{stats.model}</div>
          </div>

          <div className="stat-item">
            <div className="stat-label">API Calls</div>
            <div className="stat-value">{stats.apiCalls}</div>
          </div>

          <div className="stat-item">
            <div className="stat-label">Tokens</div>
            <div className="stat-value">{stats.tokensUsed.toLocaleString()}</div>
          </div>

          <div className="stat-item">
            <div className="stat-label">Budget Used</div>
            <div className="stat-value">
              <div className="budget-bar">
                <div
                  className="budget-fill"
                  style={{ width: `${Math.min(stats.budgetUsage, 100)}%` }}
                />
              </div>
              <span className="budget-percent">{stats.budgetUsage}%</span>
            </div>
          </div>
        </div>

        <div className="quick-actions">
          {onOpenBudget && (
            <button className="action-btn" onClick={() => { onOpenBudget(); onClose(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              Budget
            </button>
          )}
          {onOpenHistory && (
            <button className="action-btn" onClick={() => { onOpenHistory(); onClose(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              History
            </button>
          )}
          {onCreateCheckpoint && (
            <button className="action-btn" onClick={() => { onCreateCheckpoint(); onClose(); }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
                <polyline points="17 21 17 13 7 13 7 21" />
                <polyline points="7 3 7 8 15 8" />
              </svg>
              Checkpoint
            </button>
          )}
        </div>

        <style>{`
          .status-popover-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            z-index: 998;
          }

          .status-popover {
            position: fixed;
            top: 80px;
            right: 20px;
            width: 320px;
            background: var(--surface-overlay, #1A1B26);
            border: 1px solid var(--border-default, #292E44);
            border-radius: var(--radius-lg, 10px);
            padding: var(--space-5, 20px);
            z-index: 999;
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
            animation: popover-slide-in 0.2s cubic-bezier(0, 0, 0.2, 1);
          }

          @keyframes popover-slide-in {
            from {
              opacity: 0;
              transform: translateY(-10px);
            }
            to {
              opacity: 1;
              transform: translateY(0);
            }
          }

          .popover-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: var(--space-4, 16px);
          }

          .popover-title {
            font-size: var(--text-sm, 12px);
            font-weight: var(--weight-semibold, 600);
            color: var(--text-primary, #E2E4F0);
            margin: 0;
            text-transform: uppercase;
            letter-spacing: var(--tracking-widest, 0.1em);
          }

          .close-btn {
            background: none;
            border: none;
            color: var(--text-tertiary, #5C6080);
            cursor: pointer;
            padding: 4px;
            display: flex;
            align-items: center;
            justify-content: center;
            border-radius: var(--radius-sm, 3px);
            transition: color var(--duration-fast, 150ms) ease,
                        background var(--duration-fast, 150ms) ease;
          }

          .close-btn:hover {
            background: var(--state-hover, #FFFFFF0A);
            color: var(--text-primary, #E2E4F0);
          }

          .status-badge {
            display: flex;
            align-items: center;
            gap: var(--space-2, 8px);
            padding: var(--space-2, 8px) var(--space-3, 12px);
            background: var(--surface-float, #222435);
            border: 1px solid;
            border-radius: var(--radius-md, 6px);
            margin-bottom: var(--space-4, 16px);
          }

          .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
          }

          .status-label {
            font-size: var(--text-sm, 12px);
            font-weight: var(--weight-medium, 500);
            color: var(--text-primary, #E2E4F0);
          }

          .stats-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: var(--space-3, 12px);
            margin-bottom: var(--space-4, 16px);
          }

          .stat-item {
            display: flex;
            flex-direction: column;
            gap: 4px;
          }

          .stat-label {
            font-size: 10px;
            color: var(--text-tertiary, #5C6080);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          }

          .stat-value {
            font-size: var(--text-sm, 12px);
            color: var(--text-primary, #E2E4F0);
            font-weight: var(--weight-medium, 500);
            font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          }

          .budget-bar {
            width: 100%;
            height: 4px;
            background: var(--surface-float, #222435);
            border-radius: var(--radius-full, 9999px);
            overflow: hidden;
            margin-bottom: 4px;
          }

          .budget-fill {
            height: 100%;
            background: var(--accent-primary, #00C9A7);
            transition: width 0.3s ease;
          }

          .budget-percent {
            font-size: var(--text-xs, 11px);
            color: var(--text-secondary, #9DA3BE);
            font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          }

          .quick-actions {
            display: flex;
            gap: var(--space-2, 8px);
            padding-top: var(--space-4, 16px);
            border-top: 1px solid var(--border-subtle, #1E2030);
          }

          .action-btn {
            flex: 1;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 6px;
            padding: var(--space-2, 8px) var(--space-3, 12px);
            background: var(--surface-float, #222435);
            border: 1px solid var(--border-default, #292E44);
            border-radius: var(--radius-md, 6px);
            color: var(--text-secondary, #9DA3BE);
            font-size: var(--text-xs, 11px);
            font-weight: var(--weight-medium, 500);
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            cursor: pointer;
            transition: border-color var(--duration-fast, 150ms) ease,
                        color var(--duration-fast, 150ms) ease,
                        background var(--duration-fast, 150ms) ease;
          }

          .action-btn:hover {
            background: var(--state-hover, #FFFFFF0A);
            border-color: var(--border-accent, #00C9A7);
            color: var(--text-accent, #00C9A7);
          }

          .action-btn svg {
            opacity: 0.8;
          }
        `}</style>
      </div>
    </>
  );
}
