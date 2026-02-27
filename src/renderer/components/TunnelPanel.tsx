/**
 * TunnelPanel — Redesigned to match Obsidian spec §6.14.
 *
 * Preserves all existing useTunnel hook usage and IPC.
 * Visual overhaul only.
 */

import { useState, useCallback } from 'react';
import { Copy, Check, Plus, Unplug, Radio, FileText, Globe, Key, Loader2 } from 'lucide-react';
import { useTunnel } from '../hooks/useTunnel';
import { TunnelCreateDialog } from './TunnelCreateDialog';
import { TunnelRequestLogs } from './TunnelRequestLogs';
import { SidePanel } from './SidePanel';
import { StatusDot } from './ui/StatusDot';
import type { TunnelInfo, TunnelAccountInfo } from '../../shared/types/tunnel-types';

export interface TunnelPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatRelativeTime(iso: string): string {
  const delta = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

// ─── Active tunnel card ────────────────────────────────────────────────────

interface TunnelCardProps {
  tunnel: TunnelInfo;
  onStop: (id: string) => void;
  onViewLogs: (tunnel: TunnelInfo) => void;
  onCopyUrl: (url: string) => void;
  copiedId: string | null;
  isOperating: boolean;
}

function TunnelCard({ tunnel, onStop, onViewLogs, onCopyUrl, copiedId, isOperating }: TunnelCardProps) {
  const isActive = tunnel.status === 'active';
  const isCreating = tunnel.status === 'creating';
  const statusColor = isActive
    ? 'var(--semantic-success)'
    : isCreating
      ? 'var(--semantic-warning)'
      : tunnel.status === 'error'
        ? 'var(--semantic-error)'
        : 'var(--text-tertiary)';
  const isCopied = copiedId === tunnel.id;

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
          borderBottom: '1px solid var(--border-subtle)',
        }}
      >
        {/* Pulsing status dot */}
        <div
          style={{
            width: 8,
            height: 8,
            borderRadius: '50%',
            background: statusColor,
            flexShrink: 0,
            animation: isActive ? 'tunnel-pulse 2s ease-in-out infinite' : 'none',
          }}
        />
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
          {tunnel.name || `Port ${tunnel.port}`}
        </span>
        <span
          style={{
            fontSize: 'var(--text-2xs)',
            fontFamily: 'var(--font-mono-ui)',
            color: statusColor,
            background: `${statusColor}14`,
            padding: '1px 5px',
            borderRadius: 'var(--radius-sm)',
          }}
        >
          {tunnel.status}
        </span>
      </div>

      {/* URL row */}
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
        <Globe size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
        <span
          style={{
            flex: 1,
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono-ui)',
            color: 'var(--text-accent)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
            cursor: 'default',
          }}
          title={tunnel.url}
        >
          {tunnel.url}
        </span>
        <button
          onClick={() => onCopyUrl(tunnel.id)}
          title={isCopied ? 'Copied!' : 'Copy URL'}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 20,
            height: 20,
            background: 'none',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: isCopied ? 'var(--semantic-success)' : 'var(--text-tertiary)',
            cursor: 'pointer',
            padding: 0,
            flexShrink: 0,
          }}
        >
          {isCopied ? <Check size={11} /> : <Copy size={11} />}
        </button>
      </div>

      {/* Meta row */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-3)',
          padding: '6px var(--space-3)',
          fontSize: 'var(--text-xs)',
          fontFamily: 'var(--font-mono-ui)',
          color: 'var(--text-tertiary)',
        }}
      >
        <span>Port {tunnel.port}</span>
        <span style={{ color: 'var(--border-strong)' }}>·</span>
        <span>{tunnel.protocol.toUpperCase()}</span>
        <span style={{ color: 'var(--border-strong)' }}>·</span>
        <span>{formatRelativeTime(tunnel.createdAt)}</span>
      </div>

      {/* Actions row */}
      <div
        style={{
          display: 'flex',
          gap: 'var(--space-2)',
          padding: '6px var(--space-3) 8px',
        }}
      >
        <button
          onClick={() => onCopyUrl(tunnel.id)}
          style={actionBtnStyle(false)}
        >
          <Copy size={10} />
          Copy URL
        </button>
        {tunnel.hasInspect && (
          <button
            onClick={() => onViewLogs(tunnel)}
            style={actionBtnStyle(false)}
          >
            <FileText size={10} />
            View Logs
          </button>
        )}
        {(isActive || isCreating) && (
          <button
            onClick={() => onStop(tunnel.id)}
            disabled={isOperating}
            style={actionBtnStyle(true)}
          >
            <Unplug size={10} />
            Disconnect
          </button>
        )}
      </div>
    </div>
  );
}

function actionBtnStyle(isDanger: boolean): React.CSSProperties {
  return {
    display: 'flex',
    alignItems: 'center',
    gap: 3,
    padding: '3px 8px',
    background: isDanger ? 'var(--semantic-error-muted)' : 'var(--surface-high)',
    border: `1px solid ${isDanger ? 'var(--semantic-error)' : 'var(--border-default)'}`,
    borderRadius: 'var(--radius-sm)',
    color: isDanger ? 'var(--semantic-error)' : 'var(--text-secondary)',
    fontSize: 'var(--text-xs)',
    fontFamily: 'var(--font-ui)',
    cursor: 'pointer',
  };
}

// ─── Account status bar ───────────────────────────────────────────────────

interface AccountStatusBarProps {
  isConfigured: boolean;
  account: TunnelAccountInfo | null;
}

function AccountStatusBar({ isConfigured, account }: AccountStatusBarProps) {
  if (!isConfigured) return null;

  const hasEmail = account?.email;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '6px var(--space-3)',
        background: 'var(--surface-raised)',
        borderBottom: '1px solid var(--border-subtle)',
        fontSize: 'var(--text-xs)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <StatusDot status={hasEmail ? 'running' : 'warning'} size={6} />
      <span
        style={{
          flex: 1,
          color: 'var(--text-secondary)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {hasEmail ? account.email : 'Connected'}
        {!hasEmail && (
          <span style={{ color: 'var(--text-tertiary)', marginLeft: 4 }}>(API key set)</span>
        )}
      </span>
      {account?.plan && (
        <span
          style={{
            fontSize: 'var(--text-2xs)',
            fontFamily: 'var(--font-mono-ui)',
            color: 'var(--accent-primary)',
            background: 'color-mix(in srgb, var(--accent-primary) 14%, transparent)',
            padding: '1px 6px',
            borderRadius: 'var(--radius-full)',
          }}
        >
          {account.plan}
        </span>
      )}
    </div>
  );
}

// ─── API key setup form ───────────────────────────────────────────────────

interface ApiKeySetupProps {
  onValidateAndSave: (key: string) => Promise<void>;
}

function ApiKeySetup({ onValidateAndSave }: ApiKeySetupProps) {
  const [apiKey, setApiKey] = useState('');
  const [isValidating, setIsValidating] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const handleSubmit = async () => {
    const trimmed = apiKey.trim();
    if (!trimmed) return;

    setIsValidating(true);
    setFeedback(null);

    try {
      await onValidateAndSave(trimmed);
      setFeedback({ type: 'success', message: 'Connected successfully' });
    } catch (err) {
      setFeedback({
        type: 'error',
        message: err instanceof Error ? err.message : 'Invalid API key',
      });
    } finally {
      setIsValidating(false);
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-8) var(--space-4)',
        gap: 'var(--space-3)',
      }}
    >
      <Key size={32} style={{ color: 'var(--text-tertiary)' }} />
      <span
        style={{
          fontSize: 'var(--text-sm)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-secondary)',
          fontFamily: 'var(--font-ui)',
          textAlign: 'center',
        }}
      >
        Connect to LaunchTunnel
      </span>
      <span
        style={{
          fontSize: 'var(--text-xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-ui)',
          textAlign: 'center',
        }}
      >
        Enter your API key to create and manage tunnels
      </span>

      <div style={{ width: '100%', maxWidth: 260, display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => { setApiKey(e.target.value); setFeedback(null); }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          placeholder="lt_xxxxxxxxxxxxxxxx"
          disabled={isValidating}
          style={{
            width: '100%',
            padding: '6px 10px',
            background: 'var(--surface-float)',
            border: `1px solid ${feedback?.type === 'error' ? 'var(--semantic-error)' : 'var(--border-default)'}`,
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-primary)',
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono-ui)',
            outline: 'none',
            boxSizing: 'border-box',
          }}
        />

        <button
          onClick={handleSubmit}
          disabled={isValidating || !apiKey.trim()}
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
            padding: '6px 14px',
            background: isValidating || !apiKey.trim() ? 'var(--surface-high)' : 'var(--accent-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: isValidating || !apiKey.trim() ? 'var(--text-tertiary)' : 'var(--text-inverse)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            fontFamily: 'var(--font-ui)',
            cursor: isValidating || !apiKey.trim() ? 'default' : 'pointer',
            width: '100%',
          }}
        >
          {isValidating ? (
            <>
              <Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} />
              Validating…
            </>
          ) : (
            'Validate & Save'
          )}
        </button>

        {feedback && (
          <span
            style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-ui)',
              color: feedback.type === 'error' ? 'var(--semantic-error)' : 'var(--semantic-success)',
              textAlign: 'center',
            }}
          >
            {feedback.message}
          </span>
        )}
      </div>

      <span
        style={{
          fontSize: 'var(--text-2xs)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-ui)',
          marginTop: 'var(--space-1)',
        }}
      >
        Get an API key at launchtunnel.dev
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function TunnelPanel({ isOpen, onClose }: TunnelPanelProps) {
  const tunnel = useTunnel();
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [logsTarget, setLogsTarget] = useState<TunnelInfo | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyUrl = useCallback(
    async (tunnelId: string) => {
      const t = tunnel.tunnels.find((t) => t.id === tunnelId);
      if (!t) return;
      try {
        await navigator.clipboard.writeText(t.url);
        setCopiedId(tunnelId);
        setTimeout(() => setCopiedId(null), 2000);
      } catch {}
    },
    [tunnel.tunnels]
  );

  const handleValidateAndSave = useCallback(async (key: string) => {
    const result = await tunnel.validateApiKey(key);
    if (!result || !result.success) {
      throw new Error(result?.message ?? 'Validation failed');
    }
    await tunnel.updateSettings({ apiKey: key });
    await tunnel.loadAccount();
  }, [tunnel]);

  const activeTunnels = tunnel.tunnels.filter((t) => t.status === 'active' || t.status === 'creating');
  const hasActiveTunnel = activeTunnels.length > 0;

  const headerActions = (
    <button
      onClick={() => setShowCreateDialog(true)}
      title="New tunnel"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 6px',
        background: 'var(--surface-float)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-secondary)',
        fontSize: 'var(--text-xs)',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <Plus size={10} />
      New
    </button>
  );

  if (!isOpen) return null;

  return (
    <>
      <SidePanel isOpen={isOpen} onClose={onClose} title="Tunnels" headerActions={headerActions}>
        {/* Account status bar — shown when configured */}
        <AccountStatusBar isConfigured={tunnel.isConfigured} account={tunnel.account} />

        {/* API key setup — shown when not configured and no tunnels */}
        {!tunnel.isConfigured && tunnel.tunnels.length === 0 && (
          <ApiKeySetup onValidateAndSave={handleValidateAndSave} />
        )}

        {/* Empty state — shown when configured but no tunnels */}
        {tunnel.isConfigured && !hasActiveTunnel && tunnel.tunnels.length === 0 && (
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
            <Radio size={32} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No active tunnels
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              Create a tunnel to expose a local port
            </span>
            <button
              onClick={() => setShowCreateDialog(true)}
              style={{
                marginTop: 'var(--space-2)',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: '6px 14px',
                background: 'var(--accent-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-inverse)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-semibold)',
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
              }}
            >
              <Plus size={12} />
              New Tunnel
            </button>
          </div>
        )}

        {/* Active tunnel cards */}
        {activeTunnels.map((t) => (
          <TunnelCard
            key={t.id}
            tunnel={t}
            onStop={(id) => tunnel.stopTunnel(id)}
            onViewLogs={(tun) => setLogsTarget(tun)}
            onCopyUrl={handleCopyUrl}
            copiedId={copiedId}
            isOperating={tunnel.isLoading}
          />
        ))}

        {/* Stopped/errored tunnels (dimmed) */}
        {tunnel.tunnels.filter((t) => t.status !== 'active' && t.status !== 'creating').map((t) => (
          <div
            key={t.id}
            style={{
              margin: 'var(--space-1) var(--space-3)',
              padding: '6px var(--space-3)',
              background: 'var(--surface-raised)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              opacity: 0.6,
            }}
          >
            <div
              style={{
                width: 6,
                height: 6,
                borderRadius: '50%',
                background: t.status === 'error' ? 'var(--semantic-error)' : 'var(--text-tertiary)',
                flexShrink: 0,
              }}
            />
            <span
              style={{
                flex: 1,
                fontSize: 'var(--text-xs)',
                fontFamily: 'var(--font-mono-ui)',
                color: 'var(--text-tertiary)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {t.name || `Port ${t.port}`}
            </span>
            <span
              style={{
                fontSize: 'var(--text-2xs)',
                fontFamily: 'var(--font-mono-ui)',
                color: 'var(--text-tertiary)',
              }}
            >
              {t.status}
            </span>
            <button
              onClick={() => tunnel.deleteTunnel(t.id)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 18,
                height: 18,
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: 0,
                borderRadius: 2,
              }}
              title="Remove"
            >
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>
        ))}

        {/* Error banner */}
        {tunnel.error && (
          <div
            style={{
              margin: 'var(--space-2) var(--space-3)',
              padding: '8px var(--space-3)',
              background: 'var(--semantic-error-muted)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--semantic-error)',
              fontSize: 'var(--text-xs)',
              color: 'var(--semantic-error)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            {tunnel.error}
          </div>
        )}
      </SidePanel>

      {/* Create dialog */}
      {showCreateDialog && (
        <TunnelCreateDialog
          isOpen={showCreateDialog}
          onToggle={() => setShowCreateDialog(false)}
          onSubmit={async (req) => {
            await tunnel.createTunnel(req);
            setShowCreateDialog(false);
          }}
          isLoading={tunnel.isLoading}
          settings={tunnel.settings}
        />
      )}

      {/* Request logs */}
      {logsTarget && (
        <TunnelRequestLogs
          tunnel={logsTarget}
          logs={tunnel.requestLogs}
          onBack={() => setLogsTarget(null)}
          onRefresh={tunnel.loadRequestLogs}
        />
      )}

      <style>{`
        @keyframes tunnel-pulse {
          0%, 100% { opacity: 1; box-shadow: 0 0 0 0 var(--semantic-success); }
          50% { opacity: 0.8; box-shadow: 0 0 0 4px transparent; }
        }
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
    </>
  );
}
