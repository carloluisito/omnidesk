/**
 * FileList - Expandable list of changed files
 *
 * Displays a scrollable list of changed files with:
 * - Configurable max visible count (default: 5)
 * - Expand/collapse toggle for additional files
 * - "View all diffs" link for full diff view
 * - Smooth animation for expansion
 * - Auto-collapse when file count drops below threshold
 *
 * Uses FileItem components for individual file rows.
 * Supports file click handling for viewing individual diffs.
 */
import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { FileItem, FileItemProps } from './FileItem';

interface FileListProps {
  files: Array<Omit<FileItemProps, 'onClick' | 'isSelected'>>;
  onFileClick?: (path: string) => void;
  maxVisible?: number;
  selectedPath?: string | null;
  onViewAllDiffs?: () => void;
}

export function FileList({
  files,
  onFileClick,
  maxVisible = 5,
  selectedPath = null,
  onViewAllDiffs,
}: FileListProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const hiddenCount = Math.max(0, files.length - maxVisible);
  const showExpansionToggle = files.length > maxVisible;
  const visibleFiles = isExpanded ? files : files.slice(0, maxVisible);

  // Auto-collapse when files reduce to maxVisible or fewer
  useEffect(() => {
    if (files.length <= maxVisible) {
      setIsExpanded(false);
    }
  }, [files.length, maxVisible]);

  const toggleLabel = isExpanded ? 'Show less' : `Show ${hiddenCount} more`;

  if (files.length === 0) {
    return (
      <div className="text-xs text-white/55 py-4 text-center">
        No changes yet
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      {/* File list header */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-medium text-white/55">
          {files.length} file{files.length !== 1 ? 's' : ''} changed
        </span>
        {onViewAllDiffs && files.length > 0 && (
          <button
            onClick={onViewAllDiffs}
            className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </button>
        )}
      </div>

      {/* File list */}
      <AnimatePresence initial={false}>
        <motion.div
          key="file-list"
          initial={false}
          animate={{ height: 'auto' }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="space-y-0.5"
        >
          {visibleFiles.map((file) => (
            <FileItem
              key={file.path}
              {...file}
              onClick={onFileClick ? () => onFileClick(file.path) : undefined}
              isSelected={selectedPath === file.path}
            />
          ))}
        </motion.div>
      </AnimatePresence>

      {/* Expand/collapse toggle */}
      {showExpansionToggle && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-1.5 w-full justify-center py-2 text-xs text-white/50 hover:text-white/70 transition-colors"
        >
          <motion.span
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
          >
            <ChevronDown className="h-4 w-4" />
          </motion.span>
          {toggleLabel}
        </button>
      )}
    </div>
  );
}
