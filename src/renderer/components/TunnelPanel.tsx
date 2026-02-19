/**
 * TunnelPanel — Slide-in right panel for LaunchTunnel integration.
 *
 * Spec: 4 views (setup, main, settings, logs), BudgetPanel-pattern shell,
 * tunnel cards with status dots and copy URL, collapsible create/account sections,
 * CLI warning banner, skeleton loading, Tokyo Night styling, ESC to close.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  RefreshCw,
  Settings,
  ArrowLeft,
  Copy,
  Check,
  Eye,
  EyeOff,
  AlertTriangle,
  X,
  ChevronRight,
  ChevronDown,
  Loader2,
} from 'lucide-react';
import { useTunnel } from '../hooks/useTunnel';
import { TunnelCreateDialog } from './TunnelCreateDialog';
import { TunnelRequestLogs } from './TunnelRequestLogs';
import type { TunnelInfo } from '../../shared/types/tunnel-types';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface TunnelPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

type PanelView = 'main' | 'settings' | 'logs';

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

function getTunnelStatusColor(status: TunnelInfo['status']): string {
  switch (status) {
    case 'active': return '#9ece6a';
    case 'creating': return '#e0af68';
    case 'error': return '#f7768e';
    default: return '#3b4261';
  }
}

function formatRelativeTime(isoString: string): string {
  const delta = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function formatExpiry(isoString: string): string {
  const delta = new Date(isoString).getTime() - Date.now();
  if (delta <= 0) return 'Expired';
  const minutes = Math.floor(delta / 60_000);
  if (minutes < 60) return `Expires in ${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `Expires in ${hours}h`;
}

// ═══════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════

function TunnelCard({
  tunnel,
  index,
  onStop,
  onDelete,
  onViewLogs,
  isOperating,
}: {
  tunnel: TunnelInfo;
  index: number;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onViewLogs: (tunnel: TunnelInfo) => void;
  isOperating: boolean;
}) {
  const [urlCopied, setUrlCopied] = useState(false);
  const accentColor = getTunnelStatusColor(tunnel.status);

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(tunnel.url).catch(console.error);
    setUrlCopied(true);
    setTimeout(() => setUrlCopied(false), 2000);
  };

  return (
    <div
      className="tc-card"
      style={{
        borderLeftColor: accentColor,
        animationDelay: `${index * 50}ms`,
      }}
    >
      {/* Row 1: Name + protocol badge + status */}
      <div className="tc-row-1">
        <span className="tc-name">{tunnel.name || `Port ${tunnel.port}`}</span>
        <div className="tc-badges">
          <span
            className="tc-protocol-badge"
            style={{
              color: tunnel.protocol === 'http' ? '#7aa2f7' : '#bb9af7',
              background: tunnel.protocol === 'http'
                ? 'rgba(122, 162, 247, 0.12)'
                : 'rgba(187, 154, 247, 0.12)',
              borderColor: tunnel.protocol === 'http'
                ? 'rgba(122, 162, 247, 0.25)'
                : 'rgba(187, 154, 247, 0.25)',
            }}
          >
            {tunnel.protocol.toUpperCase()}
          </span>
          <span
            className="tc-status-badge"
            style={{
              color: accentColor,
              background: `${accentColor}12`,
              borderColor: `${accentColor}25`,
            }}
          >
            {tunnel.status}
          </span>
          <span
            className={`tc-status-dot${tunnel.status === 'active' ? ' tc-dot-active' : ''}`}
            style={{ background: accentColor }}
          />
        </div>
      </div>

      {/* Row 2: URL + copy button */}
      <div className="tc-row-2">
        <span className="tc-url">{tunnel.url}</span>
        <button
          className={`tc-copy-btn${urlCopied ? ' copied' : ''}`}
          onClick={handleCopyUrl}
          title={urlCopied ? 'Copied!' : 'Copy URL'}
        >
          {urlCopied ? <Check size={12} /> : <Copy size={12} />}
          {urlCopied && <span className="tc-copied-tooltip">Copied!</span>}
        </button>
      </div>

      {/* Row 3: Meta info */}
      <div className="tc-row-3">
        <span>Port {tunnel.port}</span>
        <span className="tc-dot-sep">·</span>
        <span>{formatRelativeTime(tunnel.createdAt)}</span>
        {tunnel.expiresAt && (
          <>
            <span className="tc-dot-sep">·</span>
            <span>{formatExpiry(tunnel.expiresAt)}</span>
          </>
        )}
      </div>

      {/* Row 4: Actions */}
      <div className="tc-row-4">
        {tunnel.status === 'active' || tunnel.status === 'creating' ? (
          <button
            className="tc-action-btn tc-action-stop"
            onClick={() => onStop(tunnel.id)}
            disabled={isOperating}
          >
            Stop
          </button>
        ) : null}
        <button
          className="tc-action-btn tc-action-delete"
          onClick={() => onDelete(tunnel.id)}
          disabled={isOperating}
        >
          Delete
        </button>
        {tunnel.hasInspect && (
          <button
            className="tc-action-btn tc-action-logs"
            onClick={() => onViewLogs(tunnel)}
          >
            View Logs
          </button>
        )}
      </div>
    </div>
  );
}

function SkeletonCard() {
  return (
    <div className="tc-skeleton">
      <div className="tc-skel-row">
        <div className="tc-skel-block tc-skel-name" />
        <div className="tc-skel-block tc-skel-badge" />
      </div>
      <div className="tc-skel-block tc-skel-url" />
      <div className="tc-skel-block tc-skel-meta" />
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SETUP VIEW
// ═══════════════════════════════════════════════════════════════════════════

function SetupView({
  onSave,
  isLoading,
}: {
  onSave: (key: string) => Promise<void>;
  isLoading: boolean;
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<'idle' | 'loading' | 'success'>('idle');

  const handleSave = async () => {
    setError(null);

    if (!apiKey.trim()) {
      setError('API key is required');
      return;
    }
    if (!apiKey.trim().startsWith('lt_')) {
      setError('API key must start with lt_');
      return;
    }

    setSaveState('loading');
    try {
      await onSave(apiKey.trim());
      setSaveState('success');
      setTimeout(() => setSaveState('idle'), 1500);
    } catch (err) {
      setSaveState('idle');
      setError(err instanceof Error ? err.message : 'Failed to validate API key');
    }
  };

  return (
    <div className="tp-setup">
      <div className="tp-setup-card">
        <div className="tp-setup-globe">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" strokeWidth="1.5">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
          </svg>
        </div>
        <p className="tp-setup-intro">
          Expose local ports to the internet via LaunchTunnel.
        </p>

        <div className="tp-setup-field">
          <label className="tp-setup-label" htmlFor="tp-api-key">API KEY</label>
          <div className="tp-setup-input-wrap">
            <input
              id="tp-api-key"
              className={`tp-setup-input${error ? ' tp-setup-input-error' : ''}`}
              type={showKey ? 'text' : 'password'}
              placeholder="lt_••••••••"
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
              disabled={isLoading || saveState === 'loading'}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              className="tp-setup-eye-btn"
              onClick={() => setShowKey((v) => !v)}
              tabIndex={-1}
              aria-label={showKey ? 'Hide API key' : 'Show API key'}
            >
              {showKey ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>
          {error && <span className="tp-setup-error">{error}</span>}
        </div>

        <button
          className={`tp-setup-save-btn${saveState !== 'idle' ? ` tp-save-${saveState}` : ''}`}
          onClick={handleSave}
          disabled={isLoading || saveState === 'loading'}
        >
          {saveState === 'loading' && (
            <Loader2 size={14} className="tp-setup-spinner" />
          )}
          {saveState === 'success' ? (
            <>
              <Check size={14} />
              Saved!
            </>
          ) : saveState === 'loading' ? (
            'Validating...'
          ) : (
            'Validate & Save'
          )}
        </button>

        <a
          className="tp-setup-link"
          href="https://app.launchtunnel.dev"
          target="_blank"
          rel="noopener noreferrer"
        >
          Get your API key at app.launchtunnel.dev
        </a>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// SETTINGS VIEW
// ═══════════════════════════════════════════════════════════════════════════

function SettingsView({
  onBack,
  currentKey,
  defaultProtocol,
  defaultExpires,
  autoRefreshIntervalMs,
  cliPath,
  onSave,
  onDisconnect,
}: {
  onBack: () => void;
  currentKey: string;
  defaultProtocol: 'http' | 'tcp';
  defaultExpires: string | undefined;
  autoRefreshIntervalMs: number;
  cliPath?: string;
  onSave: (changes: {
    defaultProtocol?: 'http' | 'tcp';
    defaultExpires?: string;
    autoRefreshIntervalMs?: number;
  }) => Promise<void>;
  onDisconnect: () => Promise<void>;
}) {
  const [proto, setProto] = useState<'http' | 'tcp'>(defaultProtocol);
  const [expires, setExpires] = useState(defaultExpires ?? '');
  const [refreshMs, setRefreshMs] = useState(autoRefreshIntervalMs);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const REFRESH_OPTIONS = [
    { value: 2000, label: '2s' },
    { value: 5000, label: '5s' },
    { value: 10000, label: '10s' },
    { value: 30000, label: '30s' },
  ];

  const EXPIRE_OPTIONS = [
    { value: '', label: 'None' },
    { value: '30m', label: '30m' },
    { value: '1h', label: '1h' },
    { value: '2h', label: '2h' },
    { value: '4h', label: '4h' },
    { value: '8h', label: '8h' },
    { value: '24h', label: '24h' },
  ];

  const maskedKey = currentKey
    ? `lt_${'•'.repeat(Math.max(0, currentKey.length - 7))}${currentKey.slice(-4)}`
    : 'Not set';

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave({ defaultProtocol: proto, defaultExpires: expires, autoRefreshIntervalMs: refreshMs });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="tp-settings">
      {/* Back header */}
      <div className="tp-settings-back">
        <button className="tp-back-btn" onClick={onBack}>
          <ArrowLeft size={14} />
          <span>Settings</span>
        </button>
      </div>

      <div className="tp-settings-body">
        {/* API Key row */}
        <div className="tp-settings-section">
          <div className="tp-settings-row">
            <div>
              <div className="tp-settings-label">API KEY</div>
              <div className="tp-settings-value-mono">{maskedKey}</div>
            </div>
            <button
              className="tp-settings-change-btn"
              onClick={onBack}
            >
              Change
            </button>
          </div>
        </div>

        <div className="tp-settings-divider" />

        {/* Default Protocol */}
        <div className="tp-settings-section">
          <div className="tp-settings-section-label">DEFAULT PROTOCOL</div>
          <div className="tcd-protocol-toggle" style={{ width: '100%', marginTop: 6 }}>
            <button
              className={`tcd-protocol-btn${proto === 'http' ? ' active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setProto('http')}
            >
              HTTP
            </button>
            <button
              className={`tcd-protocol-btn${proto === 'tcp' ? ' active' : ''}`}
              style={{ flex: 1 }}
              onClick={() => setProto('tcp')}
            >
              TCP
            </button>
          </div>
        </div>

        {/* Default Expiration */}
        <div className="tp-settings-section">
          <div className="tp-settings-section-label">DEFAULT EXPIRATION</div>
          <select
            className="tcd-select"
            style={{ marginTop: 6 }}
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          >
            {EXPIRE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* Auto-refresh Interval */}
        <div className="tp-settings-section">
          <div className="tp-settings-section-label">AUTO-REFRESH INTERVAL</div>
          <select
            className="tcd-select"
            style={{ marginTop: 6 }}
            value={refreshMs}
            onChange={(e) => setRefreshMs(Number(e.target.value))}
          >
            {REFRESH_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>

        {/* CLI path */}
        {cliPath && (
          <div className="tp-settings-section">
            <div className="tp-settings-section-label">CLI PATH (AUTO-DETECTED)</div>
            <div className="tp-settings-cli-path">{cliPath}</div>
          </div>
        )}

        {/* Save button */}
        <button
          className="tp-settings-save-btn"
          onClick={handleSave}
          disabled={isSaving}
        >
          {isSaving ? (
            <><Loader2 size={13} className="tp-setup-spinner" /> Saving...</>
          ) : 'Save Settings'}
        </button>

        <div className="tp-settings-divider" />

        {/* Disconnect */}
        {!confirmDisconnect ? (
          <button
            className="tp-disconnect-btn"
            onClick={() => setConfirmDisconnect(true)}
          >
            Disconnect
          </button>
        ) : (
          <div className="tp-disconnect-confirm">
            <span>Remove API key and disconnect?</span>
            <div className="tp-disconnect-confirm-actions">
              <button className="tp-disconnect-cancel" onClick={() => setConfirmDisconnect(false)}>
                Cancel
              </button>
              <button className="tp-disconnect-confirm-btn" onClick={onDisconnect}>
                Disconnect
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Include tcd styles for re-used form elements */}
      <style>{`
        .tcd-protocol-toggle { display: flex; border: 1px solid #292e42; border-radius: 6px; overflow: hidden; }
        .tcd-protocol-btn { padding: 6px 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.08em; font-family: 'JetBrains Mono', monospace; background: transparent; border: none; color: #565f89; cursor: pointer; transition: all 0.15s ease; }
        .tcd-protocol-btn + .tcd-protocol-btn { border-left: 1px solid #292e42; }
        .tcd-protocol-btn.active { background: rgba(122, 162, 247, 0.15); color: #7aa2f7; }
        .tcd-protocol-btn:hover:not(.active) { background: #1f2335; color: #a9b1d6; }
        .tcd-select { height: 34px; padding: 0 10px; background: #0d0e14; border: 1px solid #292e42; border-radius: 6px; color: #c0caf5; font-family: 'JetBrains Mono', monospace; font-size: 12px; outline: none; cursor: pointer; transition: border-color 0.15s ease; appearance: none; background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23565f89' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E"); background-repeat: no-repeat; background-position: right 10px center; padding-right: 28px; width: 100%; }
        .tcd-select:focus { border-color: #7aa2f7; }
        .tcd-select option { background: #16161e; color: #c0caf5; }
      `}</style>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════

export function TunnelPanel({ isOpen, onClose }: TunnelPanelProps) {
  const tunnel = useTunnel();
  const [isAnimating, setIsAnimating] = useState(false);
  const [view, setView] = useState<PanelView>('main');
  const [showCreateSection, setShowCreateSection] = useState(false);
  const [showAccountSection, setShowAccountSection] = useState(false);
  const [dismissedCliBanner, setDismissedCliBanner] = useState(false);
  const [dismissedErrorBanner, setDismissedErrorBanner] = useState(false);
  const lastErrorRef = useRef<string | null>(null);

  const activeTunnelCount = tunnel.tunnels.filter((t) => t.status === 'active').length;

  // Animation on open
  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
    }
  }, [isOpen]);

  // Reset dismissed banners when error changes
  useEffect(() => {
    if (tunnel.error && tunnel.error !== lastErrorRef.current) {
      setDismissedErrorBanner(false);
      lastErrorRef.current = tunnel.error;
    }
  }, [tunnel.error]);

  // Load account when settings view opens
  useEffect(() => {
    if (showAccountSection && tunnel.isConfigured) {
      tunnel.loadAccount();
    }
  }, [showAccountSection, tunnel.isConfigured]);

  // Refresh tunnels when panel opens
  useEffect(() => {
    if (isOpen && tunnel.isConfigured) {
      tunnel.refreshTunnels();
    }
  }, [isOpen, tunnel.isConfigured]);

  // ESC to close
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (view !== 'main') {
          setView('main');
        } else {
          handleClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, view]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 200);
  };

  const handleCreateTunnel = useCallback(async (request: import('../../shared/types/tunnel-types').TunnelCreateRequest) => {
    const result = await tunnel.createTunnel(request);
    if (result?.success) {
      setShowCreateSection(false);
    }
  }, [tunnel.createTunnel]);

  const handleSaveSetup = useCallback(async (apiKey: string) => {
    const result = await tunnel.validateApiKey(apiKey);
    if (result?.success) {
      await tunnel.updateSettings({ apiKey });
    } else {
      throw new Error(result?.message ?? 'Validation failed');
    }
  }, [tunnel.validateApiKey, tunnel.updateSettings]);

  const handleDisconnect = useCallback(async () => {
    await tunnel.updateSettings({ apiKey: '' });
    setView('main');
  }, [tunnel.updateSettings]);

  const handleSaveSettings = useCallback(async (changes: {
    defaultProtocol?: 'http' | 'tcp';
    defaultExpires?: string;
    autoRefreshIntervalMs?: number;
  }) => {
    await tunnel.updateSettings(changes);
    setView('main');
  }, [tunnel.updateSettings]);

  const handleViewLogs = useCallback((t: TunnelInfo) => {
    tunnel.selectTunnel(t);
    setView('logs');
  }, [tunnel.selectTunnel]);

  if (!isOpen) return null;

  const showCliWarning = tunnel.isConfigured && !tunnel.cliStatus?.found && !dismissedCliBanner;
  const showErrorBanner = tunnel.isConfigured && tunnel.error && !dismissedErrorBanner;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`tp-backdrop${isAnimating ? ' visible' : ''}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div className={`tp-panel${isAnimating ? ' visible' : ''}`}>
        <div className="tp-scanlines" />

        {/* Header */}
        <header className="tp-header">
          <div className="tp-header-title">
            {view !== 'main' ? (
              <button
                className="tp-header-back"
                onClick={() => setView('main')}
                aria-label="Back"
              >
                <ArrowLeft size={16} />
              </button>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#7aa2f7" strokeWidth="1.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
              </svg>
            )}
            <span className="tp-header-label">LAUNCHTUNNEL</span>
            {activeTunnelCount > 0 && (
              <span className="tp-active-badge">{activeTunnelCount}</span>
            )}
          </div>

          <div className="tp-header-actions">
            {tunnel.isConfigured && view === 'main' && (
              <>
                <button
                  className={`tp-icon-btn${tunnel.isLoading ? ' spinning' : ''}`}
                  onClick={() => tunnel.refreshTunnels()}
                  disabled={tunnel.isLoading}
                  title="Refresh"
                >
                  <RefreshCw size={15} />
                </button>
                <button
                  className="tp-icon-btn"
                  onClick={() => setView('settings')}
                  title="Settings"
                >
                  <Settings size={15} />
                </button>
              </>
            )}
            <button className="tp-esc-btn" onClick={handleClose} aria-label="Close panel">
              ESC
            </button>
          </div>
        </header>

        {/* Body */}
        <div className="tp-body">
          {/* ── LOGS VIEW ── */}
          {view === 'logs' && tunnel.selectedTunnel ? (
            <TunnelRequestLogs
              tunnel={tunnel.selectedTunnel}
              logs={tunnel.requestLogs}
              onBack={() => setView('main')}
              onRefresh={tunnel.loadRequestLogs}
            />
          ) : view === 'settings' && tunnel.settings ? (
            /* ── SETTINGS VIEW ── */
            <SettingsView
              onBack={() => setView('main')}
              currentKey={tunnel.settings.apiKey}
              defaultProtocol={tunnel.settings.defaultProtocol}
              defaultExpires={tunnel.settings.defaultExpires}
              autoRefreshIntervalMs={tunnel.settings.autoRefreshIntervalMs}
              cliPath={tunnel.settings.ltBinaryPath}
              onSave={handleSaveSettings}
              onDisconnect={handleDisconnect}
            />
          ) : !tunnel.isConfigured ? (
            /* ── SETUP VIEW ── */
            <SetupView
              onSave={handleSaveSetup}
              isLoading={tunnel.isLoading}
            />
          ) : (
            /* ── MAIN VIEW ── */
            <div className="tp-main">
              {/* CLI warning banner */}
              {showCliWarning && (
                <div className="tp-cli-banner">
                  <AlertTriangle size={13} style={{ color: '#e0af68', flexShrink: 0 }} />
                  <span>CLI not found: <code>npm i -g @launchtunnel/cli</code></span>
                  <button
                    className="tp-banner-dismiss"
                    onClick={() => setDismissedCliBanner(true)}
                    aria-label="Dismiss"
                  >
                    <X size={12} />
                  </button>
                </div>
              )}

              {/* Error banner */}
              {showErrorBanner && (
                <div className="tp-error-banner">
                  <AlertTriangle size={13} style={{ color: '#f7768e', flexShrink: 0 }} />
                  <span className="tp-error-banner-msg">{tunnel.error}</span>
                  <div className="tp-error-banner-actions">
                    <button
                      className="tp-banner-retry"
                      onClick={() => {
                        setDismissedErrorBanner(true);
                        tunnel.refreshTunnels();
                      }}
                    >
                      Retry
                    </button>
                    <button
                      className="tp-banner-dismiss"
                      onClick={() => setDismissedErrorBanner(true)}
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              )}

              {/* Active Tunnels section */}
              <div className="tp-section-header">
                <span className="tp-section-label">ACTIVE TUNNELS</span>
                <div className="tp-section-rule" />
              </div>

              {tunnel.isLoading && tunnel.tunnels.length === 0 ? (
                /* Skeleton */
                <div className="tp-tunnels-list">
                  <SkeletonCard />
                  <SkeletonCard />
                </div>
              ) : tunnel.tunnels.length === 0 ? (
                /* Empty state */
                <div className="tp-empty">
                  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#3b4261" strokeWidth="1.5">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="2" y1="12" x2="22" y2="12" />
                    <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
                  </svg>
                  <span className="tp-empty-title">No active tunnels</span>
                  <span className="tp-empty-sub">Create one below</span>
                </div>
              ) : (
                <div className="tp-tunnels-list">
                  {tunnel.tunnels.map((t, i) => (
                    <TunnelCard
                      key={t.id}
                      tunnel={t}
                      index={i}
                      onStop={tunnel.stopTunnel}
                      onDelete={tunnel.deleteTunnel}
                      onViewLogs={handleViewLogs}
                      isOperating={tunnel.operationInProgress !== null}
                    />
                  ))}
                </div>
              )}

              {/* Create Tunnel section */}
              <TunnelCreateDialog
                isOpen={showCreateSection}
                onToggle={() => setShowCreateSection((v) => !v)}
                onSubmit={handleCreateTunnel}
                isLoading={tunnel.operationInProgress === 'creating'}
                settings={tunnel.settings}
              />

              {/* Account section */}
              <div className="tp-account-section">
                <button
                  className="tp-section-toggle"
                  onClick={() => setShowAccountSection((v) => !v)}
                >
                  {showAccountSection ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  <span>ACCOUNT</span>
                </button>

                {showAccountSection && (
                  <div className="tp-account-body">
                    {tunnel.account ? (
                      <div className="tp-account-info">
                        {tunnel.account.email && (
                          <div className="tp-account-row">
                            <span className="tp-account-label">EMAIL</span>
                            <span className="tp-account-value">{tunnel.account.email}</span>
                          </div>
                        )}
                        {tunnel.account.plan && (
                          <div className="tp-account-row">
                            <span className="tp-account-label">PLAN</span>
                            <span
                              className="tp-plan-badge"
                              style={{
                                color: tunnel.account.plan.toLowerCase() === 'pro' ? '#e0af68' : '#565f89',
                                background: tunnel.account.plan.toLowerCase() === 'pro'
                                  ? 'rgba(224, 175, 104, 0.12)'
                                  : 'rgba(86, 95, 137, 0.12)',
                                borderColor: tunnel.account.plan.toLowerCase() === 'pro'
                                  ? 'rgba(224, 175, 104, 0.25)'
                                  : 'rgba(86, 95, 137, 0.25)',
                              }}
                            >
                              {tunnel.account.plan.toUpperCase()}
                            </span>
                          </div>
                        )}
                        {tunnel.account.status && (
                          <div className="tp-account-row">
                            <span className="tp-account-label">STATUS</span>
                            <span className="tp-account-value">{tunnel.account.status}</span>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="tp-account-loading">
                        <Loader2 size={13} className="tp-setup-spinner" />
                        <span>Loading account...</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {view === 'main' && tunnel.isConfigured && (
          <footer className="tp-footer">
            <span>
              Last synced:{' '}
              {new Date().toLocaleTimeString(undefined, {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </footer>
        )}
      </div>

      <style>{tunnelPanelStyles}</style>
    </>
  );
}

const tunnelPanelStyles = `
  /* ═══════════════════════════════════════════════════════════════
     BACKDROP & PANEL SHELL
     ═══════════════════════════════════════════════════════════════ */

  .tp-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0);
    z-index: 999;
    transition: background 0.2s ease;
    cursor: pointer;
  }

  .tp-backdrop.visible {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(3px);
  }

  .tp-panel {
    position: fixed;
    right: 0;
    top: 0;
    bottom: 0;
    width: min(420px, calc(100vw - 60px));
    background: linear-gradient(180deg, #1a1b26 0%, #16161e 100%);
    border-left: 1px solid #292e42;
    box-shadow:
      -20px 0 60px rgba(0, 0, 0, 0.5),
      inset 1px 0 0 rgba(122, 162, 247, 0.1);
    z-index: 1000;
    display: flex;
    flex-direction: column;
    transform: translateX(100%);
    opacity: 0;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
  }

  .tp-panel.visible {
    transform: translateX(0);
    opacity: 1;
  }

  @media (max-width: 900px) {
    .tp-panel { width: min(380px, calc(100vw - 40px)); }
  }

  @media (max-width: 750px) {
    .tp-panel { width: calc(100vw - 20px); }
  }

  @media (max-width: 650px) {
    .tp-panel { width: 100vw; }
  }

  .tp-scanlines {
    position: absolute;
    inset: 0;
    background: repeating-linear-gradient(
      0deg,
      transparent,
      transparent 2px,
      rgba(0, 0, 0, 0.03) 2px,
      rgba(0, 0, 0, 0.03) 4px
    );
    pointer-events: none;
    z-index: 10;
  }

  /* ═══════════════════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════════════════ */

  .tp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 56px;
    padding: 0 20px;
    border-bottom: 1px solid #292e42;
    background: rgba(22, 22, 30, 0.8);
    backdrop-filter: blur(8px);
    position: relative;
    z-index: 1;
    flex-shrink: 0;
  }

  .tp-header-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .tp-header-back {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tp-header-back:hover {
    background: #1f2335;
    color: #a9b1d6;
  }

  .tp-header-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #7aa2f7;
    text-shadow: 0 0 12px rgba(122, 162, 247, 0.5);
    font-family: 'JetBrains Mono', monospace;
  }

  .tp-active-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 9px;
    background: rgba(122, 162, 247, 0.2);
    border: 1px solid rgba(122, 162, 247, 0.4);
    color: #7aa2f7;
    font-size: 10px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
  }

  .tp-header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tp-icon-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 7px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tp-icon-btn:hover:not(:disabled) {
    background: #1f2335;
    border-color: #7aa2f7;
    color: #7aa2f7;
  }

  .tp-icon-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .tp-icon-btn.spinning svg {
    animation: tp-spin 1s linear infinite;
  }

  @keyframes tp-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .tp-esc-btn {
    padding: 6px 12px;
    font-size: 10px;
    font-weight: 700;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.08em;
    background: rgba(255, 255, 255, 0.05);
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tp-esc-btn:hover {
    background: #1f2335;
    border-color: #7aa2f7;
    color: #7aa2f7;
  }

  /* ═══════════════════════════════════════════════════════════════
     BODY
     ═══════════════════════════════════════════════════════════════ */

  .tp-body {
    flex: 1;
    overflow-y: auto;
    overflow-x: hidden;
    scrollbar-width: thin;
    scrollbar-color: #292e42 transparent;
    min-height: 0;
  }

  .tp-body::-webkit-scrollbar {
    width: 4px;
  }

  .tp-body::-webkit-scrollbar-track {
    background: transparent;
  }

  .tp-body::-webkit-scrollbar-thumb {
    background: #292e42;
    border-radius: 2px;
  }

  /* ═══════════════════════════════════════════════════════════════
     SETUP VIEW
     ═══════════════════════════════════════════════════════════════ */

  .tp-setup {
    padding: 24px 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    min-height: 100%;
    justify-content: center;
  }

  .tp-setup-card {
    width: 100%;
    background: #16161e;
    border: 1px solid #292e42;
    border-radius: 12px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 16px;
  }

  .tp-setup-globe {
    width: 56px;
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(122, 162, 247, 0.08);
    border: 1px solid rgba(122, 162, 247, 0.2);
    border-radius: 14px;
  }

  .tp-setup-intro {
    font-size: 13px;
    color: #a9b1d6;
    text-align: center;
    font-family: system-ui, -apple-system, sans-serif;
    line-height: 1.5;
    margin: 0;
  }

  .tp-setup-field {
    width: 100%;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .tp-setup-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
  }

  .tp-setup-input-wrap {
    position: relative;
  }

  .tp-setup-input {
    width: 100%;
    height: 38px;
    padding: 0 38px 0 12px;
    background: #0d0e14;
    border: 1px solid #292e42;
    border-radius: 7px;
    color: #c0caf5;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    outline: none;
    transition: border-color 0.15s ease;
    box-sizing: border-box;
  }

  .tp-setup-input:focus {
    border-color: #7aa2f7;
    box-shadow: 0 0 0 1px rgba(122, 162, 247, 0.2);
  }

  .tp-setup-input::placeholder { color: #3b4261; }

  .tp-setup-input-error {
    border-color: #f7768e !important;
  }

  .tp-setup-eye-btn {
    position: absolute;
    right: 10px;
    top: 50%;
    transform: translateY(-50%);
    background: none;
    border: none;
    color: #565f89;
    cursor: pointer;
    display: flex;
    align-items: center;
    padding: 0;
    transition: color 0.15s ease;
  }

  .tp-setup-eye-btn:hover { color: #a9b1d6; }

  .tp-setup-error {
    font-size: 10px;
    color: #f7768e;
    font-family: 'JetBrains Mono', monospace;
  }

  .tp-setup-save-btn {
    width: 100%;
    height: 40px;
    background: #7aa2f7;
    color: #1a1b26;
    border: none;
    border-radius: 7px;
    font-size: 13px;
    font-weight: 600;
    font-family: system-ui, -apple-system, sans-serif;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    transition: all 0.15s ease;
  }

  .tp-setup-save-btn:hover:not(:disabled) {
    background: #89b4fa;
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(122, 162, 247, 0.3);
  }

  .tp-setup-save-btn:disabled {
    opacity: 0.7;
    cursor: not-allowed;
  }

  .tp-save-success {
    background: #9ece6a !important;
    color: #1a1b26 !important;
  }

  .tp-setup-spinner {
    animation: tp-spin 0.8s linear infinite;
  }

  .tp-setup-link {
    font-size: 11px;
    color: #565f89;
    text-decoration: none;
    font-family: system-ui, -apple-system, sans-serif;
    transition: color 0.15s ease;
  }

  .tp-setup-link:hover { color: #7aa2f7; }

  /* ═══════════════════════════════════════════════════════════════
     MAIN VIEW
     ═══════════════════════════════════════════════════════════════ */

  .tp-main {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
  }

  /* Banners */
  .tp-cli-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(224, 175, 104, 0.08);
    border: 1px solid rgba(224, 175, 104, 0.2);
    border-radius: 7px;
    font-size: 11px;
    color: #e0af68;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .tp-cli-banner code {
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    background: rgba(224, 175, 104, 0.12);
    padding: 1px 5px;
    border-radius: 3px;
  }

  .tp-error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    background: rgba(247, 118, 142, 0.08);
    border: 1px solid rgba(247, 118, 142, 0.2);
    border-radius: 7px;
    font-size: 11px;
    color: #f7768e;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .tp-error-banner-msg {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tp-error-banner-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .tp-banner-retry {
    background: none;
    border: 1px solid rgba(247, 118, 142, 0.3);
    border-radius: 4px;
    color: #f7768e;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    transition: all 0.15s ease;
  }

  .tp-banner-retry:hover {
    background: rgba(247, 118, 142, 0.1);
  }

  .tp-banner-dismiss {
    display: flex;
    align-items: center;
    background: none;
    border: none;
    color: #565f89;
    cursor: pointer;
    padding: 2px;
    transition: color 0.15s ease;
    flex-shrink: 0;
  }

  .tp-banner-dismiss:hover { color: #a9b1d6; }

  /* Section header */
  .tp-section-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-top: 4px;
  }

  .tp-section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #3b4261;
    font-family: 'JetBrains Mono', monospace;
    white-space: nowrap;
  }

  .tp-section-rule {
    flex: 1;
    height: 1px;
    background: #1e2030;
  }

  /* Empty state */
  .tp-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    padding: 32px 0;
    text-align: center;
  }

  .tp-empty-title {
    font-size: 13px;
    font-weight: 600;
    color: #a9b1d6;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .tp-empty-sub {
    font-size: 11px;
    color: #565f89;
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* Tunnels list */
  .tp-tunnels-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  /* ═══════════════════════════════════════════════════════════════
     TUNNEL CARD
     ═══════════════════════════════════════════════════════════════ */

  .tc-card {
    background: #16161e;
    border: 1px solid #292e42;
    border-left-width: 3px;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 7px;
    animation: tc-appear 200ms ease both;
  }

  @keyframes tc-appear {
    from {
      opacity: 0;
      transform: translateY(6px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .tc-row-1 {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tc-name {
    font-size: 13px;
    font-weight: 700;
    color: #c0caf5;
    font-family: 'JetBrains Mono', monospace;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tc-badges {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .tc-protocol-badge,
  .tc-status-badge {
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 3px;
    border: 1px solid;
    letter-spacing: 0.06em;
    font-family: 'JetBrains Mono', monospace;
  }

  .tc-status-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .tc-dot-active {
    animation: tc-dot-pulse 2s ease-in-out infinite;
  }

  @keyframes tc-dot-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(158, 206, 106, 0.6);
      transform: scale(1);
    }
    50% {
      box-shadow: 0 0 0 5px rgba(158, 206, 106, 0);
      transform: scale(1.1);
    }
  }

  .tc-row-2 {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tc-url {
    flex: 1;
    font-size: 11px;
    color: #7aa2f7;
    font-family: 'JetBrains Mono', monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .tc-copy-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 5px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .tc-copy-btn:hover {
    background: #1f2335;
    border-color: #3b4261;
    color: #a9b1d6;
  }

  .tc-copy-btn.copied {
    border-color: rgba(158, 206, 106, 0.3);
    color: #9ece6a;
  }

  .tc-copied-tooltip {
    position: absolute;
    bottom: calc(100% + 4px);
    left: 50%;
    transform: translateX(-50%);
    background: #0d0e14;
    border: 1px solid #292e42;
    border-radius: 4px;
    padding: 3px 7px;
    font-size: 9px;
    color: #9ece6a;
    white-space: nowrap;
    font-family: 'JetBrains Mono', monospace;
    pointer-events: none;
  }

  .tc-row-3 {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
  }

  .tc-dot-sep {
    color: #3b4261;
  }

  .tc-row-4 {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 2px;
  }

  .tc-action-btn {
    height: 26px;
    padding: 0 10px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 600;
    font-family: 'JetBrains Mono', monospace;
    cursor: pointer;
    border: 1px solid;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
  }

  .tc-action-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tc-action-stop {
    background: rgba(247, 118, 142, 0.08);
    border-color: rgba(247, 118, 142, 0.25);
    color: #f7768e;
  }

  .tc-action-stop:hover:not(:disabled) {
    background: rgba(247, 118, 142, 0.15);
  }

  .tc-action-delete {
    background: transparent;
    border-color: #292e42;
    color: #565f89;
  }

  .tc-action-delete:hover:not(:disabled) {
    background: #1f2335;
    color: #a9b1d6;
  }

  .tc-action-logs {
    background: transparent;
    border-color: #292e42;
    color: #565f89;
  }

  .tc-action-logs:hover:not(:disabled) {
    background: #1f2335;
    border-color: #7aa2f7;
    color: #7aa2f7;
  }

  /* ═══════════════════════════════════════════════════════════════
     SKELETON
     ═══════════════════════════════════════════════════════════════ */

  .tc-skeleton {
    background: #16161e;
    border: 1px solid #1e2030;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tc-skel-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .tc-skel-block {
    background: #1e2030;
    border-radius: 4px;
    animation: tp-shimmer 1.6s ease-in-out infinite;
  }

  @keyframes tp-shimmer {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 0.7; }
  }

  .tc-skel-name { height: 12px; width: 120px; }
  .tc-skel-badge { height: 16px; width: 40px; border-radius: 3px; }
  .tc-skel-url { height: 10px; width: 80%; }
  .tc-skel-meta { height: 9px; width: 55%; }

  /* ═══════════════════════════════════════════════════════════════
     ACCOUNT SECTION
     ═══════════════════════════════════════════════════════════════ */

  .tp-account-section {
    border: 1px solid #292e42;
    border-radius: 8px;
    overflow: hidden;
  }

  .tp-section-toggle {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    background: #16161e;
    border: none;
    cursor: pointer;
    color: #565f89;
    font-size: 11px;
    font-weight: 700;
    letter-spacing: 0.12em;
    font-family: 'JetBrains Mono', monospace;
    transition: background 0.15s ease;
  }

  .tp-section-toggle:hover {
    background: #1f2335;
  }

  .tp-account-body {
    padding: 12px 14px;
    background: #13141b;
    border-top: 1px solid #292e42;
  }

  .tp-account-info {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tp-account-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tp-account-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #3b4261;
    font-family: 'JetBrains Mono', monospace;
  }

  .tp-account-value {
    font-size: 11px;
    color: #a9b1d6;
    font-family: 'JetBrains Mono', monospace;
  }

  .tp-plan-badge {
    font-size: 10px;
    font-weight: 700;
    padding: 2px 8px;
    border-radius: 4px;
    border: 1px solid;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.05em;
  }

  .tp-account-loading {
    display: flex;
    align-items: center;
    gap: 8px;
    color: #565f89;
    font-size: 11px;
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* ═══════════════════════════════════════════════════════════════
     SETTINGS VIEW
     ═══════════════════════════════════════════════════════════════ */

  .tp-settings {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  .tp-settings-back {
    padding: 12px 16px;
    border-bottom: 1px solid #1e2030;
  }

  .tp-back-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background: none;
    border: none;
    color: #7aa2f7;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    font-family: system-ui, -apple-system, sans-serif;
    padding: 0;
    transition: color 0.15s ease;
  }

  .tp-back-btn:hover { color: #89b4fa; }

  .tp-settings-body {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    overflow-y: auto;
  }

  .tp-settings-section {
    display: flex;
    flex-direction: column;
  }

  .tp-settings-section-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 4px;
  }

  .tp-settings-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .tp-settings-label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
    margin-bottom: 3px;
  }

  .tp-settings-value-mono {
    font-size: 12px;
    color: #a9b1d6;
    font-family: 'JetBrains Mono', monospace;
  }

  .tp-settings-change-btn {
    padding: 5px 12px;
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 5px;
    color: #7aa2f7;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: system-ui, -apple-system, sans-serif;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .tp-settings-change-btn:hover {
    background: #1f2335;
    border-color: #7aa2f7;
  }

  .tp-settings-divider {
    height: 1px;
    background: #1e2030;
  }

  .tp-settings-cli-path {
    font-size: 10px;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
    background: #0d0e14;
    border: 1px solid #1e2030;
    border-radius: 5px;
    padding: 6px 10px;
    word-break: break-all;
    margin-top: 4px;
  }

  .tp-settings-save-btn {
    height: 36px;
    background: rgba(122, 162, 247, 0.12);
    border: 1px solid rgba(122, 162, 247, 0.3);
    border-radius: 6px;
    color: #7aa2f7;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: system-ui, -apple-system, sans-serif;
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .tp-settings-save-btn:hover:not(:disabled) {
    background: rgba(122, 162, 247, 0.2);
  }

  .tp-settings-save-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Disconnect */
  .tp-disconnect-btn {
    height: 34px;
    background: transparent;
    border: 1px solid rgba(247, 118, 142, 0.25);
    border-radius: 6px;
    color: #f7768e;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    font-family: system-ui, -apple-system, sans-serif;
    transition: all 0.15s ease;
  }

  .tp-disconnect-btn:hover {
    background: rgba(247, 118, 142, 0.08);
    border-color: rgba(247, 118, 142, 0.4);
  }

  .tp-disconnect-confirm {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    background: rgba(247, 118, 142, 0.05);
    border: 1px solid rgba(247, 118, 142, 0.2);
    border-radius: 6px;
  }

  .tp-disconnect-confirm span {
    font-size: 12px;
    color: #f7768e;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .tp-disconnect-confirm-actions {
    display: flex;
    gap: 8px;
  }

  .tp-disconnect-cancel {
    flex: 1;
    height: 30px;
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 5px;
    color: #565f89;
    font-size: 11px;
    cursor: pointer;
    font-family: system-ui, -apple-system, sans-serif;
    transition: all 0.15s ease;
  }

  .tp-disconnect-cancel:hover {
    background: #1f2335;
    color: #a9b1d6;
  }

  .tp-disconnect-confirm-btn {
    flex: 1;
    height: 30px;
    background: rgba(247, 118, 142, 0.15);
    border: 1px solid rgba(247, 118, 142, 0.3);
    border-radius: 5px;
    color: #f7768e;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    font-family: system-ui, -apple-system, sans-serif;
    transition: all 0.15s ease;
  }

  .tp-disconnect-confirm-btn:hover {
    background: rgba(247, 118, 142, 0.25);
  }

  /* ═══════════════════════════════════════════════════════════════
     FOOTER
     ═══════════════════════════════════════════════════════════════ */

  .tp-footer {
    padding: 12px 16px;
    border-top: 1px solid #292e42;
    background: rgba(22, 22, 30, 0.8);
    flex-shrink: 0;
  }

  .tp-footer span {
    font-size: 10px;
    color: #3b4261;
    display: block;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
  }

  @media (prefers-reduced-motion: reduce) {
    .tp-panel,
    .tc-dot-active,
    .tc-card,
    .tc-skel-block {
      transition: none;
      animation: none;
    }
  }
`;

export default TunnelPanel;
