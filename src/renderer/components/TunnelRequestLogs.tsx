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
    case 'GET': return 'var(--semantic-success, #3DD68C)';
    case 'POST': return 'var(--accent-primary, #00C9A7)';
    case 'PUT':
    case 'PATCH': return 'var(--semantic-warning, #F7A84A)';
    case 'DELETE': return 'var(--semantic-error, #F7678E)';
    default: return 'var(--text-tertiary, #5C6080)';
  }
}

function getStatusColor(code: number): string {
  if (code >= 200 && code < 300) return 'var(--semantic-success, #3DD68C)';
  if (code >= 300 && code < 400) return 'var(--accent-primary, #00C9A7)';
  if (code >= 400 && code < 500) return 'var(--semantic-warning, #F7A84A)';
  if (code >= 500) return 'var(--semantic-error, #F7678E)';
  return 'var(--text-tertiary, #5C6080)';
}

function getDurationColor(ms: number): string {
  if (ms < 100) return 'var(--semantic-success, #3DD68C)';
  if (ms > 1000) return 'var(--semantic-warning, #F7A84A)';
  return 'var(--text-tertiary, #5C6080)';
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
          <Network size={32} style={{ color: 'var(--border-strong, #3D4163)' }} />
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
    border-bottom: 1px solid var(--border-default, #292E44);
    flex-shrink: 0;
  }

  .trl-back-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
    color: var(--text-tertiary, #5C6080);
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .trl-back-btn:hover {
    background: var(--surface-overlay, #1A1B26);
    color: var(--text-secondary, #9DA3BE);
    border-color: var(--border-strong, #3D4163);
  }

  .trl-url-bar {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background: var(--surface-base, #0D0E14);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
    padding: 5px 10px;
    min-width: 0;
  }

  .trl-url-text {
    flex: 1;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: 11px;
    color: var(--accent-primary, #00C9A7);
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
    color: var(--text-tertiary, #5C6080);
    cursor: pointer;
    flex-shrink: 0;
    transition: color 0.15s ease;
  }

  .trl-copy-btn:hover {
    color: var(--text-secondary, #9DA3BE);
  }

  .trl-live-badge {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(61, 214, 140, 0.12);
    border: 1px solid rgba(61, 214, 140, 0.25);
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--semantic-success, #3DD68C);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    flex-shrink: 0;
    transition: all 0.2s ease;
  }

  .trl-live-badge.paused {
    background: rgba(86, 95, 137, 0.12);
    border-color: rgba(86, 95, 137, 0.25);
    color: var(--text-tertiary, #5C6080);
  }

  .trl-live-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    background: var(--semantic-success, #3DD68C);
    animation: trl-pulse 2s ease-in-out infinite;
  }

  .trl-live-badge.paused .trl-live-dot {
    animation: none;
    background: var(--text-tertiary, #5C6080);
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
    color: var(--text-tertiary, #5C6080);
    text-align: center;
    padding: 40px 20px;
  }

  .trl-empty-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--text-secondary, #9DA3BE);
    font-family: system-ui, -apple-system, sans-serif;
  }

  .trl-empty-sub {
    font-size: 11px;
    color: var(--text-tertiary, #5C6080);
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* Table */
  .trl-table-wrapper {
    flex: 1;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--border-default, #292E44) transparent;
    min-height: 0;
  }

  .trl-header-row {
    display: flex;
    align-items: center;
    padding: 6px 14px;
    border-bottom: 1px solid var(--surface-float, #222435);
    position: sticky;
    top: 0;
    background: var(--surface-raised, #13141C);
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
    color: var(--border-strong, #3D4163);
  }

  .trl-col-path {
    flex: 1;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--border-strong, #3D4163);
    min-width: 0;
  }

  .trl-col-status {
    width: 52px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--border-strong, #3D4163);
    text-align: center;
  }

  .trl-col-duration {
    width: 52px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--border-strong, #3D4163);
    text-align: right;
  }

  .trl-col-time {
    width: 64px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: var(--border-strong, #3D4163);
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
    background: var(--surface-overlay, #1A1B26);
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
    color: var(--text-secondary, #9DA3BE);
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
    color: var(--border-strong, #3D4163);
    font-size: 10px;
  }

  .trl-cap-notice {
    text-align: center;
    padding: 6px;
    font-size: 10px;
    color: var(--text-tertiary, #5C6080);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    background: rgba(247, 168, 74, 0.05);
    border-bottom: 1px solid rgba(247, 168, 74, 0.1);
  }

  /* Footer */
  .trl-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 14px;
    border-top: 1px solid var(--border-default, #292E44);
    background: var(--surface-raised, #13141C);
    flex-shrink: 0;
  }

  .trl-log-count {
    font-size: 10px;
    color: var(--border-strong, #3D4163);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .trl-refresh-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    background: none;
    border: 1px solid var(--border-default, #292E44);
    border-radius: 20px;
    padding: 4px 10px;
    cursor: pointer;
    font-size: 9px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: var(--text-tertiary, #5C6080);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    transition: all 0.15s ease;
  }

  .trl-refresh-toggle.active {
    border-color: rgba(61, 214, 140, 0.3);
    color: var(--semantic-success, #3DD68C);
  }

  .trl-refresh-toggle:hover {
    background: var(--surface-overlay, #1A1B26);
  }

  .trl-toggle-pill {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--text-tertiary, #5C6080);
    transition: background 0.15s ease;
    flex-shrink: 0;
  }

  .trl-refresh-toggle.active .trl-toggle-pill {
    background: var(--semantic-success, #3DD68C);
    box-shadow: 0 0 6px rgba(61, 214, 140, 0.5);
    animation: trl-pulse 2s ease-in-out infinite;
  }
`;

export default TunnelRequestLogs;
