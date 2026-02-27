/**
 * BudgetPanel — Redesigned to match Obsidian spec §6.9.
 *
 * Bottom-sheet / popover with horizontal progress bars, token counts,
 * burn rate, budget limit input, and alert threshold.
 * Color transitions: 0–60% accent, 60–80% warning, 80–100% error.
 *
 * Claude-specific — hidden when active session is non-Claude provider.
 * Preserves all existing props and quota logic.
 */

import { useEffect, useState } from 'react';
import { RefreshCw, X, Clock } from 'lucide-react';
import type { ProviderId } from '../../../shared/types/provider-types';

// ─── Re-exported types ────────────────────────────────────────────────────
import { ClaudeUsageQuota, BurnRateData, QuotaBucket } from '../../../shared/ipc-types';
export type { ClaudeUsageQuota, BurnRateData, QuotaBucket };

export interface BudgetPanelProps {
  isOpen: boolean;
  onClose: () => void;
  quota: ClaudeUsageQuota | null;
  burnRate: BurnRateData | null;
  isLoading?: boolean;
  onRefresh?: () => void;
  activeSessionProviderId?: ProviderId;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function gaugeColor(pct: number): string {
  if (pct >= 80) return 'var(--semantic-error)';
  if (pct >= 60) return 'var(--semantic-warning)';
  return 'var(--accent-primary)';
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

// ─── Horizontal gauge bar ──────────────────────────────────────────────────

function GaugeBar({ pct, label, sublabel }: { pct: number; label: string; sublabel?: string }) {
  const color = gaugeColor(pct);
  const [animated, setAnimated] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setAnimated(pct), 80);
    return () => clearTimeout(t);
  }, [pct]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-secondary)',
            fontFamily: 'var(--font-ui)',
            fontWeight: 'var(--weight-medium)',
          }}
        >
          {label}
        </span>
        <span
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono-ui)',
            color,
            fontWeight: 'var(--weight-semibold)',
          }}
        >
          {pct}%
        </span>
      </div>
      <div
        style={{
          height: 6,
          background: 'var(--surface-float)',
          borderRadius: 'var(--radius-full)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${animated}%`,
            background: color,
            borderRadius: 'var(--radius-full)',
            transition: 'width 0.6s var(--ease-out)',
            boxShadow: pct >= 80 ? `0 0 8px ${color}60` : 'none',
          }}
        />
      </div>
      {sublabel && (
        <span
          style={{
            fontSize: 'var(--text-2xs)',
            fontFamily: 'var(--font-mono-ui)',
            color: 'var(--text-tertiary)',
          }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
}

// ─── Section divider ───────────────────────────────────────────────────────

function Divider() {
  return <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />;
}

// ─── Main component ────────────────────────────────────────────────────────

export function BudgetPanel({
  isOpen,
  onClose,
  quota,
  burnRate,
  isLoading,
  onRefresh,
  activeSessionProviderId,
}: BudgetPanelProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [budgetLimit, setBudgetLimit] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('80');

  // Claude-only feature
  if (activeSessionProviderId && activeSessionProviderId !== 'claude') return null;

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => setIsVisible(true), 10);
      return () => clearTimeout(t);
    } else {
      setIsVisible(false);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); handleClose(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen]);

  const handleClose = () => {
    setIsVisible(false);
    setTimeout(onClose, 200);
  };

  if (!isOpen) return null;

  const fiveHourPct = quota ? Math.min(100, Math.round(quota.five_hour.utilization * 100)) : 0;
  const sevenDayPct = quota ? Math.min(100, Math.round(quota.seven_day.utilization * 100)) : 0;
  const burnRateLabel = burnRate
    ? `${burnRate.ratePerHour5h !== null ? burnRate.ratePerHour5h.toFixed(1) : '—'}%/hr`
    : null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={handleClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: isVisible ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0)',
          zIndex: 'var(--z-overlay)' as any,
          transition: 'background var(--duration-normal) var(--ease-out)',
          cursor: 'pointer',
        }}
      />

      {/* Bottom sheet */}
      <div
        style={{
          position: 'fixed',
          bottom: 0,
          left: '50%',
          transform: isVisible
            ? 'translateX(-50%) translateY(0)'
            : 'translateX(-50%) translateY(100%)',
          width: 'min(480px, 96vw)',
          background: 'var(--surface-overlay)',
          borderRadius: 'var(--radius-lg) var(--radius-lg) 0 0',
          borderTop: '1px solid var(--border-default)',
          borderLeft: '1px solid var(--border-default)',
          borderRight: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-xl)',
          zIndex: 'var(--z-modal)' as any,
          transition: 'transform var(--duration-normal) var(--ease-out)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px var(--space-4)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <span
            style={{
              fontSize: 'var(--text-md)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Budget & Usage
          </span>
          <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
            {onRefresh && (
              <button
                onClick={onRefresh}
                disabled={isLoading}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 28,
                  height: 28,
                  background: 'none',
                  border: '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-tertiary)',
                  cursor: 'pointer',
                  padding: 0,
                }}
              >
                <RefreshCw size={13} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            )}
            <button
              onClick={handleClose}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: 28,
                height: 28,
                background: 'none',
                border: 'none',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-tertiary)',
                cursor: 'pointer',
                padding: 0,
              }}
            >
              <X size={14} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>

          {/* No data */}
          {!quota && (
            <div
              style={{
                textAlign: 'center',
                padding: 'var(--space-6) 0',
                color: 'var(--text-tertiary)',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              {isLoading ? 'Loading...' : 'No quota data available'}
            </div>
          )}

          {/* Quota data */}
          {quota && (
            <>
              {/* Active session section */}
              <div
                style={{
                  padding: 'var(--space-3)',
                  background: 'var(--surface-float)',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-subtle)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-3)',
                }}
              >
                <span
                  style={{
                    fontSize: 'var(--text-xs)',
                    fontWeight: 'var(--weight-semibold)',
                    color: 'var(--text-tertiary)',
                    textTransform: 'uppercase',
                    letterSpacing: 'var(--tracking-wide)',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  Active session
                </span>
                <GaugeBar
                  pct={fiveHourPct}
                  label={`5-hour · ${Math.round(quota.five_hour.utilization * 100)} of 100%`}
                  sublabel={`Resets in ${getTimeUntilReset(quota.five_hour.resets_at)}`}
                />
                {burnRate && burnRate.ratePerHour5h !== null && (
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 'var(--space-2)',
                      fontSize: 'var(--text-xs)',
                      fontFamily: 'var(--font-mono-ui)',
                      color: 'var(--text-tertiary)',
                    }}
                  >
                    <Clock size={11} />
                    Burn rate: {burnRateLabel}
                  </div>
                )}
              </div>

              <GaugeBar
                pct={sevenDayPct}
                label="7-day limit"
                sublabel={`Resets in ${getTimeUntilReset(quota.seven_day.resets_at)}`}
              />

              <Divider />

              {/* Budget settings */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    Budget limit
                  </span>
                  <input
                    type="text"
                    value={budgetLimit}
                    onChange={(e) => setBudgetLimit(e.target.value)}
                    placeholder="e.g. 8000 tokens"
                    style={{
                      width: 130,
                      padding: '4px 8px',
                      background: 'var(--surface-float)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-mono-ui)',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                  />
                  <button
                    style={{
                      padding: '4px 10px',
                      background: 'var(--surface-float)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-ui)',
                      cursor: 'pointer',
                    }}
                  >
                    Save
                  </button>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
                  <span
                    style={{
                      flex: 1,
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-secondary)',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    Alert at
                  </span>
                  <input
                    type="text"
                    value={alertThreshold}
                    onChange={(e) => setAlertThreshold(e.target.value)}
                    style={{
                      width: 60,
                      padding: '4px 8px',
                      background: 'var(--surface-float)',
                      border: '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-primary)',
                      fontSize: 'var(--text-sm)',
                      fontFamily: 'var(--font-mono-ui)',
                      textAlign: 'right',
                      outline: 'none',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'var(--border-accent)'; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                  />
                  <span
                    style={{
                      fontSize: 'var(--text-sm)',
                      color: 'var(--text-tertiary)',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    % of limit
                  </span>
                </div>
              </div>

              {/* Footer */}
              <div
                style={{
                  fontSize: 'var(--text-2xs)',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono-ui)',
                  textAlign: 'center',
                  paddingTop: 4,
                }}
              >
                Quota estimates from Claude API responses · {new Date(quota.lastUpdated).toLocaleTimeString()}
              </div>
            </>
          )}
        </div>
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}

export default BudgetPanel;
