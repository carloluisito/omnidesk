import { useState } from 'react';
import { X, AlertTriangle, Shield, Clock, Settings, Zap } from 'lucide-react';
import { cn } from '../../lib/cn';
import { motion, AnimatePresence } from 'framer-motion';

interface BudgetCheck {
  allowed: boolean;
  reason?: string;
  enforcement: 'none' | 'soft' | 'hard';
  thresholdHit?: number;
  activeDegradations?: Array<{ type: string; model?: string }>;
}

interface BudgetLimitModalProps {
  isOpen: boolean;
  onClose: () => void;
  budgetCheck: BudgetCheck;
  currentUsage: { fiveHour: number; sevenDay: number };
  projectedUsage?: { fiveHour: number; sevenDay: number };
  resetTime5h?: string;
  resetTime7d?: string;
  onSendAnyway?: () => void;
  onSwitchModel?: (model: string) => void;
  onEditMessage?: () => void;
  onOpenSettings?: () => void;
}

function getTimeUntilReset(resetsAt?: string): string {
  if (!resetsAt) return 'unknown';
  const now = new Date();
  const resetTime = new Date(resetsAt);
  const diffMs = resetTime.getTime() - now.getTime();
  if (diffMs <= 0) return 'now';
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  if (hours > 0) return `${hours}h ${minutes}m`;
  return `${minutes}m`;
}

function ProgressBarWithThreshold({ current, projected, threshold }: {
  current: number;
  projected?: number;
  threshold?: number;
}) {
  return (
    <div className="relative h-3 bg-zinc-700 rounded-full overflow-visible">
      {/* Current usage */}
      <div
        className={cn(
          'absolute inset-y-0 left-0 rounded-full transition-all',
          current >= 90 ? 'bg-red-500' : current >= 70 ? 'bg-orange-500' : 'bg-emerald-500'
        )}
        style={{ width: `${Math.min(current, 100)}%` }}
      />
      {/* Projected usage (overlay) */}
      {projected && projected > current && (
        <div
          className="absolute inset-y-0 rounded-r-full bg-white/10"
          style={{ left: `${Math.min(current, 100)}%`, width: `${Math.min(projected - current, 100 - current)}%` }}
        />
      )}
      {/* Threshold marker */}
      {threshold && (
        <div
          className="absolute top-0 h-full w-0.5 bg-red-400"
          style={{ left: `${threshold}%` }}
          title={`Threshold: ${threshold}%`}
        />
      )}
    </div>
  );
}

export function BudgetLimitModal({
  isOpen,
  onClose,
  budgetCheck,
  currentUsage,
  projectedUsage,
  resetTime5h,
  resetTime7d,
  onSendAnyway,
  onSwitchModel,
  onEditMessage,
  onOpenSettings,
}: BudgetLimitModalProps) {
  const [selectedAction, setSelectedAction] = useState<string>(
    budgetCheck.enforcement === 'hard' ? '' : 'send-anyway'
  );

  if (!isOpen) return null;

  const isHard = budgetCheck.enforcement === 'hard';
  const isSoft = budgetCheck.enforcement === 'soft';
  const resetSoon = resetTime5h && new Date(resetTime5h).getTime() - Date.now() < 5 * 60 * 1000;

  const handleAction = () => {
    switch (selectedAction) {
      case 'send-anyway':
        onSendAnyway?.();
        onClose();
        break;
      case 'switch-model':
        onSwitchModel?.('claude-3-5-haiku-20241022');
        onClose();
        break;
      case 'edit':
        onEditMessage?.();
        onClose();
        break;
      default:
        onClose();
    }
  };

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
          className={cn(
            'w-full max-w-md rounded-2xl border shadow-2xl overflow-hidden',
            isHard
              ? 'border-red-500/30 bg-zinc-900'
              : 'border-amber-500/30 bg-zinc-900'
          )}
          onClick={(e) => e.stopPropagation()}
          role="alertdialog"
          aria-modal="true"
          aria-label={isHard ? 'Budget hard limit reached' : 'Budget soft limit warning'}
        >
          {/* Header */}
          <div className={cn(
            'flex items-center gap-3 px-4 py-3 border-b',
            isHard ? 'border-red-500/20 bg-red-500/5' : 'border-amber-500/20 bg-amber-500/5'
          )}>
            <AlertTriangle className={cn('h-5 w-5', isHard ? 'text-red-400' : 'text-amber-400')} />
            <h2 className={cn('text-sm font-semibold', isHard ? 'text-red-300' : 'text-amber-300')}>
              {isHard ? 'Budget Hard Limit Reached' : 'Budget Soft Limit Warning'}
            </h2>
            <button onClick={onClose} className="ml-auto p-1 rounded hover:bg-white/5 text-zinc-400">
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Content */}
          <div className="p-4 space-y-4">
            {/* Reason */}
            <p className="text-sm text-zinc-300">{budgetCheck.reason}</p>

            {/* Progress bars */}
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                  <span>5-Hour Quota</span>
                  <span>{currentUsage.fiveHour.toFixed(1)}%{projectedUsage ? ` → ${projectedUsage.fiveHour.toFixed(1)}%` : ''}</span>
                </div>
                <ProgressBarWithThreshold
                  current={currentUsage.fiveHour}
                  projected={projectedUsage?.fiveHour}
                  threshold={budgetCheck.thresholdHit}
                />
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-zinc-400 mb-1">
                  <span>Weekly Quota</span>
                  <span>{currentUsage.sevenDay.toFixed(1)}%</span>
                </div>
                <ProgressBarWithThreshold
                  current={currentUsage.sevenDay}
                  projected={projectedUsage?.sevenDay}
                />
              </div>
            </div>

            {isHard ? (
              /* Hard limit: show recovery actions */
              <div className="space-y-2">
                <p className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Recovery Actions</p>
                {resetSoon && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 text-xs">
                    <Clock className="h-4 w-4" />
                    <span>Resetting in {getTimeUntilReset(resetTime5h)} — consider waiting</span>
                  </div>
                )}
                <ul className="space-y-1.5 text-xs text-zinc-400">
                  <li className="flex items-center gap-2"><Settings className="h-3 w-3" /> Increase your budget limit in settings</li>
                  <li className="flex items-center gap-2"><Clock className="h-3 w-3" /> Wait for quota reset ({getTimeUntilReset(resetTime5h)})</li>
                  <li className="flex items-center gap-2"><Zap className="h-3 w-3" /> Switch to a smaller model (Haiku)</li>
                  <li className="flex items-center gap-2"><Shield className="h-3 w-3" /> Start a new session to reduce context</li>
                </ul>
                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={onOpenSettings}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    Budget Settings
                  </button>
                  <button
                    onClick={() => { onSwitchModel?.('claude-3-5-haiku-20241022'); onClose(); }}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 transition-colors"
                  >
                    Switch Model
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* Soft limit: show override options */
              <div className="space-y-3">
                <div className="space-y-2">
                  {[
                    { id: 'send-anyway', label: 'Send anyway', desc: 'Continue with current model and settings' },
                    { id: 'switch-model', label: 'Switch to Haiku', desc: 'Use smaller model to conserve quota (~5-15x cheaper)' },
                    { id: 'edit', label: 'Edit message', desc: 'Go back and modify your message' },
                    { id: 'wait', label: 'Wait for reset', desc: `Quota resets in ${getTimeUntilReset(resetTime5h)}` },
                  ].map(opt => (
                    <label
                      key={opt.id}
                      className={cn(
                        'flex items-start gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors ring-1',
                        selectedAction === opt.id
                          ? 'bg-amber-500/10 ring-amber-500/30'
                          : 'bg-zinc-800/50 ring-zinc-700 hover:ring-zinc-600'
                      )}
                    >
                      <input
                        type="radio"
                        name="budget-action"
                        value={opt.id}
                        checked={selectedAction === opt.id}
                        onChange={() => setSelectedAction(opt.id)}
                        className="mt-0.5 accent-amber-500"
                      />
                      <div>
                        <span className="text-sm text-zinc-200">{opt.label}</span>
                        <p className="text-xs text-zinc-500">{opt.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleAction}
                    disabled={!selectedAction}
                    className={cn(
                      'flex-1 px-3 py-2 text-xs font-medium rounded-lg transition-colors',
                      selectedAction
                        ? 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300'
                        : 'bg-zinc-800 text-zinc-600 cursor-not-allowed'
                    )}
                  >
                    Confirm
                  </button>
                  <button
                    onClick={onClose}
                    className="px-3 py-2 text-xs font-medium rounded-lg bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

export default BudgetLimitModal;
