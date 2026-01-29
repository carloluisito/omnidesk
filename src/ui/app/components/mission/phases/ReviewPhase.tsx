/**
 * ReviewPhase - File review and diff viewing interface
 *
 * Displays a file tree of changed files, diff viewer for selected file,
 * and approval controls for the review workflow.
 */
import { useState, useMemo, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText,
  FilePlus,
  FileX,
  FilePen,
  Check,
  CheckCheck,
  ChevronRight,
  ChevronDown,
  Eye,
  AlertTriangle,
} from 'lucide-react';
import { cn } from '../../../lib/cn';
import { api } from '../../../lib/api';

export interface FileChange {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  insertions?: number;
  deletions?: number;
  oldPath?: string;
  approved?: boolean;
}

interface ReviewPhaseProps {
  sessionId: string;
  repoId?: string;
  files: FileChange[];
  onFileApprove: (path: string) => void;
  onApproveAll: () => void;
  onNavigateToShip: () => void;
}

export function ReviewPhase({
  sessionId,
  repoId,
  files,
  onFileApprove,
  onApproveAll,
  onNavigateToShip,
}: ReviewPhaseProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(
    files.length > 0 ? files[0].path : null
  );
  const [diff, setDiff] = useState<string>('');
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  // Calculate approval progress
  const approvedCount = files.filter((f) => f.approved).length;
  const totalCount = files.length;
  const allApproved = approvedCount === totalCount && totalCount > 0;

  // Group files by directory
  const fileTree = useMemo(() => {
    const tree: Record<string, FileChange[]> = {};
    files.forEach((file) => {
      const parts = file.path.split('/');
      const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '.';
      if (!tree[dir]) tree[dir] = [];
      tree[dir].push(file);
    });
    return tree;
  }, [files]);

  // Load diff for selected file
  useEffect(() => {
    if (!selectedFile || !sessionId) return;

    const loadDiff = async () => {
      setLoadingDiff(true);
      try {
        const body: { filePath: string; staged: boolean; repoId?: string } = {
          filePath: selectedFile,
          staged: false,
        };
        if (repoId) {
          body.repoId = repoId;
        }
        const data = await api<{ diff: string }>(
          'POST',
          `/terminal/sessions/${sessionId}/file-diff`,
          body
        );
        setDiff(data.diff || 'No changes');
      } catch (err) {
        console.error('Failed to load diff:', err);
        setDiff('Failed to load diff');
      } finally {
        setLoadingDiff(false);
      }
    };

    loadDiff();
  }, [selectedFile, sessionId, repoId]);

  const toggleDir = (dir: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dir)) next.delete(dir);
      else next.add(dir);
      return next;
    });
  };

  const getFileIcon = (status: FileChange['status']) => {
    switch (status) {
      case 'added':
        return <FilePlus className="h-4 w-4 text-emerald-400" />;
      case 'deleted':
        return <FileX className="h-4 w-4 text-red-400" />;
      case 'modified':
      case 'renamed':
        return <FilePen className="h-4 w-4 text-amber-400" />;
      default:
        return <FileText className="h-4 w-4 text-white/40" />;
    }
  };

  if (files.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
            <Eye className="h-8 w-8 text-white/30" />
          </div>
          <h2 className="text-lg font-semibold text-white mb-2">No changes to review</h2>
          <p className="text-sm text-white/50">
            Files modified by Claude will appear here for review.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col sm:flex-row min-h-0 gap-3 sm:gap-4 p-3 sm:p-4 overflow-y-auto sm:overflow-y-hidden">
      {/* File Tree - Left Panel */}
      <div className="w-full sm:w-64 sm:flex-shrink-0 flex flex-col rounded-xl bg-white/[0.03] ring-1 ring-white/10 overflow-hidden">
        {/* Header */}
        <div className="px-3 py-2.5 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs font-medium text-white/50 uppercase tracking-wider">
            Changed Files
          </span>
          <span className="text-xs text-white/40">
            {approvedCount}/{totalCount}
          </span>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {Object.entries(fileTree).map(([dir, dirFiles]) => (
            <div key={dir}>
              {dir !== '.' && (
                <button
                  onClick={() => toggleDir(dir)}
                  className="flex items-center gap-1 w-full px-2 py-1 text-xs text-white/40 hover:text-white/60"
                >
                  {expandedDirs.has(dir) || !expandedDirs.size ? (
                    <ChevronDown className="h-3 w-3" />
                  ) : (
                    <ChevronRight className="h-3 w-3" />
                  )}
                  <span className="truncate font-mono">{dir}</span>
                </button>
              )}

              <AnimatePresence>
                {(dir === '.' || expandedDirs.has(dir) || !expandedDirs.size) &&
                  dirFiles.map((file) => (
                    <motion.button
                      key={file.path}
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      onClick={() => setSelectedFile(file.path)}
                      className={cn(
                        'flex items-center gap-2 w-full px-2 py-1.5 rounded-lg text-left transition-colors',
                        selectedFile === file.path
                          ? 'bg-white/10 ring-1 ring-white/20'
                          : 'hover:bg-white/5',
                        dir !== '.' && 'ml-3'
                      )}
                    >
                      {getFileIcon(file.status)}
                      <span className="flex-1 text-sm text-white/80 truncate font-mono">
                        {file.path.split('/').pop()}
                      </span>
                      {file.approved && (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      )}
                    </motion.button>
                  ))}
              </AnimatePresence>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="p-3 border-t border-white/10 space-y-2">
          <button
            onClick={onApproveAll}
            disabled={allApproved}
            className={cn(
              'w-full flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
              allApproved
                ? 'bg-emerald-500/20 text-emerald-400 cursor-default'
                : 'bg-white/10 text-white hover:bg-white/15'
            )}
          >
            <CheckCheck className="h-4 w-4" />
            {allApproved ? 'All Approved' : 'Approve All'}
          </button>

          {allApproved && (
            <button
              onClick={onNavigateToShip}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-500 transition-colors"
            >
              Ready to Ship
              <ChevronRight className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Diff Viewer - Center Panel (hidden on mobile — file tree is primary) */}
      <div className="hidden sm:flex flex-1 flex-col rounded-xl bg-white/[0.03] ring-1 ring-white/10 overflow-hidden min-w-0">
        {/* File header */}
        {selectedFile && (
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <div className="flex items-center gap-2 min-w-0">
              {getFileIcon(files.find((f) => f.path === selectedFile)?.status || 'modified')}
              <span className="text-sm font-mono text-white/80 truncate">
                {selectedFile}
              </span>
            </div>
            <button
              onClick={() => {
                onFileApprove(selectedFile);
              }}
              className={cn(
                'flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors',
                files.find((f) => f.path === selectedFile)?.approved
                  ? 'bg-emerald-500/20 text-emerald-400'
                  : 'bg-white/10 text-white hover:bg-white/15'
              )}
            >
              <Check className="h-4 w-4" />
              {files.find((f) => f.path === selectedFile)?.approved
                ? 'Approved'
                : 'Approve'}
            </button>
          </div>
        )}

        {/* Diff content */}
        <div className="flex-1 overflow-auto p-4">
          {loadingDiff ? (
            <div className="flex items-center justify-center h-full">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/10 border-t-white/50" />
            </div>
          ) : (
            <DiffView diff={diff} />
          )}
        </div>
      </div>

      {/* Summary - Right Panel (horizontal on mobile, vertical sidebar on desktop) */}
      <div className="w-full sm:w-56 sm:flex-shrink-0 flex flex-row sm:flex-col gap-3 sm:gap-4">
        {/* Progress card */}
        <div className="flex-1 sm:flex-none rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-4">
          <div className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">
            Review Progress
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-semibold text-white">
                {Math.round((approvedCount / totalCount) * 100)}%
              </span>
              <span className="text-sm text-white/50">
                {approvedCount} of {totalCount}
              </span>
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(approvedCount / totalCount) * 100}%` }}
                className="h-full bg-emerald-500 rounded-full"
              />
            </div>
          </div>
        </div>

        {/* Stats card */}
        <div className="flex-1 sm:flex-none rounded-xl bg-white/[0.03] ring-1 ring-white/10 p-4">
          <div className="text-xs font-medium text-white/50 uppercase tracking-wider mb-3">
            Changes
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Added</span>
              <span className="text-sm text-emerald-400 font-mono">
                +{files.reduce((sum, f) => sum + (f.insertions || 0), 0)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-white/60">Removed</span>
              <span className="text-sm text-red-400 font-mono">
                -{files.reduce((sum, f) => sum + (f.deletions || 0), 0)}
              </span>
            </div>
          </div>
        </div>

        {/* Security warnings */}
        {files.some((f) =>
          ['auth', 'secret', '.env', 'password', 'token', 'key'].some((s) =>
            f.path.toLowerCase().includes(s)
          )
        ) && (
          <div className="rounded-xl bg-amber-500/10 ring-1 ring-amber-500/20 p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <div>
                <div className="text-sm font-medium text-amber-400">
                  Security Review
                </div>
                <p className="text-xs text-amber-400/70 mt-1">
                  Some files may contain sensitive code. Review carefully.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Simple diff viewer component
function DiffView({ diff }: { diff: string }) {
  const lines = diff.split('\n');

  return (
    <div className="font-mono text-xs leading-relaxed">
      {lines.map((line, i) => {
        let bgClass = '';
        let textClass = 'text-white/60';

        if (line.startsWith('+') && !line.startsWith('+++')) {
          bgClass = 'bg-emerald-500/10';
          textClass = 'text-emerald-400';
        } else if (line.startsWith('-') && !line.startsWith('---')) {
          bgClass = 'bg-red-500/10';
          textClass = 'text-red-400';
        } else if (line.startsWith('@@')) {
          textClass = 'text-blue-400';
        } else if (line.startsWith('diff') || line.startsWith('index')) {
          textClass = 'text-white/30';
        }

        return (
          <div
            key={i}
            className={cn('px-2 py-0.5 whitespace-pre-wrap break-all', bgClass, textClass)}
          >
            {line || ' '}
          </div>
        );
      })}
    </div>
  );
}
