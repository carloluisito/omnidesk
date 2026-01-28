import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

export interface ReviewFile {
  path: string;
  status: 'modified' | 'created' | 'deleted';
  approved: boolean;
}

interface ReviewFileListProps {
  files: ReviewFile[];
  selectedPath?: string;
  onSelectFile: (path: string) => void;
  onToggleApproval: (path: string) => void;
}

// Get status dot color
function getStatusDotColor(status: ReviewFile['status']) {
  switch (status) {
    case 'created':
      return 'bg-green-400';
    case 'deleted':
      return 'bg-red-400';
    case 'modified':
    default:
      return 'bg-yellow-400';
  }
}

export function ReviewFileList({
  files,
  selectedPath,
  onSelectFile,
  onToggleApproval,
}: ReviewFileListProps) {
  return (
    <div className="space-y-0.5">
      {files.map((file) => {
        const isSelected = selectedPath === file.path;
        return (
          <div
            key={file.path}
            onClick={() => onSelectFile(file.path)}
            className={cn(
              'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition cursor-pointer group',
              isSelected && 'bg-white/10 border-l-2 border-blue-400 rounded-l-none pl-2',
              !isSelected && 'hover:bg-white/5',
              file.approved && !isSelected && 'bg-green-500/5'
            )}
          >
            {/* Status dot */}
            <div className={cn('w-2 h-2 rounded-full flex-shrink-0', getStatusDotColor(file.status))} />

            {/* File path */}
            <span className="min-w-0 truncate flex-1 font-mono text-xs text-white/80">
              {file.path}
            </span>

            {/* Approval indicator / button */}
            <button
              onClick={(e) => {
                e.stopPropagation();
                onToggleApproval(file.path);
              }}
              className={cn(
                'flex items-center gap-1 rounded-md px-2 py-1 text-xs transition flex-shrink-0',
                file.approved
                  ? 'bg-green-600/20 text-green-400 hover:bg-green-600/30'
                  : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white/60 opacity-0 group-hover:opacity-100'
              )}
              title={file.approved ? 'Click to unapprove' : 'Click to approve'}
            >
              <Check className="h-3 w-3" />
              {file.approved && <span>Approved</span>}
            </button>
          </div>
        );
      })}
      {files.length === 0 && (
        <div className="text-center text-sm text-white/50 py-8">
          No files changed
        </div>
      )}
    </div>
  );
}
