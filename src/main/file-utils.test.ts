import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import {
  getFileCategory,
  isBinaryFile,
  getMimeType,
  isLocalFile,
  sanitizeFilePath,
} from './file-utils';

describe('getFileCategory', () => {
  it('categorizes a representative extension per category', () => {
    expect(getFileCategory('script.js')).toBe('code');
    expect(getFileCategory('index.html')).toBe('markup');
    expect(getFileCategory('notes.txt')).toBe('document');
    expect(getFileCategory('photo.png')).toBe('image');
    expect(getFileCategory('archive.zip')).toBe('binary');
  });

  it('is case-insensitive on the extension', () => {
    expect(getFileCategory('PHOTO.PNG')).toBe('image');
    expect(getFileCategory('Script.JS')).toBe('code');
  });

  it('returns "other" for a file with no extension', () => {
    expect(getFileCategory('README')).toBe('other');
  });

  it('returns "other" for an unknown extension', () => {
    expect(getFileCategory('file.xyz123')).toBe('other');
  });

  it('returns "other" for a dotfile (no extension by Node semantics)', () => {
    expect(getFileCategory('.gitignore')).toBe('other');
  });
});

describe('getMimeType', () => {
  it('returns the MIME type for a known extension', () => {
    expect(getMimeType('page.html')).toBe('text/html');
    expect(getMimeType('data.json')).toBe('application/json');
  });

  it('returns undefined for an unknown extension', () => {
    expect(getMimeType('file.xyz123')).toBeUndefined();
  });

  it('is case-insensitive on the extension', () => {
    expect(getMimeType('IMAGE.PNG')).toBe('image/png');
  });
});

describe('isLocalFile', () => {
  it('rejects http/https/ftp/file URLs', () => {
    expect(isLocalFile('http://example.com/a.txt')).toBe(false);
    expect(isLocalFile('https://example.com/a.txt')).toBe(false);
    expect(isLocalFile('ftp://example.com/a.txt')).toBe(false);
    expect(isLocalFile('file:///etc/passwd')).toBe(false);
  });

  it('accepts a plain absolute or relative path', () => {
    expect(isLocalFile(path.resolve('/tmp/a.txt'))).toBe(true);
    expect(isLocalFile('relative/a.txt')).toBe(true);
  });

  it('rejects Windows UNC paths only on win32', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'win32' });
    try {
      expect(isLocalFile('\\\\server\\share\\file.txt')).toBe(false);
    } finally {
      Object.defineProperty(process, 'platform', { value: original });
    }
  });

  it('does not reject UNC-style paths on non-win32 platforms', () => {
    const original = process.platform;
    Object.defineProperty(process, 'platform', { value: 'linux' });
    try {
      expect(isLocalFile('\\\\server\\share\\file.txt')).toBe(true);
    } finally {
      Object.defineProperty(process, 'platform', { value: original });
    }
  });
});

describe('sanitizeFilePath', () => {
  it('returns an absolute path', () => {
    expect(path.isAbsolute(sanitizeFilePath('relative/path.txt'))).toBe(true);
  });

  it('collapses ".." segments but does not confine the result to a base directory', () => {
    const base = path.resolve(path.sep + path.join('base', 'dir'));
    const escaped = sanitizeFilePath(path.join(base, '..', '..', 'etc', 'passwd'));
    expect(escaped).toBe(path.resolve(path.sep + path.join('etc', 'passwd')));
  });
});

describe('isBinaryFile', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function tempFile(name: string, data: string | Buffer): string {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-utils-'));
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, data);
    return filePath;
  }

  it('returns false for a UTF-8 text file', () => {
    const filePath = tempFile('text.txt', 'hello world\nline two\n');
    expect(isBinaryFile(filePath)).toBe(false);
  });

  it('returns true for a file containing a null byte', () => {
    const filePath = tempFile('binary.bin', Buffer.from([0x68, 0x69, 0x00, 0x21]));
    expect(isBinaryFile(filePath)).toBe(true);
  });

  it('returns false for an empty file', () => {
    const filePath = tempFile('empty.txt', '');
    expect(isBinaryFile(filePath)).toBe(false);
  });

  it('returns true (assume binary) when the path does not exist', () => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-utils-'));
    const missing = path.join(tmpDir, 'does-not-exist.txt');
    expect(isBinaryFile(missing)).toBe(true);
  });
});
