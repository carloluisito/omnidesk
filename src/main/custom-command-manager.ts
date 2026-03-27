/**
 * CustomCommandManager — manages Claude Code custom slash commands.
 *
 * Commands are stored as Markdown files with YAML frontmatter in:
 *   - Project scope: <projectDir>/.claude/commands/*.md
 *   - User scope:    ~/.claude/commands/*.md
 *   - Session scope: in-memory Map (never written to disk)
 *
 * The format aligns with Claude Code's native custom command convention so that
 * commands created here also work in standalone claude CLI sessions.
 *
 * File watching uses a 500ms debounce (same pattern as GitManager) because
 * Windows fs.watch fires multiple events per file change.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { IPCEmitter } from './ipc-emitter';
import { isValidCommandSlug } from '../shared/types/custom-command-types';
import type {
  CustomCommand,
  CommandScope,
  CommandParameter,
  CommandListRequest,
  CommandCreateRequest,
  CommandUpdateRequest,
  CommandDeleteRequest,
  CommandValidation,
} from '../shared/types/custom-command-types';

// ── Constants ──────────────────────────────────────────────────────────────

const USER_COMMANDS_DIR = path.join(os.homedir(), '.claude', 'commands');
const MAX_FILE_SIZE_BYTES = 51200; // 50 KB

/**
 * Claude Code built-in command names that must not be shadowed.
 * Validated against the slug (lowercased, hyphenated) form of the user's input.
 */
const FORBIDDEN_SLUGS = new Set([
  'help', 'init', 'config', 'login', 'logout', 'version', 'update',
]);

// ── YAML frontmatter parser (no external dependency) ──────────────────────

interface ParsedFrontmatter {
  meta: Record<string, unknown>;
  body: string;
}

/**
 * Minimal YAML parser for our specific frontmatter schema.
 * Handles: string scalars, booleans, lists of scalars, lists of objects.
 * Does NOT attempt to handle YAML anchors, multiline strings, or quotes.
 */
function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Skip blank lines
    if (!line.trim()) { i++; continue; }

    // Root-level key: value (non-empty value on the same line)
    const kvMatch = line.match(/^(\w+):\s+(.+)$/);
    if (kvMatch) {
      const val = kvMatch[2].trim();
      if (val === 'true') result[kvMatch[1]] = true;
      else if (val === 'false') result[kvMatch[1]] = false;
      else result[kvMatch[1]] = val;
      i++;
      continue;
    }

    // Root-level key: (no value — starts an array)
    const listKeyMatch = line.match(/^(\w+):\s*$/);
    if (listKeyMatch) {
      const key = listKeyMatch[1];
      const items: unknown[] = [];
      i++;

      while (i < lines.length) {
        const subLine = lines[i];

        // Skip blank lines inside a list
        if (!subLine.trim()) { i++; continue; }

        // End of list: line is not indented
        if (!subLine.startsWith('  ')) break;

        // Object list item: "  - firstKey: value"
        const objItemMatch = subLine.match(/^  - (\w+):\s*(.*)$/);
        if (objItemMatch) {
          const item: Record<string, unknown> = {};
          const firstVal = objItemMatch[2].trim();
          if (firstVal === 'true') item[objItemMatch[1]] = true;
          else if (firstVal === 'false') item[objItemMatch[1]] = false;
          else item[objItemMatch[1]] = firstVal;
          i++;

          // Read continuation properties: "    key: value"
          while (i < lines.length) {
            const propLine = lines[i];
            if (!propLine.trim()) { i++; continue; }
            if (!propLine.startsWith('    ')) break;
            const propMatch = propLine.match(/^    (\w+):\s*(.*)$/);
            if (!propMatch) { i++; continue; }
            const v = propMatch[2].trim();
            if (v === 'true') item[propMatch[1]] = true;
            else if (v === 'false') item[propMatch[1]] = false;
            else item[propMatch[1]] = v;
            i++;
          }

          items.push(item);
          continue;
        }

        // Scalar list item: "  - value"
        const scalarItemMatch = subLine.match(/^  - (.+)$/);
        if (scalarItemMatch) {
          items.push(scalarItemMatch[1].trim());
          i++;
          continue;
        }

        i++; // Unrecognized indented line — skip
      }

      result[key] = items;
      continue;
    }

    i++; // Skip unrecognized root-level line
  }

  return result;
}

function parseFrontmatter(content: string): ParsedFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) {
    return { meta: {}, body: content.trim() };
  }
  try {
    const meta = parseSimpleYaml(match[1]);
    const body = match[2].trim();
    return { meta, body };
  } catch (err) {
    console.warn('[CustomCommandManager] Failed to parse frontmatter YAML:', err);
    return { meta: {}, body: match[2].trim() };
  }
}

// ── Serialization ──────────────────────────────────────────────────────────

/**
 * Strip CR and LF from a scalar YAML value so a user-supplied newline cannot
 * close the frontmatter block early and inject arbitrary text into the body.
 */
function sanitizeScalar(value: string): string {
  return value.replace(/[\r\n]/g, ' ');
}

function serializeCommand(cmd: CustomCommand): string {
  let fm = '---\n';
  fm += `description: ${sanitizeScalar(cmd.description)}\n`;

  if (cmd.parameters.length > 0) {
    fm += 'parameters:\n';
    for (const p of cmd.parameters) {
      fm += `  - name: ${sanitizeScalar(p.name)}\n`;
      fm += `    description: ${sanitizeScalar(p.description)}\n`;
      fm += `    required: ${p.required}\n`;
      if (p.default !== undefined && p.default !== '') {
        fm += `    default: "${sanitizeScalar(p.default)}"\n`;
      }
    }
  }

  if (cmd.tags.length > 0) {
    fm += 'tags:\n';
    for (const t of cmd.tags) {
      fm += `  - ${t}\n`;
    }
  }

  if (cmd.icon && cmd.icon !== 'Terminal') {
    fm += `icon: ${cmd.icon}\n`;
  }

  fm += '---\n\n';
  return fm + cmd.body;
}

// ── Slug utilities ─────────────────────────────────────────────────────────

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60);
}

// ── Manager ────────────────────────────────────────────────────────────────

export class CustomCommandManager {
  /** In-memory store for session-only commands, keyed by sessionId. */
  private sessionCommands: Map<string, CustomCommand[]> = new Map();

  private userWatcher: fs.FSWatcher | null = null;
  private projectWatcher: fs.FSWatcher | null = null;
  private debounceTimer: NodeJS.Timeout | null = null;
  private emitter: IPCEmitter | null = null;
  private currentProjectDir: string | null = null;

  constructor() {
    this.ensureUserCommandsDir();
    this.watchUserDir();
  }

  // ── Setup ──────────────────────────────────────────────────────────────

  setEmitter(emitter: IPCEmitter): void {
    this.emitter = emitter;
  }

  /**
   * Change the watched project directory.
   * Called when the active session switches to a different workspace.
   */
  setProjectDir(dir: string | null): void {
    if (this.projectWatcher) {
      this.projectWatcher.close();
      this.projectWatcher = null;
    }
    this.currentProjectDir = dir;
    if (dir) {
      const cmdsDir = path.join(dir, '.claude', 'commands');
      this.watchProjectDir(cmdsDir);
    }
  }

  destroy(): void {
    this.userWatcher?.close();
    this.projectWatcher?.close();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.sessionCommands.clear();
    this.emitter = null;
  }

  // ── Public API ─────────────────────────────────────────────────────────

  /**
   * List all commands accessible to the caller.
   * Resolution order: project commands shadow user commands with the same slug.
   * Result order: project first, then user, then session.
   */
  listCommands(request: CommandListRequest): CustomCommand[] {
    const userCommands = this.loadFromDir(USER_COMMANDS_DIR, 'user');

    let projectCommands: CustomCommand[] = [];
    if (request.projectDir) {
      const dir = path.join(request.projectDir, '.claude', 'commands');
      projectCommands = this.loadFromDir(dir, 'project');
    }

    let sessionCmds: CustomCommand[] = [];
    if (request.sessionId) {
      sessionCmds = this.sessionCommands.get(request.sessionId) ?? [];
    }

    // Project commands shadow user commands with the same slug
    const projectSlugs = new Set(projectCommands.map(c => c.slug));
    const filteredUser = userCommands.filter(c => !projectSlugs.has(c.slug));

    return [...projectCommands, ...filteredUser, ...sessionCmds];
  }

  /**
   * Get a single command by slug and scope.
   * Returns null if not found.
   */
  getCommand(slug: string, scope: CommandScope, projectDir?: string): CustomCommand | null {
    if (!isValidCommandSlug(slug)) return null;
    if (scope === 'session') return null; // Cannot look up session commands without sessionId

    const filePath = this.resolveFilePath(slug, scope, projectDir);
    if (!filePath || !fs.existsSync(filePath)) return null;
    return this.parseCommandFile(filePath, scope);
  }

  /**
   * Validate a command name — check slug, forbidden names, uniqueness.
   */
  validateName(name: string, scope: CommandScope, projectDir?: string): CommandValidation {
    const suggestedSlug = slugify(name);
    const errors: string[] = [];

    if (!suggestedSlug) {
      return {
        valid: false,
        errors: ['Command name must contain at least one alphanumeric character'],
        suggestedSlug: 'command',
      };
    }

    if (FORBIDDEN_SLUGS.has(suggestedSlug)) {
      errors.push(`"${suggestedSlug}" is a reserved Claude Code command name`);
    }

    if (scope !== 'session') {
      const filePath = this.resolveFilePath(suggestedSlug, scope, projectDir);
      if (filePath && fs.existsSync(filePath)) {
        errors.push(`A command named "${suggestedSlug}" already exists in ${scope} scope`);
      }
    }

    return { valid: errors.length === 0, errors, suggestedSlug };
  }

  /**
   * Create a new custom command.
   * For session scope: stored in memory only.
   * For project/user scope: written to disk as a .md file.
   */
  createCommand(request: CommandCreateRequest): CustomCommand {
    const slug = slugify(request.name);

    if (!slug) {
      throw new Error('Command name must contain at least one alphanumeric character');
    }
    if (FORBIDDEN_SLUGS.has(slug)) {
      throw new Error(`"${slug}" is a reserved Claude Code command name`);
    }

    const now = Date.now();
    const params: CommandParameter[] = request.parameters ?? [];
    const tags: string[] = request.tags ?? [];
    const icon = request.icon ?? 'Terminal';

    // ── Session-only ──
    if (request.scope === 'session') {
      if (!request.sessionId) throw new Error('sessionId is required for session-scoped commands');

      const cmd: CustomCommand = {
        slug,
        description: request.description,
        body: request.body,
        parameters: params,
        scope: 'session',
        filePath: null,
        tags,
        icon,
        updatedAt: now,
      };

      const existing = this.sessionCommands.get(request.sessionId) ?? [];
      const idx = existing.findIndex(c => c.slug === slug);
      if (idx >= 0) {
        existing[idx] = cmd;
      } else {
        existing.push(cmd);
      }
      this.sessionCommands.set(request.sessionId, existing);
      return cmd;
    }

    // ── Disk-based (project or user) ──
    const dir = this.resolveDir(request.scope, request.projectDir);
    fs.mkdirSync(dir, { recursive: true });

    const filePath = path.join(dir, `${slug}.md`);
    if (fs.existsSync(filePath)) {
      throw new Error(`A command named "${slug}" already exists in ${request.scope} scope`);
    }

    const cmd: CustomCommand = {
      slug,
      description: request.description,
      body: request.body,
      parameters: params,
      scope: request.scope,
      filePath,
      tags,
      icon,
      updatedAt: now,
    };

    this.atomicWrite(filePath, serializeCommand(cmd));
    return cmd;
  }

  /**
   * Update an existing custom command. Merges the provided fields over the existing state.
   */
  updateCommand(request: CommandUpdateRequest): CustomCommand {
    if (!isValidCommandSlug(request.slug)) {
      throw new Error(`Invalid command slug: "${request.slug}"`);
    }

    // ── Session-only ──
    if (request.scope === 'session') {
      if (!request.sessionId) throw new Error('sessionId is required for session-scoped commands');
      const cmds = this.sessionCommands.get(request.sessionId) ?? [];
      const idx = cmds.findIndex(c => c.slug === request.slug);
      if (idx < 0) throw new Error(`Session command "${request.slug}" not found`);

      const cmd = { ...cmds[idx] };
      if (request.description !== undefined) cmd.description = request.description;
      if (request.body !== undefined) cmd.body = request.body;
      if (request.parameters !== undefined) cmd.parameters = request.parameters;
      if (request.tags !== undefined) cmd.tags = request.tags;
      if (request.icon !== undefined) cmd.icon = request.icon;
      cmd.updatedAt = Date.now();

      cmds[idx] = cmd;
      this.sessionCommands.set(request.sessionId, cmds);
      return cmd;
    }

    // ── Disk-based ──
    const filePath = this.resolveFilePath(request.slug, request.scope, request.projectDir);
    if (!filePath || !fs.existsSync(filePath)) {
      throw new Error(`Command "${request.slug}" not found in ${request.scope} scope`);
    }

    const existing = this.parseCommandFile(filePath, request.scope);
    if (!existing) throw new Error(`Failed to parse command file: ${filePath}`);

    if (request.description !== undefined) existing.description = request.description;
    if (request.body !== undefined) existing.body = request.body;
    if (request.parameters !== undefined) existing.parameters = request.parameters;
    if (request.tags !== undefined) existing.tags = request.tags;
    if (request.icon !== undefined) existing.icon = request.icon;
    existing.updatedAt = Date.now();

    this.atomicWrite(filePath, serializeCommand(existing));
    return existing;
  }

  /**
   * Delete a command. Returns true if deleted, false if not found.
   */
  deleteCommand(request: CommandDeleteRequest): boolean {
    if (!isValidCommandSlug(request.slug)) return false;

    // ── Session-only ──
    if (request.scope === 'session') {
      if (!request.sessionId) return false;
      const cmds = this.sessionCommands.get(request.sessionId) ?? [];
      const idx = cmds.findIndex(c => c.slug === request.slug);
      if (idx < 0) return false;
      cmds.splice(idx, 1);
      this.sessionCommands.set(request.sessionId, cmds);
      return true;
    }

    // ── Disk-based ──
    const filePath = this.resolveFilePath(request.slug, request.scope, request.projectDir);
    if (!filePath || !fs.existsSync(filePath)) return false;

    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (err) {
      console.error(`[CustomCommandManager] Failed to delete ${filePath}:`, err);
      return false;
    }
  }

  /**
   * Remove all session-only commands for a given session.
   * Call this when a session is closed.
   */
  cleanupSession(sessionId: string): void {
    this.sessionCommands.delete(sessionId);
  }

  // ── Private helpers ────────────────────────────────────────────────────

  private ensureUserCommandsDir(): void {
    try {
      fs.mkdirSync(USER_COMMANDS_DIR, { recursive: true });
    } catch (err) {
      console.warn('[CustomCommandManager] Could not create user commands dir:', err);
    }
  }

  private watchUserDir(): void {
    try {
      this.userWatcher = fs.watch(USER_COMMANDS_DIR, { persistent: false }, () => {
        this.scheduleChangeNotify('user');
      });
      this.userWatcher.on('error', err => {
        console.warn('[CustomCommandManager] User dir watcher error:', err);
      });
    } catch (err) {
      console.warn('[CustomCommandManager] Could not watch user commands dir:', err);
    }
  }

  private watchProjectDir(dir: string): void {
    try {
      fs.mkdirSync(dir, { recursive: true });
      this.projectWatcher = fs.watch(dir, { persistent: false }, () => {
        this.scheduleChangeNotify('project');
      });
      this.projectWatcher.on('error', err => {
        console.warn('[CustomCommandManager] Project dir watcher error:', err);
      });
    } catch (err) {
      console.warn('[CustomCommandManager] Could not watch project commands dir:', err);
    }
  }

  /** Debounced (500ms) push to renderer after external file-system changes. */
  private scheduleChangeNotify(changedScope: CommandScope): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);

    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (!this.emitter) return;

      let commands: CustomCommand[];
      if (changedScope === 'user') {
        commands = this.loadFromDir(USER_COMMANDS_DIR, 'user');
      } else {
        const dir = this.currentProjectDir
          ? path.join(this.currentProjectDir, '.claude', 'commands')
          : null;
        commands = dir ? this.loadFromDir(dir, 'project') : [];
      }

      this.emitter.emit('onCommandsChanged', { scope: changedScope, commands });
    }, 500);
  }

  private loadFromDir(dir: string, scope: CommandScope): CustomCommand[] {
    if (!fs.existsSync(dir)) return [];

    const commands: CustomCommand[] = [];
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;

        const filePath = path.join(dir, entry.name);

        // Skip suspiciously large files
        const stat = fs.statSync(filePath);
        if (stat.size > MAX_FILE_SIZE_BYTES) {
          console.warn(`[CustomCommandManager] Skipping oversized file: ${filePath}`);
          continue;
        }

        const cmd = this.parseCommandFile(filePath, scope);
        if (cmd) commands.push(cmd);
      }
    } catch (err) {
      console.error(`[CustomCommandManager] Failed to scan directory ${dir}:`, err);
    }

    return commands;
  }

  private parseCommandFile(filePath: string, scope: CommandScope): CustomCommand | null {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      const stat = fs.statSync(filePath);
      const slug = path.basename(filePath, '.md');

      const { meta, body } = parseFrontmatter(content);

      const description = typeof meta['description'] === 'string' ? meta['description'] : '';
      const icon = typeof meta['icon'] === 'string' ? meta['icon'] : 'Terminal';

      // Parse parameters
      const rawParams = Array.isArray(meta['parameters']) ? meta['parameters'] : [];
      const parameters: CommandParameter[] = (rawParams as unknown[])
        .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
        .map(p => ({
          name: typeof p['name'] === 'string' ? p['name'] : '',
          description: typeof p['description'] === 'string' ? p['description'] : '',
          required: p['required'] === true || p['required'] === 'true',
          default: typeof p['default'] === 'string' && p['default'] !== ''
            ? p['default']
            : undefined,
        }))
        .filter(p => p.name.length > 0);

      // Parse tags
      const rawTags = Array.isArray(meta['tags']) ? meta['tags'] : [];
      const tags = (rawTags as unknown[]).filter((t): t is string => typeof t === 'string');

      return {
        slug,
        description,
        body,
        parameters,
        scope,
        filePath,
        tags,
        icon,
        updatedAt: stat.mtimeMs,
      };
    } catch (err) {
      console.warn(`[CustomCommandManager] Failed to parse ${filePath}:`, err);
      return null;
    }
  }

  private resolveDir(scope: 'project' | 'user', projectDir?: string): string {
    if (scope === 'project') {
      if (!projectDir) throw new Error('projectDir is required for project-scoped commands');
      return path.join(projectDir, '.claude', 'commands');
    }
    return USER_COMMANDS_DIR;
  }

  private resolveFilePath(
    slug: string,
    scope: CommandScope,
    projectDir?: string,
  ): string | null {
    if (scope === 'user') return path.join(USER_COMMANDS_DIR, `${slug}.md`);
    if (scope === 'project' && projectDir) {
      return path.join(projectDir, '.claude', 'commands', `${slug}.md`);
    }
    return null;
  }

  /** Atomic write via temp-file rename (same pattern as PromptTemplatesManager). */
  private atomicWrite(filePath: string, content: string): void {
    const tmpPath = `${filePath}.tmp`;
    fs.writeFileSync(tmpPath, content, 'utf-8');
    fs.renameSync(tmpPath, filePath);
  }
}
