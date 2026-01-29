/**
 * CacheManagement - Settings section for managing app caches
 *
 * Shows cache categories with sizes and provides clear actions.
 */

import { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import {
  Terminal,
  FileText,
  GitBranch,
  BarChart3,
  Trash2,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Check,
  HardDrive,
  Wifi,
} from 'lucide-react';
import { useCacheStore, formatBytes, type CacheCategory } from '../../store/cacheStore';
import { useToast } from '../../hooks/useToast';
import { cn } from '../../lib/cn';
import { VStack } from '../../design-system/primitives/Stack';
import { Text } from '../../design-system/primitives/Text';

const categoryIcons: Record<string, typeof Terminal> = {
  sessions: Terminal,
  artifacts: FileText,
  worktrees: GitBranch,
  usage: BarChart3,
};

function CacheCard({
  category,
  isClearing,
  onClear,
}: {
  category: CacheCategory;
  isClearing: boolean;
  onClear: () => void;
}) {
  const prefersReduced = useReducedMotion();
  const Icon = categoryIcons[category.id] || HardDrive;
  const isEmpty = category.count === 0 && category.sizeBytes === 0;
  const hasActive = (category.activeCount || 0) > 0;

  return (
    <motion.div
      initial={prefersReduced ? {} : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: prefersReduced ? 0 : 0.2 }}
      className={cn(
        'rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4',
        'transition-colors hover:bg-white/[0.05]'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        {/* Left: Icon + Info */}
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
              isEmpty
                ? 'bg-white/5 ring-1 ring-white/5'
                : 'bg-white/[0.06] ring-1 ring-white/10'
            )}
          >
            <Icon
              className={cn('h-4 w-4', isEmpty ? 'text-white/20' : 'text-white/50')}
              aria-hidden="true"
            />
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Text variant="bodySm" color={isEmpty ? 'muted' : 'primary'}>
                {category.name}
              </Text>

              {category.sizeBytes > 0 && (
                <span className="inline-flex items-center rounded-md bg-white/5 px-1.5 py-0.5 text-[10px] font-medium text-white/40 ring-1 ring-white/5">
                  {formatBytes(category.sizeBytes)}
                </span>
              )}

              {hasActive && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-400/70 ring-1 ring-amber-500/20">
                  <Wifi className="h-2 w-2" />
                  active
                </span>
              )}
            </div>

            <Text variant="bodyXs" color="muted" className="mt-0.5">
              {isEmpty ? 'No cached data' : category.details}
            </Text>
          </div>
        </div>

        {/* Right: Clear button */}
        <button
          onClick={onClear}
          disabled={isEmpty || isClearing}
          className={cn(
            'shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all',
            isEmpty || isClearing
              ? 'text-white/15 cursor-not-allowed'
              : 'text-white/40 hover:text-red-400 hover:bg-red-500/10 active:scale-[0.97]'
          )}
          aria-label={`Clear ${category.name}`}
        >
          {isClearing ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Trash2 className="h-3 w-3" />
          )}
          Clear
        </button>
      </div>
    </motion.div>
  );
}

function ConfirmDialog({
  isOpen,
  title,
  message,
  onConfirm,
  onCancel,
}: {
  isOpen: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const prefersReduced = useReducedMotion();

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: prefersReduced ? 0 : 0.15 }}
            className="fixed inset-0 z-[70] bg-black/50 backdrop-blur-sm"
            onClick={onCancel}
          />
          <motion.div
            initial={{ opacity: 0, scale: prefersReduced ? 1 : 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: prefersReduced ? 1 : 0.95 }}
            transition={{ duration: prefersReduced ? 0 : 0.2 }}
            className="fixed inset-0 z-[71] flex items-center justify-center p-4"
          >
            <div className="w-full max-w-xs bg-[#0b0f16] rounded-2xl ring-1 ring-white/10 p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10 ring-1 ring-red-500/20">
                  <AlertTriangle className="h-4 w-4 text-red-400" />
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{title}</p>
                  <p className="mt-1 text-xs text-white/50 leading-relaxed">{message}</p>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2">
                <button
                  onClick={onCancel}
                  className="flex-1 rounded-xl px-3 py-2 text-xs font-medium text-white/50 hover:text-white/70 hover:bg-white/5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={onConfirm}
                  className="flex-1 rounded-xl px-3 py-2 text-xs font-semibold bg-red-600/80 text-white hover:bg-red-500/80 active:scale-[0.98] transition-all"
                >
                  Clear
                </button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export function CacheManagement() {
  const { categories, isLoading, loadError, clearingCategoryId, isClearingAll, loadCacheInfo, clearCategory, clearAll, clearClientCaches } = useCacheStore();
  const toast = useToast();
  const [confirmAction, setConfirmAction] = useState<{ id: string; title: string; message: string } | null>(null);

  useEffect(() => {
    loadCacheInfo();
  }, [loadCacheInfo]);

  const handleClearCategory = async (categoryId: string) => {
    const category = categories.find((c) => c.id === categoryId);
    if (!category) return;

    // Confirm for sessions with active sessions
    if (categoryId === 'sessions' && (category.activeCount || 0) > 0) {
      setConfirmAction({
        id: categoryId,
        title: 'Clear Session Data?',
        message: `${category.activeCount} active session(s) will be preserved. Only idle session data will be removed.`,
      });
      return;
    }

    const result = await clearCategory(categoryId);
    if (result.success) {
      toast.success(result.message);
    } else {
      toast.error(result.message);
    }
  };

  const handleClearAll = () => {
    const hasActive = categories.some((c) => (c.activeCount || 0) > 0);
    setConfirmAction({
      id: '__all__',
      title: 'Clear All Caches?',
      message: hasActive
        ? 'This will clear all cached data. Active sessions will be preserved.'
        : 'This will clear all cached data including sessions, artifacts, worktrees, and usage data. This cannot be undone.',
    });
  };

  const handleConfirm = async () => {
    if (!confirmAction) return;
    setConfirmAction(null);

    if (confirmAction.id === '__all__') {
      const result = await clearAll();
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    } else {
      const result = await clearCategory(confirmAction.id);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.message);
      }
    }
  };

  const handleClearPWA = async () => {
    await clearClientCaches();
    toast.success('Browser caches cleared');
  };

  const totalSize = categories.reduce((sum, c) => sum + c.sizeBytes, 0);
  const totalItems = categories.reduce((sum, c) => sum + c.count, 0);

  return (
    <VStack gap={5} className="pb-8">
      {/* Header with actions */}
      <div className="flex items-center justify-between">
        <div>
          <Text variant="bodySm" color="tertiary">
            {totalItems > 0
              ? `${totalItems} items using ${formatBytes(totalSize)}`
              : 'All caches are clear'}
          </Text>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadCacheInfo()}
            disabled={isLoading}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all',
              'text-white/40 hover:text-white/60 hover:bg-white/5',
              isLoading && 'animate-pulse'
            )}
            aria-label="Refresh cache sizes"
          >
            <RefreshCw className={cn('h-3 w-3', isLoading && 'animate-spin')} />
            Refresh
          </button>

          <button
            onClick={handleClearAll}
            disabled={totalItems === 0 || isClearingAll}
            className={cn(
              'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all',
              totalItems === 0 || isClearingAll
                ? 'text-white/15 cursor-not-allowed'
                : 'text-red-400/70 hover:text-red-400 hover:bg-red-500/10 active:scale-[0.97]'
            )}
          >
            {isClearingAll ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Trash2 className="h-3 w-3" />
            )}
            Clear All
          </button>
        </div>
      </div>

      {/* Error state */}
      {loadError && (
        <div className="rounded-xl bg-red-500/10 ring-1 ring-red-500/20 p-3">
          <Text variant="bodyXs" className="text-red-400">
            Failed to load cache info: {loadError}
          </Text>
        </div>
      )}

      {/* Loading skeleton */}
      {isLoading && categories.length === 0 && (
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="rounded-2xl bg-white/[0.02] ring-1 ring-white/[0.04] p-4 h-16 animate-pulse"
            />
          ))}
        </div>
      )}

      {/* Cache cards */}
      {categories.length > 0 && (
        <div className="space-y-2">
          {categories.map((category) => (
            <CacheCard
              key={category.id}
              category={category}
              isClearing={clearingCategoryId === category.id || isClearingAll}
              onClear={() => handleClearCategory(category.id)}
            />
          ))}
        </div>
      )}

      {/* Client-side caches */}
      <div className="mt-2">
        <div className="flex items-center gap-2 mb-2">
          <Text variant="bodyXs" color="muted">Browser Caches</Text>
          <div className="flex-1 h-px bg-white/5" />
        </div>

        <motion.div
          className={cn(
            'rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.06] p-4',
            'transition-colors hover:bg-white/[0.05]'
          )}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/[0.06] ring-1 ring-white/10">
                <HardDrive className="h-4 w-4 text-white/50" aria-hidden="true" />
              </div>
              <div>
                <Text variant="bodySm" color="primary">
                  PWA & Request Cache
                </Text>
                <Text variant="bodyXs" color="muted" className="mt-0.5">
                  Service worker cache and in-memory request cache
                </Text>
              </div>
            </div>
            <button
              onClick={handleClearPWA}
              className="shrink-0 flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium text-white/40 hover:text-red-400 hover:bg-red-500/10 active:scale-[0.97] transition-all"
              aria-label="Clear browser caches"
            >
              <Trash2 className="h-3 w-3" />
              Clear
            </button>
          </div>
        </motion.div>
      </div>

      {/* Info footer */}
      <Text variant="bodyXs" color="muted" className="flex items-center gap-1.5 mt-2">
        <AlertTriangle className="h-3 w-3 text-amber-400/50" />
        Active terminal sessions are protected and won't be cleared
      </Text>

      {/* Confirmation dialog */}
      <ConfirmDialog
        isOpen={!!confirmAction}
        title={confirmAction?.title || ''}
        message={confirmAction?.message || ''}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
      />
    </VStack>
  );
}
