/**
 * ConversationArea - Container for messages, composer, and inline UI elements
 *
 * Handles:
 * - Message list rendering
 * - Drag/drop for file attachments
 * - In-session search bar
 * - Queue manager
 * - Resume controls
 */

import { type ReactNode, type DragEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown, ChevronUp, X, Upload, Clock, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/cn';
import { ContextSplitBanner } from '../ContextSplitBanner';

interface ConversationAreaProps {
  /** Message content to render */
  children: ReactNode;
  /** Whether currently dragging files */
  isDragging?: boolean;
  /** Drag event handlers */
  onDragOver?: (e: DragEvent) => void;
  onDragLeave?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  /** Search bar state */
  showSearch?: boolean;
  searchQuery?: string;
  onSearchQueryChange?: (query: string) => void;
  searchIndex?: number;
  searchMatchCount?: number;
  onSearchNavigate?: (direction: 'prev' | 'next') => void;
  onSearchClose?: () => void;
  /** Queue state */
  queueCount?: number;
  showQueueManager?: boolean;
  queueItems?: QueueItem[];
  onToggleQueueManager?: () => void;
  onRemoveFromQueue?: (id: string) => void;
  onClearQueue?: () => void;
  /** Resume controls (after stop) */
  showResumeControls?: boolean;
  isSessionRunning?: boolean;
  onResumeQueue?: () => void;
  /** Context split banner */
  sessionId?: string;
  contextUtilizationPercent?: number;
  splitSuggested?: boolean;
  onSwitchSession?: (sessionId: string) => void;
  /** Composer component */
  composer: ReactNode;
  /** Custom class names */
  className?: string;
}

interface QueueItem {
  id: string;
  content: string;
  queuedAt: string;
}

export function ConversationArea({
  children,
  isDragging = false,
  onDragOver,
  onDragLeave,
  onDrop,
  showSearch = false,
  searchQuery = '',
  onSearchQueryChange,
  searchIndex = 0,
  searchMatchCount = 0,
  onSearchNavigate,
  onSearchClose,
  queueCount = 0,
  showQueueManager = false,
  queueItems = [],
  onToggleQueueManager,
  onRemoveFromQueue,
  onClearQueue,
  showResumeControls = false,
  isSessionRunning = false,
  onResumeQueue,
  sessionId,
  contextUtilizationPercent,
  splitSuggested,
  onSwitchSession,
  composer,
  className,
}: ConversationAreaProps) {
  return (
    <div
      className={cn(
        'relative flex flex-col min-h-0',
        isDragging && 'ring-2 ring-inset ring-blue-500 rounded-3xl',
        className
      )}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {/* Drag overlay */}
      {isDragging && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/40 z-10 pointer-events-none rounded-3xl">
          <div className="bg-white/10 backdrop-blur rounded-xl p-6 text-center ring-1 ring-white/20">
            <Upload className="h-8 w-8 mx-auto mb-2 text-blue-400" />
            <p className="text-sm font-medium text-white">Drop files to attach</p>
          </div>
        </div>
      )}

      {/* In-session search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex items-center gap-2 px-4 py-2 mb-3 rounded-2xl bg-white/5 ring-1 ring-white/10"
          >
            <Search className="h-4 w-4 text-white/40" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchQueryChange?.(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  onSearchNavigate?.(e.shiftKey ? 'prev' : 'next');
                }
                if (e.key === 'Escape') {
                  onSearchClose?.();
                }
              }}
              placeholder="Search in conversation..."
              className="flex-1 bg-transparent text-sm text-white placeholder-white/35 outline-none"
              autoFocus
            />
            {searchQuery && (
              <div className="flex items-center gap-2">
                <span className="text-xs text-white/50">
                  {searchMatchCount > 0
                    ? `${searchIndex + 1} of ${searchMatchCount}`
                    : 'No matches'}
                </span>
                <button
                  onClick={() => onSearchNavigate?.('prev')}
                  disabled={searchMatchCount === 0 || searchIndex === 0}
                  className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronUp className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onSearchNavigate?.('next')}
                  disabled={searchMatchCount === 0 || searchIndex >= searchMatchCount - 1}
                  className="p-1 rounded hover:bg-white/10 disabled:opacity-30"
                >
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
            )}
            <button
              onClick={onSearchClose}
              className="p-1 rounded hover:bg-white/10 text-white/40"
            >
              <X className="h-4 w-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context split banner */}
      {sessionId && (splitSuggested || (contextUtilizationPercent != null && contextUtilizationPercent >= 85)) && (
        <ContextSplitBanner
          sessionId={sessionId}
          utilizationPercent={contextUtilizationPercent ?? 85}
          onSwitchSession={onSwitchSession}
        />
      )}

      {/* Message content */}
      <div className="flex-1 overflow-y-auto min-h-0">{children}</div>

      {/* Queue badge (compact) */}
      {queueCount > 0 && !showQueueManager && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="mt-4 flex justify-center"
        >
          <button
            onClick={onToggleQueueManager}
            className="flex items-center gap-2 rounded-2xl bg-cyan-500/10 px-4 py-2 text-sm text-cyan-300 ring-1 ring-cyan-500/30 hover:bg-cyan-500/15 active:bg-cyan-500/20"
          >
            <Clock className="h-4 w-4" />
            <span>{queueCount} messages queued</span>
            <ChevronDown className="h-4 w-4" />
          </button>
        </motion.div>
      )}

      {/* Queue manager (expanded) */}
      <AnimatePresence>
        {showQueueManager && queueCount > 0 && (
          <QueueManager
            items={queueItems}
            isSessionRunning={isSessionRunning}
            onRemove={onRemoveFromQueue}
            onClear={onClearQueue}
            onClose={onToggleQueueManager}
          />
        )}
      </AnimatePresence>

      {/* Resume controls */}
      {showResumeControls && queueCount > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          transition={{ duration: 0.2 }}
          className="mt-4 flex justify-center"
        >
          <div className="w-full max-w-[600px] rounded-2xl bg-amber-500/10 px-4 py-3 ring-1 ring-amber-500/30">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                <span className="text-sm text-amber-300">
                  Stopped with {queueCount} messages queued
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={onClearQueue}
                  className="rounded-lg px-3 py-1.5 text-sm text-white/70 hover:bg-white/10 active:bg-white/15"
                >
                  Clear Queue
                </button>
                <button
                  onClick={onResumeQueue}
                  className="rounded-lg bg-cyan-500 px-3 py-1.5 text-sm font-medium text-white hover:bg-cyan-600 active:bg-cyan-700"
                >
                  Resume Queue
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* Composer */}
      <div className="mt-6 flex-shrink-0">{composer}</div>
    </div>
  );
}

// Queue Manager sub-component
interface QueueManagerProps {
  items: QueueItem[];
  isSessionRunning?: boolean;
  onRemove?: (id: string) => void;
  onClear?: () => void;
  onClose?: () => void;
}

function QueueManager({ items, isSessionRunning, onRemove, onClear, onClose }: QueueManagerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      transition={{ duration: 0.2 }}
      className="mt-4 mx-auto max-w-[600px]"
    >
      <div className="rounded-2xl bg-zinc-900/95 backdrop-blur-xl ring-1 ring-white/10">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <h3 className="text-sm font-semibold text-white">Queue ({items.length})</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={onClear}
              className="rounded-lg px-2 py-1 text-xs text-white/70 hover:bg-white/10 active:bg-white/15"
            >
              Clear All
            </button>
            <button onClick={onClose} className="rounded-lg p-1 text-white/40 hover:bg-white/10">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Queue items */}
        <div className="max-h-[400px] overflow-y-auto p-2">
          {items.map((msg, index) => (
            <div
              key={msg.id}
              className={cn(
                'mb-2 rounded-xl p-3 ring-1',
                index === 0 && isSessionRunning
                  ? 'bg-cyan-500/10 ring-cyan-500/30'
                  : 'bg-white/5 ring-white/10'
              )}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-white/50">#{index + 1}</span>
                    {index === 0 && isSessionRunning && (
                      <span className="text-xs text-cyan-300">Processing now...</span>
                    )}
                  </div>
                  <p className="text-sm text-white/80 truncate">
                    {msg.content.slice(0, 60)}
                    {msg.content.length > 60 && '...'}
                  </p>
                  <p className="mt-1 text-xs text-white/40">
                    {new Date(msg.queuedAt).toLocaleTimeString()}
                  </p>
                </div>
                <button
                  onClick={() => onRemove?.(msg.id)}
                  className="shrink-0 rounded-lg p-1.5 text-white/40 hover:bg-white/10 hover:text-red-400"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}

export type { ConversationAreaProps, QueueItem };
