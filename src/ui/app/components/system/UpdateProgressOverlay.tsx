/**
 * UpdateProgressOverlay - Modal showing update stages with progress indicators
 *
 * Stages: stopping sessions -> installing -> restarting
 * Driven by WebSocket events from the backend.
 */

import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Check, AlertTriangle, Loader2, Square, Download, RotateCcw } from 'lucide-react';
import { useUpdateStore, type UpdateStage } from '../../store/updateStore';
import { cn } from '../../lib/cn';

interface StageConfig {
  id: UpdateStage;
  label: string;
  icon: typeof Square;
}

const stages: StageConfig[] = [
  { id: 'stopping-sessions', label: 'Stopping sessions', icon: Square },
  { id: 'installing', label: 'Installing update', icon: Download },
  { id: 'restarting', label: 'Restarting server', icon: RotateCcw },
];

function getStageIndex(stage: UpdateStage | null): number {
  if (!stage) return -1;
  return stages.findIndex((s) => s.id === stage);
}

function StageIndicator({ stage, currentStage, hasError }: {
  stage: StageConfig;
  currentStage: UpdateStage | null;
  hasError: boolean;
}) {
  const stageIdx = stages.indexOf(stage);
  const currentIdx = getStageIndex(currentStage);
  const isActive = stage.id === currentStage;
  const isComplete = currentIdx > stageIdx;
  const isError = hasError && isActive;

  return (
    <div className="flex items-center gap-3">
      <div
        className={cn(
          'flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors duration-300',
          isError && 'bg-red-500/15 ring-1 ring-red-500/30',
          isComplete && 'bg-emerald-500/15 ring-1 ring-emerald-500/30',
          isActive && !isError && 'bg-blue-500/15 ring-1 ring-blue-500/30',
          !isActive && !isComplete && !isError && 'bg-white/5 ring-1 ring-white/10'
        )}
      >
        {isError && <AlertTriangle className="h-3.5 w-3.5 text-red-400" />}
        {isComplete && <Check className="h-3.5 w-3.5 text-emerald-400" />}
        {isActive && !isError && (
          <Loader2 className="h-3.5 w-3.5 text-blue-400 animate-spin" />
        )}
        {!isActive && !isComplete && !isError && (
          <div className="h-1.5 w-1.5 rounded-full bg-white/20" />
        )}
      </div>

      <span
        className={cn(
          'text-sm transition-colors duration-300',
          isError && 'text-red-400',
          isComplete && 'text-emerald-400/70',
          isActive && !isError && 'text-white',
          !isActive && !isComplete && !isError && 'text-white/30'
        )}
      >
        {stage.label}
      </span>
    </div>
  );
}

export function UpdateProgressOverlay() {
  const prefersReduced = useReducedMotion();
  const {
    isUpdating,
    updateStage,
    updateDetail,
    updateError,
    updateSuccess,
    reset,
    triggerUpdate,
  } = useUpdateStore();

  const isVisible = isUpdating || updateError || updateSuccess;

  return (
    <AnimatePresence>
      {isVisible && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.2 }}
            className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: prefersReduced ? 1 : 0.95, y: prefersReduced ? 0 : 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: prefersReduced ? 1 : 0.95 }}
            transition={{ duration: prefersReduced ? 0 : 0.25, ease: 'easeOut' }}
            className="fixed inset-0 z-[61] flex items-center justify-center p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="update-modal-title"
            aria-describedby="update-modal-status"
          >
            <div
              className={cn(
                'w-full max-w-sm',
                'bg-[#0b0f16] rounded-3xl',
                'ring-1 ring-white/10',
                'p-6 shadow-2xl shadow-black/50'
              )}
            >
              {/* Title */}
              <h2
                id="update-modal-title"
                className="text-base font-semibold text-white"
              >
                {updateSuccess ? 'Update Complete' : updateError ? 'Update Failed' : 'Updating ClaudeDesk'}
              </h2>

              {/* Stages */}
              <div className="mt-5 space-y-3" role="list" aria-label="Update progress">
                {stages.map((stage) => (
                  <StageIndicator
                    key={stage.id}
                    stage={stage}
                    currentStage={updateStage}
                    hasError={!!updateError}
                  />
                ))}
              </div>

              {/* Progress bar */}
              {isUpdating && !updateError && (
                <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-white/5">
                  <motion.div
                    className="h-full bg-gradient-to-r from-blue-500 to-blue-400 rounded-full"
                    initial={{ x: '-100%' }}
                    animate={{ x: '100%' }}
                    transition={{
                      repeat: Infinity,
                      duration: 1.5,
                      ease: 'linear',
                    }}
                    style={{ width: '40%' }}
                  />
                </div>
              )}

              {/* Status message */}
              <p
                id="update-modal-status"
                className={cn(
                  'mt-4 text-xs leading-relaxed',
                  updateError ? 'text-red-400/80' : updateSuccess ? 'text-emerald-400/80' : 'text-white/40'
                )}
              >
                {updateError || (updateSuccess ? 'Reloading...' : updateDetail || 'Please wait...')}
              </p>

              {/* Success animation */}
              {updateSuccess && (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', damping: 15, stiffness: 300 }}
                  className="mt-4 flex justify-center"
                >
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/15 ring-1 ring-emerald-500/30">
                    <Check className="h-6 w-6 text-emerald-400" />
                  </div>
                </motion.div>
              )}

              {/* Error actions */}
              {updateError && (
                <div className="mt-5 flex items-center gap-2">
                  <button
                    onClick={reset}
                    className={cn(
                      'flex-1 px-4 py-2 text-xs font-medium rounded-xl transition-colors',
                      'text-white/50 hover:text-white/70 hover:bg-white/5'
                    )}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => {
                      reset();
                      triggerUpdate();
                    }}
                    className={cn(
                      'flex-1 px-4 py-2 text-xs font-semibold rounded-xl transition-all',
                      'bg-blue-600/80 text-white',
                      'hover:bg-blue-500/80 active:scale-[0.98]'
                    )}
                  >
                    Retry
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
