import { memo, useMemo, useCallback, useEffect } from 'react';
import { Brain, Loader2, Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';
import { useTerminalStore } from '../../store/terminalStore';

interface ContextGaugeProps {
  className?: string;
}

function getGaugeColor(percent: number): string {
  if (percent >= 85) return 'bg-red-500';
  if (percent >= 70) return 'bg-orange-500';
  if (percent >= 50) return 'bg-yellow-500';
  return 'bg-emerald-500';
}

function getTextColor(percent: number): string {
  if (percent >= 85) return 'text-red-400';
  if (percent >= 70) return 'text-orange-400';
  if (percent >= 50) return 'text-yellow-400';
  return 'text-emerald-400';
}

export const ContextGauge = memo(function ContextGauge({ className }: ContextGaugeProps) {
  const { sessions, activeSessionId, fetchContextState } = useTerminalStore();

  const session = useMemo(
    () => sessions.find((s) => s.id === activeSessionId),
    [sessions, activeSessionId]
  );

  // Fetch context state on mount and when session changes
  useEffect(() => {
    if (activeSessionId && session && (session.messages?.length || 0) > 0) {
      fetchContextState(activeSessionId);
    }
  }, [activeSessionId, fetchContextState, session?.messages?.length]);

  const contextState = session?.contextState;

  const handleSummarize = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      await api('POST', `/terminal/sessions/${activeSessionId}/context/summarize`);
    } catch (error) {
      console.error('[ContextGauge] Failed to trigger summarization:', error);
    }
  }, [activeSessionId]);

  // Don't render if no session or no messages yet
  if (!session || !contextState) {
    return null;
  }

  const pct = contextState.contextUtilizationPercent;
  const status = contextState.summarizationStatus;
  const showSummarizeBtn = pct >= 70 && status === 'none';
  const isInProgress = status === 'in_progress';
  const isCompleted = status === 'completed';

  const tooltipText = [
    `Context: ${pct}%`,
    `Est. tokens: ${contextState.estimatedPromptTokens.toLocaleString()}`,
    `Messages: ${contextState.totalMessageCount} (${contextState.verbatimMessageCount} verbatim)`,
    contextState.summaryCount > 0 ? `Summaries: ${contextState.summaryCount}` : null,
    `Window: ${(contextState.modelContextWindow / 1000).toFixed(0)}K`,
  ].filter(Boolean).join(' | ');

  return (
    <div
      className={cn('flex items-center gap-1.5', className)}
      title={tooltipText}
    >
      <Brain className="h-3 w-3 text-zinc-500 shrink-0" />

      {/* Progress bar */}
      <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', getGaugeColor(pct))}
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>

      {/* Percentage */}
      <span className={cn('text-[10px] font-medium tabular-nums', getTextColor(pct))}>
        {pct}%
      </span>

      {/* Summarize button */}
      {showSummarizeBtn && (
        <button
          onClick={handleSummarize}
          className="text-[10px] text-white/40 hover:text-white/70 px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 transition-colors"
        >
          Summarize
        </button>
      )}

      {/* In-progress spinner */}
      {isInProgress && (
        <Loader2 className="h-3 w-3 text-blue-400 animate-spin" />
      )}

      {/* Completed checkmark (brief display) */}
      {isCompleted && (
        <Check className="h-3 w-3 text-emerald-400" />
      )}
    </div>
  );
});

export default ContextGauge;
