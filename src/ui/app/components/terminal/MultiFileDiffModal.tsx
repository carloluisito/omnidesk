import { useState, useEffect, useCallback } from 'react';
import { X, FileDiff, Columns, AlignJustify, ChevronUp, ChevronDown, Loader2 } from 'lucide-react';
import { cn } from '../../lib/cn';
import { FileChange } from '../../store/terminalStore';
import { api } from '../../lib/api';

interface MultiFileDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  fileChanges: FileChange[];
  sessionId: string;
  initialFile?: string;
}

// Get dot color for each operation type
function getOperationDotColor(operation: FileChange['operation']) {
  switch (operation) {
    case 'created':
      return 'bg-green-400';
    case 'modified':
      return 'bg-yellow-400';
    case 'deleted':
      return 'bg-red-400';
  }
}

// Parse unified diff into structured hunks for rendering
interface DiffLine {
  type: 'context' | 'added' | 'removed' | 'header';
  content: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function parseDiff(diff: string): DiffLine[] {
  if (!diff) return [];

  const lines = diff.split('\n');
  const result: DiffLine[] = [];
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    if (line.startsWith('@@')) {
      // Hunk header - parse line numbers
      const match = line.match(/@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldLineNum = parseInt(match[1], 10);
        newLineNum = parseInt(match[2], 10);
      }
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('---') || line.startsWith('+++') || line.startsWith('diff ') || line.startsWith('index ')) {
      result.push({ type: 'header', content: line });
    } else if (line.startsWith('-')) {
      result.push({ type: 'removed', content: line.substring(1), oldLineNum: oldLineNum++ });
    } else if (line.startsWith('+')) {
      result.push({ type: 'added', content: line.substring(1), newLineNum: newLineNum++ });
    } else if (line.startsWith(' ')) {
      result.push({ type: 'context', content: line.substring(1), oldLineNum: oldLineNum++, newLineNum: newLineNum++ });
    } else if (line === '') {
      result.push({ type: 'context', content: '', oldLineNum: oldLineNum++, newLineNum: newLineNum++ });
    }
  }

  return result;
}

// Inline diff viewer component
function InlineDiffViewer({ diff }: { diff: string }) {
  const lines = parseDiff(diff);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 text-sm p-4">
        <FileDiff className="h-8 w-8 mb-2 opacity-50" />
        <p>No changes</p>
      </div>
    );
  }

  return (
    <div className="font-mono text-xs overflow-auto h-full">
      {lines.map((line, i) => (
        <div
          key={i}
          className={cn(
            'flex',
            line.type === 'added' && 'bg-white/[0.08]',
            line.type === 'removed' && 'bg-black/[0.15]',
            line.type === 'header' && 'bg-white/5 text-white/50'
          )}
        >
          {line.type !== 'header' && (
            <>
              <span className="w-12 text-right pr-2 text-white/40 select-none shrink-0 border-r border-white/10">
                {line.oldLineNum ?? ''}
              </span>
              <span className="w-12 text-right pr-2 text-white/40 select-none shrink-0 border-r border-white/10">
                {line.newLineNum ?? ''}
              </span>
            </>
          )}
          <span
            className={cn(
              'px-2 whitespace-pre flex-1',
              line.type === 'added' && 'text-emerald-400',
              line.type === 'removed' && 'text-red-400',
              line.type === 'context' && 'text-white/70'
            )}
          >
            {line.type === 'added' && '+'}
            {line.type === 'removed' && '-'}
            {line.type === 'context' && ' '}
            {line.content}
          </span>
        </div>
      ))}
    </div>
  );
}

// Side-by-side diff viewer component
function SideBySideDiffViewer({ diff }: { diff: string }) {
  const lines = parseDiff(diff);

  if (lines.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-white/50 text-sm p-4">
        <FileDiff className="h-8 w-8 mb-2 opacity-50" />
        <p>No changes</p>
      </div>
    );
  }

  // Group lines into old and new sides
  const leftLines: (DiffLine | null)[] = [];
  const rightLines: (DiffLine | null)[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (line.type === 'header') {
      leftLines.push(line);
      rightLines.push(line);
      i++;
    } else if (line.type === 'context') {
      leftLines.push(line);
      rightLines.push(line);
      i++;
    } else if (line.type === 'removed') {
      // Look ahead for corresponding added lines
      const removedStart = i;
      while (i < lines.length && lines[i].type === 'removed') i++;
      const addedStart = i;
      while (i < lines.length && lines[i].type === 'added') i++;

      const removedLines = lines.slice(removedStart, addedStart);
      const addedLines = lines.slice(addedStart, i);
      const maxLen = Math.max(removedLines.length, addedLines.length);

      for (let j = 0; j < maxLen; j++) {
        leftLines.push(removedLines[j] || null);
        rightLines.push(addedLines[j] || null);
      }
    } else if (line.type === 'added') {
      leftLines.push(null);
      rightLines.push(line);
      i++;
    }
  }

  return (
    <div className="font-mono text-xs overflow-auto h-full flex">
      {/* Left side (old) */}
      <div className="flex-1 border-r border-white/10 overflow-auto">
        {leftLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'flex h-5',
              line?.type === 'removed' && 'bg-black/[0.15]',
              line?.type === 'header' && 'bg-white/5 text-white/50',
              !line && 'bg-black/10'
            )}
          >
            <span className="w-12 text-right pr-2 text-white/40 select-none shrink-0 border-r border-white/10">
              {line?.oldLineNum ?? ''}
            </span>
            <span
              className={cn(
                'px-2 whitespace-pre flex-1',
                line?.type === 'removed' && 'text-red-400',
                line?.type === 'context' && 'text-white/70'
              )}
            >
              {line?.content ?? ''}
            </span>
          </div>
        ))}
      </div>
      {/* Right side (new) */}
      <div className="flex-1 overflow-auto">
        {rightLines.map((line, i) => (
          <div
            key={i}
            className={cn(
              'flex h-5',
              line?.type === 'added' && 'bg-white/[0.08]',
              line?.type === 'header' && 'bg-white/5 text-white/50',
              !line && 'bg-black/10'
            )}
          >
            <span className="w-12 text-right pr-2 text-white/40 select-none shrink-0 border-r border-white/10">
              {line?.newLineNum ?? ''}
            </span>
            <span
              className={cn(
                'px-2 whitespace-pre flex-1',
                line?.type === 'added' && 'text-emerald-400',
                line?.type === 'context' && 'text-white/70'
              )}
            >
              {line?.content ?? ''}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function MultiFileDiffModal({
  isOpen,
  onClose,
  fileChanges,
  sessionId,
  initialFile,
}: MultiFileDiffModalProps) {
  const [selectedFile, setSelectedFile] = useState<string | null>(initialFile || null);
  const [viewMode, setViewMode] = useState<'inline' | 'side-by-side'>('inline');
  const [diff, setDiff] = useState<string>('');
  const [loading, setLoading] = useState(false);

  // Get current file index
  const currentIndex = selectedFile ? fileChanges.findIndex((fc) => fc.filePath === selectedFile) : -1;

  // Load diff for selected file
  const loadDiff = useCallback(async (filePath: string) => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const result = await api<{ diff: string }>('POST', `/terminal/sessions/${sessionId}/file-diff`, {
        filePath,
        staged: false,
      });
      setDiff(result.diff);
    } catch (error) {
      console.error('Failed to load diff:', error);
      setDiff('');
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Select first file on open or when initialFile changes
  useEffect(() => {
    if (isOpen && fileChanges.length > 0) {
      const file = initialFile || fileChanges[0].filePath;
      setSelectedFile(file);
      loadDiff(file);
    }
  }, [isOpen, initialFile, fileChanges, loadDiff]);

  // Handle file selection
  const handleSelectFile = (filePath: string) => {
    setSelectedFile(filePath);
    loadDiff(filePath);
  };

  // Navigate between files
  const goToPrevFile = () => {
    if (currentIndex > 0) {
      const prev = fileChanges[currentIndex - 1];
      handleSelectFile(prev.filePath);
    }
  };

  const goToNextFile = () => {
    if (currentIndex < fileChanges.length - 1) {
      const next = fileChanges[currentIndex + 1];
      handleSelectFile(next.filePath);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      } else if (e.key === 'ArrowUp' || e.key === 'k') {
        e.preventDefault();
        goToPrevFile();
      } else if (e.key === 'ArrowDown' || e.key === 'j') {
        e.preventDefault();
        goToNextFile();
      } else if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        setViewMode('inline');
      } else if (e.key === 's' || e.key === 'S') {
        e.preventDefault();
        setViewMode('side-by-side');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, currentIndex, fileChanges.length]);

  if (!isOpen) return null;

  const selectedChange = fileChanges.find((fc) => fc.filePath === selectedFile);

  return (
    <div className="fixed inset-0 z-50 flex bg-[#05070c]">
      {/* File sidebar */}
      <div className="w-72 bg-white/5 ring-1 ring-white/10 flex flex-col m-4 rounded-3xl">
        <div className="p-4 border-b border-white/10">
          <h3 className="text-sm font-semibold text-white">Changed Files</h3>
          <p className="text-xs text-white/55 mt-0.5">
            {fileChanges.length} file{fileChanges.length === 1 ? '' : 's'}
          </p>
        </div>
        <div className="flex-1 overflow-auto p-2">
          {fileChanges.map((change) => {
            const dotColor = getOperationDotColor(change.operation);
            const isSelected = change.filePath === selectedFile;
            return (
              <button
                key={change.id}
                onClick={() => handleSelectFile(change.filePath)}
                className={cn(
                  'flex items-center gap-2.5 w-full text-left px-3 py-2 text-xs transition-colors rounded-lg mb-0.5',
                  isSelected
                    ? 'bg-white/10 text-white border-l-2 border-blue-400 rounded-l-none pl-2.5'
                    : 'text-white/70 hover:bg-white/5'
                )}
              >
                <span className={cn('w-2 h-2 rounded-full flex-shrink-0', dotColor)} />
                <span className="font-mono truncate flex-1" title={change.filePath}>
                  {change.filePath}
                </span>
              </button>
            );
          })}
        </div>
        {/* Navigation buttons */}
        <div className="p-2 border-t border-white/10 flex gap-1">
          <button
            onClick={goToPrevFile}
            disabled={currentIndex <= 0}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2 rounded-2xl text-xs ring-1 ring-white/10',
              currentIndex <= 0
                ? 'text-white/30 cursor-not-allowed'
                : 'text-white/60 hover:bg-white/10'
            )}
          >
            <ChevronUp className="h-3 w-3" />
            Prev
          </button>
          <button
            onClick={goToNextFile}
            disabled={currentIndex >= fileChanges.length - 1}
            className={cn(
              'flex-1 flex items-center justify-center gap-1 py-2 rounded-2xl text-xs ring-1 ring-white/10',
              currentIndex >= fileChanges.length - 1
                ? 'text-white/30 cursor-not-allowed'
                : 'text-white/60 hover:bg-white/10'
            )}
          >
            Next
            <ChevronDown className="h-3 w-3" />
          </button>
        </div>
      </div>

      {/* Main content area */}
      <div className="flex-1 flex flex-col my-4 mr-4">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div className="flex items-center gap-3">
            <FileDiff className="h-5 w-5 text-white/60" />
            {selectedChange && (
              <>
                <span className="font-mono text-sm text-white">{selectedChange.fileName}</span>
                <span
                  className={cn(
                    'text-xs px-2 py-1 rounded-lg',
                    selectedChange.operation === 'created' && 'bg-green-500/20 text-green-400',
                    selectedChange.operation === 'modified' && 'bg-yellow-500/20 text-yellow-400',
                    selectedChange.operation === 'deleted' && 'bg-red-500/20 text-red-400'
                  )}
                >
                  {selectedChange.operation}
                </span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* View mode toggle */}
            <div className="flex items-center rounded-2xl bg-white/5 ring-1 ring-white/10 overflow-hidden">
              <button
                onClick={() => setViewMode('inline')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs',
                  viewMode === 'inline' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
                )}
              >
                <AlignJustify className="h-3.5 w-3.5" />
                Inline
              </button>
              <button
                onClick={() => setViewMode('side-by-side')}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 text-xs',
                  viewMode === 'side-by-side' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
                )}
              >
                <Columns className="h-3.5 w-3.5" />
                Side by Side
              </button>
            </div>
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-2xl hover:bg-white/10 text-white/60"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Diff content */}
        <div className="flex-1 overflow-auto bg-white/5 rounded-3xl ring-1 ring-white/10">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <Loader2 className="h-6 w-6 animate-spin text-white/40" />
            </div>
          ) : viewMode === 'inline' ? (
            <InlineDiffViewer diff={diff} />
          ) : (
            <SideBySideDiffViewer diff={diff} />
          )}
        </div>

        {/* Footer hint */}
        <div className="border-t border-white/10 px-4 py-3 text-center">
          <span className="text-xs text-white/50">
            Press <kbd className="px-2 py-1 rounded-lg bg-white/10 text-white/60 ring-1 ring-white/10">Esc</kbd> to close
            {' • '}
            <kbd className="px-2 py-1 rounded-lg bg-white/10 text-white/60 ring-1 ring-white/10">↑</kbd>
            <kbd className="px-2 py-1 rounded-lg bg-white/10 text-white/60 ring-1 ring-white/10">↓</kbd> to navigate files
            {' • '}
            <kbd className="px-2 py-1 rounded-lg bg-white/10 text-white/60 ring-1 ring-white/10">I</kbd> inline
            <kbd className="px-2 py-1 rounded-lg bg-white/10 text-white/60 ring-1 ring-white/10">S</kbd> side-by-side
          </span>
        </div>
      </div>
    </div>
  );
}
