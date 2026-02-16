import { useState, useCallback, useRef, useEffect } from 'react';
import { TabData } from './ui/Tab';
import { SessionStatusIndicator, SessionStatus } from './ui/SessionStatusIndicator';
import { StatusPopover } from './ui/StatusPopover';

interface PaneHeaderProps {
  sessionId: string;
  sessionName: string;
  workingDirectory: string;
  isFocused: boolean;
  availableSessions: TabData[];
  canSplit: boolean;
  sessionStatus?: SessionStatus;
  worktreeBranch?: string | null;
  onChangeSession: (sessionId: string) => void;
  onClosePane: () => void;
  onSplitHorizontal: () => void;
  onSplitVertical: () => void;
  onOpenBudget?: () => void;
  onOpenHistory?: () => void;
  onCreateCheckpoint?: () => void;
}

export function PaneHeader({
  sessionId,
  sessionName,
  workingDirectory,
  isFocused,
  availableSessions,
  canSplit,
  sessionStatus = 'ready',
  worktreeBranch,
  onChangeSession,
  onClosePane,
  onSplitHorizontal,
  onSplitVertical,
  onOpenBudget,
  onOpenHistory,
  onCreateCheckpoint,
}: PaneHeaderProps) {
  const [showDropdown, setShowDropdown] = useState(false);
  const [showStatusPopover, setShowStatusPopover] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  const handleSessionSelect = useCallback((sessionId: string) => {
    setShowDropdown(false);
    onChangeSession(sessionId);
  }, [onChangeSession]);

  return (
    <div className={`pane-header ${isFocused ? 'focused' : ''}`}>
      <div className="pane-header-left">
        <SessionStatusIndicator
          status={sessionStatus}
          onClick={() => setShowStatusPopover(true)}
          size={8}
        />
        <span className="pane-session-name">{sessionName}</span>
        {worktreeBranch && (
          <span className="pane-worktree-badge" title={`Worktree: ${worktreeBranch}`}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="6" y1="3" x2="6" y2="15" />
              <circle cx="18" cy="6" r="3" />
              <circle cx="6" cy="18" r="3" />
              <path d="M18 9a9 9 0 01-9 9" />
            </svg>
            {worktreeBranch}
          </span>
        )}
        <span className="pane-working-dir">{workingDirectory}</span>
      </div>
      <div className="pane-header-right">
        {canSplit && (
          <>
            <button
              className="pane-header-btn pane-split-btn"
              onClick={onSplitHorizontal}
              title="Split Horizontally (Left/Right)"
            >
              ⬌
            </button>
            <button
              className="pane-header-btn pane-split-btn"
              onClick={onSplitVertical}
              title="Split Vertically (Top/Bottom)"
            >
              ⬍
            </button>
          </>
        )}
        <button
          className="pane-header-btn"
          onClick={() => setShowDropdown(!showDropdown)}
          title="Change Session"
        >
          ▼
        </button>
        <button
          className="pane-header-btn pane-close-btn"
          onClick={onClosePane}
          title="Close Pane (Ctrl+Shift+W)"
        >
          ✕
        </button>
      </div>
      {showDropdown && (
        <div ref={dropdownRef} className="pane-session-dropdown">
          {availableSessions.length === 0 ? (
            <div className="dropdown-item disabled">No other sessions</div>
          ) : (
            availableSessions.map(session => (
              <div
                key={session.id}
                className="dropdown-item"
                onClick={() => handleSessionSelect(session.id)}
              >
                <span className="dropdown-item-name">{session.name}</span>
                <span className="dropdown-item-dir">{session.workingDirectory}</span>
              </div>
            ))
          )}
        </div>
      )}

      <StatusPopover
        sessionId={sessionId}
        sessionName={sessionName}
        status={sessionStatus}
        isOpen={showStatusPopover}
        onClose={() => setShowStatusPopover(false)}
        onOpenBudget={onOpenBudget}
        onOpenHistory={onOpenHistory}
        onCreateCheckpoint={onCreateCheckpoint}
      />

      <style>{`
        .pane-header {
          height: 24px;
          background: #16161e;
          border-bottom: 1px solid #292e42;
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 0 8px;
          font-family: 'JetBrains Mono', monospace;
          font-size: 11px;
          position: relative;
          z-index: 5;
        }

        .pane-header.focused {
          border-bottom-color: #7aa2f7;
        }

        .pane-header-left {
          display: flex;
          align-items: center;
          gap: 8px;
          flex: 1;
          overflow: hidden;
        }

        .pane-header-right {
          display: flex;
          align-items: center;
          gap: 4px;
        }

        .pane-session-name {
          color: #565f89;
          font-weight: 500;
          white-space: nowrap;
        }

        .pane-header.focused .pane-session-name {
          color: #a9b1d6;
        }

        .pane-worktree-badge {
          display: flex;
          align-items: center;
          gap: 4px;
          color: #9ece6a;
          font-size: 10px;
          font-weight: 500;
          white-space: nowrap;
          max-width: 120px;
          overflow: hidden;
          text-overflow: ellipsis;
          flex-shrink: 0;
        }

        .pane-working-dir {
          color: #3b4261;
          font-size: 10px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .pane-header.focused .pane-working-dir {
          color: #565f89;
        }

        .pane-header-btn {
          background: transparent;
          border: none;
          color: #565f89;
          cursor: pointer;
          padding: 2px 6px;
          font-size: 10px;
          border-radius: 3px;
          transition: all 0.15s ease;
          font-family: 'JetBrains Mono', monospace;
        }

        .pane-header-btn:hover {
          background: #292e42;
          color: #a9b1d6;
        }

        .pane-split-btn {
          font-size: 12px;
        }

        .pane-split-btn:hover {
          background: #7aa2f7;
          color: #1a1b26;
        }

        .pane-close-btn:hover {
          background: #f7768e;
          color: #1a1b26;
        }

        .pane-session-dropdown {
          position: absolute;
          top: 100%;
          right: 8px;
          background: #1a1b26;
          border: 1px solid #292e42;
          border-radius: 4px;
          min-width: 250px;
          max-width: 400px;
          max-height: 300px;
          overflow-y: auto;
          box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
          z-index: 1000;
        }

        .dropdown-item {
          padding: 8px 12px;
          cursor: pointer;
          display: flex;
          flex-direction: column;
          gap: 2px;
          border-bottom: 1px solid #292e42;
          transition: background 0.15s ease;
        }

        .dropdown-item:last-child {
          border-bottom: none;
        }

        .dropdown-item:hover {
          background: #292e42;
        }

        .dropdown-item.disabled {
          color: #565f89;
          cursor: default;
          font-style: italic;
        }

        .dropdown-item.disabled:hover {
          background: transparent;
        }

        .dropdown-item-name {
          color: #a9b1d6;
          font-size: 11px;
          font-weight: 500;
        }

        .dropdown-item-dir {
          color: #565f89;
          font-size: 10px;
        }
      `}</style>
    </div>
  );
}
