/**
 * Tests for custom-command-types helpers
 *
 * Covers:
 *   - slugifyCommandName() edge cases and transformations
 *   - isValidCommandSlug() validation
 *   - serializeCommandFile() format correctness
 *   - Boundary conditions and special characters
 */

import { describe, it, expect } from 'vitest';
import {
  slugifyCommandName,
  isValidCommandSlug,
  serializeCommandFile,
  FORBIDDEN_COMMAND_SLUGS,
  MAX_SLUG_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_COMMAND_FILE_SIZE,
} from './custom-command-types';
import type { CommandParameter } from './custom-command-types';

describe('custom-command-types helpers', () => {
  // ── slugifyCommandName Tests ────────────────────────────────────────────

  describe('slugifyCommandName()', () => {
    it('should convert to lowercase', () => {
      expect(slugifyCommandName('DEPLOY')).toBe('deploy');
      expect(slugifyCommandName('DeployStaging')).toBe('deploystaging');
    });

    it('should convert spaces to hyphens', () => {
      expect(slugifyCommandName('Deploy Staging')).toBe('deploy-staging');
      expect(slugifyCommandName('Run Tests Now')).toBe('run-tests-now');
    });

    it('should handle underscores as delimiters', () => {
      expect(slugifyCommandName('run_tests')).toBe('run-tests');
      expect(slugifyCommandName('deploy_to_production')).toBe('deploy-to-production');
    });

    it('should handle mixed delimiters', () => {
      expect(slugifyCommandName('Run_Tests Now!')).toBe('run-tests-now');
      expect(slugifyCommandName('my-test_script')).toBe('my-test-script');
    });

    it('should remove special characters', () => {
      expect(slugifyCommandName('test!@#$%')).toBe('test');
      expect(slugifyCommandName('run-test@#!')).toBe('run-test');
      expect(slugifyCommandName('my(test)')).toBe('my-test');
    });

    it('should keep numbers', () => {
      expect(slugifyCommandName('test123')).toBe('test123');
      expect(slugifyCommandName('123test')).toBe('123test');
      expect(slugifyCommandName('test-123-script')).toBe('test-123-script');
    });

    it('should trim leading and trailing hyphens', () => {
      expect(slugifyCommandName('  test  ')).toBe('test');
      expect(slugifyCommandName('-test-')).toBe('test');
      expect(slugifyCommandName('---test---')).toBe('test');
    });

    it('should collapse multiple consecutive delimiters', () => {
      expect(slugifyCommandName('test   script')).toBe('test-script');
      expect(slugifyCommandName('test___script')).toBe('test-script');
      expect(slugifyCommandName('test   ___   script')).toBe('test-script');
    });

    it('should handle empty string', () => {
      expect(slugifyCommandName('')).toBe('');
    });

    it('should handle only special characters', () => {
      expect(slugifyCommandName('!@#$%^&*()')).toBe('');
      expect(slugifyCommandName('---___')).toBe('');
    });

    it('should handle only whitespace', () => {
      expect(slugifyCommandName('   ')).toBe('');
    });

    it('should not truncate (manager handles that)', () => {
      const longName = 'a'.repeat(100);
      const result = slugifyCommandName(longName);

      // slugifyCommandName doesn't truncate — manager's private slugify() does that
      expect(result.length).toBeGreaterThan(MAX_SLUG_LENGTH);
      expect(result).toBe('a'.repeat(100));
    });

    it('should handle real-world examples', () => {
      const testCases = [
        { input: 'Deploy Staging', expected: 'deploy-staging' },
        { input: 'Run Tests', expected: 'run-tests' },
        { input: 'My Deploy Script', expected: 'my-deploy-script' },
        { input: 'run_tests!', expected: 'run-tests' },
        { input: '  fix bug  ', expected: 'fix-bug' },
        { input: 'Build & Deploy', expected: 'build-deploy' },
        { input: 'test (v2)', expected: 'test-v2' },
      ];

      for (const { input, expected } of testCases) {
        expect(slugifyCommandName(input)).toBe(expected);
      }
    });
  });

  // ── isValidCommandSlug Tests ────────────────────────────────────────────

  describe('isValidCommandSlug()', () => {
    it('should accept valid kebab-case slugs', () => {
      expect(isValidCommandSlug('deploy-staging')).toBe(true);
      expect(isValidCommandSlug('run-tests')).toBe(true);
      expect(isValidCommandSlug('my-test-script')).toBe(true);
    });

    it('should accept slugs with numbers', () => {
      expect(isValidCommandSlug('test123')).toBe(true);
      expect(isValidCommandSlug('123test')).toBe(true);
      expect(isValidCommandSlug('test-123-script')).toBe(true);
    });

    it('should accept single-character slug', () => {
      expect(isValidCommandSlug('a')).toBe(true);
      expect(isValidCommandSlug('x')).toBe(true);
      expect(isValidCommandSlug('1')).toBe(true);
    });

    it('should reject empty slug', () => {
      expect(isValidCommandSlug('')).toBe(false);
    });

    it('should reject slugs longer than MAX_SLUG_LENGTH', () => {
      const longSlug = 'a'.repeat(MAX_SLUG_LENGTH + 1);
      expect(isValidCommandSlug(longSlug)).toBe(false);
    });

    it('should reject reserved command slugs', () => {
      for (const reserved of FORBIDDEN_COMMAND_SLUGS) {
        expect(isValidCommandSlug(reserved)).toBe(false);
      }
    });

    it('should reject all specific reserved names', () => {
      const reserved = ['help', 'init', 'config', 'login', 'logout', 'version', 'update'];
      for (const name of reserved) {
        expect(isValidCommandSlug(name)).toBe(false);
      }
    });

    it('should reject uppercase letters', () => {
      expect(isValidCommandSlug('Deploy')).toBe(false);
      expect(isValidCommandSlug('DEPLOY')).toBe(false);
    });

    it('should reject underscores', () => {
      expect(isValidCommandSlug('test_script')).toBe(false);
    });

    it('should reject special characters', () => {
      expect(isValidCommandSlug('test!')).toBe(false);
      expect(isValidCommandSlug('test@script')).toBe(false);
      expect(isValidCommandSlug('test#cmd')).toBe(false);
    });

    it('should reject leading/trailing hyphens', () => {
      expect(isValidCommandSlug('-test')).toBe(false);
      expect(isValidCommandSlug('test-')).toBe(false);
      expect(isValidCommandSlug('-test-')).toBe(false);
    });

    it('should reject leading/trailing numbers as single char', () => {
      // Single digit should be valid
      expect(isValidCommandSlug('1')).toBe(true);
    });

    it('should accept MAX_SLUG_LENGTH exactly', () => {
      const maxSlug = 'a'.repeat(MAX_SLUG_LENGTH);
      expect(isValidCommandSlug(maxSlug)).toBe(true);
    });

    it('should reject whitespace', () => {
      expect(isValidCommandSlug('test script')).toBe(false);
      expect(isValidCommandSlug('test\tscript')).toBe(false);
    });
  });

  // ── serializeCommandFile Tests ──────────────────────────────────────────

  describe('serializeCommandFile()', () => {
    it('should create valid markdown with YAML frontmatter', () => {
      const result = serializeCommandFile('Test Command', 'This is the body');

      expect(result).toContain('---');
      expect(result).toContain('description: Test Command');
      expect(result).toContain('This is the body');

      // Should start and end with proper delimiters
      expect(result.startsWith('---')).toBe(true);
    });

    it('should include simple description', () => {
      const result = serializeCommandFile('Deploy to Staging', 'npm run deploy:staging');

      expect(result).toContain('description: Deploy to Staging');
    });

    it('should trim body whitespace', () => {
      const result = serializeCommandFile('Test', '  \n  body content  \n  ');

      expect(result).toContain('body content');
      expect(result.endsWith('body content')).toBe(true);
    });

    it('should include parameters in correct format', () => {
      const params: CommandParameter[] = [
        {
          name: 'environment',
          description: 'Target environment',
          required: true,
          default: 'staging',
        },
        {
          name: 'verbose',
          description: 'Enable verbose output',
          required: false,
        },
      ];

      const result = serializeCommandFile('Deploy', 'deploy --env={{environment}}', params);

      expect(result).toContain('parameters:');
      expect(result).toContain('- name: environment');
      expect(result).toContain('description: Target environment');
      expect(result).toContain('required: true');
      expect(result).toContain('default: "staging"');
      expect(result).toContain('- name: verbose');
      expect(result).toContain('required: false');
    });

    it('should not include parameters section if empty', () => {
      const result1 = serializeCommandFile('Test', 'body');
      const result2 = serializeCommandFile('Test', 'body', []);

      expect(result1).not.toContain('parameters:');
      expect(result2).not.toContain('parameters:');
    });

    it('should include tags in correct format', () => {
      const tags = ['deploy', 'production', 'ci-cd'];

      const result = serializeCommandFile('Deploy', 'deploy', undefined, tags);

      expect(result).toContain('tags:');
      expect(result).toContain('- deploy');
      expect(result).toContain('- production');
      expect(result).toContain('- ci-cd');
    });

    it('should not include tags section if empty', () => {
      const result1 = serializeCommandFile('Test', 'body');
      const result2 = serializeCommandFile('Test', 'body', undefined, []);

      expect(result1).not.toContain('tags:');
      expect(result2).not.toContain('tags:');
    });

    it('should include icon if provided', () => {
      const result = serializeCommandFile('Test', 'body', undefined, undefined, 'Hammer');

      expect(result).toContain('icon: Hammer');
    });

    it('should include Terminal icon only if explicitly provided', () => {
      const result1 = serializeCommandFile('Test', 'body');

      expect(result1).not.toContain('icon:');

      // When 'Terminal' is explicitly provided, it IS included
      const result2 = serializeCommandFile('Test', 'body', undefined, undefined, 'Terminal');
      expect(result2).toContain('icon: Terminal');
    });

    it('should handle special characters in description', () => {
      const result = serializeCommandFile(
        'Test: Deploy (v2) & Run',
        'body',
      );

      expect(result).toContain('description: Test: Deploy (v2) & Run');
    });

    it('should handle multiline body correctly', () => {
      const body = `npm run build
npm run test
npm run deploy`;

      const result = serializeCommandFile('Multi', body);

      expect(result).toContain('npm run build');
      expect(result).toContain('npm run test');
      expect(result).toContain('npm run deploy');
    });

    it('should maintain body without modification (except trim)', () => {
      const body = `if [ "$?" -eq 0 ]; then
  echo "Success"
else
  exit 1
fi`;

      const result = serializeCommandFile('Bash Script', body);

      expect(result).toContain('if [ "$?" -eq 0 ]; then');
      expect(result).toContain('echo "Success"');
    });

    it('should handle parameter without default value', () => {
      const params: CommandParameter[] = [
        {
          name: 'message',
          description: 'Commit message',
          required: true,
        },
      ];

      const result = serializeCommandFile('Commit', 'git commit -m "{{message}}"', params);

      expect(result).toContain('- name: message');
      expect(result).toContain('required: true');
      expect(result).not.toContain('default:'); // Should not include undefined default
    });

    it('should handle empty string default value', () => {
      const params: CommandParameter[] = [
        {
          name: 'suffix',
          description: 'Optional suffix',
          required: false,
          default: '',
        },
      ];

      const result = serializeCommandFile('Test', 'body', params);

      // Empty default should be included
      expect(result).toContain('default:');
    });

    it('should create complete valid markdown format', () => {
      const description = 'Full Example';
      const body = 'echo "Hello World"';
      const params: CommandParameter[] = [
        { name: 'name', description: 'Your name', required: true, default: 'World' },
      ];
      const tags = ['example', 'greeting'];
      const icon = 'Smile';

      const result = serializeCommandFile(description, body, params, tags, icon);

      const lines = result.split('\n');

      // Verify structure
      expect(lines[0]).toBe('---');
      expect(lines[1]).toBe('description: Full Example');

      // Find closing --- of frontmatter
      const closingIndex = lines.findIndex((line, i) => i > 0 && line === '---');
      expect(closingIndex).toBeGreaterThan(0);

      // After closing ---, should have blank line then body
      const bodyStartIndex = closingIndex + 2;
      expect(bodyStartIndex < lines.length).toBe(true);
    });
  });

  // ── Constants Tests ─────────────────────────────────────────────────────

  describe('constants', () => {
    it('should have defined FORBIDDEN_COMMAND_SLUGS', () => {
      expect(FORBIDDEN_COMMAND_SLUGS).toBeDefined();
      expect(Array.isArray(FORBIDDEN_COMMAND_SLUGS)).toBe(true);
      expect(FORBIDDEN_COMMAND_SLUGS.length).toBeGreaterThan(0);
    });

    it('should have reasonable MAX_SLUG_LENGTH', () => {
      expect(MAX_SLUG_LENGTH).toBeGreaterThan(10);
      expect(MAX_SLUG_LENGTH).toBeLessThan(200);
    });

    it('should have reasonable MAX_DESCRIPTION_LENGTH', () => {
      expect(MAX_DESCRIPTION_LENGTH).toBeGreaterThan(50);
      expect(MAX_DESCRIPTION_LENGTH).toBeLessThan(1000);
    });

    it('should have reasonable MAX_COMMAND_FILE_SIZE', () => {
      expect(MAX_COMMAND_FILE_SIZE).toBeGreaterThan(1000); // At least 1KB
      expect(MAX_COMMAND_FILE_SIZE).toBeLessThan(1000000); // Less than 1MB
    });
  });

  // ── Integration Tests (combining multiple functions) ────────────────────

  describe('integration', () => {
    it('should slugify and then validate', () => {
      const name = 'My New Command!';
      const slug = slugifyCommandName(name);
      const isValid = isValidCommandSlug(slug);

      expect(isValid).toBe(true);
    });

    it('should reject reserved names when slugified', () => {
      const reservedNames = ['Help', 'HELP', 'Help!', 'help-me'];

      for (const name of reservedNames) {
        const slug = slugifyCommandName(name);
        if (slug === 'help') {
          expect(isValidCommandSlug(slug)).toBe(false);
        }
      }
    });

    it('should create valid file for any reasonable input', () => {
      const inputs = [
        { name: 'My Test', desc: 'Test description', body: 'echo test' },
        { name: 'Deploy!', desc: 'Deploy app', body: 'npm run deploy' },
        { name: 'RUN_TESTS', desc: 'Run tests', body: 'npm test' },
      ];

      for (const input of inputs) {
        const file = serializeCommandFile(input.desc, input.body);

        // Should always start with ---
        expect(file.startsWith('---')).toBe(true);
        // Should have closing ---
        expect(file.includes('---\n')).toBe(true);
        // Should contain description
        expect(file).toContain('description:');
        // Should contain body
        expect(file).toContain(input.body);
      }
    });
  });
});
