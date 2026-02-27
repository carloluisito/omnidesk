/**
 * ShareManagementPanel — Host-side panel for managing all active shares and
 * connected observers.
 *
 * Spec: plans/session-sharing.md §10.1
 * - Side panel (320px, same pattern as TunnelPanel/GitPanel via SidePanel)
 * - Lists all active shares with: session name, share code, observer count, "Stop Sharing" button
 * - Expandable observer list per share with "Kick" and "Grant/Revoke Control" per observer
 * - Uses useSessionSharing hook for state and actions
 * - data-testid: "share-management-panel"
 * - Tokyo Night dark theme
 */

import { useState, useCallback } from 'react';
import { Share2, Users, X, UserMinus, MousePointer, MousePointer2, ChevronDown, ChevronRight, Copy, Check } from 'lucide-react';
import { SidePanel } from './SidePanel';
import { useSessionSharing } from '../hooks/useSessionSharing';
import type { ShareInfo, ObserverInfo } from '../../shared/types/sharing-types';

export interface ShareManagementPanelProps {
  isOpen: boolean;
  onClose: () => void;
  /** Session name lookup. Keys are sessionIds. */
  sessionNames?: Record<string, string>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ── ObserverRow ───────────────────────────────────────────────────────────────

interface ObserverRowProps {
  observer: ObserverInfo;
  sessionId: string;
  onKick: (sessionId: string, observerId: string) => Promise<void>;
  onGrantControl: (sessionId: string, observerId: string) => Promise<void>;
  onRevokeControl: (sessionId: string, observerId: string) => Promise<void>;
}

function ObserverRow({ observer, sessionId, onKick, onGrantControl, onRevokeControl }: ObserverRowProps) {
  const [isActing, setIsActing] = useState(false);
  const hasControl = observer.role === 'has-control';

  const handleKick = useCallback(async () => {
    setIsActing(true);
    try {
      await onKick(sessionId, observer.observerId);
    } finally {
      setIsActing(false);
    }
  }, [sessionId, observer.observerId, onKick]);

  const handleToggleControl = useCallback(async () => {
    setIsActing(true);
    try {
      if (hasControl) {
        await onRevokeControl(sessionId, observer.observerId);
      } else {
        await onGrantControl(sessionId, observer.observerId);
      }
    } finally {
      setIsActing(false);
    }
  }, [hasControl, sessionId, observer.observerId, onGrantControl, onRevokeControl]);

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '5px var(--space-3) 5px 28px',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'var(--surface-raised)',
      }}
    >
      {/* Status dot */}
      <div
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          flexShrink: 0,
          background: hasControl ? 'var(--semantic-success)' : 'var(--text-tertiary)',
          animation: hasControl ? 'share-pulse 2s ease-in-out infinite' : 'none',
        }}
        title={hasControl ? 'Has control' : 'Read-only'}
      />

      {/* Display name */}
      <span
        style={{
          flex: 1,
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-ui)',
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {observer.displayName}
      </span>

      {/* Joined time */}
      <span
        style={{
          fontSize: 'var(--text-2xs)',
          fontFamily: 'var(--font-mono-ui)',
          color: 'var(--text-tertiary)',
          flexShrink: 0,
        }}
      >
        {formatRelativeTime(observer.joinedAt)}
      </span>

      {/* Grant/Revoke control button */}
      <button
        onClick={handleToggleControl}
        disabled={isActing}
        title={hasControl ? 'Revoke control' : 'Grant control'}
        aria-label={hasControl ? `Revoke control from ${observer.displayName}` : `Grant control to ${observer.displayName}`}
        style={iconBtnStyle(hasControl ? '#00C9A7' : undefined)}
      >
        {hasControl ? <MousePointer2 size={11} /> : <MousePointer size={11} />}
      </button>

      {/* Kick button */}
      <button
        onClick={handleKick}
        disabled={isActing}
        title={`Kick ${observer.displayName}`}
        aria-label={`Kick ${observer.displayName}`}
        style={iconBtnStyle('var(--semantic-error)')}
      >
        <UserMinus size={11} />
      </button>
    </div>
  );
}

function iconBtnStyle(color?: string): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    background: 'none',
    border: 'none',
    borderRadius: 'var(--radius-sm)',
    color: color ?? 'var(--text-tertiary)',
    cursor: 'pointer',
    padding: 0,
    flexShrink: 0,
  };
}

// ── ShareCard ──────────────────────────────────────────────────────────────────

interface ShareCardProps {
  share: ShareInfo;
  sessionName: string;
  onStopSharing: (sessionId: string) => Promise<void>;
  onKick: (sessionId: string, observerId: string) => Promise<void>;
  onGrantControl: (sessionId: string, observerId: string) => Promise<void>;
  onRevokeControl: (sessionId: string, observerId: string) => Promise<void>;
}

function ShareCard({ share, sessionName, onStopSharing, onKick, onGrantControl, onRevokeControl }: ShareCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  const handleStop = useCallback(async () => {
    setIsStopping(true);
    try {
      await onStopSharing(share.sessionId);
    } finally {
      setIsStopping(false);
    }
  }, [share.sessionId, onStopSharing]);

  const handleCopyCode = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(share.shareCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    } catch { /* clipboard access may fail */ }
  }, [share.shareCode]);

  const observerCount = share.observers.length;
  const hasObservers = observerCount > 0;

  return (
    <div
      style={{
        margin: 'var(--space-2) var(--space-3)',
        background: 'var(--surface-float)',
        borderRadius: 'var(--radius-md)',
        border: '1px solid var(--border-default)',
        overflow: 'hidden',
      }}
    >
      {/* Header row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '8px var(--space-3)',
          borderBottom: hasObservers && expanded ? '1px solid var(--border-subtle)' : 'none',
        }}
      >
        {/* Active share indicator */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: '#00C9A7',
            flexShrink: 0,
            animation: 'share-pulse 2s ease-in-out infinite',
          }}
        />

        {/* Session name */}
        <span
          style={{
            flex: 1,
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {sessionName}
        </span>

        {/* Observer count badge */}
        {hasObservers && (
          <span
            aria-label={`${observerCount} observer${observerCount !== 1 ? 's' : ''} connected`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              fontSize: 'var(--text-2xs)',
              fontFamily: 'var(--font-mono-ui)',
              background: 'color-mix(in srgb, #00C9A7 20%, transparent)',
              color: '#00C9A7',
              padding: '1px 6px',
              borderRadius: 'var(--radius-full)',
            }}
          >
            <Users size={9} />
            {observerCount}
          </span>
        )}

        {/* Expand toggle */}
        {hasObservers && (
          <button
            onClick={() => setExpanded((v) => !v)}
            aria-label={expanded ? 'Collapse observer list' : 'Expand observer list'}
            style={iconBtnStyle()}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        )}
      </div>

      {/* Share code row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '6px var(--space-3)',
          borderBottom: '1px solid var(--border-subtle)',
          background: 'var(--surface-raised)',
        }}
      >
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono-ui)',
            color: 'var(--text-tertiary)',
            flexShrink: 0,
          }}
        >
          Code
        </span>
        <span
          style={{
            flex: 1,
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-mono-ui)',
            fontWeight: 'var(--weight-semibold)',
            color: 'var(--accent-primary)',
            letterSpacing: '0.1em',
          }}
        >
          {share.shareCode}
        </span>
        <button
          onClick={handleCopyCode}
          title={codeCopied ? 'Copied!' : 'Copy share code'}
          aria-label="Copy share code"
          style={iconBtnStyle(codeCopied ? 'var(--semantic-success)' : undefined)}
        >
          {codeCopied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </div>

      {/* Observer list (expanded) */}
      {expanded && hasObservers && (
        <div>
          {share.observers.map((obs) => (
            <ObserverRow
              key={obs.observerId}
              observer={obs}
              sessionId={share.sessionId}
              onKick={onKick}
              onGrantControl={onGrantControl}
              onRevokeControl={onRevokeControl}
            />
          ))}
        </div>
      )}

      {/* Actions row */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: '6px var(--space-3) 8px',
        }}
      >
        <button
          onClick={handleStop}
          disabled={isStopping}
          aria-label={`Stop sharing ${sessionName}`}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 3,
            padding: '3px 8px',
            background: 'var(--semantic-error-muted)',
            border: '1px solid var(--semantic-error)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--semantic-error)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-ui)',
            cursor: isStopping ? 'default' : 'pointer',
            opacity: isStopping ? 0.6 : 1,
          }}
        >
          <X size={10} />
          Stop Sharing
        </button>
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ShareManagementPanel({ isOpen, onClose, sessionNames = {} }: ShareManagementPanelProps) {
  const sharing = useSessionSharing();

  const activeShareList = Array.from(sharing.activeShares.values());

  const handleStopSharing = useCallback(async (sessionId: string) => {
    await sharing.stopSharing(sessionId);
  }, [sharing]);

  const handleKick = useCallback(async (sessionId: string, observerId: string) => {
    await sharing.kickObserver(sessionId, observerId);
  }, [sharing]);

  const handleGrantControl = useCallback(async (sessionId: string, observerId: string) => {
    await sharing.grantControl(sessionId, observerId);
  }, [sharing]);

  const handleRevokeControl = useCallback(async (sessionId: string, observerId: string) => {
    await sharing.revokeControl(sessionId, observerId);
  }, [sharing]);

  if (!isOpen) return null;

  return (
    <>
      <SidePanel
        isOpen={isOpen}
        onClose={onClose}
        title="Sharing"
        defaultWidth={320}
      >
        <div data-testid="share-management-panel">
          {/* Empty state */}
          {activeShareList.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-8) var(--space-4)',
                gap: 'var(--space-2)',
              }}
            >
              <Share2 size={32} style={{ color: 'var(--text-tertiary)' }} />
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-ui)',
                  textAlign: 'center',
                }}
              >
                No active shares
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-ui)',
                  textAlign: 'center',
                }}
              >
                Share a session from the PaneHeader or tab context menu
              </span>
            </div>
          )}

          {/* Active share cards */}
          {activeShareList.map((share) => (
            <ShareCard
              key={share.sessionId}
              share={share}
              sessionName={sessionNames[share.sessionId] ?? share.sessionId}
              onStopSharing={handleStopSharing}
              onKick={handleKick}
              onGrantControl={handleGrantControl}
              onRevokeControl={handleRevokeControl}
            />
          ))}
        </div>
      </SidePanel>

      <style>{`
        @keyframes share-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.6; }
        }
      `}</style>
    </>
  );
}
