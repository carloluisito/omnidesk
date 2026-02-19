/**
 * BudgetPanel - Neon Fuel Cell Usage Display (Redesigned)
 *
 * A slide-in panel showing Claude API quota usage with
 * improved readability and clear visual hierarchy.
 */

import { useEffect, useState } from 'react';
import {
  RefreshCw,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  Gauge,
  Zap,
  AlertTriangle,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// Re-export types from shared for convenience
import { ClaudeUsageQuota, BurnRateData, QuotaBucket } from '../../../shared/ipc-types';
export type { ClaudeUsageQuota, BurnRateData, QuotaBucket };

export interface BudgetPanelProps {
  isOpen: boolean;
  onClose: () => void;
  quota: ClaudeUsageQuota | null;
  burnRate: BurnRateData | null;
  isLoading?: boolean;
  onRefresh?: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════════

function getQuotaStatus(utilization: number) {
  const pct = utilization * 100;
  if (pct >= 90) return { color: '#f7768e', label: 'CRITICAL', glow: 'rgba(247, 118, 142, 0.5)' };
  if (pct >= 70) return { color: '#e0af68', label: 'HIGH', glow: 'rgba(224, 175, 104, 0.5)' };
  if (pct >= 50) return { color: '#bb9af7', label: 'MODERATE', glow: 'rgba(187, 154, 247, 0.5)' };
  return { color: '#9ece6a', label: 'NOMINAL', glow: 'rgba(158, 206, 106, 0.5)' };
}

function getTimeUntilReset(resetsAt: string): string {
  const now = new Date();
  const resetTime = new Date(resetsAt);
  const diffMs = resetTime.getTime() - now.getTime();
  if (diffMs <= 0) return 'now';
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function formatProjectedTime(minutes: number | null): string {
  if (minutes === null) return '—';
  if (minutes < 60) return `${Math.round(minutes)}m`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUB-COMPONENTS
// ═══════════════════════════════════════════════════════════════════════════════

function QuotaCard({
  label,
  utilization,
  resets_at,
}: {
  label: string;
  utilization: number;
  resets_at: string;
}) {
  const percentage = Math.min(Math.round(utilization * 100), 100);
  const status = getQuotaStatus(utilization);
  const timeUntil = getTimeUntilReset(resets_at);
  const [animatedLevel, setAnimatedLevel] = useState(0);

  // Animate fill on mount/change
  useEffect(() => {
    const timer = setTimeout(() => setAnimatedLevel(Math.min(utilization, 1)), 100);
    return () => clearTimeout(timer);
  }, [utilization]);

  return (
    <div className="quota-card">
      {/* Header row: Label and Status Badge */}
      <div className="quota-header">
        <span className="quota-label">{label}</span>
        <span
          className="status-badge"
          style={{
            background: `${status.color}15`,
            color: status.color,
            borderColor: status.color,
            boxShadow: `0 0 12px ${status.glow}`,
            textShadow: `0 0 8px ${status.glow}`,
          }}
        >
          {status.label}
        </span>
      </div>

      {/* Simplified Liquid Gauge */}
      <div className="liquid-gauge">
        {/* Background grid lines */}
        <div className="gauge-grid">
          {[25, 50, 75].map(mark => (
            <div key={mark} className="grid-line" style={{ bottom: `${mark}%` }} />
          ))}
        </div>

        {/* Liquid fill - simplified, no wobble */}
        <div
          className="gauge-fill"
          style={{
            height: `${animatedLevel * 100}%`,
            background: `linear-gradient(180deg,
              ${status.color}dd 0%,
              ${status.color}99 40%,
              ${status.color}66 100%)`,
            boxShadow: `
              0 0 20px ${status.glow},
              inset 0 0 30px ${status.glow}
            `,
          }}
        />

        {/* Glass reflection (subtle) */}
        <div className="gauge-reflection" />
      </div>

      {/* Stats row: Large percentage and reset time */}
      <div className="quota-stats">
        <div className="percentage-display">
          <span
            className="percentage-value"
            style={{
              color: status.color,
              textShadow: `0 0 20px ${status.glow}, 0 0 40px ${status.glow}`,
            }}
          >
            {percentage}
          </span>
          <span className="percentage-unit">%</span>
        </div>
        <div className="reset-time">
          <Clock size={16} />
          <span>Resets in {timeUntil}</span>
        </div>
      </div>
    </div>
  );
}

function BurnRateCard({ burnRate }: { burnRate: BurnRateData }) {
  const TrendIcon =
    burnRate.trend === 'increasing'
      ? TrendingUp
      : burnRate.trend === 'decreasing'
        ? TrendingDown
        : Minus;

  const trendColors: Record<string, { color: string; glow: string }> = {
    increasing: { color: '#f7768e', glow: 'rgba(247, 118, 142, 0.5)' },
    decreasing: { color: '#9ece6a', glow: 'rgba(158, 206, 106, 0.5)' },
    stable: { color: '#7aa2f7', glow: 'rgba(122, 162, 247, 0.5)' },
    unknown: { color: '#565f89', glow: 'rgba(86, 95, 137, 0.3)' },
  };

  const labelColors: Record<string, { bg: string; color: string; glow: string }> = {
    'on-track': { bg: 'rgba(158, 206, 106, 0.15)', color: '#9ece6a', glow: 'rgba(158, 206, 106, 0.5)' },
    elevated: { bg: 'rgba(224, 175, 104, 0.15)', color: '#e0af68', glow: 'rgba(224, 175, 104, 0.5)' },
    critical: { bg: 'rgba(247, 118, 142, 0.15)', color: '#f7768e', glow: 'rgba(247, 118, 142, 0.5)' },
    unknown: { bg: 'rgba(86, 95, 137, 0.15)', color: '#565f89', glow: 'rgba(86, 95, 137, 0.3)' },
  };

  const trend = trendColors[burnRate.trend];
  const labelStyle = labelColors[burnRate.label] || labelColors.unknown;

  return (
    <div className="burn-rate-card">
      {/* Header */}
      <div className="burn-header">
        <div className="burn-title">
          <Zap size={16} style={{ color: '#7aa2f7' }} />
          <span>BURN RATE</span>
        </div>
        <span
          className="burn-badge"
          style={{
            background: labelStyle.bg,
            color: labelStyle.color,
            borderColor: labelStyle.color,
            boxShadow: `0 0 12px ${labelStyle.glow}`,
            textShadow: `0 0 8px ${labelStyle.glow}`,
          }}
        >
          {burnRate.label === 'on-track' ? 'ON TRACK' : burnRate.label.toUpperCase()}
        </span>
      </div>

      {/* Large Trend Indicator */}
      <div className="burn-trend">
        <TrendIcon
          size={32}
          strokeWidth={2.5}
          style={{
            color: trend.color,
            filter: `drop-shadow(0 0 12px ${trend.glow})`,
          }}
        />
        <span
          className="trend-label"
          style={{
            color: trend.color,
            textShadow: `0 0 8px ${trend.glow}`,
          }}
        >
          {burnRate.trend.charAt(0).toUpperCase() + burnRate.trend.slice(1)}
        </span>
      </div>

      {/* Per-Quota Burn Rates */}
      <div className="burn-projections">
        <div className="projection-item">
          <span className="projection-label">5H RATE</span>
          <span className="projection-value">
            {burnRate.ratePerHour5h !== null ? `${burnRate.ratePerHour5h.toFixed(1)}%/hr` : '—'}
          </span>
        </div>
        <div className="projection-divider" />
        <div className="projection-item">
          <span className="projection-label">7D RATE</span>
          <span className="projection-value">
            {burnRate.ratePerHour7d !== null ? `${burnRate.ratePerHour7d.toFixed(1)}%/hr` : '—'}
          </span>
        </div>
      </div>

      {/* Projections Grid */}
      <div className="burn-projections">
        <div className="projection-item">
          <span className="projection-label">5H LIMIT</span>
          <span className="projection-value">
            {formatProjectedTime(burnRate.projectedTimeToLimit5h)}
          </span>
        </div>
        <div className="projection-divider" />
        <div className="projection-item">
          <span className="projection-label">7D LIMIT</span>
          <span className="projection-value">
            {formatProjectedTime(burnRate.projectedTimeToLimit7d)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export function BudgetPanel({
  isOpen,
  onClose,
  quota,
  burnRate,
  isLoading,
  onRefresh,
}: BudgetPanelProps) {
  const [isAnimating, setIsAnimating] = useState(false);
  const [panelWidth, setPanelWidth] = useState(() => {
    const vw = window.innerWidth;
    if (vw <= 650) return '100vw';
    if (vw <= 750) return `${vw - 20}px`;
    if (vw <= 900) return `${Math.min(380, vw - 40)}px`;
    return `${Math.min(420, vw - 60)}px`;
  });

  // Responsive scaling factor for content - scale to fit window
  const [scaleFactor, setScaleFactor] = useState(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Estimate content height at full scale (~700px)
    const contentHeight = 700;
    const heightScale = Math.min(1.0, vh / contentHeight);

    // Width-based scale
    let widthScale = 1.0;
    if (vw <= 650) widthScale = 0.75;
    else if (vw <= 750) widthScale = 0.85;
    else if (vw <= 900) widthScale = 0.92;

    // Use the smaller of the two to ensure it fits
    return Math.min(heightScale, widthScale);
  });

  useEffect(() => {
    if (isOpen) {
      setIsAnimating(true);
    }
  }, [isOpen]);

  // Update panel width and scale on window resize
  useEffect(() => {
    const handleResize = () => {
      const vw = window.innerWidth;
      const vh = window.innerHeight;

      // Update width
      if (vw <= 650) {
        setPanelWidth('100vw');
      } else if (vw <= 750) {
        setPanelWidth(`${vw - 20}px`);
      } else if (vw <= 900) {
        setPanelWidth(`${Math.min(380, vw - 40)}px`);
      } else {
        setPanelWidth(`${Math.min(420, vw - 60)}px`);
      }

      // Calculate scale to fit both width and height
      const contentHeight = 700;
      const heightScale = Math.min(1.0, vh / contentHeight);

      let widthScale = 1.0;
      if (vw <= 650) widthScale = 0.75;
      else if (vw <= 750) widthScale = 0.85;
      else if (vw <= 900) widthScale = 0.92;

      setScaleFactor(Math.min(heightScale, widthScale));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'r' && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        onRefresh?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onRefresh]);

  const handleClose = () => {
    setIsAnimating(false);
    setTimeout(onClose, 200);
  };

  if (!isOpen) return null;

  const hasData = quota !== null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`budget-backdrop ${isAnimating ? 'visible' : ''}`}
        onClick={handleClose}
      />

      {/* Panel */}
      <div
        className={`budget-panel ${isAnimating ? 'visible' : ''}`}
        style={{
          width: panelWidth,
        }}
      >
        {/* Scanline overlay */}
        <div className="scanlines" />

        {/* Scale wrapper */}
        <div
          style={{
            transform: `scale(${scaleFactor})`,
            transformOrigin: 'top left',
            height: `${100 / scaleFactor}%`,
          }}
        >
          {/* Header */}
          <header className="budget-header">
          <div className="header-title">
            <Gauge size={18} style={{ color: '#7aa2f7' }} />
            <span>FUEL STATUS</span>
          </div>
          <div className="header-actions">
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                className={`refresh-btn ${isLoading ? 'spinning' : ''}`}
                title="Refresh (R)"
                aria-label="Refresh quota data"
              >
                <RefreshCw size={16} />
              </button>
            )}
            <button
              className="esc-btn"
              onClick={handleClose}
              aria-label="Close panel (Escape key)"
            >
              ESC
            </button>
          </div>
        </header>

        {/* Content */}
        <div className="budget-content">
          {!hasData ? (
            <div className="no-data">
              <AlertTriangle size={48} />
              <span className="no-data-title">No telemetry</span>
              <span className="no-data-sub">Quota data unavailable</span>
            </div>
          ) : (
            <>
              {/* Quota Cards - Stacked Vertically */}
              <QuotaCard
                label="5-HOUR RESERVE"
                utilization={quota.five_hour.utilization}
                resets_at={quota.five_hour.resets_at}
              />
              <QuotaCard
                label="7-DAY RESERVE"
                utilization={quota.seven_day.utilization}
                resets_at={quota.seven_day.resets_at}
              />

              {/* Burn Rate */}
              {burnRate && <BurnRateCard burnRate={burnRate} />}

              {/* Last Updated */}
              <div className="last-updated">
                Telemetry sync: {new Date(quota.lastUpdated).toLocaleTimeString(undefined, {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit',
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <footer className="budget-footer">
          <span>Quota estimates from Claude API responses</span>
        </footer>
        </div>
        {/* End scale wrapper */}
      </div>

      <style>{budgetPanelStyles}</style>
    </>
  );
}

const budgetPanelStyles = `
  /* ═══════════════════════════════════════════════════════════════════════════
     BACKDROP & PANEL
     ═══════════════════════════════════════════════════════════════════════════ */

  .budget-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0);
    z-index: 999;
    transition: background 0.2s ease;
    cursor: pointer;
  }

  .budget-backdrop.visible {
    background: rgba(0, 0, 0, 0.6);
    backdrop-filter: blur(3px);
  }

  .budget-panel {
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

  .budget-panel.visible {
    transform: translateX(0);
    opacity: 1;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     RESPONSIVE BREAKPOINTS (Desktop-focused: 600px+ viewport)
     ═══════════════════════════════════════════════════════════════════════════ */

  /* Medium desktop windows: Reduce padding slightly */
  @media (max-width: 900px) {
    .budget-panel {
      width: min(380px, calc(100vw - 40px));
    }

    .budget-content {
      padding: 16px;
      gap: 14px;
    }

    .quota-card,
    .burn-rate-card {
      padding: 14px;
    }
  }

  /* Small desktop windows: More compact layout */
  @media (max-width: 750px) {
    .budget-panel {
      width: calc(100vw - 20px);
    }

    .budget-header {
      height: 52px;
      padding: 0 16px;
    }

    .header-title span {
      font-size: 11px;
    }

    .budget-content {
      padding: 14px;
      gap: 12px;
    }

    .quota-card,
    .burn-rate-card {
      padding: 12px;
      border-radius: 10px;
    }

    .liquid-gauge {
      height: 90px;
    }

    .percentage-value {
      font-size: 42px;
    }

    .percentage-unit {
      font-size: 18px;
    }
  }

  /* Minimum desktop width (600px): Nearly full width */
  @media (max-width: 650px) {
    .budget-panel {
      width: 100vw;
    }

    .budget-header {
      height: 48px;
      padding: 0 14px;
    }

    .header-title span {
      font-size: 10px;
    }

    .header-title svg {
      width: 16px;
      height: 16px;
    }

    .refresh-btn {
      width: 38px;
      height: 38px;
    }

    .esc-btn {
      padding: 6px 10px;
      font-size: 9px;
    }

    .budget-content {
      padding: 12px;
      gap: 10px;
    }

    .quota-card,
    .burn-rate-card {
      padding: 10px;
      border-radius: 8px;
    }

    .liquid-gauge {
      height: 80px;
    }

    .percentage-value {
      font-size: 38px;
    }

    .percentage-unit {
      font-size: 16px;
    }

    .reset-time {
      font-size: 14px;
    }

    .burn-title span,
    .quota-label {
      font-size: 10px;
    }

    .budget-footer {
      padding: 12px;
    }

    .budget-footer span {
      font-size: 9px;
    }
  }


  /* Landscape Mobile Optimization */
  @media (max-height: 500px) and (orientation: landscape) {
    .budget-content {
      padding: 12px;
      gap: 10px;
    }

    .quota-card,
    .burn-rate-card {
      padding: 10px;
    }

    .liquid-gauge {
      height: 60px;
    }

    .budget-header {
      height: 44px;
    }

    .budget-footer {
      padding: 10px;
    }
  }

  /* Scanline effect */
  .scanlines {
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

  /* Reduced motion support */
  @media (prefers-reduced-motion: reduce) {
    .budget-panel,
    .gauge-fill,
    .refresh-btn.spinning {
      transition: none;
      animation: none;
    }
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     HEADER
     ═══════════════════════════════════════════════════════════════════════════ */

  .budget-header {
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
  }

  .header-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .header-title span {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #7aa2f7;
    text-shadow: 0 0 12px rgba(122, 162, 247, 0.5);
    font-family: 'JetBrains Mono', monospace;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .refresh-btn {
    width: 44px;
    height: 44px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 8px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .refresh-btn:hover:not(:disabled) {
    background: #1f2335;
    border-color: #7aa2f7;
    color: #7aa2f7;
  }

  .refresh-btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .refresh-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .refresh-btn.spinning svg {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .esc-btn {
    padding: 8px 14px;
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

  .esc-btn:hover {
    background: #1f2335;
    border-color: #7aa2f7;
    color: #7aa2f7;
  }

  .esc-btn:active {
    transform: scale(0.98);
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     CONTENT
     ═══════════════════════════════════════════════════════════════════════════ */

  .budget-content {
    flex: 1;
    overflow: hidden;
    padding: 18px 18px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }


  /* No data state */
  .no-data {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    color: #565f89;
    text-align: center;
    gap: 12px;
  }

  .no-data-title {
    font-size: 18px;
    font-weight: 600;
    color: #a9b1d6;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .no-data-sub {
    font-size: 14px;
    color: #565f89;
    font-family: system-ui, -apple-system, sans-serif;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     QUOTA CARD
     ═══════════════════════════════════════════════════════════════════════════ */

  .quota-card {
    background: #16161e;
    border: 1px solid #292e42;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .quota-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .quota-label {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.12em;
    color: #565f89;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
  }

  .status-badge {
    padding: 6px 12px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.08em;
    border-radius: 6px;
    border: 1px solid;
    font-family: 'JetBrains Mono', monospace;
  }

  /* Liquid Gauge - Simplified */
  .liquid-gauge {
    position: relative;
    height: 100px;
    background: linear-gradient(180deg, #0d0e14 0%, #13141b 100%);
    border: 1px solid #292e42;
    border-radius: 8px;
    overflow: hidden;
  }

  .gauge-grid {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 1;
  }

  .grid-line {
    position: absolute;
    left: 0;
    right: 0;
    height: 1px;
    background: rgba(41, 46, 66, 0.5);
  }

  .gauge-fill {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    transition: height 0.8s cubic-bezier(0.4, 0, 0.2, 1);
    border-radius: 0 0 6px 6px;
    z-index: 0;
  }

  .gauge-reflection {
    position: absolute;
    top: 6px;
    left: 6px;
    right: 60%;
    bottom: 6px;
    background: linear-gradient(
      135deg,
      rgba(255, 255, 255, 0.04) 0%,
      transparent 50%
    );
    border-radius: 6px;
    pointer-events: none;
    z-index: 2;
  }

  /* Stats row */
  .quota-stats {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
  }

  .percentage-display {
    display: flex;
    align-items: baseline;
    gap: 4px;
  }

  .percentage-value {
    font-size: 48px;
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    letter-spacing: -0.02em;
  }

  .percentage-unit {
    font-size: 20px;
    font-weight: 700;
    color: #565f89;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .reset-time {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 16px;
    font-weight: 500;
    color: #a9b1d6;
    font-family: system-ui, -apple-system, sans-serif;
  }

  .reset-time svg {
    color: #565f89;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     BURN RATE CARD
     ═══════════════════════════════════════════════════════════════════════════ */

  .burn-rate-card {
    background: linear-gradient(135deg, #16161e 0%, #1a1b26 100%);
    border: 1px solid #292e42;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .burn-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .burn-title {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .burn-title span {
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.15em;
    color: #565f89;
    font-family: 'JetBrains Mono', monospace;
  }

  .burn-badge {
    padding: 6px 12px;
    font-size: 14px;
    font-weight: 700;
    letter-spacing: 0.08em;
    border-radius: 6px;
    border: 1px solid;
    font-family: 'JetBrains Mono', monospace;
  }

  .burn-trend {
    display: flex;
    align-items: center;
    gap: 14px;
    padding: 8px 0;
  }

  .trend-label {
    font-size: 18px;
    font-weight: 600;
    font-family: system-ui, -apple-system, sans-serif;
    letter-spacing: -0.01em;
  }

  .burn-projections {
    display: flex;
    align-items: stretch;
    background: #0d0e14;
    border-radius: 8px;
    overflow: hidden;
  }

  .projection-item {
    flex: 1;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .projection-label {
    font-size: 12px;
    font-weight: 600;
    letter-spacing: 0.1em;
    color: #3b4261;
    text-transform: uppercase;
    font-family: 'JetBrains Mono', monospace;
  }

  .projection-value {
    font-size: 18px;
    font-weight: 700;
    color: #c0caf5;
    font-variant-numeric: tabular-nums;
    font-family: 'JetBrains Mono', monospace;
  }

  .projection-divider {
    width: 1px;
    background: #292e42;
  }

  /* ═══════════════════════════════════════════════════════════════════════════
     FOOTER
     ═══════════════════════════════════════════════════════════════════════════ */

  .last-updated {
    text-align: center;
    font-size: 10px;
    color: #3b4261;
    padding-top: 12px;
    border-top: 1px solid rgba(41, 46, 66, 0.5);
    font-family: 'JetBrains Mono', monospace;
  }

  .budget-footer {
    padding: 16px;
    border-top: 1px solid #292e42;
    background: rgba(22, 22, 30, 0.8);
  }

  .budget-footer span {
    font-size: 10px;
    color: #3b4261;
    display: block;
    text-align: center;
    font-family: 'JetBrains Mono', monospace;
  }
`;

export default BudgetPanel;
