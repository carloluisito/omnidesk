/**
 * FuelTooltip - Hover overlay with detailed quota breakdown
 *
 * Shows both 5h and 7d quotas with mini gauges, burn rate, status, and reset times.
 * Auto-positions above/below based on viewport.
 */

import { useRef, useLayoutEffect, useState } from 'react';
import { ClaudeUsageQuota, BurnRateData } from '../../../shared/ipc-types';

interface FuelTooltipProps {
  quotaData: ClaudeUsageQuota;
  burnRateData: BurnRateData | null;
  anchorRef: React.RefObject<HTMLElement | null>;
}

function formatTimeUntilReset(resetAt: string): string {
  const now = Date.now();
  const reset = new Date(resetAt).getTime();
  const diffMs = reset - now;

  if (diffMs <= 0) return 'Resetting...';

  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const remainingHours = hours % 24;
    return `${days}d ${remainingHours}h`;
  }
  return `${hours}h ${minutes}m`;
}

function formatTimeSince(isoString: string): string {
  const now = Date.now();
  const then = new Date(isoString).getTime();
  const diffMs = now - then;

  if (diffMs < 60000) return 'Just now';
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m ago`;
}

function formatPercent(utilization: number): string {
  const pct = Math.round(utilization * 100);
  return pct > 99 && utilization < 1 ? '99' : `${Math.min(pct, 99)}`;
}

function miniBar(utilization: number, _severity: 'normal' | 'elevated' | 'critical'): string {
  const filled = Math.round(Math.min(1, utilization) * 7);
  return Array.from({ length: 7 }, (_, i) => i < filled ? '\u2588' : '\u2591').join('');
}

function getSeverity(utilization: number): 'normal' | 'elevated' | 'critical' {
  if (utilization > 0.8) return 'critical';
  if (utilization > 0.5) return 'elevated';
  return 'normal';
}

const severityColors: Record<string, string> = {
  normal: 'var(--semantic-success, #3DD68C)',
  elevated: 'var(--semantic-warning, #F7A84A)',
  critical: 'var(--semantic-error, #F7678E)',
};

const burnRateLabels: Record<string, { text: string; color: string }> = {
  'on-track': { text: 'On Track', color: 'var(--semantic-success, #3DD68C)' },
  'elevated': { text: 'Elevated', color: 'var(--semantic-warning, #F7A84A)' },
  'critical': { text: 'Critical', color: 'var(--semantic-error, #F7678E)' },
  'unknown': { text: 'Unknown', color: 'var(--text-tertiary, #5C6080)' },
};

export function FuelTooltip({ quotaData, burnRateData, anchorRef }: FuelTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState<'above' | 'below'>('above');

  useLayoutEffect(() => {
    if (!anchorRef.current || !tooltipRef.current) return;
    const anchorRect = anchorRef.current.getBoundingClientRect();
    const tooltipHeight = tooltipRef.current.offsetHeight;

    // Position above if there's room, otherwise below
    if (anchorRect.top - tooltipHeight - 8 < 0) {
      setPosition('below');
    } else {
      setPosition('above');
    }
  }, [anchorRef]);

  const fiveH = quotaData.five_hour;
  const sevenD = quotaData.seven_day;
  const fiveHSeverity = getSeverity(fiveH.utilization);
  const sevenDSeverity = getSeverity(sevenD.utilization);
  const staleMs = Date.now() - new Date(quotaData.lastUpdated).getTime();
  const isStale = staleMs > 5 * 60 * 1000;

  const statusInfo = burnRateData
    ? burnRateLabels[burnRateData.label]
    : burnRateLabels['unknown'];

  return (
    <div
      ref={tooltipRef}
      className={`fuel-tooltip fuel-tooltip-${position}`}
      role="tooltip"
    >
      <div className="fuel-tooltip-title">Fuel Status</div>
      <div className="fuel-tooltip-divider" />

      {/* 5-Hour Quota */}
      <div className="fuel-tooltip-row">
        <span className="fuel-tooltip-label">5-Hour Quota</span>
        <span className="fuel-tooltip-value">
          <span style={{ color: severityColors[fiveHSeverity] }}>
            {formatPercent(fiveH.utilization)}%
          </span>
          {' '}
          <span style={{ color: severityColors[fiveHSeverity], fontSize: '9px', letterSpacing: '-0.5px' }}>
            {miniBar(fiveH.utilization, fiveHSeverity)}
          </span>
        </span>
      </div>
      <div className="fuel-tooltip-row fuel-tooltip-sub">
        <span className="fuel-tooltip-label">Resets in</span>
        <span className="fuel-tooltip-value">{formatTimeUntilReset(fiveH.resets_at)}</span>
      </div>

      <div className="fuel-tooltip-spacer" />

      {/* 7-Day Quota */}
      <div className="fuel-tooltip-row">
        <span className="fuel-tooltip-label">7-Day Quota</span>
        <span className="fuel-tooltip-value">
          <span style={{ color: severityColors[sevenDSeverity] }}>
            {formatPercent(sevenD.utilization)}%
          </span>
          {' '}
          <span style={{ color: severityColors[sevenDSeverity], fontSize: '9px', letterSpacing: '-0.5px' }}>
            {miniBar(sevenD.utilization, sevenDSeverity)}
          </span>
        </span>
      </div>
      <div className="fuel-tooltip-row fuel-tooltip-sub">
        <span className="fuel-tooltip-label">Resets in</span>
        <span className="fuel-tooltip-value">{formatTimeUntilReset(sevenD.resets_at)}</span>
      </div>

      <div className="fuel-tooltip-divider" />

      {/* Burn Rates */}
      {burnRateData && burnRateData.ratePerHour5h !== null && (
        <div className="fuel-tooltip-row">
          <span className="fuel-tooltip-label">5H Burn</span>
          <span className="fuel-tooltip-value">
            {burnRateData.ratePerHour5h.toFixed(1)}%/hr
          </span>
        </div>
      )}
      {burnRateData && burnRateData.ratePerHour7d !== null && (
        <div className="fuel-tooltip-row">
          <span className="fuel-tooltip-label">7D Burn</span>
          <span className="fuel-tooltip-value">
            {burnRateData.ratePerHour7d.toFixed(1)}%/hr
          </span>
        </div>
      )}

      {/* Status */}
      <div className="fuel-tooltip-row">
        <span className="fuel-tooltip-label">Status</span>
        <span className="fuel-tooltip-value" style={{ color: statusInfo.color }}>
          {statusInfo.text}
        </span>
      </div>

      <div className="fuel-tooltip-divider" />

      {/* Last Updated */}
      <div className="fuel-tooltip-row fuel-tooltip-sub">
        <span className="fuel-tooltip-label">Updated</span>
        <span className="fuel-tooltip-value">
          {isStale && <span className="fuel-tooltip-stale-icon">! </span>}
          {formatTimeSince(quotaData.lastUpdated)}
        </span>
      </div>
      {isStale && (
        <div className="fuel-tooltip-stale-warning">Data may be outdated</div>
      )}

      <style>{`
        .fuel-tooltip {
          position: absolute;
          z-index: 10000;
          width: 280px;
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-md, 6px);
          padding: var(--space-3, 12px);
          box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          font-size: var(--text-xs, 11px);
          color: var(--text-secondary, #9DA3BE);
          pointer-events: none;
          animation: fadeIn 150ms ease-out;
        }

        .fuel-tooltip-above {
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
        }

        .fuel-tooltip-below {
          top: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%);
        }

        .fuel-tooltip-title {
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-bold, 700);
          color: var(--text-primary, #E2E4F0);
          margin-bottom: var(--space-1, 4px);
        }

        .fuel-tooltip-divider {
          height: 1px;
          background: var(--border-subtle, #1E2030);
          margin: var(--space-2, 8px) 0;
        }

        .fuel-tooltip-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          padding: 2px 0;
        }

        .fuel-tooltip-sub {
          opacity: 0.6;
          font-size: 10px;
        }

        .fuel-tooltip-label {
          color: var(--text-tertiary, #5C6080);
        }

        .fuel-tooltip-value {
          color: var(--text-secondary, #9DA3BE);
          font-weight: var(--weight-semibold, 600);
        }

        .fuel-tooltip-spacer {
          height: 6px;
        }

        .fuel-tooltip-stale-icon {
          color: var(--semantic-warning, #F7A84A);
          font-weight: var(--weight-bold, 700);
        }

        .fuel-tooltip-stale-warning {
          font-size: 10px;
          color: var(--semantic-warning, #F7A84A);
          text-align: center;
          margin-top: var(--space-1, 4px);
          opacity: 0.8;
        }

        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateX(-50%) translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateX(-50%) translateY(0);
          }
        }
      `}</style>
    </div>
  );
}
