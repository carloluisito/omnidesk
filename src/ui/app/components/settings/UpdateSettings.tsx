/**
 * UpdateSettings - Settings controls for auto-update checking
 *
 * Toggle auto-check, adjust interval, manual check button,
 * and display of install method.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  RefreshCw,
  Download,
  Terminal,
  Container,
  Code2,
  Check,
  Loader2,
  Clock,
} from 'lucide-react';
import { useUpdateStore, type InstallMethod } from '../../store/updateStore';
import { useToast } from '../../hooks/useToast';
import { cn } from '../../lib/cn';
import { VStack, HStack } from '../../design-system/primitives/Stack';
import { Text } from '../../design-system/primitives/Text';

const installMethodConfig: Record<InstallMethod, { label: string; icon: typeof Terminal; color: string }> = {
  'global-npm': { label: 'npm (global)', icon: Download, color: 'text-red-400' },
  npx: { label: 'npx', icon: Terminal, color: 'text-amber-400' },
  docker: { label: 'Docker', icon: Container, color: 'text-blue-400' },
  source: { label: 'Source', icon: Code2, color: 'text-purple-400' },
  unknown: { label: 'Unknown', icon: Terminal, color: 'text-white/40' },
};

function formatRelativeTime(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);
  const diffDay = Math.floor(diffHour / 24);

  if (diffSec < 30) return 'Just now';
  if (diffMin < 1) return `${diffSec}s ago`;
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return `${diffDay}d ago`;
}

interface UpdateSettingsProps {
  autoCheckEnabled: boolean;
  checkIntervalHours: number;
  onAutoCheckChange: (enabled: boolean) => void;
  onIntervalChange: (hours: number) => void;
}

export function UpdateSettings({
  autoCheckEnabled,
  checkIntervalHours,
  onAutoCheckChange,
  onIntervalChange,
}: UpdateSettingsProps) {
  const prefersReduced = useReducedMotion();
  const { info, isChecking, checkForUpdate, fetchUpdateInfo } = useUpdateStore();
  const toast = useToast();
  const [localInterval, setLocalInterval] = useState(checkIntervalHours);

  useEffect(() => {
    fetchUpdateInfo();
  }, [fetchUpdateInfo]);

  useEffect(() => {
    setLocalInterval(checkIntervalHours);
  }, [checkIntervalHours]);

  const handleManualCheck = async () => {
    await checkForUpdate();
    const updatedInfo = useUpdateStore.getState().info;
    if (updatedInfo?.updateAvailable) {
      toast.info(`Update available: v${updatedInfo.latestVersion}`);
    } else if (updatedInfo?.error) {
      toast.error('Failed to check for updates');
    } else {
      toast.success('You\'re running the latest version');
    }
  };

  const handleIntervalCommit = () => {
    const clamped = Math.max(1, Math.min(168, localInterval));
    setLocalInterval(clamped);
    onIntervalChange(clamped);
  };

  const method = installMethodConfig[info?.installMethod || 'unknown'];
  const MethodIcon = method.icon;

  return (
    <VStack gap={4}>
      {/* Auto-check toggle */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
        <div>
          <Text variant="bodySm" color="primary">
            Automatic Update Checks
          </Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5">
            Check for updates in the background
          </Text>
        </div>
        <button
          role="switch"
          aria-checked={autoCheckEnabled}
          aria-label="Automatic update checks"
          onClick={() => onAutoCheckChange(!autoCheckEnabled)}
          className={cn(
            'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors duration-200',
            autoCheckEnabled ? 'bg-blue-600' : 'bg-white/10'
          )}
        >
          <span
            className={cn(
              'inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform duration-200',
              autoCheckEnabled ? 'translate-x-[22px]' : 'translate-x-[2px]',
              'mt-[2px]'
            )}
          />
        </button>
      </div>

      {/* Check interval (shown when auto-check is enabled) */}
      <AnimatePresence>
        {autoCheckEnabled && (
          <motion.div
            initial={prefersReduced ? {} : { height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={prefersReduced ? {} : { height: 0, opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.2 }}
            className="overflow-hidden"
          >
            <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
              <div>
                <Text variant="bodySm" color="primary">
                  Check Interval
                </Text>
                <Text variant="bodyXs" color="muted" className="mt-0.5">
                  How often to check (1-168 hours)
                </Text>
              </div>
              <HStack gap={2} align="center">
                <input
                  type="range"
                  min={1}
                  max={168}
                  value={localInterval}
                  onChange={(e) => setLocalInterval(Number(e.target.value))}
                  onMouseUp={handleIntervalCommit}
                  onTouchEnd={handleIntervalCommit}
                  className="w-24 h-1 appearance-none rounded-full bg-white/10 accent-blue-500 cursor-pointer"
                  aria-label="Check interval in hours"
                />
                <input
                  type="number"
                  min={1}
                  max={168}
                  value={localInterval}
                  onChange={(e) => setLocalInterval(Number(e.target.value))}
                  onBlur={handleIntervalCommit}
                  className="w-14 rounded-lg bg-white/5 px-2 py-1 text-xs text-white text-center ring-1 ring-white/10 focus:ring-blue-500/50 focus:outline-none"
                  aria-label="Check interval hours"
                />
                <Text variant="bodyXs" color="muted">h</Text>
              </HStack>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual check */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
        <div>
          <Text variant="bodySm" color="primary">
            Manual Check
          </Text>
          <HStack gap={1.5} align="center" className="mt-0.5">
            <Clock className="h-3 w-3 text-white/25" />
            <Text variant="bodyXs" color="muted">
              Last checked: {formatRelativeTime(info?.checkedAt || null)}
            </Text>
          </HStack>
        </div>
        <button
          onClick={handleManualCheck}
          disabled={isChecking}
          className={cn(
            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all',
            isChecking
              ? 'text-white/30 cursor-not-allowed'
              : 'text-blue-400/80 hover:text-blue-400 hover:bg-blue-500/10 active:scale-[0.97]'
          )}
        >
          {isChecking ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          {isChecking ? 'Checking...' : 'Check Now'}
        </button>
      </div>

      {/* Install method */}
      <div className="flex items-center justify-between gap-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4">
        <div>
          <Text variant="bodySm" color="primary">
            Installation Method
          </Text>
          <Text variant="bodyXs" color="muted" className="mt-0.5">
            Detected automatically
          </Text>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full bg-white/5 px-2.5 py-1 text-xs font-medium ring-1 ring-white/10',
            method.color
          )}
          role="status"
          aria-label={`Installation method: ${method.label}`}
        >
          <MethodIcon className="h-3 w-3" />
          {method.label}
        </span>
      </div>

      {/* Current version */}
      {info && (
        <div className="flex items-center justify-between gap-4 px-1">
          <Text variant="bodyXs" color="muted">
            Current version
          </Text>
          <Text variant="bodyXs" color="muted" className="font-mono">
            v{info.currentVersion}
          </Text>
        </div>
      )}
    </VStack>
  );
}
