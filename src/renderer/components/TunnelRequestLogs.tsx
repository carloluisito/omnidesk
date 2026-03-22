/**
 * TunnelRequestLogs — Request log sub-view for a specific tunnel.
 *
 * Spec: Back arrow, URL bar with copy + LIVE/PAUSED indicator,
 * log table (METHOD/PATH/STATUS/DURATION/TIME), method and status
 * color coding, row appear animation, 500-row cap notice, auto-refresh toggle.
 */

import { useState, useEffect, useCallback } from 'react';
import { ArrowLeft, Copy, Check, Network } from 'lucide-react';
import type { TunnelInfo, TunnelRequestLog } from '../../shared/types/tunnel-types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface TunnelRequestLogsProps {
  tunnel: TunnelInfo;
  logs: TunnelRequestLog[];
  onBack: () => void;
  onRefresh: (tunnelId: string) => Promise<void>;
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getMethodColor(method: string): string {
  switch (method.toUpperCase()) {
    case 'GET': return 'var(--semantic-success)';
    case 'POST': return 'var(--accent-primary)';
    case 'PUT':
    case 'PATCH': return 'var(--semantic-warning)';
    case 'DELETE': return 'var(--semantic-error)';
    default: return 'var(--text-tertiary)';
  }
}

function getStatusColor(code: number): string {
  if (code >= 200 && code < 300) return 'var(--semantic-success)';
  if (code >= 300 && code < 400) return 'var(--accent-primary)';
  if (code >= 400 && code < 500) return 'var(--semantic-warning)';
  if (code >= 500) return 'var(--semantic-error)';
  return 'var(--text-tertiary)';
}

function getDurationColor(ms: number): string {
  if (ms < 100) return 'var(--semantic-success)';
  if (ms > 1000) return 'var(--semantic-warning)';
  return 'var(--text-tertiary)';
}

function formatDuration(ms: number): string {
  if (ms >= 1000) return `${(ms / 1000).toFixed(1)}s`;
  return `${ms}ms`;
}

function formatRelativeTime(timestamp: string): string {
  const delta = Date.now() - new Date(timestamp).getTime();
  const seconds = Math.floor(delta / 1000);
  if (seconds < 5) return 'now';
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h`;
}

const MAX_ROWS = 500;

// ═══════════════════════════════════════════════════════════════════════════
// COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function TunnelRequestLogs({ tunnel, logs, onBack, onRefresh }: TunnelRequestLogsProps) {
  const [urlCopied, setUrlCopied] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [isPaused, setIsPaused] = useState(false);
  const [relativeNow, setRelativeNow] = useState(Date.now());

  // Tick every 10s to update relative timestamps
  useEffect(() => {
    const id = setInterval(() => setRelativeNow(Date.now()), 10_000);
    return () => clearInterval(id);
  }, []);

  // Auto-refresh when live
  useEffect(() => {
    if (!autoRefresh || isPaused) return;
    const id = setInterval(() => {
      onRefresh(tunnel.id);
    }, 5_000);
    return () => clearInterval(id);
  }, [autoRefresh, isPaused, tunnel.id, onRefresh]);

  const handleCopyUrl = useCallback(() => {
    navigator.clipboard.writeText(tunnel.url).catch(console.error);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  }, [tunnel.url]);

  // Enforce 500-row cap
  const displayLogs = logs.slice(-MAX_ROWS);
  const isCapped = logs.length >= MAX_ROWS;

  return (
    <div className="trl-wrapper">
      {/* Top bar */}
      <div className="trl-top-bar">
        <button className="trl-back-btn" onClick={onBack} aria-label="Back to tunnel list">
          <ArrowLeft size={16} />
        </button>

        <div className="trl-url-bar">
          <span className="trl-url-text">{tunnel.url}</span>
          <button
            className="trl-copy-btn"
            onClick={handleCopyUrl}
            title={urlCopied ? 'Copied!' : 'Copy URL'}
          >
            {urlCopied ? <Check size={12} /> : <Copy size={12} />}
          </button>
        </div>

        <div className={`trl-live-badge${isPaused ? ' paused' : ''}`}>
          <span className="trl-live-dot" />
          {isPaused ? 'PAUSED' : 'LIVE'}
        </div>
      </div>

      {/* Log table */}
      {displayLogs.length === 0 ? (
        <div className="trl-empty">
          <Network size={32} style={{ color: 'var(--border-strong)' }} />
          <span className="trl-empty-title">No requests logged yet</span>
          <span className="trl-empty-sub">Requests to this tunnel will appear here</span>
        </div>
      ) : (
        <div className="trl-table-wrapper">
          {/* Header */}
          <div className="trl-header-row">
            <div className="trl-col trl-col-method">METHOD</div>
            <div className="trl-col trl-col-path">PATH</div>
            <div className="trl-col trl-col-status">STATUS</div>
            <div className="trl-col trl-col-duration">TIME</div>
            <div className="trl-col trl-col-time">AGO</div>
          </div>

          {/* Rows */}
          <div className="trl-rows">
            {isCapped && (
              <div className="trl-cap-notice">
                Showing latest 500 requests only
              </div>
            )}
            {displayLogs.map((log, i) => (
              <div
                key={log.id}
                className="trl-row"
                style={{ animationDelay: `${Math.min(i, 10) * 20}ms` }}
              >
                <div className="trl-col trl-col-method">
                  <span
                    className="trl-method-badge"
                    style={{
                      color: getMethodColor(log.method),
                      background: `${getMethodColor(log.method)}18`,
                      borderColor: `${getMethodColor(log.method)}30`,
                    }}
                  >
                    {log.method.toUpperCase()}
                  </span>
                </div>
                <div className="trl-col trl-col-path trl-path-text" title={log.path}>
                  {log.path}
                </div>
                <div className="trl-col trl-col-status">
                  <span
                    className="trl-status-text"
                    style={{ color: getStatusColor(log.statusCode) }}
                  >
                    {log.statusCode}
                  </span>
                </div>
                <div className="trl-col trl-col-duration">
                  <span style={{ color: getDurationColor(log.duration) }}>
                    {formatDuration(log.duration)}
                  </span>
                </div>
                <div className="trl-col trl-col-time trl-muted">
                  {/* relativeNow used to trigger re-render every 10s */}
                  {formatRelativeTime(log.timestamp)}
                  {void relativeNow}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="trl-footer">
        <span className="trl-log-count">
          {displayLogs.length} request{displayLogs.length !== 1 ? 's' : ''}
        </span>

        {/* Auto-refresh pill toggle */}
        <button
          className={`trl-refresh-toggle${autoRefresh ? ' active' : ''}`}
          onClick={() => {
            setAutoRefresh((v) => !v);
            setIsPaused((v) => !v);
          }}
          title={autoRefresh ? 'Pause auto-refresh' : 'Enable auto-refresh'}
        >
          <span className="trl-toggle-pill" />
          <span>{autoRefresh ? 'LIVE' : 'PAUSED'}</span>
        </button>
      </div>

      <style>{tunnelRequestLogsStyles}</style>
    </div>
  );
}

const tunnelRequestLogsStyles = `
  .trl-wrapper {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
  }

  /* Top bar */
  .trl-top-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-bottom: 1px solid var(--border-default);
    flex-shrink: 0;
  }

  .trl-back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid var(--border-default);
    border-radius: 6px;
    color: var(--text-tertiary);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .trl-back-btn:hover {
    background: var(--surface-overlay);
    color: var(--text-secondary);
    border-color: var(--border-strong);
  }

  .trl-url-bar {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--surface-base);
    border: 1px solid var(--border-default);
    border-radius: 6px;
    padding: 5px 10px;
    min-width: 0;
  }

  .trl-url-text {
    flex: 1;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: 11px;
    color: var(--accent-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trl-copy-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    background: transparent;
    border: none;
    border-radius: 4px;
    color: var(--text-tertiary);
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.15s ease;
  }

  .trl-copy-btn:hover {
    color: var(--text-secondary);
  }

  .trl-live-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 4px;
    background: color-mix(in srgb, var(--semantic-success) 12%, transparent);
    border: 1px solid color-mix(in srgb, var(--semantic-success) 25%, transparent);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--semantic-success);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .trl-live-badge.paused {
    background: color-mix(in srgb, var(--border-strong) 12%, transparent);
    border-color: color-mix(in srgb, var(--border-strong) 25%, transparent);
    color: var(--text-tertiary);
  }

  .trl-live-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--semantic-success);
    animation: trl-pulse 2s ease-in-out infinite;
  }

  .trl-live-badge.paused .trl-live-dot {
    animation: none;
    background: var(--text-tertiary);
  }

  @keyframes trl-pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.5; transform: scale(0.8); }
  }

  /* Empty state */
  .trl-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    color: var(--text-tertiary);
    text-align: center;
    padding: 40px 20px;
  }

  .trl-empty-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary);
    font-family: system-ui, -apple-system, sans-serif;
  }

  .trl-empty-sub {
    font-size: 11px;
    color: var(--text-tertiary);
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* Table */
  .trl-table-wrapper {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border-default) transparent;
    min-height: 0;
  }

  .trl-header-row {
    display: flex;
    align-items: center;
    padding: 6px 14px;
    border-bottom: 1px solid var(--surface-float);
    position: sticky;
    top: 0;
    background: var(--surface-raised);
    z-index: 2;
  }

  .trl-col {
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: 10px;
    flex-shrink: 0;
  }

  .trl-col-method {
    width: 60px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--border-strong);
  }

  .trl-col-path {
    flex: 1;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--border-strong);
    min-width: 0;
  }

  .trl-col-status {
    width: 52px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--border-strong);
    text-align: center;
  }

  .trl-col-duration {
    width: 52px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--border-strong);
    text-align: right;
  }

  .trl-col-time {
    width: 64px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--border-strong);
    text-align: right;
  }

  .trl-rows {
    display: flex;
    flex-direction: column;
  }

  .trl-row {
    display: flex;
    align-items: center;
    padding: 7px 14px;
    border-bottom: 1px solid rgba(41, 46, 66, 0.4);
    animation: trl-row-in 150ms ease both;
    transition: background 0.1s ease;
  }

  .trl-row:hover {
    background: var(--surface-overlay);
  }

  @keyframes trl-row-in {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .trl-method-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.06em;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .trl-path-text {
    font-size: 11px;
    color: var(--text-secondary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .trl-status-text {
    font-size: 11px;
    font-weight: 600;
    text-align: center;
    display: block;
  }

  .trl-muted {
    color: var(--border-strong);
    font-size: 10px;
  }

  .trl-cap-notice {
    text-align: center;
    padding: 6px;
    font-size: 10px;
    color: var(--text-tertiary);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    background: color-mix(in srgb, var(--semantic-warning) 5%, transparent);
    border-bottom: 1px solid color-mix(in srgb, var(--semantic-warning) 10%, transparent);
  }

  /* Footer */
  .trl-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    border-top: 1px solid var(--border-default);
    background: var(--surface-raised);
    flex-shrink: 0;
  }

  .trl-log-count {
    font-size: 10px;
    color: var(--border-strong);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .trl-refresh-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 1px solid var(--border-default);
    border-radius: 20px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--text-tertiary);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    transition: all 0.15s ease;
  }

  .trl-refresh-toggle.active {
    border-color: color-mix(in srgb, var(--semantic-success) 30%, transparent);
    color: var(--semantic-success);
  }

  .trl-refresh-toggle:hover {
    background: var(--surface-overlay);
  }

  .trl-toggle-pill {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-tertiary);
    transition: background 0.15s ease;
    flex-shrink: 0;
  }

  .trl-refresh-toggle.active .trl-toggle-pill {
    background: var(--semantic-success);
    box-shadow: 0 0 6px color-mix(in srgb, var(--semantic-success) 50%, transparent);
    animation: trl-pulse 2s ease-in-out infinite;
  }
`;

export default TunnelRequestLogs;
