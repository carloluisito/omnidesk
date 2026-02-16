/**
 * FuelStatusIndicator - Always-visible fuel status in the TabBar
 *
 * Shows a compact 5-segment gauge + percentage + status icon.
 * Click opens BudgetPanel. Hover shows detailed tooltip.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { ClaudeUsageQuota, BurnRateData } from '../../../shared/ipc-types';
import { FuelGaugeBar } from './FuelGaugeBar';
import { FuelTooltip } from './FuelTooltip';

export interface FuelStatusIndicatorProps {
  quotaData: ClaudeUsageQuota | null;
  burnRateData: BurnRateData | null;
  onOpenPanel: () => void;
  isLoading?: boolean;
  error?: string | null;
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
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#9ece6a" strokeWidth="1.5">
      <polyline points="2 6 5 9 10 3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  elevated: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#e0af68" strokeWidth="1.5">
      <path d="M6 3v4" strokeLinecap="round" />
      <circle cx="6" cy="9" r="0.5" fill="#e0af68" />
    </svg>
  ),
  critical: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#f7768e" strokeWidth="1.5">
      <path d="M6 3v4" strokeLinecap="round" />
      <circle cx="6" cy="9" r="0.5" fill="#f7768e" />
    </svg>
  ),
};

export function FuelStatusIndicator({
  quotaData,
  burnRateData,
  onOpenPanel,
  isLoading = false,
  error = null,
}: FuelStatusIndicatorProps) {
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
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#565f89" strokeWidth="1.5" className="fuel-spin-icon">
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
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#f7768e" strokeWidth="1.5">
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
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="#565f89" strokeWidth="1.5">
          <circle cx="6" cy="6" r="5" />
          <path d="M5 5a1.5 1.5 0 011.5-1.5A1.5 1.5 0 018 5c0 1-1.5 1.5-1.5 1.5" strokeLinecap="round" />
          <circle cx="6" cy="9" r="0.5" fill="#565f89" />
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
    height: 32px;
    padding: 0 10px;
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 6px;
    cursor: pointer;
    font-family: 'JetBrains Mono', 'Fira Code', monospace;
    font-size: 11px;
    color: #a9b1d6;
    transition: all 150ms ease;
    flex-shrink: 0;
    outline: none;
  }

  .fuel-indicator:hover {
    background: #1e2030;
    border-color: #3b4261;
  }

  .fuel-indicator:focus-visible {
    outline: 2px solid #7aa2f7;
    outline-offset: 2px;
  }

  .fuel-indicator:active {
    transform: scale(0.97);
  }

  /* Severity states */
  .fuel-indicator-normal {
    border-color: #292e42;
  }

  .fuel-indicator-normal:hover {
    border-color: #9ece6a40;
  }

  .fuel-indicator-elevated {
    border-color: #e0af6830;
  }

  .fuel-indicator-elevated:hover {
    border-color: #e0af6860;
  }

  .fuel-indicator-critical {
    border-color: #f7768e40;
    animation: fuel-pulse 2s ease-in-out infinite;
  }

  .fuel-indicator-critical:hover {
    border-color: #f7768e80;
  }

  /* Stale data warning */
  .fuel-indicator-stale {
    border-color: #e0af6850 !important;
  }

  /* Percentage text */
  .fuel-pct {
    font-weight: 700;
    font-size: 11px;
    min-width: 28px;
    text-align: right;
  }

  .fuel-pct-normal {
    color: #9ece6a;
  }

  .fuel-pct-elevated {
    color: #e0af68;
  }

  .fuel-pct-critical {
    color: #f7768e;
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
    color: #565f89;
    font-weight: 600;
    background: linear-gradient(90deg, #565f89 0%, #3b4261 50%, #565f89 100%);
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
    border-color: #f7768e40;
  }

  .fuel-text-error {
    color: #f7768e;
    font-weight: 700;
    font-size: 10px;
  }

  /* No data state */
  .fuel-indicator-nodata {
    opacity: 0.5;
  }

  .fuel-text-nodata {
    color: #565f89;
    font-weight: 600;
    font-size: 10px;
  }

  /* Animations */
  @keyframes fuel-pulse {
    0%, 100% {
      box-shadow: 0 0 0 0 rgba(247, 118, 142, 0.4);
    }
    50% {
      box-shadow: 0 0 8px 2px rgba(247, 118, 142, 0.6);
    }
  }

  @keyframes fuel-shimmer {
    0% {
      background-position: -200px 0;
    }
    100% {
      background-position: 200px 0;
    }
  }

  @keyframes fuel-spin {
    from {
      transform: rotate(0deg);
    }
    to {
      transform: rotate(360deg);
    }
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
