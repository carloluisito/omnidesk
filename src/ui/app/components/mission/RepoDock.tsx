/**
 * RepoDock - Always-visible repository dock
 *
 * Horizontal dock showing all active repos with visual status,
 * branch info, quick focus, and add/remove functionality.
 */
import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch,
  Plus,
  X,
  Circle,
  AlertCircle,
  Loader2,
  FolderGit2,
  Link2,
} from 'lucide-react';
import { cn } from '../../lib/cn';
import { useTerminalUIStore } from '../../store/terminalUIStore';

export interface RepoStatus {
  id: string;
  name: string;
  branch: string;
  changesCount: number;
  status: 'clean' | 'modified' | 'running' | 'error';
  isActive: boolean;
  parentSessionId?: string;
  childSessionIds?: string[];
}

interface RepoDockProps {
  repos: RepoStatus[];
  onRepoClick: (repoId: string) => void;
  onRepoRemove: (repoId: string) => Promise<void> | void;
  className?: string;
}

export function RepoDock({
  repos,
  onRepoClick,
  onRepoRemove,
  className,
}: RepoDockProps) {
  const { openOverlay } = useTerminalUIStore();
  const [closingSessionIds, setClosingSessionIds] = useState<Set<string>>(new Set());

  const handleRemove = useCallback(async (sessionId: string) => {
    setClosingSessionIds((prev) => new Set(prev).add(sessionId));
    try {
      await onRepoRemove(sessionId);
    } finally {
      setClosingSessionIds((prev) => {
        const next = new Set(prev);
        next.delete(sessionId);
        return next;
      });
    }
  }, [onRepoRemove]);

  const getStatusIndicator = (status: RepoStatus['status']) => {
    switch (status) {
      case 'running':
        return <Loader2 className="h-3 w-3 animate-spin text-blue-400" />;
      case 'error':
        return <AlertCircle className="h-3 w-3 text-red-400" />;
      case 'modified':
        return <Circle className="h-3 w-3 fill-amber-400 text-amber-400" />;
      case 'clean':
      default:
        return <Circle className="h-3 w-3 fill-emerald-400 text-emerald-400" />;
    }
  };

  const getStatusColor = (status: RepoStatus['status'], isActive: boolean) => {
    if (isActive) {
      switch (status) {
        case 'running':
          return 'ring-blue-500/50 bg-blue-500/10';
        case 'error':
          return 'ring-red-500/50 bg-red-500/10';
        case 'modified':
          return 'ring-amber-500/50 bg-amber-500/10';
        default:
          return 'ring-emerald-500/50 bg-emerald-500/10';
      }
    }
    return 'ring-white/10 bg-white/5 hover:bg-white/10 hover:ring-white/20';
  };

  return (
    <div
      className={cn(
        'relative z-40 flex items-center gap-2 px-4 py-3 bg-[#05070c]/80 backdrop-blur-xl border-t border-white/10',
        className
      )}
    >
      {/* Repo icon label */}
      <div className="flex items-center gap-2 text-white/40 text-xs font-medium uppercase tracking-wider">
        <FolderGit2 className="h-4 w-4" />
        <span className="hidden sm:inline">Repos</span>
      </div>

      <div className="h-4 w-px bg-white/10 mx-1" />

      {/* Repo pills */}
      <div className="flex items-center gap-2 flex-1 overflow-x-auto scrollbar-none">
        <AnimatePresence mode="popLayout">
          {repos.map((repo) => {
            const isClosing = closingSessionIds.has(repo.id);
            return (
              <motion.div
                key={repo.id}
                initial={{ opacity: 0, scale: 0.8, x: -10 }}
                animate={{ opacity: isClosing ? 0.5 : 1, scale: 1, x: 0 }}
                exit={{ opacity: 0, scale: 0.8, x: -10 }}
                layout
                className="flex-shrink-0"
              >
                <button
                  onClick={() => !isClosing && onRepoClick(repo.id)}
                  disabled={isClosing}
                  className={cn(
                    'group flex items-center gap-2 rounded-xl px-3 py-2 text-sm transition-all ring-1',
                    isClosing
                      ? 'ring-red-500/30 bg-red-500/5 cursor-wait'
                      : getStatusColor(repo.status, repo.isActive)
                  )}
                >
                  {/* Status dot / closing spinner */}
                  {isClosing ? (
                    <Loader2 className="h-3 w-3 animate-spin text-red-400" />
                  ) : (
                    getStatusIndicator(repo.status)
                  )}

                  {/* Repo name */}
                  <span
                    className={cn(
                      'font-medium max-w-[120px] truncate',
                      isClosing
                        ? 'text-red-300/70'
                        : repo.isActive ? 'text-white' : 'text-white/70'
                    )}
                  >
                    {isClosing ? 'Closing...' : repo.name}
                  </span>

                  {/* Branch badge - hidden while closing */}
                  {!isClosing && (
                    <span className="flex items-center gap-1 rounded-md bg-white/5 px-1.5 py-0.5 text-xs text-white/50 font-mono">
                      <GitBranch className="h-3 w-3" />
                      <span className="max-w-[80px] truncate">{repo.branch}</span>
                    </span>
                  )}

                  {/* Changes count - hidden while closing */}
                  {!isClosing && repo.changesCount > 0 && (
                    <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-amber-500/20 px-1.5 text-xs font-semibold text-amber-400">
                      {repo.changesCount}
                    </span>
                  )}

                  {/* Session link indicator (parent/child) */}
                  {!isClosing && (repo.parentSessionId || (repo.childSessionIds && repo.childSessionIds.length > 0)) && (
                    <span
                      className="flex items-center gap-0.5 text-xs text-blue-400/70"
                      title={repo.parentSessionId ? 'Continued from another session' : `Continued in ${repo.childSessionIds?.length} session(s)`}
                    >
                      <Link2 className="h-3 w-3" />
                    </span>
                  )}

                  {/* Remove button (shown on hover, hidden while closing) */}
                  {!isClosing && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemove(repo.id);
                      }}
                      className="ml-1 p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-white/10 transition-opacity"
                      title="Close session"
                    >
                      <X className="h-3 w-3 text-white/50" />
                    </button>
                  )}
                </button>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>

      {/* Add Session button */}
      <motion.button
        onClick={() => openOverlay('new-session')}
        className="flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-sm text-white/60 ring-1 ring-white/10 hover:bg-white/10 hover:ring-white/20 hover:text-white/80 transition-all"
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
      >
        <Plus className="h-4 w-4" />
        <span className="hidden sm:inline">Add Session</span>
      </motion.button>
    </div>
  );
}
