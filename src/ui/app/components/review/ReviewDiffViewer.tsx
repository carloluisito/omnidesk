import { Undo2, Eye, Loader2, Check } from 'lucide-react';
import { cn } from '../../lib/cn';

interface ReviewDiffViewerProps {
  filePath: string;
  status: 'modified' | 'created' | 'deleted';
  diffLines: string[];
  fileContent?: string[];
  isLoading?: boolean;
  isApproved?: boolean;
  onApprove?: () => void;
  onRevert?: () => void;
  onViewFull?: () => void;
}

export function ReviewDiffViewer({
  filePath,
  status,
  diffLines,
  fileContent = [],
  isLoading = false,
  isApproved = false,
  onApprove,
  onRevert,
  onViewFull,
}: ReviewDiffViewerProps) {
  if (isLoading) {
    return (
      <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10 flex items-center justify-center min-h-[300px]">
        <Loader2 className="h-6 w-6 animate-spin text-white/50" />
      </div>
    );
  }

  // For created files with no diff, show file content as additions
  const showAsNewFile = status === 'created' && diffLines.length === 0 && fileContent.length > 0;
  // For deleted files with no diff, show file content as deletions
  const showAsDeletedFile = status === 'deleted' && diffLines.length === 0 && fileContent.length > 0;

  return (
    <div className={cn(
      'rounded-3xl bg-white/5 p-4 ring-1 ring-white/10',
      isApproved && 'ring-2 ring-green-500/30'
    )}>
      {/* Header with approve button */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="text-sm font-semibold text-white truncate">
            {filePath}
          </div>
          <span
            className={cn(
              'rounded-full bg-white/5 px-2.5 py-1 text-xs ring-1 ring-white/10 flex-shrink-0',
              status === 'created' && 'text-green-400',
              status === 'deleted' && 'text-red-400',
              status === 'modified' && 'text-white/60'
            )}
          >
            {status}
          </span>
        </div>

        {/* Approve button - prominent placement */}
        {onApprove && (
          <button
            onClick={onApprove}
            className={cn(
              'inline-flex items-center gap-2 rounded-xl px-4 py-2 text-sm font-medium transition-all flex-shrink-0',
              isApproved
                ? 'bg-green-600 text-white'
                : 'bg-blue-600 hover:bg-blue-700 text-white'
            )}
          >
            <Check className="h-4 w-4" />
            {isApproved ? 'Approved' : 'Approve'}
          </button>
        )}
      </div>

      {/* Diff content */}
      <div className="mt-3 space-y-0.5 font-mono text-xs max-h-[400px] overflow-y-auto rounded-xl bg-black/20 p-2">
        {showAsNewFile ? (
          // Show entire file content as additions for new files
          fileContent.map((line, i) => (
            <div
              key={i}
              className="rounded px-3 py-0.5 bg-white/[0.08] text-emerald-400 flex"
            >
              <span className="w-10 text-right mr-3 text-white/30 select-none">{i + 1}</span>
              <span className="text-emerald-400 mr-2">+</span>
              <span className="flex-1">{line || ' '}</span>
            </div>
          ))
        ) : showAsDeletedFile ? (
          // Show entire file content as deletions for deleted files
          fileContent.map((line, i) => (
            <div
              key={i}
              className="rounded px-3 py-0.5 bg-black/[0.15] text-red-400 flex"
            >
              <span className="w-10 text-right mr-3 text-white/30 select-none">{i + 1}</span>
              <span className="text-red-400 mr-2">-</span>
              <span className="flex-1">{line || ' '}</span>
            </div>
          ))
        ) : diffLines.length === 0 ? (
          <div className="text-white/40 text-center py-8">
            {status === 'created' ? 'New file (content loading...)' : 'No changes to display'}
          </div>
        ) : (
          diffLines.map((line, i) => {
            const isAddition = line.startsWith('+') && !line.startsWith('+++');
            const isDeletion = line.startsWith('-') && !line.startsWith('---');
            const isHeader = line.startsWith('@@');
            const isMeta = line.startsWith('diff ') || line.startsWith('index ') || line.startsWith('---') || line.startsWith('+++');

            if (isMeta) return null;

            return (
              <div
                key={i}
                className={cn(
                  'rounded px-3 py-0.5',
                  isAddition && 'bg-white/[0.08] text-emerald-400',
                  isDeletion && 'bg-black/[0.15] text-red-400',
                  isHeader && 'bg-white/5 text-white/50 mt-2',
                  !isAddition && !isDeletion && !isHeader && 'text-white/70'
                )}
              >
                {line}
              </div>
            );
          })
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex items-center gap-2">
        {onRevert && (
          <button
            onClick={onRevert}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-xs text-white ring-1 ring-white/10 hover:bg-white/10"
          >
            <Undo2 className="h-4 w-4" />
            Revert file
          </button>
        )}
        {onViewFull && (
          <button
            onClick={onViewFull}
            className="inline-flex items-center gap-2 rounded-2xl bg-white/5 px-3 py-2 text-xs text-white ring-1 ring-white/10 hover:bg-white/10"
          >
            <Eye className="h-4 w-4" />
            View full file
          </button>
        )}
      </div>
    </div>
  );
}
