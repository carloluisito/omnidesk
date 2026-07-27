// @atlas-entrypoint: Session pane — the Focus-mode body.
// Identity strip (icon, name, branch/perms chips, status, close) + terminal slot.
// The actual xterm lives in TerminalHost at App level — we just expose our
// content area as a slot via useTerminalSlot so the host portals the
// terminal's DOM into it.
import { useEffect } from 'react';
import { P4Icon } from './P4Icon';
import {
  colorBg, colorFg, initials, STATUS_META, isSessionStopped, formatByteSize,
  formatActiveDuration, type RepoColor,
} from './shell-utils';
import { mapTabStatus } from './SessionRail';
import { useTerminalSlot } from './TerminalHost';
import { useSessionDigest } from '../../hooks/useSessionDigest';
import type { TabData } from '../ui/Tab';

interface SessionPaneProps {
  session: TabData;
  onClose?: (sessionId: string) => void;
  onRestart?: (sessionId: string) => void;
  onKill?: (sessionId: string) => void;
}

export function SessionPane({ session, onClose, onRestart, onKill }: SessionPaneProps) {
  const slotRef = useTerminalSlot(session.id);

  // "While you were away" recap glance (epic #225 child-4) — same digest data
  // HistoryPanel shows for past sessions, surfaced here for the live one.
  // Re-fetched whenever the focused session changes.
  const { digest, loading: digestLoading, error: digestError, fetch: fetchDigest } = useSessionDigest();
  useEffect(() => {
    void fetchDigest(session.id);
  }, [session.id, fetchDigest]);

  // The underlying CLI process is gone once a session exits or errors. Offer
  // restart. (A 'starting' session is not stopped — don't flash the overlay
  // during launch.) Single-sourced with the rail via isSessionStopped.
  const isStopped = isSessionStopped(session.status);

  const status = mapTabStatus(session);
  const meta = STATUS_META[status];
  const color: RepoColor = status === 'errored' ? 'error' :
                            status === 'live' ? 'accent' :
                            status === 'idle' ? 'neutral' : 'info';

  const permLabel =
    session.permissionMode === 'skip-permissions' ? 'skip perms' : 'default';
  const permClass =
    session.permissionMode === 'skip-permissions' ? 'p4-chip err' : 'p4-chip';

  return (
    <div className="p4-sess-pane">
      <div className="p4-sess-strip">
        <span
          className="ic"
          style={{ background: colorBg(color), color: colorFg(color) }}
        >
          {initials(session.name)}
        </span>
        <div>
          <div className="name">{session.name}</div>
          <div className="meta" style={{ marginTop: 4 }}>
            {session.worktreeBranch && (
              <span className="p4-chip">
                <P4Icon name="branch" size={10} /> {session.worktreeBranch}
              </span>
            )}
            {session.kind === 'shell'
              ? <span className="p4-chip"><P4Icon name="terminal" size={10} /> Terminal</span>
              : <span className={permClass}>{permLabel}</span>}
          </div>
        </div>
        <div className="status">
          <span
            className={'p4-chip ' + (meta.chip || '')}
            style={{
              animation: meta.pulse ? 'p4-pulse 1.6s var(--ease-in-out) infinite' : undefined,
            }}
          >
            <span
              style={{
                width: 6, height: 6, borderRadius: '50%',
                background: meta.color, display: 'inline-block',
              }}
            />
            {meta.label}
          </span>
          {isStopped && onRestart && (
            <button
              type="button"
              className="p4-btn"
              style={{ padding: '4px 10px', gap: 6 }}
              title="Restart this session's CLI"
              onClick={() => onRestart(session.id)}
            >
              <P4Icon name="play" size={12} /> Restart
            </button>
          )}
          {!isStopped && onKill && (
            <button
              type="button"
              className="p4-btn ghost"
              style={{ padding: 4 }}
              title="Kill the CLI process (keeps the session)"
              aria-label={`Kill ${session.name}`}
              onClick={() => onKill(session.id)}
            >
              <P4Icon name="pause" size={13} />
            </button>
          )}
          {onClose && (
            <button
              type="button"
              className="p4-btn ghost"
              style={{ padding: 4 }}
              title="Close session"
              aria-label={`Close ${session.name}`}
              onClick={() => onClose(session.id)}
            >
              <P4Icon name="x" size={13} />
            </button>
          )}
        </div>
      </div>

      {/* "While you were away" recap glance — mirrors HistoryPanel's digest
          rendering (same null-handling convention: approvalPromptsHit /
          errorsDetected show "— (not tracked)" when null, never 0). Hidden
          entirely while loading or on error to avoid a flash of empty chips. */}
      {!digestLoading && !digestError && digest && (
        <div className="p4-sess-strip" data-testid="session-pane-digest" style={{ paddingTop: 0, paddingBottom: 8 }}>
          <div className="meta" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            <span className="p4-chip">Active {formatActiveDuration(digest.activeDurationMs)}</span>
            <span className="p4-chip">Output {formatByteSize(digest.outputBytes)}</span>
            <span className="p4-chip">Checkpoints {digest.checkpointsCreated}</span>
            {digest.restartSegments > 0 && (
              <span className="p4-chip">Restarts {digest.restartSegments}</span>
            )}
            <span className="p4-chip" data-testid="session-pane-digest-approvals">
              Approvals {digest.approvalPromptsHit === null ? '— (not tracked)' : digest.approvalPromptsHit}
            </span>
            <span className="p4-chip" data-testid="session-pane-digest-errors">
              Errors {digest.errorsDetected === null ? '— (not tracked)' : digest.errorsDetected}
            </span>
          </div>
        </div>
      )}

      {/* Slot: TerminalHost portals this session's persistent xterm into here. */}
      <div ref={slotRef} className="p4-term-host" style={{ position: 'relative' }}>
        {isStopped && onRestart && (
          <div
            style={{
              position: 'absolute', inset: 0, zIndex: 2,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center', gap: 14,
              background: 'rgba(10,11,17,.55)',
              backdropFilter: 'blur(1px)',
              pointerEvents: 'auto',
            }}
          >
            <div style={{
              width: 48, height: 48, borderRadius: 'var(--radius-lg)',
              background: 'rgba(0,201,167,.10)',
              border: '1px solid rgba(0,201,167,.22)',
              color: 'var(--accent)',
              display: 'grid', placeItems: 'center',
            }}>
              <P4Icon name="play" size={20} />
            </div>
            <div style={{ color: 'var(--text-secondary)', fontSize: 'var(--text-sm)' }}>
              This session has stopped.
            </div>
            <button className="p4-btn primary" onClick={() => onRestart(session.id)}>
              <P4Icon name="play" size={13} /> Restart session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
