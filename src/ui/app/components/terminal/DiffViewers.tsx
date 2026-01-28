import { FileDiff, FileCode, AlignJustify, Columns, X } from 'lucide-react';
import { cn } from '../../lib/cn';

// Parse diff into structured format for side-by-side view
interface DiffHunk {
  oldStart: number;
  newStart: number;
  lines: Array<{
    type: 'context' | 'addition' | 'deletion';
    content: string;
    oldLineNum?: number;
    newLineNum?: number;
  }>;
}

export function parseDiff(diff: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  const lines = diff.split('\n');
  let currentHunk: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    const hunkMatch = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunkMatch) {
      if (currentHunk) hunks.push(currentHunk);
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      currentHunk = { oldStart: oldLine, newStart: newLine, lines: [] };
      continue;
    }

    if (!currentHunk) continue;

    if (
      line.startsWith('diff ') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++')
    ) {
      continue;
    }

    if (line.startsWith('+')) {
      currentHunk.lines.push({
        type: 'addition',
        content: line.slice(1),
        newLineNum: newLine++,
      });
    } else if (line.startsWith('-')) {
      currentHunk.lines.push({
        type: 'deletion',
        content: line.slice(1),
        oldLineNum: oldLine++,
      });
    } else if (line.startsWith(' ') || line === '') {
      currentHunk.lines.push({
        type: 'context',
        content: line.slice(1) || '',
        oldLineNum: oldLine++,
        newLineNum: newLine++,
      });
    }
  }

  if (currentHunk) hunks.push(currentHunk);
  return hunks;
}

// Inline Diff Viewer
interface InlineDiffViewerProps {
  diff: string;
}

export function InlineDiffViewer({ diff }: InlineDiffViewerProps) {
  if (!diff) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 text-sm p-4">
        <FileDiff className="h-8 w-8 mb-2 opacity-50" />
        <p>No changes</p>
      </div>
    );
  }

  const lines = diff.split('\n');

  return (
    <div className="overflow-auto font-mono text-xs">
      {lines.map((line, i) => {
        const isAddition = line.startsWith('+') && !line.startsWith('+++');
        const isDeletion = line.startsWith('-') && !line.startsWith('---');
        const isHeader = line.startsWith('@@');
        const isMeta =
          line.startsWith('diff ') ||
          line.startsWith('index ') ||
          line.startsWith('---') ||
          line.startsWith('+++');

        if (isMeta) return null;

        return (
          <div
            key={i}
            className={cn(
              'px-3 py-0.5 flex',
              isAddition && 'bg-white/[0.08]',
              isDeletion && 'bg-black/[0.15]',
              isHeader && 'bg-white/5 text-white/50 mt-2'
            )}
          >
            <span
              className={cn(
                'w-5 flex-shrink-0 text-right mr-3 select-none',
                isAddition && 'text-emerald-400',
                isDeletion && 'text-red-400',
                !isAddition && !isDeletion && !isHeader && 'text-white/40'
              )}
            >
              {isAddition && '+'}
              {isDeletion && '-'}
              {!isAddition && !isDeletion && !isHeader && ' '}
            </span>
            <span
              className={cn(
                'flex-1',
                isAddition && 'text-emerald-400',
                isDeletion && 'text-red-400',
                !isAddition && !isDeletion && !isHeader && 'text-white/70'
              )}
            >
              {isHeader ? line : line.slice(1) || ' '}
            </span>
          </div>
        );
      })}
    </div>
  );
}

// Side-by-Side Diff Viewer
interface SideBySideDiffViewerProps {
  diff: string;
}

export function SideBySideDiffViewer({ diff }: SideBySideDiffViewerProps) {
  if (!diff) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 text-sm p-4">
        <FileDiff className="h-8 w-8 mb-2 opacity-50" />
        <p>No changes</p>
      </div>
    );
  }

  const hunks = parseDiff(diff);

  // Build paired lines for side-by-side display
  const pairs: Array<{
    left: { lineNum?: number; content: string; type: 'context' | 'deletion' | 'empty' };
    right: { lineNum?: number; content: string; type: 'context' | 'addition' | 'empty' };
  }> = [];

  for (const hunk of hunks) {
    pairs.push({
      left: { content: `@@ -${hunk.oldStart}`, type: 'context' },
      right: { content: `@@ +${hunk.newStart}`, type: 'context' },
    });

    let i = 0;
    while (i < hunk.lines.length) {
      const line = hunk.lines[i];

      if (line.type === 'context') {
        pairs.push({
          left: { lineNum: line.oldLineNum, content: line.content, type: 'context' },
          right: { lineNum: line.newLineNum, content: line.content, type: 'context' },
        });
        i++;
      } else if (line.type === 'deletion') {
        const nextAddition =
          hunk.lines[i + 1]?.type === 'addition' ? hunk.lines[i + 1] : null;
        if (nextAddition) {
          pairs.push({
            left: { lineNum: line.oldLineNum, content: line.content, type: 'deletion' },
            right: {
              lineNum: nextAddition.newLineNum,
              content: nextAddition.content,
              type: 'addition',
            },
          });
          i += 2;
        } else {
          pairs.push({
            left: { lineNum: line.oldLineNum, content: line.content, type: 'deletion' },
            right: { content: '', type: 'empty' },
          });
          i++;
        }
      } else if (line.type === 'addition') {
        pairs.push({
          left: { content: '', type: 'empty' },
          right: { lineNum: line.newLineNum, content: line.content, type: 'addition' },
        });
        i++;
      } else {
        i++;
      }
    }
  }

  return (
    <div className="overflow-auto font-mono text-xs">
      <div className="min-w-[800px]">
        {pairs.map((pair, i) => (
          <div key={i} className="flex">
            {/* Left side (old) */}
            <div
              className={cn(
                'w-1/2 flex border-r border-white/10',
                pair.left.type === 'deletion' && 'bg-black/[0.15]',
                pair.left.type === 'empty' && 'bg-black/10'
              )}
            >
              <span className="w-10 px-2 text-right text-white/40 select-none border-r border-white/10 flex-shrink-0">
                {pair.left.lineNum}
              </span>
              <span
                className={cn(
                  'flex-1 px-2 py-0.5',
                  pair.left.type === 'deletion' && 'text-red-400',
                  pair.left.type === 'context' && 'text-white/70'
                )}
              >
                {pair.left.content || ' '}
              </span>
            </div>
            {/* Right side (new) */}
            <div
              className={cn(
                'w-1/2 flex',
                pair.right.type === 'addition' && 'bg-white/[0.08]',
                pair.right.type === 'empty' && 'bg-black/10'
              )}
            >
              <span className="w-10 px-2 text-right text-white/40 select-none border-r border-white/10 flex-shrink-0">
                {pair.right.lineNum}
              </span>
              <span
                className={cn(
                  'flex-1 px-2 py-0.5',
                  pair.right.type === 'addition' && 'text-emerald-400',
                  pair.right.type === 'context' && 'text-white/70'
                )}
              >
                {pair.right.content || ' '}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Fullscreen Diff Modal
interface FullscreenDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  diff: string;
  fileName: string;
  viewMode: 'inline' | 'side-by-side';
  onViewModeChange: (mode: 'inline' | 'side-by-side') => void;
  onViewFullFile: () => void;
}

export function FullscreenDiffModal({
  isOpen,
  onClose,
  diff,
  fileName,
  viewMode,
  onViewModeChange,
  onViewFullFile,
}: FullscreenDiffModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-[#05070c]">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
        <div className="flex items-center gap-3">
          <FileDiff className="h-5 w-5 text-white/60" />
          <span className="font-mono text-sm text-white">{fileName}</span>
        </div>
        <div className="flex items-center gap-2">
          {/* View mode toggle */}
          <div className="flex items-center rounded-2xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
            <button
              onClick={() => onViewModeChange('inline')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs',
                viewMode === 'inline'
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:text-white'
              )}
            >
              <AlignJustify className="h-3.5 w-3.5" />
              Inline
            </button>
            <button
              onClick={() => onViewModeChange('side-by-side')}
              className={cn(
                'flex items-center gap-1.5 px-3 py-1.5 text-xs',
                viewMode === 'side-by-side'
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:text-white'
              )}
            >
              <Columns className="h-3.5 w-3.5" />
              Side by Side
            </button>
          </div>
          <button
            onClick={onViewFullFile}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-2xl bg-white/5 ring-1 ring-white/10 text-white/60 hover:text-white hover:bg-white/10"
          >
            <FileCode className="h-3.5 w-3.5" />
            View Full File
          </button>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-2xl hover:bg-white/10 text-white/60"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto bg-white/5 m-4 rounded-3xl ring-1 ring-white/10">
        {viewMode === 'inline' ? (
          <InlineDiffViewer diff={diff} />
        ) : (
          <SideBySideDiffViewer diff={diff} />
        )}
      </div>

      {/* Footer hint */}
      <div className="border-t border-white/10 px-4 py-3 text-center">
        <span className="text-xs text-white/50">
          Press <kbd className="px-2 py-1 rounded-lg bg-white/10 text-white/60 ring-1 ring-white/10">Esc</kbd> to
          close
        </span>
      </div>
    </div>
  );
}
