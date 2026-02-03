import { useState, useEffect, useRef } from 'react';
import { Info } from 'lucide-react';
import { cn } from '../../lib/cn';
import { api } from '../../lib/api';

interface CostEstimate {
  estimatedPercent5h: number;
  projectedAfter5h: number;
  estimatedPercent7d: number;
  projectedAfter7d: number;
  confidence: 'low' | 'medium' | 'high';
  basis: string;
}

interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  enforcement: 'none' | 'soft' | 'hard';
  thresholdHit?: number;
}

interface PreSendCostIndicatorProps {
  messageText: string;
  sessionId?: string;
  currentQuota?: { fiveHour: number; sevenDay: number };
  onBudgetBlock?: (check: BudgetCheck) => void;
  className?: string;
}

function getImpactColor(estimatedPct: number): string {
  if (estimatedPct > 10) return 'text-orange-400';
  if (estimatedPct > 5) return 'text-yellow-400';
  return 'text-emerald-400';
}

function getImpactBg(estimatedPct: number): string {
  if (estimatedPct > 10) return 'bg-orange-500/10 ring-orange-500/20';
  if (estimatedPct > 5) return 'bg-yellow-500/10 ring-yellow-500/20';
  return 'bg-emerald-500/10 ring-emerald-500/20';
}

export function PreSendCostIndicator({
  messageText,
  sessionId,
  currentQuota,
  onBudgetBlock,
  className,
}: PreSendCostIndicatorProps) {
  const [estimate, setEstimate] = useState<CostEstimate | null>(null);
  const [budgetCheck, setBudgetCheck] = useState<BudgetCheck | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Only show for messages > 10 chars, with 500ms debounce
    if (!messageText || messageText.length <= 10) {
      setEstimate(null);
      setBudgetCheck(null);
      return;
    }

    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(async () => {
      try {
        const [estResult, checkResult] = await Promise.all([
          api<CostEstimate>('POST', '/terminal/usage/estimate', { sessionId }),
          currentQuota
            ? api<BudgetCheck>('POST', '/terminal/usage/check-budget', currentQuota)
            : Promise.resolve(null),
        ]);
        setEstimate(estResult);
        if (checkResult) {
          setBudgetCheck(checkResult);
          if (!checkResult.allowed) {
            onBudgetBlock?.(checkResult);
          }
        }
      } catch {
        // Silent fail — don't block user from sending
      }
    }, 500);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [messageText, sessionId, currentQuota, onBudgetBlock]);

  if (!estimate) return null;

  const isHardBlock = budgetCheck && !budgetCheck.allowed && budgetCheck.enforcement === 'hard';
  const isSoftWarn = budgetCheck && budgetCheck.enforcement === 'soft' && budgetCheck.thresholdHit;

  return (
    <div
      className={cn(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs ring-1 transition-all',
        isHardBlock
          ? 'bg-red-500/10 ring-red-500/30 text-red-300'
          : isSoftWarn
            ? 'bg-amber-500/10 ring-amber-500/20 text-amber-300'
            : getImpactBg(estimate.estimatedPercent5h),
        className
      )}
      role={isHardBlock ? 'alert' : 'status'}
      aria-live={isHardBlock ? 'assertive' : 'polite'}
    >
      {isHardBlock ? (
        <span className="text-red-400 font-medium">
          Budget hard limit exceeded. {budgetCheck.reason}
        </span>
      ) : (
        <>
          <span className={cn('font-medium', getImpactColor(estimate.estimatedPercent5h))}>
            Est. cost: ~{estimate.estimatedPercent5h}% of 5h quota
          </span>
          <span className="text-zinc-500">
            ({Math.round(estimate.projectedAfter5h - estimate.estimatedPercent5h)}% → {estimate.projectedAfter5h}%)
          </span>
          <div className="flex items-center gap-1 text-zinc-600" title={estimate.basis}>
            <Info className="h-3 w-3" />
            <span>{estimate.basis}</span>
          </div>
          {isSoftWarn && (
            <span className="ml-auto text-amber-400 font-medium">
              Threshold: {budgetCheck.thresholdHit}%
            </span>
          )}
        </>
      )}
    </div>
  );
}

export default PreSendCostIndicator;
