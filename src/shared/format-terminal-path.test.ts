import { describe, it, expect } from 'vitest';
import { formatPathForTerminal } from './format-terminal-path';

// A metacharacter-laden POSIX path used across several assertions.
const NASTY = `/tmp/notes;$(whoami) it's "quoted".txt`;

describe('formatPathForTerminal - POSIX (isWindows=false)', () => {
  describe('unquoted', () => {
    it('returns the path unmodified aside from separator normalization', () => {
      expect(formatPathForTerminal('a\\b\\c.txt', 'unquoted', false)).toBe('a/b/c.txt');
      expect(formatPathForTerminal(NASTY, 'unquoted', false)).toBe(NASTY);
    });
  });

  describe('escaped', () => {
    it('leaves a path with no special characters untouched', () => {
      expect(formatPathForTerminal('/tmp/plain-file_1.0.txt', 'escaped', false)).toBe(
        '/tmp/plain-file_1.0.txt'
      );
    });

    it('escapes a semicolon so it cannot terminate/split the command', () => {
      expect(formatPathForTerminal('notes;ls.txt', 'escaped', false)).toBe('notes\\;ls.txt');
    });

    it('escapes a backtick so command substitution does not fire', () => {
      expect(formatPathForTerminal('`whoami`.txt', 'escaped', false)).toBe('\\`whoami\\`.txt');
    });

    it('escapes a single quote so it cannot open an unterminated quote', () => {
      expect(formatPathForTerminal("it's mine.txt", 'escaped', false)).toBe(
        "it\\'s\\ mine.txt"
      );
    });

    it('escapes $ so variable expansion does not fire', () => {
      expect(formatPathForTerminal('report$USER.txt', 'escaped', false)).toBe(
        'report\\$USER.txt'
      );
    });

    it('escapes double quotes and space', () => {
      expect(formatPathForTerminal('say "hi".txt', 'escaped', false)).toBe(
        'say\\ \\"hi\\".txt'
      );
    });

    it('normalizes a literal backslash to a separator before escaping (POSIX)', () => {
      // On POSIX, separator normalization runs first and turns `\` into `/`,
      // so a raw backslash never reaches the escaping step here - `/` is not
      // a shell metacharacter, so it comes out unescaped.
      expect(formatPathForTerminal('weird\\path.txt', 'escaped', false)).toBe(
        'weird/path.txt'
      );
    });

    it('escapes a backslash-containing metachar run without double-escaping', () => {
      // Regression guard for the single-pass regex design: escaping `;` next
      // to other metachars must not compound (e.g. re-escape an already
      // inserted `\`).
      expect(formatPathForTerminal('a;b|c.txt', 'escaped', false)).toBe('a\\;b\\|c.txt');
    });

    it('escapes the full extended metacharacter set', () => {
      const input = '|<>*?[]{}~#!';
      const result = formatPathForTerminal(input, 'escaped', false);
      for (const ch of input) {
        expect(result).toContain(`\\${ch}`);
      }
    });

    it('escapes tab and newline', () => {
      expect(formatPathForTerminal('a\tb\nc', 'escaped', false)).toBe('a\\\tb\\\nc');
    });
  });

  describe('quoted', () => {
    it('returns a path made only of safe characters unquoted', () => {
      expect(formatPathForTerminal('/tmp/plain-file_1.0.txt', 'quoted', false)).toBe(
        '/tmp/plain-file_1.0.txt'
      );
    });

    it('single-quotes a path with a space (no $ expansion inside)', () => {
      expect(formatPathForTerminal('my $file.txt', 'quoted', false)).toBe("'my $file.txt'");
    });

    it('single-quotes a path with a semicolon so it cannot split the command', () => {
      expect(formatPathForTerminal('notes;ls.txt', 'quoted', false)).toBe("'notes;ls.txt'");
    });

    it('single-quotes a path with a backtick so command substitution does not fire', () => {
      expect(formatPathForTerminal('`whoami`.txt', 'quoted', false)).toBe("'`whoami`.txt'");
    });

    it('single-quotes a path with double quotes without early termination', () => {
      expect(formatPathForTerminal('say "hi".txt', 'quoted', false)).toBe('\'say "hi".txt\'');
    });

    it('closes, escapes, and reopens for an embedded single quote', () => {
      expect(formatPathForTerminal("it's mine.txt", 'quoted', false)).toBe(
        "'it'\\''s mine.txt'"
      );
    });

    it('produces round-trip-safe output for a path combining every case', () => {
      // Simulate what a POSIX shell does with the produced text: single
      // quotes end/re-open only around literal ' characters, and nothing
      // outside quotes is left unescaped/unquoted for the shell to see.
      const result = formatPathForTerminal(NASTY, 'quoted', false);
      expect(result.startsWith("'")).toBe(true);
      expect(result.endsWith("'")).toBe(true);
      // No bare $, backtick, or " sitting inside an active single-quoted
      // span - i.e. every special char is inside '...' or itself quoted.
      expect(result).toBe(`'/tmp/notes;$(whoami) it'\\''s "quoted".txt'`);
    });
  });
});

describe('formatPathForTerminal - Windows (isWindows=true)', () => {
  it('normalizes forward slashes to backslashes', () => {
    expect(formatPathForTerminal('a/b/c.txt', 'unquoted', true)).toBe('a\\b\\c.txt');
  });

  it('quoted mode wraps in double quotes only for space/parens (pre-existing behavior)', () => {
    expect(formatPathForTerminal('C:/Program Files/app.exe', 'quoted', true)).toBe(
      '"C:\\Program Files\\app.exe"'
    );
    expect(formatPathForTerminal('C:/tools/app.exe', 'quoted', true)).toBe('C:\\tools\\app.exe');
  });

  it('escaped mode only escapes space/parens/&/$ (pre-existing behavior)', () => {
    expect(formatPathForTerminal('C:/my (app)/a&b$c.txt', 'escaped', true)).toBe(
      'C:\\my\\ \\(app\\)\\a\\&b\\$c.txt'
    );
  });
});
