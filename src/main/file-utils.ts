import * as fs from 'fs';
import * as path from 'path';
import { FileCategory } from '../shared/ipc-types';

// Extension to category mapping
const EXTENSION_CATEGORIES: Record<string, FileCategory> = {
  // Code files
  '.js': 'code',
  '.jsx': 'code',
  '.ts': 'code',
  '.tsx': 'code',
  '.py': 'code',
  '.java': 'code',
  '.c': 'code',
  '.cpp': 'code',
  '.cs': 'code',
  '.go': 'code',
  '.rs': 'code',
  '.rb': 'code',
  '.php': 'code',
  '.swift': 'code',
  '.kt': 'code',
  '.scala': 'code',
  '.sh': 'code',
  '.bash': 'code',
  '.zsh': 'code',
  '.ps1': 'code',
  '.sql': 'code',
  '.r': 'code',
  '.m': 'code',
  '.h': 'code',
  '.hpp': 'code',
  '.asm': 'code',

  // Markup files
  '.html': 'markup',
  '.htm': 'markup',
  '.xml': 'markup',
  '.svg': 'markup',
  '.md': 'markup',
  '.markdown': 'markup',
  '.json': 'markup',
  '.yaml': 'markup',
  '.yml': 'markup',
  '.toml': 'markup',
  '.css': 'markup',
  '.scss': 'markup',
  '.sass': 'markup',
  '.less': 'markup',

  // Document files
  '.txt': 'document',
  '.log': 'document',
  '.csv': 'document',
  '.tsv': 'document',
  '.pdf': 'document',
  '.doc': 'document',
  '.docx': 'document',
  '.rtf': 'document',

  // Image files
  '.png': 'image',
  '.jpg': 'image',
  '.jpeg': 'image',
  '.gif': 'image',
  '.bmp': 'image',
  '.webp': 'image',
  '.ico': 'image',
  '.tiff': 'image',
  '.tif': 'image',

  // Binary files
  '.exe': 'binary',
  '.dll': 'binary',
  '.so': 'binary',
  '.dylib': 'binary',
  '.bin': 'binary',
  '.zip': 'binary',
  '.tar': 'binary',
  '.gz': 'binary',
  '.7z': 'binary',
  '.rar': 'binary',
  '.dmg': 'binary',
  '.iso': 'binary',
};


/**
 * Get file category based on extension
 */
export function getFileCategory(filePath: string): FileCategory {
  const ext = path.extname(filePath).toLowerCase();
  return EXTENSION_CATEGORIES[ext] || 'other';
}

/**
 * Detect if file is binary by reading first N bytes
 * Uses heuristic: looks for null bytes or non-printable characters
 */
export function isBinaryFile(filePath: string): boolean {
  try {
    // Read first 8KB to check for binary content
    const buffer = Buffer.alloc(8192);
    const fd = fs.openSync(filePath, 'r');
    const bytesRead = fs.readSync(fd, buffer, 0, 8192, 0);
    fs.closeSync(fd);

    if (bytesRead === 0) {
      return false; // Empty file is not binary
    }

    // Check for null bytes (strong indicator of binary)
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }

    // Check for high ratio of non-printable characters
    let nonPrintable = 0;
    for (let i = 0; i < bytesRead; i++) {
      const byte = buffer[i];
      // Count as non-printable if not in printable ASCII range and not common whitespace
      if (byte < 32 && byte !== 9 && byte !== 10 && byte !== 13) {
        nonPrintable++;
      }
    }

    // If more than 30% non-printable, consider binary
    const ratio = nonPrintable / bytesRead;
    return ratio > 0.3;
  } catch (err) {
    console.error('Error checking if file is binary:', err);
    // On error, assume binary for safety
    return true;
  }
}

/**
 * Get basic MIME type based on extension
 */
export function getMimeType(filePath: string): string | undefined {
  const ext = path.extname(filePath).toLowerCase();

  const mimeTypes: Record<string, string> = {
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'text/javascript',
    '.json': 'application/json',
    '.xml': 'application/xml',
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.zip': 'application/zip',
    '.tar': 'application/x-tar',
    '.gz': 'application/gzip',
  };

  return mimeTypes[ext];
}

/**
 * Validate that path is a local file (not URL, not remote)
 */
export function isLocalFile(filePath: string): boolean {
  // Reject URLs
  if (filePath.startsWith('http://') || filePath.startsWith('https://') ||
      filePath.startsWith('ftp://') || filePath.startsWith('file://')) {
    return false;
  }

  // Reject UNC paths (network shares) on Windows
  if (process.platform === 'win32' && filePath.startsWith('\\\\')) {
    return false;
  }

  return true;
}

/**
 * Normalize a file path to an absolute path.
 *
 * Note: this does NOT confine the result to any base directory or prevent
 * path traversal — `path.resolve()` collapses `..` segments but happily
 * resolves them past any starting point (e.g. `path.resolve('/base', '../../etc/passwd')`
 * yields `/etc/passwd`). Callers that need traversal protection must add
 * their own base-directory containment check.
 */
export function sanitizeFilePath(filePath: string): string {
  return path.resolve(filePath);
}
