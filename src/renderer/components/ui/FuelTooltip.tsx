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
  normal: '#9ece6a',
  elevated: '#e0af68',
  critical: '#f7768e',
};

const burnRateLabels: Record<string, { text: string; color: string }> = {
  'on-track': { text: 'On Track', color: '#9ece6a' },
  'elevated': { text: 'Elevated', color: '#e0af68' },
  'critical': { text: 'Critical', color: '#f7768e' },
  'unknown': { text: 'Unknown', color: '#565f89' },
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

      {/* Burn Rate */}
      {burnRateData && burnRateData.ratePerHour5h !== null && (
        <div className="fuel-tooltip-row">
          <span className="fuel-tooltip-label">Burn Rate</span>
          <span className="fuel-tooltip-value">
            {burnRateData.ratePerHour5h.toFixed(1)}%/hr
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
          background: #16161e;
          border: 1px solid #292e42;
          border-radius: 8px;
          padding: 12px;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.5);
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
          font-size: 11px;
          color: #a9b1d6;
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
          font-size: 12px;
          font-weight: 700;
          color: #c0caf5;
          margin-bottom: 4px;
        }

        .fuel-tooltip-divider {
          height: 1px;
          background: #292e42;
          margin: 8px 0;
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
          color: #565f89;
        }

        .fuel-tooltip-value {
          color: #a9b1d6;
          font-weight: 600;
        }

        .fuel-tooltip-spacer {
          height: 6px;
        }

        .fuel-tooltip-stale-icon {
          color: #e0af68;
          font-weight: 700;
        }

        .fuel-tooltip-stale-warning {
          font-size: 10px;
          color: #e0af68;
          text-align: center;
          margin-top: 4px;
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
