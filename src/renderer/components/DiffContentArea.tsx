import { useMemo } from 'react';
import type { GitFileEntry, GitDiffResult } from '../../shared/types/git-types';
import { parseDiff } from '../utils/diff-parser';
import type { DiffChunk, DiffLine } from '../utils/diff-parser';

interface DiffContentAreaProps {
  file: GitFileEntry | null;
  diff: GitDiffResult | null;
  isLoading: boolean;
}

export function DiffContentArea({ file, diff, isLoading }: DiffContentAreaProps) {
  const chunks = useMemo(() => {
    if (!diff?.diff) return [];
    return parseDiff(diff.diff);
  }, [diff]);

  // Loading state
  if (isLoading) {
    return (
      <div className="diff-content-area">
        <div className="diff-content-empty">
          <div className="diff-content-spinner" />
          <span>Loading diff...</span>
        </div>
      </div>
    );
  }

  // No file selected
  if (!file) {
    return (
      <div className="diff-content-area">
        <div className="diff-content-empty">
          <span style={{ color: '#565f89' }}>Select a file to view changes</span>
        </div>
      </div>
    );
  }

  // Empty diff
  if (!diff?.diff && !isLoading) {
    return (
      <div className="diff-content-area">
        <div className="diff-content-empty">
          <span style={{ color: '#565f89' }}>No changes to display</span>
        </div>
      </div>
    );
  }

  const isUntracked = file.area === 'untracked';
  const isDeleted = (file.area === 'staged' ? file.indexStatus : file.workTreeStatus) === 'deleted';

  return (
    <div className="diff-content-area">
      {/* New file / deleted file banner */}
      {isUntracked && (
        <div className="diff-content-banner diff-content-banner-new">
          New file — all lines shown as additions
        </div>
      )}
      {isDeleted && (
        <div className="diff-content-banner diff-content-banner-deleted">
          Deleted file — all lines shown as removals
        </div>
      )}

      {/* Truncation warning */}
      {diff?.isTruncated && (
        <div className="diff-content-banner diff-content-banner-truncated">
          Diff truncated — file is {Math.round((diff.totalSizeBytes || 0) / 1024)}KB (showing first 100KB)
        </div>
      )}

      {/* Diff chunks */}
      <div className="diff-content-lines">
        {chunks.map((chunk, ci) => (
          <ChunkView key={ci} chunk={chunk} />
        ))}
      </div>
    </div>
  );
}

function ChunkView({ chunk }: { chunk: DiffChunk }) {
  // Extract function context from header (text after @@...@@)
  const contextMatch = chunk.header.match(/@@[^@]+@@\s*(.*)/);
  const context = contextMatch?.[1] || '';

  return (
    <>
      <div className="diff-chunk-header">
        <span className="diff-chunk-gutter" />
        <span className="diff-chunk-gutter" />
        <span className="diff-chunk-text">
          @@ -{chunk.oldStart} +{chunk.newStart} @@{context ? ` ${context}` : ''}
        </span>
      </div>
      {chunk.lines.map((line, li) => (
        <LineView key={li} line={line} />
      ))}
    </>
  );
}

function LineView({ line }: { line: DiffLine }) {
  const classMap = {
    add: 'diff-line-add',
    remove: 'diff-line-remove',
    context: 'diff-line-context',
  };

  return (
    <div className={`diff-line ${classMap[line.type]}`}>
      <span className="diff-line-gutter diff-line-gutter-old">
        {line.oldLineNum ?? ''}
      </span>
      <span className="diff-line-gutter diff-line-gutter-new">
        {line.newLineNum ?? ''}
      </span>
      <span className="diff-line-prefix">
        {line.type === 'add' ? '+' : line.type === 'remove' ? '-' : ' '}
      </span>
      <span className="diff-line-content">{line.content}</span>
    </div>
  );
}
