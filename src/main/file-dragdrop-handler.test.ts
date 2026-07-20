import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { getFileInfo, readFileContent } from './file-dragdrop-handler';

describe('file-dragdrop-handler', () => {
  let tmpDir: string;

  afterEach(() => {
    if (tmpDir) fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  function tempFile(name: string, data: string | Buffer): string {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-dragdrop-'));
    const filePath = path.join(tmpDir, name);
    fs.writeFileSync(filePath, data);
    return filePath;
  }

  function tempDir(): string {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-dragdrop-'));
    return tmpDir;
  }

  describe('getFileInfo', () => {
    it('returns populated FileInfo for a valid local file', async () => {
      const filePath = tempFile('notes.txt', 'hello world\n');
      const [info] = await getFileInfo([filePath]);

      expect(info).toBeDefined();
      expect(info.name).toBe('notes.txt');
      expect(info.extension).toBe('.txt');
      expect(info.sizeBytes).toBe(Buffer.byteLength('hello world\n'));
      expect(info.category).toBe('document');
      expect(info.isBinary).toBe(false);
      expect(info.mimeType).toBe('text/plain');
    });

    it('skips (does not throw for) a non-local path', async () => {
      const results = await getFileInfo(['https://example.com/a.txt']);
      expect(results).toEqual([]);
    });

    it('skips (does not throw for) a missing path', async () => {
      const dir = tempDir();
      const missing = path.join(dir, 'does-not-exist.txt');
      const results = await getFileInfo([missing]);
      expect(results).toEqual([]);
    });

    it('skips (does not throw for) a directory', async () => {
      const dir = tempDir();
      const results = await getFileInfo([dir]);
      expect(results).toEqual([]);
    });

    it('processes multiple paths independently, skipping invalid ones', async () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'file-dragdrop-'));
      tmpDir = dir;
      const goodFile = path.join(dir, 'good.md');
      fs.writeFileSync(goodFile, '# heading');
      const missing = path.join(dir, 'missing.md');

      const results = await getFileInfo([missing, goodFile, 'https://example.com/x']);

      expect(results).toHaveLength(1);
      expect(results[0].name).toBe('good.md');
    });
  });

  describe('readFileContent', () => {
    it('throws for a non-local path', async () => {
      await expect(readFileContent('https://example.com/a.txt', 1024)).rejects.toThrow(
        'Cannot read non-local files'
      );
    });

    it('throws for a missing file', async () => {
      const dir = tempDir();
      const missing = path.join(dir, 'does-not-exist.txt');
      await expect(readFileContent(missing, 1024)).rejects.toThrow('File does not exist');
    });

    it('throws for a directory', async () => {
      const dir = tempDir();
      await expect(readFileContent(dir, 1024)).rejects.toThrow('Path is not a file');
    });

    it('throws for a binary file', async () => {
      const filePath = tempFile('binary.bin', Buffer.from([0x68, 0x69, 0x00, 0x21]));
      await expect(readFileContent(filePath, 1024)).rejects.toThrow(
        'Cannot read binary file content'
      );
    });

    it('returns full content with truncated=false when the file fits within the limit', async () => {
      const filePath = tempFile('small.txt', 'hello');
      const result = await readFileContent(filePath, 1024);
      expect(result.truncated).toBe(false);
      expect(result.content).toBe('hello');
    });

    it('truncates a pure-ASCII file at the exact byte boundary, unaffected', async () => {
      const filePath = tempFile('ascii.txt', 'a'.repeat(20));
      // maxSizeBytes = 10 * 1024 would be huge; use a fractional KB so the
      // byte boundary is exactly 10 (10/1024 KB * 1024 = 10 bytes).
      const result = await readFileContent(filePath, 10 / 1024);
      expect(result.truncated).toBe(true);
      expect(result.content).toBe('a'.repeat(10));
    });

    it('does not emit a trailing U+FFFD when the cut lands 1 byte into a multi-byte UTF-8 sequence', async () => {
      // '€' is E2 82 AC (3 bytes). Cutting after 11 bytes lands 1 byte into it.
      const content = 'x'.repeat(10) + '€' + 'y'.repeat(10);
      const filePath = tempFile('euro-cut-1.txt', content);
      const result = await readFileContent(filePath, 11 / 1024);

      expect(result.truncated).toBe(true);
      expect(result.content).toBe('x'.repeat(10));
      expect(result.content).not.toContain('�');
    });

    it('does not emit a trailing U+FFFD when the cut lands 2 bytes into a multi-byte UTF-8 sequence', async () => {
      const content = 'x'.repeat(10) + '€' + 'y'.repeat(10);
      const filePath = tempFile('euro-cut-2.txt', content);
      const result = await readFileContent(filePath, 12 / 1024);

      expect(result.truncated).toBe(true);
      expect(result.content).toBe('x'.repeat(10));
      expect(result.content).not.toContain('�');
    });

    it('keeps the full multi-byte character when the cut lands exactly on a sequence boundary', async () => {
      const content = 'x'.repeat(10) + '€' + 'y'.repeat(10);
      const filePath = tempFile('euro-cut-3.txt', content);
      // 10 ASCII bytes + all 3 bytes of '€' = 13 bytes, a clean boundary.
      const result = await readFileContent(filePath, 13 / 1024);

      expect(result.truncated).toBe(true);
      expect(result.content).toBe('x'.repeat(10) + '€');
      expect(result.content).not.toContain('�');
    });

    it('strips null bytes from returned content', async () => {
      // isBinaryFile only inspects the first 8KB, so put the null byte past
      // that window in an otherwise-printable, non-truncated file.
      const content = 'a'.repeat(8300) + '\0' + 'end';
      const filePath = tempFile('with-null.txt', content);

      const result = await readFileContent(filePath, 1024 * 1024);
      expect(result.truncated).toBe(false);
      expect(result.content).not.toContain('\0');
      expect(result.content).toBe('a'.repeat(8300) + 'end');
    });
  });
});
