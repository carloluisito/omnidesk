import * as fs from 'fs';
import * as path from 'path';
import { FileInfo, FileReadResult } from '../shared/ipc-types';
import {
  getFileCategory,
  isBinaryFile,
  getMimeType,
  isLocalFile,
  sanitizeFilePath,
} from './file-utils';

/**
 * Get file information for drag-dropped files
 */
export async function getFileInfo(filePaths: string[]): Promise<FileInfo[]> {
  const results: FileInfo[] = [];

  for (const filePath of filePaths) {
    try {
      // Security: validate local file
      if (!isLocalFile(filePath)) {
        console.warn('Rejecting non-local file:', filePath);
        continue;
      }

      const sanitizedPath = sanitizeFilePath(filePath);

      // Check if file exists
      if (!fs.existsSync(sanitizedPath)) {
        console.warn('File does not exist:', sanitizedPath);
        continue;
      }

      // Check if it's a file (not directory)
      const stats = fs.statSync(sanitizedPath);
      if (!stats.isFile()) {
        console.warn('Path is not a file:', sanitizedPath);
        continue;
      }

      const name = path.basename(sanitizedPath);
      const extension = path.extname(sanitizedPath);
      const category = getFileCategory(sanitizedPath);
      const isBinary = isBinaryFile(sanitizedPath);
      const mimeType = getMimeType(sanitizedPath);

      results.push({
        path: sanitizedPath,
        name,
        extension,
        sizeBytes: stats.size,
        category,
        isBinary,
        mimeType,
      });
    } catch (err) {
      console.error('Error getting file info for', filePath, ':', err);
      // Skip files that cause errors
    }
  }

  return results;
}

/**
 * Given a buffer and the number of valid bytes read into it, return the
 * length (<= bytesRead) that ends on a complete UTF-8 code point.
 *
 * When a truncation cut lands in the middle of a multi-byte UTF-8 sequence
 * (accented letters, CJK, emoji, box-drawing, etc.), decoding the dangling
 * lead byte(s) produces a spurious trailing U+FFFD replacement character.
 * This walks back over any trailing continuation bytes (0x80-0xBF) to find
 * the sequence's leader byte, and if that sequence isn't fully present in
 * `bytesRead`, trims back to just before it. A UTF-8 sequence is at most 4
 * bytes, so at most 3 trailing continuation bytes are ever scanned.
 */
function trimIncompleteTrailingUtf8Sequence(buffer: Buffer, bytesRead: number): number {
  if (bytesRead === 0) {
    return 0;
  }

  let leaderIndex = bytesRead - 1;
  let continuationBytes = 0;
  while (
    leaderIndex >= 0 &&
    continuationBytes < 3 &&
    (buffer[leaderIndex] & 0xc0) === 0x80
  ) {
    continuationBytes++;
    leaderIndex--;
  }

  if (leaderIndex < 0) {
    // Nothing but continuation bytes in the scanned window; no safe boundary found.
    return 0;
  }

  const leader = buffer[leaderIndex];
  let sequenceLength: number;
  if ((leader & 0x80) === 0x00) {
    sequenceLength = 1; // ASCII
  } else if ((leader & 0xe0) === 0xc0) {
    sequenceLength = 2;
  } else if ((leader & 0xf0) === 0xe0) {
    sequenceLength = 3;
  } else if ((leader & 0xf8) === 0xf0) {
    sequenceLength = 4;
  } else {
    // Not a valid leader byte (e.g. a run of continuation bytes with no
    // leader, or an invalid encoding) - drop it along with its continuations.
    return leaderIndex;
  }

  const bytesAvailable = bytesRead - leaderIndex;
  return bytesAvailable >= sequenceLength ? bytesRead : leaderIndex;
}

/**
 * Read file content with size limit
 */
export async function readFileContent(
  filePath: string,
  maxSizeKB: number
): Promise<FileReadResult> {
  try {
    // Security: validate local file
    if (!isLocalFile(filePath)) {
      throw new Error('Cannot read non-local files');
    }

    const sanitizedPath = sanitizeFilePath(filePath);

    // Check if file exists
    if (!fs.existsSync(sanitizedPath)) {
      throw new Error('File does not exist');
    }

    const stats = fs.statSync(sanitizedPath);

    // Check if it's a file
    if (!stats.isFile()) {
      throw new Error('Path is not a file');
    }

    // Check if binary
    if (isBinaryFile(sanitizedPath)) {
      throw new Error('Cannot read binary file content');
    }

    const maxSizeBytes = maxSizeKB * 1024;
    const truncated = stats.size > maxSizeBytes;

    // Read file with size limit
    let content: string;
    if (truncated) {
      const buffer = Buffer.alloc(maxSizeBytes);
      const fd = fs.openSync(sanitizedPath, 'r');
      const bytesRead = fs.readSync(fd, buffer, 0, maxSizeBytes, 0);
      fs.closeSync(fd);
      const safeLength = trimIncompleteTrailingUtf8Sequence(buffer, bytesRead);
      content = buffer.toString('utf-8', 0, safeLength);
    } else {
      content = fs.readFileSync(sanitizedPath, 'utf-8');
    }

    // Sanitize content: remove null bytes
    content = content.replace(/\0/g, '');

    return {
      content,
      truncated,
    };
  } catch (err) {
    console.error('Error reading file content:', err);
    throw err;
  }
}
