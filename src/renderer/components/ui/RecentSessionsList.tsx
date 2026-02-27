import { ProviderBadge } from './ProviderBadge';
import type { ProviderId } from '../../../shared/types/provider-types';

interface RecentSession {
  id: string;
  name: string;
  timestamp: number;
  directory?: string;
  providerId?: ProviderId;
}

interface RecentSessionsListProps {
  sessions: RecentSession[];
  onSelectSession: (sessionId: string) => void;
}

export function RecentSessionsList({ sessions, onSelectSession }: RecentSessionsListProps) {
  if (sessions.length === 0) {
    return null;
  }

  const formatTimestamp = (timestamp: number) => {
    const now = Date.now();
    const diff = now - timestamp;
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    return 'Just now';
  };

  return (
    <div className="recent-sessions">
      <h2 className="recent-title">Recent Sessions</h2>
      <div className="sessions-list">
        {sessions.slice(0, 3).map((session, index) => (
          <button
            type="button"
            key={session.id}
            className="session-item"
            onClick={() => onSelectSession(session.id)}
            aria-label={`Open session ${session.name}`}
            style={{ animationDelay: `${0.8 + index * 0.1}s` }}
          >
            <ProviderBadge providerId={session.providerId} size="sm" />
            <div className="session-info">
              <div className="session-name">{session.name}</div>
              {session.directory && (
                <div className="session-dir">{session.directory}</div>
              )}
            </div>
            <div className="session-time">{formatTimestamp(session.timestamp)}</div>
          </button>
        ))}
      </div>

      <style>{`
        .recent-sessions {
          margin-top: var(--space-12, 48px);
          width: 100%;
          max-width: 700px;
        }

        .recent-title {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-medium, 500);
          color: var(--text-secondary, #9DA3BE);
          margin: 0 0 var(--space-3, 12px) 0;
        }

        .sessions-list {
          display: flex;
          flex-direction: column;
          gap: var(--space-2, 8px);
        }

        .session-item {
          display: flex;
          align-items: center;
          gap: var(--space-3, 12px);
          padding: var(--space-2, 8px) var(--space-3, 12px);
          background: var(--surface-raised, #13141C);
          border: 1px solid var(--border-subtle, #1E2030);
          border-radius: var(--radius-md, 6px);
          cursor: pointer;
          transition:
            border-color var(--duration-fast, 150ms) var(--ease-inout, ease),
            background-color var(--duration-fast, 150ms) var(--ease-inout, ease),
            transform var(--duration-fast, 150ms) var(--ease-out, ease);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          text-align: left;
          width: 100%;
          animation: session-fade-in 0.5s var(--ease-out, ease) backwards;
        }

        @keyframes session-fade-in {
          from {
            opacity: 0;
            transform: translateX(-20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .session-item:hover {
          border-color: var(--border-default, #292E44);
          background: var(--surface-float, #222435);
          transform: translateX(2px);
        }

        .session-item:focus-visible {
          outline: 2px solid var(--state-focus, #00C9A740);
          outline-offset: 2px;
        }

        .session-info {
          flex: 1;
          min-width: 0;
        }

        .session-name {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-medium, 500);
          color: var(--text-primary, #E2E4F0);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .session-dir {
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-top: 1px;
        }

        .session-time {
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
          flex-shrink: 0;
          margin-left: auto;
        }

        @media (prefers-reduced-motion: reduce) {
          .session-item {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
