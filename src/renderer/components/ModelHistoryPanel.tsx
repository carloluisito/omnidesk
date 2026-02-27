import { useModelHistory } from '../hooks/useModelHistory';
import { ClaudeModel } from '../../shared/ipc-types';

interface ModelHistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string | null;
  sessionName?: string;
}

const MODEL_COLORS: Record<ClaudeModel, string> = {
  haiku: 'var(--semantic-success, #3DD68C)',   // green
  sonnet: 'var(--accent-primary, #00C9A7)',     // teal
  opus: 'var(--text-secondary, #9DA3BE)',       // muted
  auto: 'var(--semantic-warning, #F7A84A)',     // yellow
};

const MODEL_LABELS: Record<ClaudeModel, string> = {
  haiku: 'Haiku',
  sonnet: 'Sonnet',
  opus: 'Opus',
  auto: 'Auto',
};

function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  // If today, show time only
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }

  // Otherwise show date and time
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  });
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    const remainingMinutes = minutes % 60;
    return `${hours}h ${remainingMinutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m`;
  }
  return `${seconds}s`;
}

export function ModelHistoryPanel({ isOpen, onClose, sessionId, sessionName }: ModelHistoryPanelProps) {
  const { history, isLoading, clearHistory } = useModelHistory(sessionId);

  if (!isOpen) return null;

  const handleClear = async () => {
    if (confirm('Clear all model history for this session?')) {
      await clearHistory();
    }
  };

  const totalTime = history.length > 0 && history[history.length - 1].timestamp
    ? history[history.length - 1].timestamp - history[0].timestamp
    : 0;

  return (
    <>
      <div className="model-history-overlay" onClick={onClose} />
      <div className="model-history-panel">
        <div className="model-history-header">
          <div>
            <h2 className="model-history-title">Model History</h2>
            {sessionName && <p className="model-history-subtitle">{sessionName}</p>}
          </div>
          <button className="close-btn" onClick={onClose} aria-label="Close">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {history.length > 0 && (
          <div className="model-history-stats">
            <span>{history.length} switches</span>
            {totalTime > 0 && (
              <>
                <span className="stat-separator">•</span>
                <span>{formatDuration(totalTime)} session</span>
              </>
            )}
            <button className="clear-history-btn" onClick={handleClear}>
              Clear History
            </button>
          </div>
        )}

        <div className="model-history-content">
          {isLoading ? (
            <div className="model-history-loading">
              <div className="loading-spinner" />
              <p>Loading history...</p>
            </div>
          ) : history.length === 0 ? (
            <div className="model-history-empty">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <h3>No model history</h3>
              <p>Switch models to see your history here</p>
            </div>
          ) : (
            <div className="model-history-timeline">
              {history.map((entry) => (
                <div key={entry.id} className="timeline-entry">
                  <div className="timeline-marker" style={{ backgroundColor: MODEL_COLORS[entry.toModel] }} />
                  <div className="timeline-content">
                    <div className="timeline-switch">
                      {entry.fromModel && (
                        <>
                          <span className="model-badge" style={{ color: MODEL_COLORS[entry.fromModel] }}>
                            {MODEL_LABELS[entry.fromModel]}
                          </span>
                          <span className="arrow">→</span>
                        </>
                      )}
                      <span className="model-badge" style={{ color: MODEL_COLORS[entry.toModel] }}>
                        {MODEL_LABELS[entry.toModel]}
                      </span>
                    </div>
                    <div className="timeline-meta">
                      <span className="timeline-time">{formatTimestamp(entry.timestamp)}</span>
                      {entry.durationMs && (
                        <>
                          <span className="meta-separator">•</span>
                          <span className="timeline-duration">
                            {formatDuration(entry.durationMs)} in {entry.fromModel ? MODEL_LABELS[entry.fromModel] : 'previous'}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <style>{`
          .model-history-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(26, 27, 38, 0.8);
            backdrop-filter: blur(4px);
            z-index: 998;
            animation: overlay-fade-in 0.2s ease;
          }

          @keyframes overlay-fade-in {
            from { opacity: 0; }
            to { opacity: 1; }
          }

          .model-history-panel {
            position: fixed;
            top: 50%;
            right: 24px;
            transform: translateY(-50%);
            width: 420px;
            max-height: 85vh;
            background: var(--surface-overlay, #1A1B26);
            border: 2px solid var(--border-default, #292E44);
            border-radius: 12px;
            z-index: 999;
            font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
            display: flex;
            flex-direction: column;
            box-shadow: 0 24px 96px rgba(0, 0, 0, 0.6);
            animation: panel-slide-in 0.3s cubic-bezier(0, 0, 0.2, 1);
          }

          @keyframes panel-slide-in {
            from {
              opacity: 0;
              transform: translateY(-50%) translateX(20px);
            }
            to {
              opacity: 1;
              transform: translateY(-50%) translateX(0);
            }
          }

          .model-history-header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            padding: 24px;
            border-bottom: 1px solid var(--border-default, #292E44);
            flex-shrink: 0;
          }

          .model-history-title {
            font-size: 18px;
            font-weight: 600;
            color: var(--text-primary, #E2E4F0);
            margin: 0;
          }

          .model-history-subtitle {
            font-size: 12px;
            color: var(--text-tertiary, #5C6080);
            margin: 4px 0 0 0;
          }

          .close-btn {
            display: flex;
            align-items: center;
            justify-content: center;
            width: 32px;
            height: 32px;
            background: transparent;
            border: none;
            color: var(--text-secondary, #9DA3BE);
            cursor: pointer;
            border-radius: 6px;
            transition: all 0.2s ease;
            flex-shrink: 0;
          }

          .close-btn:hover {
            background: var(--surface-float, #222435);
            color: var(--semantic-error, #F7678E);
          }

          .model-history-stats {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 12px 24px;
            background: var(--surface-overlay, #1A1B26);
            border-bottom: 1px solid var(--border-default, #292E44);
            font-size: 12px;
            color: var(--text-secondary, #9DA3BE);
            flex-shrink: 0;
          }

          .stat-separator {
            color: var(--border-default, #292E44);
          }

          .clear-history-btn {
            margin-left: auto;
            padding: 4px 12px;
            background: transparent;
            border: 1px solid var(--border-default, #292E44);
            border-radius: 4px;
            color: var(--semantic-error, #F7678E);
            font-size: 11px;
            font-family: inherit;
            cursor: pointer;
            transition: all 0.2s ease;
          }

          .clear-history-btn:hover {
            background: rgba(247, 103, 142, 0.1);
            border-color: var(--semantic-error, #F7678E);
          }

          .model-history-content {
            flex: 1;
            overflow-y: auto;
            padding: 24px;
          }

          .model-history-content::-webkit-scrollbar {
            width: 8px;
          }

          .model-history-content::-webkit-scrollbar-track {
            background: var(--surface-overlay, #1A1B26);
          }

          .model-history-content::-webkit-scrollbar-thumb {
            background: var(--border-default, #292E44);
            border-radius: 4px;
          }

          .model-history-content::-webkit-scrollbar-thumb:hover {
            background: var(--text-tertiary, #5C6080);
          }

          .model-history-loading {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 48px 24px;
            gap: 16px;
          }

          .loading-spinner {
            width: 32px;
            height: 32px;
            border: 3px solid var(--border-default, #292E44);
            border-top-color: var(--accent-primary, #00C9A7);
            border-radius: 50%;
            animation: spin 1s linear infinite;
          }

          @keyframes spin {
            to { transform: rotate(360deg); }
          }

          .model-history-loading p {
            margin: 0;
            color: var(--text-tertiary, #5C6080);
            font-size: 13px;
          }

          .model-history-empty {
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 48px 24px;
            text-align: center;
          }

          .model-history-empty svg {
            color: var(--border-default, #292E44);
            margin-bottom: 16px;
          }

          .model-history-empty h3 {
            font-size: 16px;
            font-weight: 600;
            color: var(--text-secondary, #9DA3BE);
            margin: 0 0 8px 0;
          }

          .model-history-empty p {
            font-size: 13px;
            color: var(--text-tertiary, #5C6080);
            margin: 0;
          }

          .model-history-timeline {
            display: flex;
            flex-direction: column;
            gap: 20px;
          }

          .timeline-entry {
            display: flex;
            gap: 16px;
            position: relative;
          }

          .timeline-entry:not(:last-child)::after {
            content: '';
            position: absolute;
            left: 6px;
            top: 24px;
            bottom: -20px;
            width: 2px;
            background: var(--border-default, #292E44);
          }

          .timeline-marker {
            width: 14px;
            height: 14px;
            border-radius: 50%;
            border: 3px solid var(--surface-overlay, #1A1B26);
            flex-shrink: 0;
            margin-top: 4px;
            z-index: 1;
          }

          .timeline-content {
            flex: 1;
            min-width: 0;
          }

          .timeline-switch {
            display: flex;
            align-items: center;
            gap: 8px;
            margin-bottom: 4px;
          }

          .model-badge {
            font-size: 13px;
            font-weight: 600;
          }

          .arrow {
            font-size: 12px;
            color: var(--text-tertiary, #5C6080);
          }

          .timeline-meta {
            display: flex;
            align-items: center;
            gap: 6px;
            font-size: 11px;
            color: var(--text-tertiary, #5C6080);
          }

          .meta-separator {
            color: var(--border-default, #292E44);
          }

          .timeline-time {
            color: var(--text-secondary, #9DA3BE);
          }

          .timeline-duration {
            color: var(--text-tertiary, #5C6080);
          }
        `}</style>
      </div>
    </>
  );
}
