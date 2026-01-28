/**
 * FileItem - Individual changed file row (GitHub-style)
 *
 * Displays a single file in the changes list with:
 * - Status dot: 8x8px colored circle (green/yellow/red/blue)
 * - Full file path in natural directory/filename order
 * - Insertion/deletion counts
 *
 * Supports click handling for viewing file diffs and
 * selection state for highlighting the active file.
 */
import { ArrowRight } from 'lucide-react';
import { cn } from '../../../../lib/cn';

export interface FileItemProps {
  path: string;
  status: 'added' | 'modified' | 'deleted' | 'renamed' | 'created';
  insertions?: number;
  deletions?: number;
  oldPath?: string;
  onClick?: () => void;
  isSelected?: boolean;
}

export function FileItem({
  path,
  status,
  insertions = 0,
  deletions = 0,
  oldPath,
  onClick,
  isSelected = false,
}: FileItemProps) {
  const getStatusDotColor = () => {
    switch (status) {
      case 'added':
      case 'created':
        return 'bg-green-400';
      case 'deleted':
        return 'bg-red-400';
      case 'renamed':
        return 'bg-blue-400';
      case 'modified':
      default:
        return 'bg-yellow-400';
    }
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-left transition-colors',
        'bg-transparent',
        onClick && 'hover:bg-white/5 cursor-pointer',
        isSelected && 'bg-white/10 border-l-2 border-blue-400 rounded-l-none pl-2'
      )}
    >
      {/* Status dot */}
      <div className={cn('w-2 h-2 rounded-full flex-shrink-0', getStatusDotColor())} />

      {/* File path - full path in natural order */}
      <div className="flex-1 min-w-0 font-mono text-xs">
        {oldPath ? (
          <div className="flex items-center gap-1.5">
            <span className="text-white/50 truncate">{oldPath}</span>
            <ArrowRight className="h-3 w-3 text-white/30 flex-shrink-0" />
            <span className="text-white/80 truncate">{path}</span>
          </div>
        ) : (
          <span className="text-white/80 truncate block">{path}</span>
        )}
      </div>

      {/* Stats */}
      {(insertions > 0 || deletions > 0) && (
        <div className="flex items-center gap-1.5 text-xs flex-shrink-0">
          {insertions > 0 && <span className="text-green-400">+{insertions}</span>}
          {deletions > 0 && <span className="text-red-400">-{deletions}</span>}
        </div>
      )}
    </button>
  );
}
