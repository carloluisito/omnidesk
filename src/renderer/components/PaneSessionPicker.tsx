import { TabData } from './ui/Tab';

interface PaneSessionPickerProps {
  availableSessions: TabData[];
  onSelectSession: (sessionId: string) => void;
  onCreateNewSession: () => void;
  onCancel: () => void;
}

export function PaneSessionPicker({
  availableSessions,
  onSelectSession,
  onCreateNewSession,
  onCancel,
}: PaneSessionPickerProps) {
  return (
    <div className="pane-session-picker">
      <div className="picker-card">
        <div className="picker-header">
          <h3>Select a session for this pane</h3>
        </div>

        <button className="picker-new-session-btn" onClick={onCreateNewSession}>
          + New Session
        </button>

        {availableSessions.length > 0 && (
          <>
            <div className="picker-divider">
              <span>or choose existing</span>
            </div>

            <div className="picker-sessions">
              {availableSessions.map(session => (
                <div
                  key={session.id}
                  className="picker-session-item"
                  onClick={() => onSelectSession(session.id)}
                >
                  <div className="picker-session-name">{session.name}</div>
                  <div className="picker-session-dir">{session.workingDirectory}</div>
                  <div className={`picker-session-status status-${session.status}`}>
                    {session.status === 'running' ? '● Running' : '○ Exited'}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}

        <div className="picker-footer">
          <button className="picker-cancel-link" onClick={onCancel}>
            Cancel (close this pane)
          </button>
        </div>
      </div>

      <style>{`
        .pane-session-picker {
          width: 100%;
          height: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--surface-base, #0D0E14);
          padding: var(--space-6, 24px);
        }

        .picker-card {
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-lg, 10px);
          padding: var(--space-6, 24px);
          max-width: 500px;
          width: 100%;
          box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
        }

        .picker-header h3 {
          margin: 0 0 var(--space-4, 16px);
          font-size: var(--text-base, 13px);
          font-weight: var(--weight-semibold, 600);
          color: var(--text-primary, #E2E4F0);
        }

        .picker-new-session-btn {
          width: 100%;
          padding: var(--space-3, 12px);
          background: var(--accent-primary, #00C9A7);
          color: var(--text-inverse, #0D0E14);
          border: none;
          border-radius: var(--radius-md, 6px);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-semibold, 600);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          cursor: pointer;
          transition: background var(--duration-fast, 150ms) ease;
        }

        .picker-new-session-btn:hover {
          background: var(--accent-primary-dim, #009E84);
        }

        .picker-divider {
          display: flex;
          align-items: center;
          gap: var(--space-3, 12px);
          margin: var(--space-5, 20px) 0;
        }

        .picker-divider::before,
        .picker-divider::after {
          content: '';
          flex: 1;
          height: 1px;
          background: var(--border-subtle, #1E2030);
        }

        .picker-divider span {
          color: var(--text-tertiary, #5C6080);
          font-size: var(--text-xs, 11px);
          text-transform: uppercase;
          letter-spacing: var(--tracking-widest, 0.1em);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
        }

        .picker-sessions {
          display: flex;
          flex-direction: column;
          gap: var(--space-2, 8px);
          max-height: 300px;
          overflow-y: auto;
        }

        .picker-session-item {
          padding: var(--space-3, 12px);
          background: var(--surface-float, #222435);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          cursor: pointer;
          transition: border-color var(--duration-fast, 150ms) ease,
                      background var(--duration-fast, 150ms) ease;
        }

        .picker-session-item:hover {
          background: var(--state-hover, #FFFFFF0A);
          border-color: var(--border-accent, #00C9A7);
        }

        .picker-session-name {
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-medium, 500);
          color: var(--text-primary, #E2E4F0);
          margin-bottom: 4px;
        }

        .picker-session-dir {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary, #5C6080);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          margin-bottom: 6px;
        }

        .picker-session-status {
          font-size: 10px;
          display: inline-block;
          padding: 2px var(--space-2, 8px);
          border-radius: var(--radius-sm, 3px);
          font-weight: var(--weight-medium, 500);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
        }

        .picker-session-status.status-running {
          color: var(--semantic-success, #3DD68C);
          background: rgba(61, 214, 140, 0.08);
        }

        .picker-session-status.status-exited {
          color: var(--text-tertiary, #5C6080);
          background: var(--surface-raised, #13141C);
        }

        .picker-footer {
          margin-top: var(--space-5, 20px);
          text-align: center;
        }

        .picker-cancel-link {
          background: transparent;
          border: none;
          color: var(--text-tertiary, #5C6080);
          font-size: var(--text-xs, 11px);
          cursor: pointer;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          transition: color var(--duration-fast, 150ms) ease;
        }

        .picker-cancel-link:hover {
          color: var(--text-secondary, #9DA3BE);
        }
      `}</style>
    </div>
  );
}
