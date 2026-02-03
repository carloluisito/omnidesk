import { useState, useEffect } from 'react';
import { Zap, ChevronRight, X, Check } from 'lucide-react';
import { cn } from '../../lib/cn';
import { motion, AnimatePresence } from 'framer-motion';

interface DegradationStep {
  type: string;
  model?: string;
}

interface DegradationBannerProps {
  activeDegradations: DegradationStep[];
  currentUsagePct: number;
  onViewDetails: () => void;
  onDismiss?: () => void;
  className?: string;
}

function getDegradationStyle(step: DegradationStep): { bg: string; text: string; icon: string } {
  switch (step.type) {
    case 'switch-model':
      return { bg: 'bg-yellow-500/10 ring-yellow-500/20', text: 'text-yellow-300', icon: 'text-yellow-400' };
    case 'require-plan-mode':
      return { bg: 'bg-blue-500/10 ring-blue-500/20', text: 'text-blue-300', icon: 'text-blue-400' };
    case 'require-confirmation':
      return { bg: 'bg-amber-500/10 ring-amber-500/20', text: 'text-amber-300', icon: 'text-amber-400' };
    case 'pause-queue':
      return { bg: 'bg-red-500/10 ring-red-500/20', text: 'text-red-300', icon: 'text-red-400' };
    case 'block-new-sessions':
      return { bg: 'bg-red-500/10 ring-red-500/20', text: 'text-red-300', icon: 'text-red-400' };
    default:
      return { bg: 'bg-zinc-500/10 ring-zinc-500/20', text: 'text-zinc-300', icon: 'text-zinc-400' };
  }
}

function getDegradationLabel(step: DegradationStep): string {
  switch (step.type) {
    case 'switch-model':
      return `Switched to ${step.model?.includes('haiku') ? 'Haiku' : step.model || 'smaller model'} to conserve quota`;
    case 'require-plan-mode':
      return 'Plan Mode required before direct execution';
    case 'require-confirmation':
      return 'Confirmation required before sending';
    case 'pause-queue':
      return 'Message queue paused — budget limit approaching';
    case 'suggest-split':
      return 'Consider starting a new session to reduce costs';
    case 'block-new-sessions':
      return 'New sessions blocked until quota recovers';
    default:
      return `Budget restriction active: ${step.type}`;
  }
}

export function DegradationBanner({
  activeDegradations,
  currentUsagePct,
  onViewDetails,
  onDismiss,
  className,
}: DegradationBannerProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isLifted, setIsLifted] = useState(false);

  // Cycle through multiple degradations every 3s
  useEffect(() => {
    if (activeDegradations.length <= 1) return;
    const interval = setInterval(() => {
      setCurrentIndex(i => (i + 1) % activeDegradations.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [activeDegradations.length]);

  // Show "Restrictions Lifted" briefly when degradations clear
  useEffect(() => {
    if (activeDegradations.length === 0 && !isLifted) {
      setIsLifted(true);
      const timer = setTimeout(() => setIsLifted(false), 5000);
      return () => clearTimeout(timer);
    }
    if (activeDegradations.length > 0) {
      setIsLifted(false);
    }
  }, [activeDegradations.length]);

  if (activeDegradations.length === 0 && !isLifted) return null;

  // Show lifted state
  if (isLifted) {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={cn(
            'mx-4 mt-2 rounded-xl px-4 py-2.5 flex items-center gap-2 ring-1',
            'bg-emerald-500/10 ring-emerald-500/20 text-emerald-300',
            className
          )}
          role="status"
          aria-live="polite"
        >
          <Check className="h-4 w-4 text-emerald-400" />
          <span className="text-xs font-medium">Restrictions Lifted</span>
        </motion.div>
      </AnimatePresence>
    );
  }

  const current = activeDegradations[currentIndex] || activeDegradations[0];
  if (!current) return null;

  const style = getDegradationStyle(current);
  const label = getDegradationLabel(current);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={`${current.type}-${currentIndex}`}
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={cn(
          'mx-4 mt-2 rounded-xl px-4 py-2.5 flex items-center gap-2 ring-1',
          style.bg,
          className
        )}
        role="status"
        aria-live="polite"
      >
        <Zap className={cn('h-4 w-4 shrink-0', style.icon)} aria-hidden="true" />
        <span className={cn('text-xs flex-1', style.text)}>
          <span className="font-medium">Budget Saver Active:</span> {label} ({currentUsagePct.toFixed(0)}% of 5h)
        </span>

        {activeDegradations.length > 1 && (
          <span className="text-[10px] text-zinc-500 shrink-0">
            {currentIndex + 1}/{activeDegradations.length}
          </span>
        )}

        <button
          onClick={onViewDetails}
          className={cn('text-xs font-medium px-2 py-0.5 rounded-md transition-colors shrink-0', style.text, 'hover:bg-white/5')}
        >
          View <ChevronRight className="h-3 w-3 inline" />
        </button>

        {onDismiss && (
          <button
            onClick={onDismiss}
            className="p-1 rounded hover:bg-white/5 text-zinc-500 shrink-0"
            aria-label="Dismiss"
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

export default DegradationBanner;
