/**
 * FuelStatusIndicator - Always-visible fuel status in the TabBar
 *
 * Shows a compact 5-segment gauge + percentage + status icon.
 * Click opens BudgetPanel. Hover shows detailed tooltip.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ClaudeUsageQuota, BurnRateData } from '../../../shared/ipc-types';
import type { ProviderId } from '../../../shared/types/provider-types';
import { FuelGaugeBar } from './FuelGaugeBar';
import { FuelTooltip } from './FuelTooltip';

export interface FuelStatusIndicatorProps {
  quotaData: ClaudeUsageQuota | null;
  burnRateData: BurnRateData | null;
  onOpenPanel: () => void;
  isLoading?: boolean;
  error?: string | null;
  activeSessionProviderId?: ProviderId;
}

type Severity = 'normal' | 'elevated' | 'critical';

function getSeverity(utilization: number): Severity {
  if (utilization > 0.8) return 'critical';
  if (utilization > 0.5) return 'elevated';
  return 'normal';
}

function getMaxUtilization(quota: ClaudeUsageQuota): number {
  return Math.max(quota.five_hour.utilization, quota.seven_day.utilization);
}

const severityIcons: Record<Severity, JSX.Element> = {
  normal: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--semantic-success)" strokeWidth="1.5">
      <polyline points="2 6 5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  elevated: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--semantic-warning)" strokeWidth="1.5">
      <path d="M6 3v4" strokeLinecap="round" />
      <circle cx="6" cy="9" r="0.5" fill="var(--semantic-warning)" />
    </svg>
  ),
  critical: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--semantic-error)" strokeWidth="1.5">
      <path d="M6 3v4" strokeLinecap="round" />
      <circle cx="6" cy="9" r="0.5" fill="var(--semantic-error)" />
    </svg>
  ),
};

export function FuelStatusIndicator({
  quotaData,
  burnRateData,
  onOpenPanel,
  isLoading = false,
  error = null,
  activeSessionProviderId,
}: FuelStatusIndicatorProps) {
  // Hide quota indicator when active session is not Claude (quota is Claude-specific)
  if (activeSessionProviderId && activeSessionProviderId !== 'claude') return null;
  const [showTooltip, setShowTooltip] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Cleanup timeouts on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  const handleMouseEnter = useCallback(() => {
    if (hideTimeoutRef.current) {
      clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = null;
    }
    hoverTimeoutRef.current = setTimeout(() => setShowTooltip(true), 200);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    hideTimeoutRef.current = setTimeout(() => setShowTooltip(false), 300);
  }, []);

  const handleFocus = useCallback(() => {
    setShowTooltip(true);
  }, []);

  const handleBlur = useCallback(() => {
    setShowTooltip(false);
  }, []);

  const handleClick = useCallback(() => {
    setShowTooltip(false);
    onOpenPanel();
  }, [onOpenPanel]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
    if (e.key === 'Escape') {
      setShowTooltip(false);
    }
  }, [handleClick]);

  // Loading state
  if (isLoading && !quotaData) {
    return (
      <div className="fuel-indicator fuel-indicator-loading" aria-label="Loading fuel status">
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" className="fuel-spin-icon">
          <path d="M6 1a5 5 0 014.33 2.5" strokeLinecap="round" />
        </svg>
        <span className="fuel-text-loading">---</span>
        <style>{indicatorStyles}</style>
      </div>
    );
  }

  // Error state
  if (error && !quotaData) {
    return (
      <button
        ref={buttonRef}
        className="fuel-indicator fuel-indicator-error"
        onClick={onOpenPanel}
        aria-label="API quota error. Click for details."
        aria-haspopup="dialog"
        title="Quota unavailable - click for details"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--semantic-error)" strokeWidth="1.5">
          <circle cx="6" cy="6" r="5" />
          <path d="M4 4l4 4M8 4l-4 4" strokeLinecap="round" />
        </svg>
        <span className="fuel-text-error">ERR</span>
        <style>{indicatorStyles}</style>
      </button>
    );
  }

  // No data state
  if (!quotaData) {
    return (
      <button
        ref={buttonRef}
        className="fuel-indicator fuel-indicator-nodata"
        onClick={onOpenPanel}
        aria-label="No quota data available. Click for details."
        aria-haspopup="dialog"
        title="No quota data - click for details"
      >
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5">
          <circle cx="6" cy="6" r="5" />
          <path d="M5 5a1.5 1.5 0 011.5-1.5A1.5 1.5 0 018 5c0 1-1.5 1.5-1.5 1.5" strokeLinecap="round" />
          <circle cx="6" cy="9" r="0.5" fill="var(--text-tertiary)" />
        </svg>
        <span className="fuel-text-nodata">N/A</span>
        <style>{indicatorStyles}</style>
      </button>
    );
  }

  // Normal display
  const maxUtil = getMaxUtilization(quotaData);
  const severity = getSeverity(maxUtil);
  const displayPct = maxUtil > 1 ? 99 : Math.round(maxUtil * 100);
  const isStale = Date.now() - new Date(quotaData.lastUpdated).getTime() > 5 * 60 * 1000;

  const ariaLabel = `API quota status: ${displayPct}% used${severity === 'critical' ? ' - Critical!' : severity === 'elevated' ? ' - Elevated' : ''}. Click for details.`;

  return (
    <button
      ref={buttonRef}
      className={`fuel-indicator fuel-indicator-${severity}${isStale ? ' fuel-indicator-stale' : ''}`}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onKeyDown={handleKeyDown}
      aria-label={ariaLabel}
      aria-haspopup="dialog"
      role="button"
      tabIndex={0}
    >
      <FuelGaugeBar utilization={maxUtil} severity={severity} />
      <span className={`fuel-pct fuel-pct-${severity}`}>{displayPct}%</span>
      <span className="fuel-severity-icon">{severityIcons[severity]}</span>

      {showTooltip && (
        <FuelTooltip
          quotaData={quotaData}
          burnRateData={burnRateData}
          anchorRef={buttonRef}
        />
      )}

      <style>{indicatorStyles}</style>
    </button>
  );
}

const indicatorStyles = `
  .fuel-indicator {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    height: 22px;
    padding: 0 var(--space-2, 8px);
    background: transparent;
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
    font-size: var(--text-xs, 11px);
    color: var(--text-secondary, #9DA3BE);
    transition: all var(--duration-fast, 150ms) var(--ease-inout, ease);
    flex-shrink: 0;
    outline: none;
  }

  .fuel-indicator:hover {
    background: var(--state-hover, #FFFFFF0A);
    border-color: var(--border-strong, #3D4163);
  }

  .fuel-indicator:focus-visible {
    outline: 2px solid var(--state-focus, #00C9A740);
    outline-offset: 2px;
  }

  .fuel-indicator:active {
    transform: scale(0.97);
  }

  /* Severity states */
  .fuel-indicator-normal {
    border-color: var(--border-default, #292E44);
  }

  .fuel-indicator-normal:hover {
    border-color: rgba(61, 214, 140, 0.25);
  }

  .fuel-indicator-elevated {
    border-color: rgba(247, 168, 74, 0.2);
  }

  .fuel-indicator-elevated:hover {
    border-color: rgba(247, 168, 74, 0.4);
  }

  .fuel-indicator-critical {
    border-color: rgba(247, 103, 142, 0.25);
    animation: fuel-pulse 2s ease-in-out infinite;
  }

  .fuel-indicator-critical:hover {
    border-color: rgba(247, 103, 142, 0.5);
  }

  /* Stale data warning */
  .fuel-indicator-stale {
    border-color: rgba(247, 168, 74, 0.3) !important;
  }

  /* Percentage text */
  .fuel-pct {
    font-weight: var(--weight-bold, 700);
    font-size: var(--text-xs, 11px);
    min-width: 28px;
    text-align: right;
  }

  .fuel-pct-normal {
    color: var(--semantic-success, #3DD68C);
  }

  .fuel-pct-elevated {
    color: var(--semantic-warning, #F7A84A);
  }

  .fuel-pct-critical {
    color: var(--semantic-error, #F7678E);
  }

  /* Severity icon */
  .fuel-severity-icon {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 12px;
    height: 12px;
  }

  /* Loading state */
  .fuel-indicator-loading {
    cursor: default;
    opacity: 0.6;
  }

  .fuel-text-loading {
    color: var(--text-tertiary, #5C6080);
    font-weight: var(--weight-semibold, 600);
    background: linear-gradient(90deg, var(--text-tertiary, #5C6080) 0%, var(--border-strong, #3D4163) 50%, var(--text-tertiary, #5C6080) 100%);
    background-size: 200px 100%;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: fuel-shimmer 1.5s ease-in-out infinite;
  }

  .fuel-spin-icon {
    animation: fuel-spin 1s linear infinite;
  }

  /* Error state */
  .fuel-indicator-error {
    border-color: rgba(247, 103, 142, 0.25);
  }

  .fuel-text-error {
    color: var(--semantic-error, #F7678E);
    font-weight: var(--weight-bold, 700);
    font-size: var(--text-2xs, 10px);
  }

  /* No data state */
  .fuel-indicator-nodata {
    opacity: 0.5;
  }

  .fuel-text-nodata {
    color: var(--text-tertiary, #5C6080);
    font-weight: var(--weight-semibold, 600);
    font-size: var(--text-2xs, 10px);
  }

  /* Animations */
  @keyframes fuel-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(247, 103, 142, 0.3);
    }
    50% {
      box-shadow: 0 0 8px 2px rgba(247, 103, 142, 0.5);
    }
  }

  @keyframes fuel-shimmer {
    0%   { background-position: -200px 0; }
    100% { background-position: 200px 0; }
  }

  @keyframes fuel-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    .fuel-indicator-critical {
      animation: none;
    }
    .fuel-text-loading {
      animation: none;
    }
    .fuel-spin-icon {
      animation: none;
    }
  }
`;
