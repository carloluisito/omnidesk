import { memo, useState, useEffect, useCallback, useRef } from 'react';
import { RefreshCw, Gauge, TrendingUp, TrendingDown, Minus, Shield } from 'lucide-react';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { useTerminalStore } from '../../store/terminalStore';
import { useTerminalUIStore } from '../../store/terminalUIStore';

interface ClaudeQuotaBucket {
  utilization: number;
  resets_at: string;
}

interface ClaudeUsageQuota {
  five_hour: ClaudeQuotaBucket;
  seven_day: ClaudeQuotaBucket;
  lastUpdated: string;
}

interface BurnRateData {
  ratePerHour5h: number | null;
  ratePerHour7d: number | null;
  trend: 'increasing' | 'stable' | 'decreasing' | 'unknown';
  projectedTimeToLimit5h: number | null;
  projectedTimeToLimit7d: number | null;
  label: 'on-track' | 'elevated' | 'critical' | 'unknown';
  dataPoints: number;
}

interface AllocatorConfig {
  enabled: boolean;
  defaults: {
    reservePercentWeekly: number;
    warnThresholds: [number, number, number];
  };
}

interface WalletGaugeProps {
  className?: string;
}

function getSegmentColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500';
  if (pct >= 80) return 'bg-orange-500';
  if (pct >= 70) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function getTextColor(pct: number): string {
  if (pct >= 90) return 'text-red-400';
  if (pct >= 80) return 'text-orange-400';
  if (pct >= 70) return 'text-yellow-400';
  return 'text-emerald-400';
}

function getTimeUntilReset(resetsAt: string): string {
  const now = new Date();
  const resetTime = new Date(resetsAt);
  const diffMs = resetTime.getTime() - now.getTime();
  if (diffMs <= 0) return 'now';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function TrendIcon({ trend }: { trend: BurnRateData['trend'] }) {
  if (trend === 'increasing') return <TrendingUp className="h-3 w-3 text-red-400" />;
  if (trend === 'decreasing') return <TrendingDown className="h-3 w-3 text-emerald-400" />;
  if (trend === 'stable') return <Minus className="h-3 w-3 text-zinc-400" />;
  return null;
}

function SegmentedBar({ pct, segments = 5 }: { pct: number; segments?: number }) {
  const filled = Math.round((pct / 100) * segments);
  return (
    <div className="flex gap-0.5" role="meter" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100}>
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={cn(
            'h-2 w-2.5 rounded-[2px] transition-colors',
            i < filled ? getSegmentColor(pct) : 'bg-zinc-700'
          )}
        />
      ))}
    </div>
  );
}

export const WalletGauge = memo(function WalletGauge({ className }: WalletGaugeProps) {
  const { sessions, activeSessionId } = useTerminalStore();
  const { openOverlay } = useTerminalUIStore();
  const [quota, setQuota] = useState<ClaudeUsageQuota | null>(null);
  const [burnRate, setBurnRate] = useState<BurnRateData | null>(null);
  const [config, setConfig] = useState<AllocatorConfig | null>(null);
  const [loading, setLoading] = useState(false);

  const session = sessions.find((s) => s.id === activeSessionId);

  const hasFetched = useRef(false);

  const fetchData = useCallback(async (forceRefresh = false) => {
    try {
      setLoading(true);
      const refreshParam = forceRefresh ? '?refresh=true' : '';
      // Fetch quota first (most important), then batch the rest
      const quotaResult = await api<ClaudeUsageQuota | null>('GET', `/terminal/usage/quota${refreshParam}`);
      setQuota(quotaResult);

      // Fetch secondary data with a slight delay to avoid rate limiting
      const [burnRateResult, configResult] = await Promise.all([
        api<BurnRateData>('GET', '/terminal/usage/burn-rate').catch(() => null),
        api<AllocatorConfig>('GET', '/terminal/usage/budget-config').catch(() => null),
      ]);
      if (burnRateResult) setBurnRate(burnRateResult);
      if (configResult) setConfig(configResult);

      // Record a utilization sample for history tracking
      api('POST', '/terminal/usage/sample').catch(() => {});
    } catch (error) {
      console.error('[WalletGauge] Error fetching data:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hasFetched.current) {
      hasFetched.current = true;
      fetchData();
    }
  }, [fetchData]);

  // Refetch when active session changes (but not the initial load)
  const prevSessionId = useRef(activeSessionId);
  useEffect(() => {
    if (prevSessionId.current !== activeSessionId) {
      prevSessionId.current = activeSessionId;
      fetchData();
    }
  }, [activeSessionId, fetchData]);

  // Poll every 2 minutes for utilization sampling (reduced from 60s to avoid rate limiting)
  useEffect(() => {
    const interval = setInterval(() => {
      fetchData();
    }, 120000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (!session) return null;

  const fiveHourPct = quota ? Math.round(quota.five_hour.utilization * 100) : 0;
  const sevenDayPct = quota ? Math.round(quota.seven_day.utilization * 100) : 0;
  const hasReserve = config?.enabled && config.defaults.reservePercentWeekly > 0;
  const isCritical = fiveHourPct >= 90 || sevenDayPct >= 90;

  return (
      <button
        onClick={() => openOverlay('usage-dashboard')}
        className={cn(
          'flex items-center gap-3 px-4 py-2.5 bg-zinc-900/50 border-b border-zinc-800 w-full text-left',
          'hover:bg-zinc-800/50 transition-colors cursor-pointer',
          isCritical && 'animate-pulse',
          className
        )}
        title="Click to view budget dashboard"
        aria-label={`Budget gauge: 5-hour ${fiveHourPct}%, 7-day ${sevenDayPct}%`}
      >
        {quota ? (
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <Gauge className="h-3.5 w-3.5 text-zinc-500 shrink-0" />
            <span className="text-xs text-zinc-500 shrink-0">Budget</span>

            {/* 5h gauge */}
            <div className="flex items-center gap-1.5 shrink-0" title={`5h quota resets in ${getTimeUntilReset(quota.five_hour.resets_at)}`}>
              <SegmentedBar pct={fiveHourPct} />
              <span className={cn('text-xs font-medium', getTextColor(fiveHourPct))}>
                {fiveHourPct}%
              </span>
            </div>

            {/* 7d gauge */}
            <div className="flex items-center gap-1.5 shrink-0" title={`7d quota resets in ${getTimeUntilReset(quota.seven_day.resets_at)}`}>
              <SegmentedBar pct={sevenDayPct} />
              <span className={cn('text-xs font-medium', getTextColor(sevenDayPct))}>
                {sevenDayPct}%
              </span>
            </div>

            {/* Reset times - hidden on small screens */}
            <div className="hidden sm:flex items-center gap-2 text-[10px] text-zinc-600">
              <span>5h ({getTimeUntilReset(quota.five_hour.resets_at)})</span>
              <span>7d ({getTimeUntilReset(quota.seven_day.resets_at)})</span>
            </div>

            {/* Burn rate */}
            {burnRate && burnRate.ratePerHour5h !== null && (
              <div className="flex items-center gap-1 shrink-0" title={`Burn rate: ${burnRate.ratePerHour5h}%/hr`}>
                <TrendIcon trend={burnRate.trend} />
                <span className="text-[10px] text-zinc-500">
                  {burnRate.ratePerHour5h}%/h
                </span>
              </div>
            )}

            {/* Reserve badge */}
            {hasReserve && (
              <div className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-purple-500/10 shrink-0" title="Reserve budget active">
                <Shield className="h-2.5 w-2.5 text-purple-400" />
                <span className="text-[9px] text-purple-400 font-medium">Reserve</span>
              </div>
            )}

            {/* Loading indicator */}
            {loading && (
              <RefreshCw className="h-3 w-3 text-zinc-500 animate-spin ml-auto shrink-0" />
            )}
          </div>
        ) : (
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <Gauge className="h-3.5 w-3.5" />
            <span>{loading ? 'Loading quota...' : 'Quota unavailable'}</span>
          </div>
        )}
      </button>
  );
});

export default WalletGauge;
