/**
 * UpdateAvailableBanner - Shows when a newer npm version is available
 *
 * Distinct from the PWA UpdateBanner (service worker updates).
 * This notifies about new ClaudeDesk releases on npm.
 */

import { useEffect } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ArrowUpCircle, X, Terminal, Container, Code2, Download } from 'lucide-react';
import { useUpdateStore } from '../../store/updateStore';
import { cn } from '../../lib/cn';

const installMethodLabels: Record<string, { label: string; icon: typeof Terminal }> = {
  'global-npm': { label: 'npm', icon: Download },
  npx: { label: 'npx', icon: Terminal },
  docker: { label: 'Docker', icon: Container },
  source: { label: 'Source', icon: Code2 },
  unknown: { label: 'Unknown', icon: Terminal },
};

export function UpdateAvailableBanner() {
  const prefersReduced = useReducedMotion();
  const { info, bannerDismissedVersion, isUpdating, dismissBanner, triggerUpdate, fetchUpdateInfo } = useUpdateStore();

  // Fetch update info on mount (backend checks periodically, we just read the result)
  useEffect(() => {
    fetchUpdateInfo();
  }, [fetchUpdateInfo]);

  // Don't show if no update, already dismissed, or currently updating
  const shouldShow =
    info?.updateAvailable &&
    info.latestVersion &&
    info.latestVersion !== bannerDismissedVersion &&
    !isUpdating;

  const methodInfo = installMethodLabels[info?.installMethod || 'unknown'];
  const MethodIcon = methodInfo?.icon || Terminal;

  const handleUpdate = async () => {
    const result = await triggerUpdate();
    // Manual methods get instructions shown via toast or modal
    if (result.status === 'manual' && result.instructions) {
      // Handled by parent component or toast
    }
  };

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: prefersReduced ? 0 : -60 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: prefersReduced ? 0 : -60 }}
          transition={
            prefersReduced
              ? { duration: 0 }
              : { type: 'spring', damping: 25, stiffness: 300 }
          }
          className="fixed top-4 left-4 right-4 z-50 flex justify-center pointer-events-none"
          role="alert"
          aria-live="polite"
          aria-label="Software update notification"
        >
          <div
            className={cn(
              'pointer-events-auto w-full max-w-lg',
              'bg-[#0b0f16]/95 backdrop-blur-xl rounded-2xl',
              'ring-1 ring-white/10',
              'p-4 shadow-2xl shadow-black/40'
            )}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 ring-1 ring-emerald-500/20">
                <ArrowUpCircle className="h-5 w-5 text-emerald-400" aria-hidden="true" />
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-white">
                    Update Available
                  </p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/40 ring-1 ring-white/10">
                    <MethodIcon className="h-2.5 w-2.5" />
                    {methodInfo?.label}
                  </span>
                </div>
                <p className="mt-0.5 text-xs text-white/50">
                  <span className="text-white/40">v{info?.currentVersion}</span>
                  <span className="mx-1.5 text-white/20">&rarr;</span>
                  <span className="text-emerald-400/80 font-medium">v{info?.latestVersion}</span>
                </p>
              </div>

              {/* Close */}
              <button
                onClick={dismissBanner}
                className="shrink-0 rounded-lg p-1 text-white/30 hover:text-white/60 hover:bg-white/5 transition-colors"
                aria-label="Dismiss update notification"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Actions */}
            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                onClick={dismissBanner}
                className={cn(
                  'flex-1 px-4 py-2 text-xs font-medium rounded-xl transition-colors',
                  'text-white/50 hover:text-white/70 hover:bg-white/5'
                )}
              >
                Later
              </button>

              {info?.canAutoUpdate ? (
                <button
                  type="button"
                  onClick={handleUpdate}
                  className={cn(
                    'flex-1 px-4 py-2 text-xs font-semibold rounded-xl transition-all',
                    'bg-emerald-600/80 text-white',
                    'hover:bg-emerald-500/80 active:scale-[0.98]',
                    'flex items-center justify-center gap-1.5'
                  )}
                >
                  <ArrowUpCircle className="h-3.5 w-3.5" />
                  Update Now
                </button>
              ) : (
                <div className="flex-1 px-3 py-2 text-[11px] text-white/40 text-center leading-tight">
                  {info?.installMethod === 'docker' && 'Pull latest image to update'}
                  {info?.installMethod === 'npx' && 'Restart with npx claudedesk@latest'}
                  {info?.installMethod === 'source' && 'Pull latest & rebuild'}
                  {info?.installMethod === 'unknown' && 'npm i -g claudedesk@latest'}
                </div>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
