/**
 * Security tests for custom-command-types helpers
 *
 * Tests the following security fixes:
 * 1. YAML Injection Prevention: serializeCommandFile() sanitizes newlines
 *    in description, parameter names, descriptions, and defaults to prevent
 *    frontmatter delimiter injection that could close the YAML block early
 *    and inject arbitrary content.
 *
 * These are pure function tests with no mocking — they test the actual
 * serialization logic directly.
 */

import { describe, it, expect } from 'vitest';
import {
  serializeCommandFile,
  isValidCommandSlug,
} from './custom-command-types';
import type { CommandParameter } from './custom-command-types';

describe('YAML Security — serializeCommandFile()', () => {
  // ──────────────────────────────────────────────────────────────────────────
  // BASIC SANITIZATION TESTS
  // ──────────────────────────────────────────────────────────────────────────

  describe('description field newline sanitization', () => {
    it('should replace LF (\\n) with space in description', () => {
      const result = serializeCommandFile(
        'Line 1\nLine 2',
        'body content',
      );

      // The description should be on a single line in the frontmatter
      const lines = result.split('\n');
      const descLine = lines.find(l => l.startsWith('description:'));

      expect(descLine).toBe('description: Line 1 Line 2');
    });

    it('should replace CR (\\r) with space in description', () => {
      const result = serializeCommandFile(
        'Line 1\rLine 2',
        'body content',
      );

      const lines = result.split('\n');
      const descLine = lines.find(l => l.startsWith('description:'));

      // CR should be converted to space
      expect(descLine).toBe('description: Line 1 Line 2');
    });

    it('should replace CRLF (\\r\\n) with space in description', () => {
      const result = serializeCommandFile(
        'Line 1\r\nLine 2',
        'body content',
      );

      const lines = result.split('\n');
      const descLine = lines.find(l => l.startsWith('description:'));

      // CRLF gets two replacements: \r->space and \n->space, so we get two spaces
      expect(descLine).toMatch(/^description:\s+Line 1\s+Line 2$/);
    });

    it('should handle multiple consecutive newlines in description', () => {
      const result = serializeCommandFile(
        'Start\n\n\nMiddle\n\nEnd',
        'body',
      );

      const lines = result.split('\n');
      const descLine = lines.find(l => l.startsWith('description:'));

      // Multiple newlines should all be converted to spaces
      expect(descLine).toBe('description: Start   Middle  End');
    });

    it('should handle description with only newlines', () => {
      const result = serializeCommandFile(
        '\n\n\n',
        'body',
      );

      const lines = result.split('\n');
      const descLine = lines.find(l => l.startsWith('description:'));

      // Should become spaces
      expect(descLine).toContain('description:');
    });
  });

  describe('parameter name sanitization', () => {
    it('should replace LF in parameter name with space', () => {
      const params: CommandParameter[] = [
        {
          name: 'env\niroment',
          description: 'Environment',
          required: true,
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      expect(result).toContain('name: env iroment');
      expect(result).not.toContain('name: env\niroment');
    });

    it('should replace CR in parameter name with space', () => {
      const params: CommandParameter[] = [
        {
          name: 'var\riable',
          description: 'Variable',
          required: true,
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      expect(result).toContain('name: var iable');
    });

    it('should handle parameter name with multiple newlines', () => {
      const params: CommandParameter[] = [
        {
          name: 'param\n\nname',
          description: 'Test',
          required: false,
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      expect(result).toContain('name: param  name');
    });
  });

  describe('parameter description sanitization', () => {
    it('should replace LF in parameter description with space', () => {
      const params: CommandParameter[] = [
        {
          name: 'env',
          description: 'Deploy to\nstaging environment',
          required: true,
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      const lines = result.split('\n');
      const paramDescLine = lines.find(l => l.includes('Deploy to'));

      expect(paramDescLine).toBe('    description: Deploy to staging environment');
    });

    it('should replace CR in parameter description with space', () => {
      const params: CommandParameter[] = [
        {
          name: 'target',
          description: 'Target\rhost',
          required: false,
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      expect(result).toContain('description: Target host');
    });

    it('should handle parameter description with multiple newlines', () => {
      const params: CommandParameter[] = [
        {
          name: 'script',
          description: 'Run script\n\nwith args',
          required: true,
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      expect(result).toContain('description: Run script  with args');
    });
  });

  describe('parameter default value sanitization', () => {
    it('should replace LF in parameter default with space', () => {
      const params: CommandParameter[] = [
        {
          name: 'env',
          description: 'Environment',
          required: false,
          default: 'staging\nproduction',
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      expect(result).toContain('default: "staging production"');
    });

    it('should replace CR in parameter default with space', () => {
      const params: CommandParameter[] = [
        {
          name: 'mode',
          description: 'Mode',
          required: false,
          default: 'fast\rslow',
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      expect(result).toContain('default: "fast slow"');
    });

    it('should replace CRLF in parameter default with space', () => {
      const params: CommandParameter[] = [
        {
          name: 'opt',
          description: 'Option',
          required: false,
          default: 'val1\r\nval2',
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      // CRLF (\r\n) gets sanitized: \r becomes space, \n becomes space
      // The key thing is the newlines are gone and it's on one line
      expect(result).toMatch(/default:\s*"val1\s+val2"/);
    });

    it('should handle parameter default with multiple newlines', () => {
      const params: CommandParameter[] = [
        {
          name: 'config',
          description: 'Config',
          required: false,
          default: 'start\n\nmiddle\n\nend',
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      expect(result).toContain('default: "start  middle  end"');
    });

    it('should quote default value (for YAML safety)', () => {
      const params: CommandParameter[] = [
        {
          name: 'value',
          description: 'Value',
          required: false,
          default: 'simple-value',
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      // Default should be quoted even without special chars
      expect(result).toContain('default: "simple-value"');
    });

    it('should quote empty string default', () => {
      const params: CommandParameter[] = [
        {
          name: 'optional',
          description: 'Optional param',
          required: false,
          default: '',
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      expect(result).toContain('default: ""');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // YAML INJECTION ATTACK TESTS
  // ──────────────────────────────────────────────────────────────────────────

  describe('YAML Injection Prevention', () => {
    it('should prevent closing frontmatter via description newline injection', () => {
      // Attacker tries: description: "Normal"\n---\nmalicious: true\n---
      const injection = 'Normal\n---\nmalicious: true';

      const result = serializeCommandFile(injection, 'body');

      // Count the number of "---" lines
      const frontmatterCount = (result.match(/^---$/gm) || []).length;

      // Should have exactly 2: opening and closing (not 4 from injection)
      // This is the key security check: frontmatter is not closed prematurely
      expect(frontmatterCount).toBe(2);

      // Verify the structure: injected "---" is converted to spaces, not a new YAML section
      const lines = result.split('\n');
      const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l === '---');
      const frontmatter = lines.slice(0, frontmatterEnd).join('\n');

      // Should not have a separate "malicious:" field in frontmatter
      expect(frontmatter).not.toMatch(/^\s*malicious:\s*true$/m);
    });

    it('should prevent injecting new YAML fields via parameter description', () => {
      const params: CommandParameter[] = [
        {
          name: 'env',
          description: 'Test\n---\nadmin: true\n---',
          required: false,
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      // Frontmatter should still be valid (exactly 2 ---)
      const count = (result.match(/^---$/gm) || []).length;
      expect(count).toBe(2);

      // Verify no separate "admin:" field exists in the frontmatter
      const lines = result.split('\n');
      const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l === '---');
      const frontmatter = lines.slice(0, frontmatterEnd).join('\n');

      // Should not have "admin:" as a top-level YAML field
      expect(frontmatter).not.toMatch(/^\s*admin:\s*true$/m);
    });

    it('should prevent injecting new YAML fields via parameter name', () => {
      const params: CommandParameter[] = [
        {
          name: 'exploit\n---\nbackdoor',
          description: 'Try injection',
          required: false,
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      const count = (result.match(/^---$/gm) || []).length;
      expect(count).toBe(2);

      // Should not have the injected field
      expect(result).not.toMatch(/^backdoor/m);
    });

    it('should prevent injecting new YAML fields via parameter default', () => {
      const params: CommandParameter[] = [
        {
          name: 'param',
          description: 'Param',
          required: false,
          default: 'value\n---\nsecret: exposed',
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      const count = (result.match(/^---$/gm) || []).length;
      expect(count).toBe(2);

      // Verify no separate "secret:" field exists in the frontmatter
      const lines = result.split('\n');
      const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l === '---');
      const frontmatter = lines.slice(0, frontmatterEnd).join('\n');

      expect(frontmatter).not.toMatch(/^\s*secret:\s*exposed$/m);
    });

    it('should prevent multi-line injection in description', () => {
      const injection = `Deploy to prod
---
destroy: everything
hack: the-system
---`;

      const result = serializeCommandFile(injection, 'body');

      const count = (result.match(/^---$/gm) || []).length;
      expect(count).toBe(2);

      // Verify no separate "destroy:" or "hack:" fields exist as top-level YAML
      const lines = result.split('\n');
      const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l === '---');
      const frontmatter = lines.slice(0, frontmatterEnd).join('\n');

      expect(frontmatter).not.toMatch(/^\s*destroy:/m);
      expect(frontmatter).not.toMatch(/^\s*hack:/m);
    });

    it('should prevent injection across multiple parameters', () => {
      const params: CommandParameter[] = [
        {
          name: 'first\n---\ninjected',
          description: 'First',
          required: true,
        },
        {
          name: 'second',
          description: 'Second\n---\nalso-injected',
          required: false,
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      const count = (result.match(/^---$/gm) || []).length;
      expect(count).toBe(2);

      expect(result).not.toMatch(/injected:/);
      expect(result).not.toMatch(/also-injected:/);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // LEGITIMATE MULTILINE CONTENT TESTS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Legitimate multiline content preservation', () => {
    it('should preserve newlines in command body (after frontmatter)', () => {
      const body = `#!/bin/bash
# Deploy script
echo "Starting deploy..."
cd /app && npm run build
npm run test
npm run deploy`;

      const result = serializeCommandFile('Deploy', body);

      // Body should retain all its newlines
      expect(result).toContain('#!/bin/bash');
      expect(result).toContain('# Deploy script');
      expect(result).toContain('echo "Starting deploy..."');
      expect(result).toContain('cd /app && npm run build');
      expect(result).toContain('npm run test');
      expect(result).toContain('npm run deploy');
    });

    it('should preserve complex bash scripts with multiple lines', () => {
      const body = `if [ -z "$1" ]; then
  echo "Usage: $0 <version>"
  exit 1
fi

version=$1
echo "Building version $version..."
npm run build -- --version $version`;

      const result = serializeCommandFile('Build', body);

      // All lines should be preserved in body
      expect(result).toContain('if [ -z "$1" ]; then');
      expect(result).toContain('echo "Usage: $0 <version>"');
      expect(result).toContain('version=$1');
    });

    it('should allow parameter templating syntax in body', () => {
      const body = 'git commit -m "{{message}}" --author="{{author}}"';

      const result = serializeCommandFile('Commit', body);

      expect(result).toContain('{{message}}');
      expect(result).toContain('{{author}}');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // EDGE CASE TESTS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Edge cases and corner cases', () => {
    it('should handle parameter with no default', () => {
      const params: CommandParameter[] = [
        {
          name: 'required-param',
          description: 'This is required',
          required: true,
          // no default
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      // Should NOT include default line if undefined
      const lines = result.split('\n');
      const paramSection = result.substring(
        result.indexOf('parameters:'),
        result.indexOf('---', result.indexOf('parameters:'))
      );

      expect(paramSection).not.toContain('default:');
    });

    it('should handle many parameters with mixed newlines', () => {
      const params: CommandParameter[] = [
        {
          name: 'p1\ninjected',
          description: 'First\nline',
          required: true,
          default: 'val\ninjected',
        },
        {
          name: 'p2',
          description: 'Normal',
          required: false,
        },
        {
          name: 'p3\r\ninjected',
          description: 'Third\rline',
          required: false,
          default: 'default\nvalue',
        },
      ];

      const result = serializeCommandFile('Desc', 'body', params);

      // Should have exactly 2 --- (not more from injections)
      const count = (result.match(/^---$/gm) || []).length;
      expect(count).toBe(2);

      // All newlines in frontmatter should be sanitized
      const lines = result.split('\n');
      const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l === '---');
      const frontmatter = lines.slice(0, frontmatterEnd).join('\n');

      // Check that no injection patterns remain in frontmatter
      expect(frontmatter).not.toMatch(/\n---\n/);
    });

    it('should handle empty description', () => {
      const result = serializeCommandFile('', 'body');

      expect(result).toContain('description:');
      expect(result).toContain('---');
    });

    it('should handle very long description with newlines', () => {
      const longDesc = 'Start ' + 'line\n'.repeat(100) + ' end';

      const result = serializeCommandFile(longDesc, 'body');

      // Should still have valid frontmatter
      const count = (result.match(/^---$/gm) || []).length;
      expect(count).toBe(2);
    });

    it('should handle description with mixed whitespace and newlines', () => {
      const desc = '  Start  \n  \n  Middle  \r  \nEnd  ';

      const result = serializeCommandFile(desc, 'body');

      const lines = result.split('\n');
      const descLine = lines.find(l => l.startsWith('description:'));

      // Should be sanitized but preserve intended spacing
      expect(descLine).toBeDefined();
      expect(descLine).toContain('Start');
      expect(descLine).toContain('Middle');
      expect(descLine).toContain('End');
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // YAML STRUCTURE VALIDATION
  // ──────────────────────────────────────────────────────────────────────────

  describe('YAML structure integrity after sanitization', () => {
    it('should always produce valid YAML frontmatter structure', () => {
      const injection = 'Desc\n---\nmalicious: true';
      const params: CommandParameter[] = [
        {
          name: 'param\n---\ninjected',
          description: 'Desc\n---\nmore-injection',
          required: false,
          default: 'val\n---\nanother',
        },
      ];

      const result = serializeCommandFile(injection, 'body', params);

      // Must start with ---
      expect(result.startsWith('---')).toBe(true);

      // Must have closing ---
      const lines = result.split('\n');
      const firstClose = lines.findIndex((l, i) => i > 0 && l === '---');
      expect(firstClose).toBeGreaterThan(0);

      // Everything after closing --- is body
      const bodyStart = firstClose + 2; // skip blank line
      expect(bodyStart < lines.length).toBe(true);
    });

    it('should have valid YAML in frontmatter (no injected fields)', () => {
      const injection = 'Test\n---\nadmin: true\nsecret: exposed';
      const result = serializeCommandFile(injection, 'body');

      const lines = result.split('\n');
      const closingIndex = lines.findIndex((l, i) => i > 0 && l === '---');
      const frontmatter = lines.slice(1, closingIndex);

      // Valid keys should exist
      expect(frontmatter.some(l => l.startsWith('description:'))).toBe(true);

      // Injected keys should NOT exist
      expect(frontmatter.some(l => l.startsWith('admin:'))).toBe(false);
      expect(frontmatter.some(l => l.startsWith('secret:'))).toBe(false);
    });

    it('should produce consistent structure with/without parameters', () => {
      const result1 = serializeCommandFile('Desc', 'body');
      const result2 = serializeCommandFile('Desc', 'body', []);

      // Both should have exactly 2 --- delimiters
      expect((result1.match(/^---$/gm) || []).length).toBe(2);
      expect((result2.match(/^---$/gm) || []).length).toBe(2);
    });
  });
});
