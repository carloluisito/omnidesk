/**
 * Unified diff parser — converts raw `git diff` output into structured chunks
 * with proper old/new line numbering.
 */

export interface DiffLine {
  type: 'add' | 'remove' | 'context';
  content: string;
  oldLineNum: number | null;
  newLineNum: number | null;
}

export interface DiffChunk {
  header: string;
  oldStart: number;
  newStart: number;
  lines: DiffLine[];
}

/**
 * Parse a unified diff string into structured DiffChunk[].
 * Handles `@@` hunk headers, +/- prefixed lines, and context lines.
 * Skips file header lines (`---`, `+++`, `diff --git`, `index`).
 */
export function parseDiff(rawDiff: string): DiffChunk[] {
  if (!rawDiff.trim()) return [];

  const lines = rawDiff.split('\n');
  const chunks: DiffChunk[] = [];
  let currentChunk: DiffChunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const line of lines) {
    // Skip file headers
    if (
      line.startsWith('diff --git') ||
      line.startsWith('index ') ||
      line.startsWith('---') ||
      line.startsWith('+++') ||
      line.startsWith('new file mode') ||
      line.startsWith('deleted file mode') ||
      line.startsWith('old mode') ||
      line.startsWith('new mode') ||
      line.startsWith('similarity index') ||
      line.startsWith('rename from') ||
      line.startsWith('rename to') ||
      line.startsWith('Binary files')
    ) {
      continue;
    }

    // Chunk header: @@ -oldStart,oldCount +newStart,newCount @@ optional context
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@(.*)/);
    if (hunkMatch) {
      oldLine = parseInt(hunkMatch[1], 10);
      newLine = parseInt(hunkMatch[2], 10);
      currentChunk = {
        header: line,
        oldStart: oldLine,
        newStart: newLine,
        lines: [],
      };
      chunks.push(currentChunk);
      continue;
    }

    if (!currentChunk) continue;

    // "\ No newline at end of file" marker — skip
    if (line.startsWith('\\ No newline')) continue;

    if (line.startsWith('+')) {
      currentChunk.lines.push({
        type: 'add',
        content: line.slice(1),
        oldLineNum: null,
        newLineNum: newLine++,
      });
    } else if (line.startsWith('-')) {
      currentChunk.lines.push({
        type: 'remove',
        content: line.slice(1),
        oldLineNum: oldLine++,
        newLineNum: null,
      });
    } else {
      // Context line (starts with space or is empty)
      currentChunk.lines.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldLineNum: oldLine++,
        newLineNum: newLine++,
      });
    }
  }

  return chunks;
}

/**
 * Convert raw file content into a diff-like format where every line is an addition.
 * Used for displaying untracked files.
 */
export function fileContentToDiff(content: string): DiffChunk[] {
  if (!content) return [];

  const lines = content.split('\n');
  // Remove trailing empty line from split
  if (lines.length > 0 && lines[lines.length - 1] === '') {
    lines.pop();
  }

  return [{
    header: `@@ -0,0 +1,${lines.length} @@ (new file)`,
    oldStart: 0,
    newStart: 1,
    lines: lines.map((line, i) => ({
      type: 'add' as const,
      content: line,
      oldLineNum: null,
      newLineNum: i + 1,
    })),
  }];
}
