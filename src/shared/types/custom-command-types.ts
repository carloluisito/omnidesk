/**
 * Custom Command types — shared between main and renderer.
 *
 * Commands are persisted as Markdown files with YAML frontmatter in:
 *   - Project scope: <project-root>/.claude/commands/*.md
 *   - User scope:    ~/.claude/commands/*.md
 *   - Session scope: in-memory only (not written to disk)
 *
 * This aligns with Claude Code's native custom command convention so that
 * commands created in OmniDesk are also recognized by standalone CLI sessions.
 */

// ── Scope ──────────────────────────────────────────────────────────────────

export type CommandScope = 'project' | 'user' | 'session';

// ── Parameter definition ───────────────────────────────────────────────────

export interface CommandParameter {
  /** Alphanumeric + underscore. Used as {{name}} in the command body. */
  name: string;
  /** Shown to the user when prompted for a value. */
  description: string;
  /** Whether this parameter must be provided before running. Default: false */
  required: boolean;
  /** Default value used when the parameter is not supplied. */
  default?: string;
}

// ── Custom command ─────────────────────────────────────────────────────────

export interface CustomCommand {
  /** Derived from the filename without extension (e.g. "deploy-staging"). */
  slug: string;
  /** Human-readable description from frontmatter. Shown in the command palette. */
  description: string;
  /** The Markdown body — the actual instruction sent to Claude when the command is invoked. */
  body: string;
  /** Parameter definitions for this command. */
  parameters: CommandParameter[];
  /** Where this command lives. */
  scope: CommandScope;
  /** Absolute path to the .md file. Null for session-only commands. */
  filePath: string | null;
  /** Tags for search/filtering in the OmniDesk UI. */
  tags: string[];
  /** Lucide icon name. Defaults to "Terminal". */
  icon: string;
  /** File modification time (milliseconds since epoch). */
  updatedAt: number;
}

// ── IPC request / response types ───────────────────────────────────────────

export interface CommandListRequest {
  /** If provided, also scan <projectDir>/.claude/commands/ for project-scoped commands. */
  projectDir?: string;
  /** If provided, include in-memory session-only commands for this session. */
  sessionId?: string;
}

export interface CommandCreateRequest {
  /** Desired command name — will be slugified automatically. */
  name: string;
  /** Human-readable description (max 200 chars). */
  description: string;
  /** The instruction body (Markdown). Supports {{paramName}} placeholders. */
  body: string;
  /** Where to save the command. */
  scope: 'project' | 'user' | 'session';
  /** Optional parameter definitions. */
  parameters?: CommandParameter[];
  /** Optional tags for search/filtering. */
  tags?: string[];
  /** Optional Lucide icon name. Defaults to "Terminal". */
  icon?: string;
  /** Required when scope is "session". */
  sessionId?: string;
  /** Required when scope is "project". */
  projectDir?: string;
}

export interface CommandUpdateRequest {
  /** Slug of the command to update. */
  slug: string;
  /** Scope — used to locate the correct file or in-memory store. */
  scope: CommandScope;
  /** Updated description (optional). */
  description?: string;
  /** Updated body (optional). */
  body?: string;
  /** Updated parameters (optional, replaces the full list). */
  parameters?: CommandParameter[];
  /** Updated tags (optional, replaces the full list). */
  tags?: string[];
  /** Updated icon (optional). */
  icon?: string;
  /** Required when scope is "session". */
  sessionId?: string;
  /** Required when scope is "project". */
  projectDir?: string;
}

export interface CommandDeleteRequest {
  /** Slug of the command to delete. */
  slug: string;
  /** Scope — used to locate the correct file or in-memory store. */
  scope: CommandScope;
  /** Required when scope is "session". */
  sessionId?: string;
  /** Required when scope is "project". */
  projectDir?: string;
}

export interface CommandValidation {
  /** Whether the name/slug is valid and unique. */
  valid: boolean;
  /** Human-readable error messages. Empty when valid. */
  errors: string[];
  /** The slugified form of the provided name. */
  suggestedSlug: string;
}

// ── Constants ───────────────────────────────────────────────────────────────

/**
 * Claude Code built-in command names that cannot be used as custom command slugs.
 * Must be validated at creation time to prevent shadowing built-in behaviour.
 */
export const FORBIDDEN_COMMAND_SLUGS: readonly string[] = [
  'help',
  'init',
  'config',
  'login',
  'logout',
  'version',
  'update',
] as const;

/** Maximum slug length (characters, not including the .md extension). */
export const MAX_SLUG_LENGTH = 60;

/** Maximum frontmatter description length (characters). */
export const MAX_DESCRIPTION_LENGTH = 200;

/**
 * Files larger than this are skipped during directory scanning.
 * Prevents accidental large-file ingestion from `.claude/commands/`.
 */
export const MAX_COMMAND_FILE_SIZE = 51200; // 50 KB

// ── Pure helpers (safe in both main and renderer) ──────────────────────────

/**
 * Convert any user-supplied string into a valid command slug.
 *
 * @example
 * slugifyCommandName('My Deploy Script')  // → 'my-deploy-script'
 * slugifyCommandName('run_tests!')        // → 'run-tests'
 * slugifyCommandName('  fix bug  ')       // → 'fix-bug'
 */
export function slugifyCommandName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

/**
 * Return true when the slug is syntactically valid as a custom command name.
 * Does NOT check for filesystem collisions — that requires an async lookup.
 */
export function isValidCommandSlug(slug: string): boolean {
  if (!slug || slug.length === 0 || slug.length > MAX_SLUG_LENGTH) return false;
  if ((FORBIDDEN_COMMAND_SLUGS as readonly string[]).includes(slug)) return false;
  // Must be kebab-case: lowercase letters/digits with interior hyphens.
  // A single-character slug (e.g. "x") is allowed.
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug);
}

/**
 * Strip CR and LF from a scalar YAML value so a user-supplied newline cannot
 * close the frontmatter block early and inject arbitrary text into the body.
 */
function sanitizeScalar(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

/**
 * Serialize command metadata + body into the canonical `.md` file format.
 *
 * @example
 * serializeCommandFile('Run tests', 'Run npm test and report failures');
 * // ---
 * // description: Run tests
 * // ---
 * //
 * // Run npm test and report failures
 */
export function serializeCommandFile(
  description: string,
  body: string,
  parameters?: CommandParameter[],
  tags?: string[],
  icon?: string,
): string {
  const lines: string[] = ['---', `description: ${sanitizeScalar(description)}`];

  if (parameters && parameters.length > 0) {
    lines.push('parameters:');
    for (const p of parameters) {
      lines.push(`  - name: ${sanitizeScalar(p.name)}`);
      lines.push(`    description: ${sanitizeScalar(p.description)}`);
      lines.push(`    required: ${p.required}`);
      if (p.default !== undefined) {
        lines.push(`    default: "${sanitizeScalar(p.default)}"`);
      }
    }
  }

  if (tags && tags.length > 0) {
    lines.push('tags:');
    for (const t of tags) {
      lines.push(`  - ${t}`);
    }
  }

  if (icon) {
    lines.push(`icon: ${icon}`);
  }

  lines.push('---', '', body.trim());
  return lines.join('\n');
}
