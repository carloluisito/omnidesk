import { useState, useEffect } from 'react';
import { AlertTriangle, Trash2, Settings, Play } from 'lucide-react';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';

interface QueuedMessage {
  id: string;
  content: string;
  mode?: string;
}

interface QueueEstimate {
  totalEstimatedPercent5h: number;
  totalEstimatedPercent7d: number;
  current5h: number;
  projected5h: number;
  current7d: number;
  projected7d: number;
  wouldExceedAt?: number;
}

interface CostEstimate {
  estimatedPercent5h: number;
}

interface AllocatorConfig {
  enabled: boolean;
  defaults: {
    sessionCapPercent5h: number;
  };
  queue: {
    showProjectedCost: boolean;
  };
}

interface QueueBudgetPanelProps {
  queuedMessages: QueuedMessage[];
  onRemoveMessage: (id: string) => void;
  onClearQueue: () => void;
  onProcessUpToLimit?: () => void;
  onOpenSettings?: () => void;
  className?: string;
}

function truncate(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  return text.slice(0, maxLen) + '...';
}

export function QueueBudgetPanel({
  queuedMessages,
  onRemoveMessage,
  onClearQueue,
  onProcessUpToLimit,
  onOpenSettings,
  className,
}: QueueBudgetPanelProps) {
  const [queueEstimate, setQueueEstimate] = useState<QueueEstimate | null>(null);
  const [perMessageCost, setPerMessageCost] = useState<number>(0);
  const [config, setConfig] = useState<AllocatorConfig | null>(null);

  useEffect(() => {
    if (queuedMessages.length === 0) {
      setQueueEstimate(null);
      return;
    }

    const fetchEstimates = async () => {
      try {
        const [queueResult, costResult, configResult] = await Promise.all([
          api<QueueEstimate>('POST', '/terminal/usage/estimate-queue', { messageCount: queuedMessages.length }),
          api<CostEstimate>('POST', '/terminal/usage/estimate', {}),
          api<AllocatorConfig>('GET', '/terminal/usage/budget-config').catch(() => null),
        ]);
        setQueueEstimate(queueResult);
        setPerMessageCost(costResult?.estimatedPercent5h ?? 0);
        if (configResult) setConfig(configResult);
      } catch {
        // Silent fail
      }
    };

    fetchEstimates();
  }, [queuedMessages.length]);

  if (queuedMessages.length === 0) return null;

  const wouldExceed = queueEstimate?.wouldExceedAt !== undefined;
  const cap = config?.defaults.sessionCapPercent5h ?? 100;
  const showCost = config?.queue.showProjectedCost !== false;

  return (
    <div className={cn('rounded-xl border border-zinc-700 bg-zinc-900/80 overflow-hidden', className)}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-zinc-200">Message Queue ({queuedMessages.length})</span>
        </div>
        {showCost && queueEstimate && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-zinc-500">Projected:</span>
            <span className={cn(
              'font-medium',
              wouldExceed ? 'text-red-400' : queueEstimate.projected5h >= 70 ? 'text-orange-400' : 'text-zinc-300'
            )}>
              {queueEstimate.totalEstimatedPercent5h.toFixed(1)}%
            </span>
            <span className="text-zinc-600">
              ({queueEstimate.current5h}% → {queueEstimate.projected5h}%)
            </span>
            {wouldExceed && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertTriangle className="h-3 w-3" />
                Would exceed {cap}% cap
              </span>
            )}
          </div>
        )}
      </div>

      {/* Progress bar */}
      {showCost && queueEstimate && (
        <div className="px-4 py-2 bg-zinc-800/30">
          <div className="relative h-2 bg-zinc-700 rounded-full overflow-visible">
            {/* Current */}
            <div
              className="absolute inset-y-0 left-0 rounded-l-full bg-emerald-500/60"
              style={{ width: `${Math.min(queueEstimate.current5h, 100)}%` }}
            />
            {/* Projected addition */}
            <div
              className={cn(
                'absolute inset-y-0 rounded-r-full',
                wouldExceed ? 'bg-red-500/40' : 'bg-blue-500/40'
              )}
              style={{
                left: `${Math.min(queueEstimate.current5h, 100)}%`,
                width: `${Math.min(queueEstimate.totalEstimatedPercent5h, 100 - queueEstimate.current5h)}%`,
              }}
            />
            {/* Cap marker */}
            {config?.enabled && (
              <div
                className="absolute top-0 h-full w-0.5 bg-red-400/60"
                style={{ left: `${cap}%` }}
              />
            )}
          </div>
        </div>
      )}

      {/* Message list */}
      <div className="max-h-48 overflow-y-auto divide-y divide-zinc-800/50">
        {queuedMessages.map((msg, index) => {
          const isOverrun = queueEstimate?.wouldExceedAt !== undefined && index >= queueEstimate.wouldExceedAt;
          const estimatedCost = perMessageCost;

          return (
            <div
              key={msg.id}
              className={cn(
                'flex items-center gap-3 px-4 py-2 text-xs',
                isOverrun && 'bg-red-500/5'
              )}
            >
              <span className="text-zinc-600 shrink-0 w-4 text-right">{index + 1}</span>
              <span className="text-zinc-300 flex-1 truncate">
                {truncate(msg.content, 40)}
              </span>
              {showCost && (
                <span className={cn('shrink-0', isOverrun ? 'text-red-400' : 'text-zinc-500')}>
                  ~{estimatedCost.toFixed(1)}%
                  {isOverrun && <AlertTriangle className="h-3 w-3 inline ml-1" />}
                </span>
              )}
              <button
                onClick={() => onRemoveMessage(msg.id)}
                className="p-1 rounded hover:bg-white/5 text-zinc-600 hover:text-red-400 shrink-0"
                title="Remove from queue"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </div>
          );
        })}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-t border-zinc-800 bg-zinc-800/30">
        <button
          onClick={onClearQueue}
          className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
        >
          Clear Queue
        </button>
        {onOpenSettings && (
          <button
            onClick={onOpenSettings}
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-400 transition-colors"
          >
            <Settings className="h-3 w-3 inline mr-1" />
            Adjust Budget
          </button>
        )}
        {wouldExceed && onProcessUpToLimit && (
          <button
            onClick={onProcessUpToLimit}
            className="ml-auto px-2.5 py-1.5 text-xs font-medium rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors"
          >
            <Play className="h-3 w-3 inline mr-1" />
            Process Up To Limit
          </button>
        )}
      </div>
    </div>
  );
}

export default QueueBudgetPanel;
