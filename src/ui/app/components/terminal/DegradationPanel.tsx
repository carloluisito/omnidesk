import { X, Check, Settings, Zap } from 'lucide-react';
import { cn } from '../../lib/cn';
import { motion, AnimatePresence } from 'framer-motion';

interface DegradationStep {
  type: string;
  model?: string;
}

interface DegradationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  activeDegradations: DegradationStep[];
  currentUsagePct: number;
  targetThreshold: number;
  onTurnOff?: () => void;
  onAdjustLimits?: () => void;
}

const ALL_STEP_LABELS: Record<string, string> = {
  'require-confirmation': 'Require confirmation before sending',
  'switch-model': 'Switch to cheaper model',
  'require-plan-mode': 'Require Plan Mode',
  'pause-queue': 'Pause message queue',
  'suggest-split': 'Suggest session split',
  'block-new-sessions': 'Block new sessions',
};

export function DegradationPanel({
  isOpen,
  onClose,
  activeDegradations,
  currentUsagePct,
  targetThreshold,
  onTurnOff,
  onAdjustLimits,
}: DegradationPanelProps) {
  if (!isOpen) return null;

  const activeTypes = new Set(activeDegradations.map(d => d.type));

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-sm rounded-2xl border border-zinc-700 bg-zinc-900 shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
          aria-label="Active budget restrictions"
        >
          {/* Header */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700 bg-zinc-800/50">
            <Zap className="h-4 w-4 text-yellow-400" />
            <h3 className="text-sm font-semibold text-zinc-100">Active Restrictions</h3>
            <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-white/5 text-zinc-400">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Steps list */}
            <div className="space-y-2">
              {Object.entries(ALL_STEP_LABELS).map(([type, label]) => {
                const isActive = activeTypes.has(type);
                return (
                  <div
                    key={type}
                    className={cn(
                      'flex items-center gap-2 px-3 py-2 rounded-lg text-xs',
                      isActive
                        ? 'bg-yellow-500/10 ring-1 ring-yellow-500/20 text-yellow-300'
                        : 'bg-zinc-800/50 text-zinc-600'
                    )}
                  >
                    {isActive ? (
                      <Check className="h-3.5 w-3.5 text-yellow-400 shrink-0" />
                    ) : (
                      <div className="h-3.5 w-3.5 rounded-full border border-zinc-600 shrink-0" />
                    )}
                    <span>{label}</span>
                  </div>
                );
              })}
            </div>

            {/* Usage bar */}
            <div>
              <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                <span>Current usage</span>
                <span>{currentUsagePct.toFixed(1)}%</span>
              </div>
              <div className="relative h-2 bg-zinc-700 rounded-full overflow-visible">
                <div
                  className={cn(
                    'h-full rounded-full',
                    currentUsagePct >= 90 ? 'bg-red-500' : currentUsagePct >= 70 ? 'bg-orange-500' : 'bg-emerald-500'
                  )}
                  style={{ width: `${Math.min(currentUsagePct, 100)}%` }}
                />
                {/* Target threshold marker */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-yellow-400/60"
                  style={{ left: `${targetThreshold}%` }}
                  title={`Target: ${targetThreshold}%`}
                />
              </div>
              <div className="text-[10px] text-zinc-600 mt-1">
                Restrictions activate above {targetThreshold}%
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2">
              {onTurnOff && (
                <button
                  onClick={() => { onTurnOff(); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 ring-1 ring-red-500/20 transition-colors"
                >
                  Turn Off Budget Saver
                </button>
              )}
              {onAdjustLimits && (
                <button
                  onClick={() => { onAdjustLimits(); onClose(); }}
                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                >
                  <Settings className="h-3 w-3" />
                  Adjust Limits
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default DegradationPanel;
