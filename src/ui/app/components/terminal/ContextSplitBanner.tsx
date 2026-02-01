import { useState, useCallback } from 'react';
import { Scissors, X } from 'lucide-react';
import { cn } from '../../lib/cn';
import { motion, AnimatePresence } from 'framer-motion';
import { useTerminalStore } from '../../store/terminalStore';

interface ContextSplitBannerProps {
  sessionId: string;
  utilizationPercent: number;
  onSwitchSession?: (sessionId: string) => void;
}

export function ContextSplitBanner({
  sessionId,
  utilizationPercent,
  onSwitchSession,
}: ContextSplitBannerProps) {
  const [isDismissed, setIsDismissed] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);
  const { splitSession } = useTerminalStore();

  const handleDismiss = useCallback(() => {
    setIsDismissed(true);
  }, []);

  const handleSplit = useCallback(async () => {
    setIsSplitting(true);
    try {
      const newSessionId = await splitSession(sessionId);
      if (newSessionId && onSwitchSession) {
        onSwitchSession(newSessionId);
      }
    } catch (error) {
      console.error('[ContextSplitBanner] Split failed:', error);
    } finally {
      setIsSplitting(false);
    }
  }, [sessionId, splitSession, onSwitchSession]);

  if (isDismissed || utilizationPercent < 85) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        role="alert"
        aria-live="polite"
        className={cn(
          'mx-6 mt-2 rounded-xl px-4 py-3 flex items-center gap-3 ring-1',
          'bg-amber-500/10 ring-amber-500/30 text-amber-300'
        )}
      >
        <Scissors
          className="h-5 w-5 shrink-0 text-amber-400"
          aria-hidden="true"
        />

        <p className="flex-1 text-sm">
          Context is {utilizationPercent}% full. Split into a new session to keep responses sharp.
        </p>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleSplit}
            disabled={isSplitting}
            className={cn(
              'px-3 py-1.5 text-xs font-medium rounded-lg transition-colors',
              'bg-amber-500/20 hover:bg-amber-500/30 text-amber-200',
              'disabled:opacity-50'
            )}
          >
            {isSplitting ? 'Splitting...' : 'Split Session'}
          </button>

          <button
            type="button"
            onClick={handleDismiss}
            className="p-1.5 rounded-lg transition-colors hover:bg-amber-500/20 text-amber-400"
            aria-label="Dismiss alert"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
