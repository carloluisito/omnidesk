import { useState, useEffect, useCallback, useRef } from 'react';
import { X, Gauge, RefreshCw, Timer, Clock, TrendingUp, TrendingDown, Minus, Settings, Download, Lightbulb } from 'lucide-react';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';

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

interface UtilizationSample {
  timestamp: string;
  fiveHour: number;
  sevenDay: number;
}

interface AllocatorConfig {
  enabled: boolean;
  defaults: {
    sessionCapPercent5h: number;
    workspaceCapPercentWeekly: number;
    warnThresholds: [number, number, number];
  };
}

interface BudgetDashboardProps {
  isOpen: boolean;
  onClose: () => void;
  quota?: ClaudeUsageQuota | null;
  burnRate?: BurnRateData | null;
  onRefresh?: () => void;
}

function getQuotaStatus(utilization: number) {
  const pct = utilization * 100;
  if (pct >= 90) return { text: 'text-red-400', bg: 'bg-red-500/20', bar: 'bg-red-500', badgeBg: 'bg-red-500/20', badgeText: 'text-red-400', label: 'Near Limit' };
  if (pct >= 70) return { text: 'text-orange-400', bg: 'bg-orange-500/20', bar: 'bg-orange-500', badgeBg: 'bg-orange-500/20', badgeText: 'text-orange-400', label: 'High Usage' };
  if (pct >= 50) return { text: 'text-yellow-400', bg: 'bg-yellow-500/20', bar: 'bg-yellow-500', badgeBg: 'bg-yellow-500/20', badgeText: 'text-yellow-400', label: 'Moderate' };
  return { text: 'text-emerald-400', bg: 'bg-emerald-500/20', bar: 'bg-emerald-500', badgeBg: 'bg-emerald-500/20', badgeText: 'text-emerald-400', label: 'Normal' };
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

function getAbsoluteResetTime(resetsAt: string): string {
  return new Date(resetsAt).toLocaleString(undefined, {
    weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

function BurnRateLabel({ label }: { label: BurnRateData['label'] }) {
  const styles = {
    'on-track': 'bg-emerald-500/20 text-emerald-400',
    'elevated': 'bg-yellow-500/20 text-yellow-400',
    'critical': 'bg-red-500/20 text-red-400',
    'unknown': 'bg-zinc-500/20 text-zinc-400',
  };
  const labels = { 'on-track': 'On Track', 'elevated': 'Elevated', 'critical': 'Critical', 'unknown': 'Calculating...' };
  return (
    <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', styles[label])}>
      {labels[label]}
    </span>
  );
}

function TrendIcon({ trend }: { trend: BurnRateData['trend'] }) {
  if (trend === 'increasing') return <TrendingUp className="h-4 w-4 text-red-400" />;
  if (trend === 'decreasing') return <TrendingDown className="h-4 w-4 text-emerald-400" />;
  if (trend === 'stable') return <Minus className="h-4 w-4 text-zinc-400" />;
  return null;
}

function UsageHistoryChart({ history, config }: { history: UtilizationSample[]; config?: AllocatorConfig | null }) {
  if (history.length < 2) {
    return (
      <div className="text-center py-6 text-zinc-500 text-sm">
        No usage history yet. Data will appear after your first message.
      </div>
    );
  }

  // Simple SVG chart (no external dependency needed for basic visualization)
  const width = 480;
  const height = 120;
  const padding = { top: 10, right: 10, bottom: 20, left: 35 };
  const chartW = width - padding.left - padding.right;
  const chartH = height - padding.top - padding.bottom;

  const times = history.map(s => new Date(s.timestamp).getTime());
  const minTime = Math.min(...times);
  const maxTime = Math.max(...times);
  const timeRange = maxTime - minTime || 1;

  const toX = (t: number) => padding.left + ((t - minTime) / timeRange) * chartW;
  const toY = (pct: number) => padding.top + chartH - (pct / 100) * chartH;

  const path5h = history.map((s, i) => `${i === 0 ? 'M' : 'L'} ${toX(times[i])} ${toY(s.fiveHour)}`).join(' ');
  const path7d = history.map((s, i) => `${i === 0 ? 'M' : 'L'} ${toX(times[i])} ${toY(s.sevenDay)}`).join(' ');

  const softThreshold = config?.defaults.warnThresholds[0] ?? 70;
  const hardThreshold = config?.defaults.warnThresholds[2] ?? 95;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
      {/* Grid lines */}
      {[0, 25, 50, 75, 100].map(pct => (
        <g key={pct}>
          <line x1={padding.left} y1={toY(pct)} x2={width - padding.right} y2={toY(pct)} stroke="rgb(63 63 70)" strokeWidth={0.5} />
          <text x={padding.left - 4} y={toY(pct) + 3} textAnchor="end" className="fill-zinc-500" fontSize={8}>{pct}%</text>
        </g>
      ))}

      {/* Threshold lines */}
      <line x1={padding.left} y1={toY(softThreshold)} x2={width - padding.right} y2={toY(softThreshold)}
        stroke="rgb(234 179 8)" strokeWidth={1} strokeDasharray="4 2" opacity={0.5} />
      <line x1={padding.left} y1={toY(hardThreshold)} x2={width - padding.right} y2={toY(hardThreshold)}
        stroke="rgb(239 68 68)" strokeWidth={1} strokeDasharray="4 2" opacity={0.5} />

      {/* Data lines */}
      <path d={path5h} fill="none" stroke="rgb(168 85 247)" strokeWidth={1.5} />
      <path d={path7d} fill="none" stroke="rgb(59 130 246)" strokeWidth={1.5} />

      {/* Legend */}
      <circle cx={padding.left + 5} cy={height - 6} r={3} fill="rgb(168 85 247)" />
      <text x={padding.left + 12} y={height - 3} className="fill-zinc-400" fontSize={8}>5h</text>
      <circle cx={padding.left + 35} cy={height - 6} r={3} fill="rgb(59 130 246)" />
      <text x={padding.left + 42} y={height - 3} className="fill-zinc-400" fontSize={8}>7d</text>
    </svg>
  );
}

function Recommendations({ quota, burnRate }: { quota?: ClaudeUsageQuota | null; burnRate?: BurnRateData | null }) {
  const suggestions: string[] = [];

  if (quota) {
    const pct5h = quota.five_hour.utilization * 100;
    const pct7d = quota.seven_day.utilization * 100;

    if (pct5h >= 80) suggestions.push('Consider switching to Haiku for routine tasks to conserve quota.');
    if (pct5h >= 60) suggestions.push('Start a new session to reset context and reduce input token costs.');
    if (pct7d >= 70) suggestions.push('Plan your remaining weekly usage carefully — weekly limit is getting high.');
    if (burnRate?.label === 'critical') suggestions.push('Burn rate is critical. Pause and let the 5-hour window roll forward.');
    if (burnRate?.label === 'elevated') suggestions.push('Usage rate is elevated. Consider using Plan Mode for deliberate, cheaper interactions.');
  }

  if (suggestions.length === 0) {
    suggestions.push('Usage is healthy. Continue working normally.');
  }

  return (
    <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800/50">
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="h-4 w-4 text-blue-500" />
        <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300">Recommendations</h3>
      </div>
      <ul className="space-y-1.5">
        {suggestions.map((s, i) => (
          <li key={i} className="text-xs text-blue-800 dark:text-blue-200/80 flex items-start gap-1.5">
            <span className="text-blue-500 mt-0.5 shrink-0">-</span>
            <span>{s}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function BudgetDashboard({ isOpen, onClose, quota, burnRate, onRefresh }: BudgetDashboardProps) {
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<UtilizationSample[]>([]);
  const [config, setConfig] = useState<AllocatorConfig | null>(null);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      onRefreshRef.current?.();
      const [historyResult, configResult] = await Promise.all([
        api<UtilizationSample[]>('GET', '/terminal/usage/history').catch(() => []),
        api<AllocatorConfig>('GET', '/terminal/usage/budget-config').catch(() => null),
      ]);
      setHistory(historyResult || []);
      if (configResult) setConfig(configResult);
    } finally {
      setLoading(false);
    }
  }, []);

  const prevOpen = useRef(false);
  useEffect(() => {
    if (isOpen && !prevOpen.current) {
      fetchData();
    }
    prevOpen.current = isOpen;
  }, [isOpen, fetchData]);

  // Handle keyboard shortcuts
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const fiveHourStatus = quota ? getQuotaStatus(quota.five_hour.utilization) : null;
  const sevenDayStatus = quota ? getQuotaStatus(quota.seven_day.utilization) : null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="w-full max-w-xl rounded-2xl border border-zinc-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Budget Dashboard"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-200 dark:border-zinc-700 px-4 py-3 shrink-0">
          <div className="flex items-center gap-2">
            <Gauge className="h-5 w-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Budget Dashboard</h2>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={fetchData} disabled={loading}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500 disabled:opacity-50" title="Refresh">
              <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
            </button>
            <button onClick={onClose}
              className="p-2 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-500">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {quota ? (
            <>
              {/* Quota Cards */}
              {[
                { label: '5-Hour Limit', bucket: quota.five_hour, status: fiveHourStatus! },
                { label: 'Weekly Limit', bucket: quota.seven_day, status: sevenDayStatus! },
              ].map(({ label, bucket, status }) => (
                <div key={label} className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{label}</span>
                    <div className="flex items-center gap-2">
                      <span className={cn('px-2 py-0.5 text-xs font-medium rounded-full', status.badgeBg, status.badgeText)}>
                        {status.label}
                      </span>
                      <span className={cn('text-2xl font-bold', status.text)}>
                        {(bucket.utilization * 100).toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  {/* Progress bar with threshold markers */}
                  <div className="relative">
                    <div className="h-3 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden mb-3"
                      role="meter" aria-label={`${label} usage`}
                      aria-valuenow={Math.round(bucket.utilization * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div className={cn('h-full rounded-full transition-all', status.bar)}
                        style={{ width: `${Math.min(bucket.utilization * 100, 100)}%` }} />
                    </div>
                    {/* Threshold markers */}
                    {config?.enabled && config.defaults.warnThresholds.map((t, i) => (
                      <div key={i} className="absolute top-0 h-3" style={{ left: `${t}%` }}>
                        <div className={cn('w-px h-full', i === 2 ? 'bg-red-400/60' : 'bg-yellow-400/40')} />
                      </div>
                    ))}
                  </div>
                  <div className="flex items-center justify-between text-sm text-zinc-500">
                    <div className="flex items-center gap-1.5">
                      <Timer className="h-4 w-4" />
                      <span>Resets in {getTimeUntilReset(bucket.resets_at)}</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="h-4 w-4" />
                      <span>{getAbsoluteResetTime(bucket.resets_at)}</span>
                    </div>
                  </div>
                </div>
              ))}

              {/* Burn Rate Panel */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Burn Rate</span>
                  {burnRate && <BurnRateLabel label={burnRate.label} />}
                </div>
                {burnRate && burnRate.ratePerHour5h !== null ? (
                  <div className="grid grid-cols-3 gap-3">
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-1 mb-1">
                        <TrendIcon trend={burnRate.trend} />
                        <span className="text-lg font-bold text-zinc-100">{burnRate.ratePerHour5h}%/h</span>
                      </div>
                      <span className="text-xs text-zinc-500">Current Rate</span>
                    </div>
                    <div className="text-center">
                      <span className="text-lg font-bold text-zinc-100">
                        {burnRate.projectedTimeToLimit5h !== null
                          ? burnRate.projectedTimeToLimit5h > 60
                            ? `${Math.floor(burnRate.projectedTimeToLimit5h / 60)}h ${burnRate.projectedTimeToLimit5h % 60}m`
                            : `${burnRate.projectedTimeToLimit5h}m`
                          : '--'}
                      </span>
                      <div className="text-xs text-zinc-500">To 5h Limit</div>
                    </div>
                    <div className="text-center">
                      <span className="text-lg font-bold text-zinc-100">
                        {burnRate.projectedTimeToLimit7d !== null
                          ? burnRate.projectedTimeToLimit7d > 1440
                            ? `${Math.floor(burnRate.projectedTimeToLimit7d / 1440)}d`
                            : burnRate.projectedTimeToLimit7d > 60
                              ? `${Math.floor(burnRate.projectedTimeToLimit7d / 60)}h`
                              : `${burnRate.projectedTimeToLimit7d}m`
                          : '--'}
                      </span>
                      <div className="text-xs text-zinc-500">To 7d Limit</div>
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-zinc-500 text-center py-2">
                    Calculating... Need at least 2 data points.
                  </div>
                )}
              </div>

              {/* Usage History Chart */}
              <div className="p-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/50 border border-zinc-200 dark:border-zinc-700">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-zinc-600 dark:text-zinc-400">Usage History</span>
                  <span className="text-xs text-zinc-500">{history.length} samples</span>
                </div>
                <UsageHistoryChart history={history} config={config} />
              </div>

              {/* Recommendations */}
              <Recommendations quota={quota} burnRate={burnRate} />

              {/* Last Updated */}
              <div className="text-center text-xs text-zinc-500">
                Last updated: {new Date(quota.lastUpdated).toLocaleTimeString()}
              </div>

              {/* Actions */}
              <div className="flex items-center justify-center gap-3">
                <button onClick={onClose}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors">
                  Close
                </button>
                <button onClick={fetchData}
                  className="px-3 py-1.5 text-xs font-medium rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors">
                  <RefreshCw className="h-3 w-3 inline mr-1" />
                  Refresh
                </button>
              </div>
            </>
          ) : (
            <div className="text-center py-8 text-zinc-500">
              <Gauge className="h-12 w-12 mx-auto mb-3 opacity-30" />
              <p className="text-sm">Quota data unavailable</p>
              <p className="text-xs mt-1">OAuth token may not be accessible</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default BudgetDashboard;
