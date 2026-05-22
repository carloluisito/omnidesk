/**
 * BudgetPanel — Redesigned to match Obsidian spec §6.9.
 *
 * Inline fixed panel (PanelShell) with burn-rate chart, daily/weekly
 * period toggle, and settings section.
 * Color transitions: 0–60% accent, 60–80% warning, 80–100% error.
 *
 * Claude-specific — hidden when active session is non-Claude provider.
 */

import React, { useEffect, useState } from 'react';
import { RefreshCw, X, Clock, BarChart2 } from 'lucide-react';
import type { ProviderId } from '../../../shared/types/provider-types';
import { PanelShell, PanelSection, PanelEmpty } from './index';

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
  return 'var(--v2-accent)';
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
            color: 'var(--v2-text-secondary)',
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
          background: 'var(--v2-surface-low)',
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
            color: 'var(--v2-text-tertiary)',
          }}
        >
          {sublabel}
        </span>
      )}
    </div>
  );
}

function v2BudgetIconBtn(): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, background: 'none',
    border: '1px solid var(--v2-border-default)',
    borderRadius: 4, color: 'var(--v2-text-tertiary)',
    cursor: 'pointer', padding: 0,
  };
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
  const [budgetLimit, setBudgetLimit] = useState('');
  const [alertThreshold, setAlertThreshold] = useState('80');
  const [periodToggle, setPeriodToggle] = useState<'daily' | 'weekly'>('daily');

  // Claude-only feature — must come after all hooks
  if (activeSessionProviderId && activeSessionProviderId !== 'claude') return null;
  if (!isOpen) return null;

  const fiveHourPct = quota ? Math.min(100, Math.round(quota.five_hour.utilization * 100)) : 0;
  const sevenDayPct = quota ? Math.min(100, Math.round(quota.seven_day.utilization * 100)) : 0;
  const burnRateLabel = burnRate
    ? `${burnRate.ratePerHour5h !== null ? burnRate.ratePerHour5h.toFixed(1) : '—'}%/hr`
    : null;

  return (
    <div style={{
      position: 'fixed', bottom: 0, right: 0, width: 320,
      height: 'calc(100vh - var(--title-bar-height, 36px) - var(--tab-bar-height, 38px))',
      zIndex: 'var(--z-panel, 200)' as unknown as number,
      display: 'flex', flexDirection: 'column',
    }}>
      <PanelShell
        icon={<BarChart2 size={13} />}
        title="Budget & Usage"
        actions={
          <div style={{ display: 'flex', gap: 4 }}>
            {onRefresh && (
              <button onClick={onRefresh} disabled={isLoading} style={v2BudgetIconBtn()}>
                <RefreshCw size={11} style={{ animation: isLoading ? 'spin 1s linear infinite' : 'none' }} />
              </button>
            )}
            <button onClick={onClose} style={v2BudgetIconBtn()}>
              <X size={11} />
            </button>
          </div>
        }
      >
        {!quota ? (
          <PanelEmpty
            icon={<BarChart2 size={26} />}
            title="No quota data"
            body={isLoading ? 'Loading usage data…' : 'No quota information available for this session.'}
          />
        ) : (
          <div style={{ padding: '12px 12px 0' }}>
            {/* Period toggle */}
            <div style={{ display: 'flex', gap: 4, marginBottom: 16 }}>
              {(['daily', 'weekly'] as const).map((period) => (
                <button
                  key={period}
                  onClick={() => setPeriodToggle(period)}
                  style={{
                    flex: 1, padding: '4px 0',
                    background: periodToggle === period ? 'var(--v2-accent)' : 'var(--v2-surface-mid)',
                    color: periodToggle === period ? '#0A0B11' : 'var(--v2-text-secondary)',
                    border: 'none', borderRadius: 'var(--radius-md, 6px)',
                    fontSize: 'var(--text-xs, 11px)', fontWeight: periodToggle === period ? 600 : 400,
                    cursor: 'pointer', textTransform: 'capitalize',
                  }}
                >
                  {period}
                </button>
              ))}
            </div>

            {/* Gauge for selected period */}
            <PanelSection title={periodToggle === 'daily' ? '5-hour window' : '7-day limit'} defaultOpen>
              <GaugeBar
                pct={periodToggle === 'daily' ? fiveHourPct : sevenDayPct}
                label={periodToggle === 'daily' ? `5-hour · ${fiveHourPct}%` : `7-day · ${sevenDayPct}%`}
                sublabel={`Resets in ${getTimeUntilReset(periodToggle === 'daily' ? quota.five_hour.resets_at : quota.seven_day.resets_at)}`}
              />
              {burnRateLabel && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 8, fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--v2-text-tertiary)' }}>
                  <Clock size={10} /> Burn rate: {burnRateLabel}
                </div>
              )}
            </PanelSection>

            {/* Budget settings */}
            <PanelSection title="Settings" defaultOpen={false}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1, fontSize: 'var(--text-xs, 11px)', color: 'var(--v2-text-secondary)' }}>Budget limit</span>
                <input
                  type="text" value={budgetLimit} onChange={(e) => setBudgetLimit(e.target.value)}
                  placeholder="e.g. 8000 tokens"
                  style={{ width: 110, padding: '3px 6px', background: 'var(--v2-surface-mid)', border: '1px solid var(--v2-border-default)', borderRadius: 4, color: 'var(--v2-text-primary)', fontSize: 11, outline: 'none' }}
                />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <span style={{ flex: 1, fontSize: 'var(--text-xs, 11px)', color: 'var(--v2-text-secondary)' }}>Alert at</span>
                <input
                  type="text" value={alertThreshold} onChange={(e) => setAlertThreshold(e.target.value)}
                  style={{ width: 48, padding: '3px 6px', background: 'var(--v2-surface-mid)', border: '1px solid var(--v2-border-default)', borderRadius: 4, color: 'var(--v2-text-primary)', fontSize: 11, textAlign: 'right', outline: 'none' }}
                />
                <span style={{ fontSize: 10, color: 'var(--v2-text-tertiary)' }}>%</span>
              </div>
            </PanelSection>
          </div>
        )}
      </PanelShell>
      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}

export default BudgetPanel;
