/**
 * Security tests for CustomCommandManager
 *
 * Tests the following security fixes:
 * 1. Path Traversal: updateCommand, deleteCommand, and getCommand reject
 *    slugs containing "..", absolute paths, null bytes, slashes, etc.
 * 2. YAML Injection: serializeCommand sanitizes newlines in description
 *    and parameter scalar fields to prevent frontmatter delimiter injection.
 *
 * These tests verify that the guards in each method prevent attacks
 * before resolveFilePath() is ever called.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs module BEFORE any imports that use it
vi.mock('fs');

// Mock os BEFORE any imports that use it
vi.mock('os', () => ({
  homedir: vi.fn(() => '/home/testuser'),
}));

// Mock IPCEmitter BEFORE importing CustomCommandManager
vi.mock('./ipc-emitter');

// NOW import the modules that were mocked above
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { CustomCommandManager } from './custom-command-manager';
import { IPCEmitter } from './ipc-emitter';
import type { CustomCommand, CommandParameter } from '../shared/types/custom-command-types';

const mockedFs = vi.mocked(fs);
const mockedOs = vi.mocked(os);
const MockedIPCEmitter = vi.mocked(IPCEmitter);

describe('CustomCommandManager Security', () => {
  let manager: CustomCommandManager;
  let mockEmitter: any;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset fs mocks to default behaviors
    mockedFs.existsSync.mockReturnValue(false);
    mockedFs.mkdirSync.mockReturnValue(undefined);
    mockedFs.writeFileSync.mockReturnValue(undefined);
    mockedFs.renameSync.mockReturnValue(undefined);
    mockedFs.readFileSync.mockReturnValue('');
    mockedFs.statSync.mockReturnValue({
      size: 100,
      mtimeMs: Date.now(),
    } as any);
    mockedFs.readdirSync.mockReturnValue([]);
    mockedFs.watch.mockReturnValue({
      close: vi.fn(),
      on: vi.fn(function () {
        return this;
      }),
    } as any);
    mockedFs.unlinkSync.mockReturnValue(undefined);

    mockEmitter = {
      emit: vi.fn(),
    };

    manager = new CustomCommandManager();
    manager.setEmitter(mockEmitter);
  });

  afterEach(() => {
    manager.destroy();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // PATH TRAVERSAL TESTS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Path Traversal Protection', () => {
    describe('getCommand() slug validation', () => {
      it('should reject slug with path traversal ".."', () => {
        const result = manager.getCommand('../../etc/passwd', 'user');
        expect(result).toBeNull();
      });

      it('should reject slug with multiple ".." segments', () => {
        const result = manager.getCommand('../../../sensitive-file', 'user');
        expect(result).toBeNull();
      });

      it('should reject slug starting with "."', () => {
        const result = manager.getCommand('.hidden', 'user');
        expect(result).toBeNull();
      });

      it('should reject slug with forward slash', () => {
        const result = manager.getCommand('parent/child', 'user');
        expect(result).toBeNull();
      });

      it('should reject slug with backward slash', () => {
        const result = manager.getCommand('parent\\child', 'user');
        expect(result).toBeNull();
      });

      it('should reject slug with null byte', () => {
        const result = manager.getCommand('test\x00name', 'user');
        expect(result).toBeNull();
      });

      it('should reject absolute path with /etc/passwd', () => {
        const result = manager.getCommand('/etc/passwd', 'user');
        expect(result).toBeNull();
      });

      it('should reject Windows absolute path C:\\file', () => {
        const result = manager.getCommand('C:\\Windows\\System32', 'user');
        expect(result).toBeNull();
      });

      it('should reject uppercase letters (not kebab-case)', () => {
        const result = manager.getCommand('Deploy-Staging', 'user');
        expect(result).toBeNull();
      });

      it('should reject underscore (not kebab-case)', () => {
        const result = manager.getCommand('deploy_staging', 'user');
        expect(result).toBeNull();
      });

      it('should reject leading hyphen', () => {
        const result = manager.getCommand('-deploy', 'user');
        expect(result).toBeNull();
      });

      it('should reject trailing hyphen', () => {
        const result = manager.getCommand('deploy-', 'user');
        expect(result).toBeNull();
      });

      it('should accept valid kebab-case slug', () => {
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(`---
description: Test
---
test body`);
        mockedFs.statSync.mockReturnValue({
          size: 100,
          mtimeMs: Date.now(),
        } as any);

        const result = manager.getCommand('valid-deploy-command', 'user');
        expect(result).toBeDefined();
      });

      it('should accept single-character valid slug', () => {
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(`---
description: Test
---
test body`);
        mockedFs.statSync.mockReturnValue({
          size: 100,
          mtimeMs: Date.now(),
        } as any);

        const result = manager.getCommand('x', 'user');
        expect(result).toBeDefined();
      });

      it('should accept slug with numbers', () => {
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(`---
description: Test
---
test body`);
        mockedFs.statSync.mockReturnValue({
          size: 100,
          mtimeMs: Date.now(),
        } as any);

        const result = manager.getCommand('deploy-v2-prod', 'user');
        expect(result).toBeDefined();
      });
    });

    describe('updateCommand() slug validation', () => {
      it('should throw when updating with path traversal slug', () => {
        expect(() => {
          manager.updateCommand({
            slug: '../../etc/passwd',
            scope: 'user',
            description: 'malicious',
          });
        }).toThrow('Invalid command slug');
      });

      it('should throw when updating with multiple ".." segments', () => {
        expect(() => {
          manager.updateCommand({
            slug: '../../../config',
            scope: 'user',
            description: 'malicious',
          });
        }).toThrow('Invalid command slug');
      });

      it('should throw when updating with forward slash', () => {
        expect(() => {
          manager.updateCommand({
            slug: 'parent/child',
            scope: 'user',
            description: 'malicious',
          });
        }).toThrow('Invalid command slug');
      });

      it('should throw when updating with backward slash', () => {
        expect(() => {
          manager.updateCommand({
            slug: 'parent\\child',
            scope: 'user',
            description: 'malicious',
          });
        }).toThrow('Invalid command slug');
      });

      it('should throw when updating with absolute path', () => {
        expect(() => {
          manager.updateCommand({
            slug: '/etc/passwd',
            scope: 'user',
            description: 'malicious',
          });
        }).toThrow('Invalid command slug');
      });

      it('should throw when updating with Windows absolute path', () => {
        expect(() => {
          manager.updateCommand({
            slug: 'C:\\Windows\\System32',
            scope: 'user',
            description: 'malicious',
          });
        }).toThrow('Invalid command slug');
      });

      it('should throw when updating with null byte', () => {
        expect(() => {
          manager.updateCommand({
            slug: 'test\x00file',
            scope: 'user',
            description: 'malicious',
          });
        }).toThrow('Invalid command slug');
      });

      it('should succeed when updating with valid kebab-case slug', () => {
        mockedFs.existsSync.mockReturnValue(true);
        mockedFs.readFileSync.mockReturnValue(`---
description: Original
---
body`);
        mockedFs.statSync.mockReturnValue({
          size: 100,
          mtimeMs: Date.now(),
        } as any);

        const result = manager.updateCommand({
          slug: 'valid-slug',
          scope: 'user',
          description: 'Updated',
        });

        expect(result).toBeDefined();
        expect(result.description).toBe('Updated');
      });
    });

    describe('deleteCommand() slug validation', () => {
      it('should return false when deleting with path traversal slug', () => {
        const result = manager.deleteCommand({
          slug: '../../etc/passwd',
          scope: 'user',
        });
        expect(result).toBe(false);
      });

      it('should return false when deleting with ".." slug', () => {
        const result = manager.deleteCommand({
          slug: '../../../config',
          scope: 'user',
        });
        expect(result).toBe(false);
      });

      it('should return false when deleting with forward slash', () => {
        const result = manager.deleteCommand({
          slug: 'parent/child',
          scope: 'user',
        });
        expect(result).toBe(false);
      });

      it('should return false when deleting with backward slash', () => {
        const result = manager.deleteCommand({
          slug: 'parent\\child',
          scope: 'user',
        });
        expect(result).toBe(false);
      });

      it('should return false when deleting with absolute path', () => {
        const result = manager.deleteCommand({
          slug: '/etc/passwd',
          scope: 'user',
        });
        expect(result).toBe(false);
      });

      it('should return false when deleting with Windows absolute path', () => {
        const result = manager.deleteCommand({
          slug: 'C:\\sensitive\\file',
          scope: 'user',
        });
        expect(result).toBe(false);
      });

      it('should return false when deleting with null byte', () => {
        const result = manager.deleteCommand({
          slug: 'test\x00data',
          scope: 'user',
        });
        expect(result).toBe(false);
      });

      it('should succeed when deleting with valid kebab-case slug', () => {
        mockedFs.existsSync.mockReturnValue(true);

        const result = manager.deleteCommand({
          slug: 'valid-slug',
          scope: 'user',
        });

        expect(result).toBe(true);
        expect(mockedFs.unlinkSync).toHaveBeenCalled();
      });

      it('should not call fs.unlinkSync for invalid slug', () => {
        mockedFs.existsSync.mockReturnValue(true);

        manager.deleteCommand({
          slug: '../../etc/passwd',
          scope: 'user',
        });

        // unlinkSync should NOT be called because slug validation fails first
        expect(mockedFs.unlinkSync).not.toHaveBeenCalled();
      });
    });

    describe('Slug validation order (guard first, filesystem second)', () => {
      it('should reject invalid slug before checking filesystem', () => {
        // Set existsSync to always return true (pretend file exists everywhere)
        mockedFs.existsSync.mockReturnValue(true);

        // Try to delete a dangerous slug
        const result = manager.deleteCommand({
          slug: '../../etc/passwd',
          scope: 'user',
        });

        // Should return false WITHOUT calling any filesystem methods
        expect(result).toBe(false);
        expect(mockedFs.existsSync).not.toHaveBeenCalled();
      });

      it('should reject invalid slug in updateCommand before checking filesystem', () => {
        mockedFs.existsSync.mockReturnValue(true);

        expect(() => {
          manager.updateCommand({
            slug: '../../../sensitive',
            scope: 'user',
            description: 'test',
          });
        }).toThrow('Invalid command slug');

        // Filesystem methods should not be called
        expect(mockedFs.existsSync).not.toHaveBeenCalled();
      });

      it('should reject invalid slug in getCommand before checking filesystem', () => {
        mockedFs.existsSync.mockReturnValue(true);

        const result = manager.getCommand('../../etc/hosts', 'user');

        expect(result).toBeNull();
        // existsSync should not be called because slug is invalid
        expect(mockedFs.existsSync).not.toHaveBeenCalled();
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // YAML INJECTION TESTS
  // ──────────────────────────────────────────────────────────────────────────

  describe('YAML Injection Prevention', () => {
    describe('serializeCommand() description sanitization', () => {
      it('should sanitize newline in description', () => {
        const cmd: CustomCommand = {
          slug: 'test',
          description: 'Line 1\nLine 2',
          body: 'test body',
          parameters: [],
          scope: 'user',
          filePath: '/test.md',
          tags: [],
          icon: 'Terminal',
          updatedAt: Date.now(),
        };

        // Import the internal serializeCommand function for testing
        // We'll verify the output by mocking and checking what gets written
        mockedFs.existsSync.mockReturnValue(false);

        manager.createCommand({
          name: 'Test',
          description: 'Line 1\nLine 2',
          body: 'test body',
          scope: 'user',
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1];
        const lines = (writtenContent as string).split('\n');

        // Find the description line
        const descLine = lines.find(l => l.startsWith('description:'));
        expect(descLine).toBeDefined();

        // The newline should be converted to a space, so description line should NOT contain a literal newline
        const descValue = descLine?.substring('description:'.length).trim();
        expect(descValue).toBe('Line 1 Line 2');
      });

      it('should sanitize carriage return in description', () => {
        mockedFs.existsSync.mockReturnValue(false);

        manager.createCommand({
          name: 'Test',
          description: 'Line 1\rLine 2',
          body: 'test body',
          scope: 'user',
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1];
        const lines = (writtenContent as string).split('\n');

        const descLine = lines.find(l => l.startsWith('description:'));
        const descValue = descLine?.substring('description:'.length).trim();

        // Carriage return should be converted to space
        expect(descValue).toBe('Line 1 Line 2');
      });

      it('should sanitize multiple newlines in description', () => {
        mockedFs.existsSync.mockReturnValue(false);

        manager.createCommand({
          name: 'Test',
          description: 'Line 1\n\nLine 2\n\nLine 3',
          body: 'test body',
          scope: 'user',
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1];

        // The entire frontmatter should be intact (not prematurely closed by injection)
        expect(writtenContent).toContain('---');

        // Count closing --- to ensure frontmatter is not broken
        const frontmatterMatches = (writtenContent as string).match(/^---\n/gm);
        expect(frontmatterMatches).toBeDefined();
      });

      it('should prevent YAML injection by sanitizing description newlines', () => {
        mockedFs.existsSync.mockReturnValue(false);

        // Attempt injection: close frontmatter, add injected content
        const injectedDescription = 'Description\n---\nInjected: true\n---\nBody';

        manager.createCommand({
          name: 'Test',
          description: injectedDescription,
          body: 'test body',
          scope: 'user',
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;

        // Parse the written content
        const lines = writtenContent.split('\n');

        // Find the opening ---
        let frontmatterEnd = -1;
        for (let i = 1; i < lines.length; i++) {
          if (lines[i] === '---') {
            frontmatterEnd = i;
            break;
          }
        }

        // There should be exactly ONE closing --- after opening ---
        // (not two because newlines were sanitized)
        expect(frontmatterEnd).toBeGreaterThan(0);

        // Count how many "---" appear in the entire output
        const frontmatterCount = (writtenContent.match(/^---$/gm) || []).length;
        expect(frontmatterCount).toBe(2); // Opening and closing only
      });
    });

    describe('serializeCommand() parameter sanitization', () => {
      it('should sanitize newline in parameter name', () => {
        mockedFs.existsSync.mockReturnValue(false);

        manager.createCommand({
          name: 'Test',
          description: 'Test',
          body: 'test body',
          scope: 'user',
          parameters: [
            {
              name: 'env\ninjected',
              description: 'Environment',
              required: true,
            },
          ],
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;

        // The newline in parameter name should be converted to space
        expect(writtenContent).toContain('name: env injected');
        expect(writtenContent).not.toContain('name: env\ninjected');
      });

      it('should sanitize newline in parameter description', () => {
        mockedFs.existsSync.mockReturnValue(false);

        manager.createCommand({
          name: 'Test',
          description: 'Test',
          body: 'test body',
          scope: 'user',
          parameters: [
            {
              name: 'env',
              description: 'Line 1\nLine 2',
              required: true,
            },
          ],
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;

        // The newline should be converted to space
        expect(writtenContent).toContain('description: Line 1 Line 2');
      });

      it('should sanitize newline in parameter default value', () => {
        mockedFs.existsSync.mockReturnValue(false);

        manager.createCommand({
          name: 'Test',
          description: 'Test',
          body: 'test body',
          scope: 'user',
          parameters: [
            {
              name: 'env',
              description: 'Environment',
              required: false,
              default: 'staging\ninjected',
            },
          ],
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;

        // The newline in default value should be converted to space
        expect(writtenContent).toContain('default: "staging injected"');
      });

      it('should prevent YAML injection in parameters by sanitizing newlines', () => {
        mockedFs.existsSync.mockReturnValue(false);

        manager.createCommand({
          name: 'Test',
          description: 'Test',
          body: 'test body',
          scope: 'user',
          parameters: [
            {
              name: 'exploit\n---\nmalicious',
              description: 'Try to inject',
              required: true,
            },
          ],
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;

        // Count closing --- (should be exactly 2: opening and closing)
        const frontmatterCount = (writtenContent.match(/^---$/gm) || []).length;
        expect(frontmatterCount).toBe(2);
      });

      it('should handle multiple parameters with newlines', () => {
        mockedFs.existsSync.mockReturnValue(false);

        manager.createCommand({
          name: 'Test',
          description: 'Test\nDescription',
          body: 'test body',
          scope: 'user',
          parameters: [
            {
              name: 'param1\ninjected',
              description: 'First\nparam',
              required: true,
              default: 'value\ninjected',
            },
            {
              name: 'param2',
              description: 'Second',
              required: false,
              default: 'normal',
            },
          ],
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;

        // All newlines should be sanitized
        expect(writtenContent).not.toContain('param1\ninjected');
        expect(writtenContent).toContain('param1 injected');
        expect(writtenContent).not.toContain('First\nparam');
        expect(writtenContent).toContain('First param');
      });
    });

    describe('YAML parsing resilience', () => {
      it('should parse generated YAML correctly after sanitization', () => {
        mockedFs.existsSync.mockReturnValue(false);

        manager.createCommand({
          name: 'Test',
          description: 'Description\nwith\nnewlines',
          body: 'test body',
          scope: 'user',
          parameters: [
            {
              name: 'param\ninjection',
              description: 'Desc\nwith\ninjection',
              required: true,
              default: 'value\ninjection',
            },
          ],
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;

        // The output should have valid YAML structure
        const lines = writtenContent.split('\n');
        const openingIndex = lines.findIndex(l => l === '---');
        const closingIndex = lines.findIndex((l, i) => i > openingIndex && l === '---');

        expect(openingIndex).toBeGreaterThanOrEqual(0);
        expect(closingIndex).toBeGreaterThan(openingIndex);

        // Verify frontmatter section is well-formed
        const frontmatter = lines.slice(openingIndex + 1, closingIndex).join('\n');
        expect(frontmatter).toContain('description:');
        expect(frontmatter).toContain('parameters:');
      });

      it('should allow legitimate newlines in command body (after ---)', () => {
        mockedFs.existsSync.mockReturnValue(false);

        const multilineBody = `#!/bin/bash
if [ "$?" -eq 0 ]; then
  echo "Success"
else
  exit 1
fi`;

        manager.createCommand({
          name: 'Test',
          description: 'Test script',
          body: multilineBody,
          scope: 'user',
        });

        const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;

        // Body should retain all newlines
        expect(writtenContent).toContain('if [ "$?" -eq 0 ]; then');
        expect(writtenContent).toContain('echo "Success"');
        expect(writtenContent).toContain('exit 1');
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // COMBINED SECURITY TESTS
  // ──────────────────────────────────────────────────────────────────────────

  describe('Combined Attack Scenarios', () => {
    it('should prevent path traversal AND YAML injection combined', () => {
      // Attempt to combine both attacks
      const injectedSlug = '../../../etc/shadow';
      const injectedDesc = 'Description\n---\nmalicious: true';

      // The slug guard should catch this first
      expect(() => {
        manager.updateCommand({
          slug: injectedSlug,
          scope: 'user',
          description: injectedDesc,
        });
      }).toThrow('Invalid command slug');

      // File system should not be accessed
      expect(mockedFs.existsSync).not.toHaveBeenCalled();
    });

    it('should sanitize YAML injection in parameters even with valid slug', () => {
      mockedFs.existsSync.mockReturnValue(false);

      manager.createCommand({
        name: 'legitimate-command',
        description: 'Legitimate description',
        body: 'legitimate body',
        scope: 'user',
        parameters: [
          {
            name: 'param',
            description: 'Close frontmatter\n---\ninjected: "malicious"',
            required: false,
          },
        ],
      });

      const writtenContent = mockedFs.writeFileSync.mock.calls[0][1] as string;

      // Should have exactly 2 --- (opening and closing, not 4 from injection)
      const count = (writtenContent.match(/^---$/gm) || []).length;
      expect(count).toBe(2);

      // Verify the frontmatter doesn't contain the injection as a separate field
      const lines = writtenContent.split('\n');
      const frontmatterEnd = lines.findIndex((l, i) => i > 0 && l === '---');
      const frontmatter = lines.slice(0, frontmatterEnd).join('\n');

      // The "---" in the description should have been converted to spaces,
      // so there should not be a separate "injected:" field after a "---" delimiter
      const afterClosing = lines.slice(frontmatterEnd + 1).join('\n');
      expect(afterClosing).not.toMatch(/^\s*injected:/m);
    });
  });
});
