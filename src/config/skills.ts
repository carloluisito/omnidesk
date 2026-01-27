import { readdirSync, readFileSync, existsSync } from 'fs';
import { join, basename, extname } from 'path';
import { parse as parseYaml } from 'yaml';
import { SkillConfig, SkillConfigSchema } from '../types.js';

// Lazy path resolution - evaluated when needed, not at module load time
function getGlobalSkillsDir(): string {
  return join(process.cwd(), 'config', 'skills');
}

export class SkillRegistry {
  private globalSkills: Map<string, SkillConfig> = new Map();
  private repoSkillsCache: Map<string, Map<string, SkillConfig>> = new Map();
  private globalSkillsLoaded = false;

  private ensureGlobalSkillsLoaded(): void {
    if (!this.globalSkillsLoaded) {
      this.loadGlobalSkills();
      this.globalSkillsLoaded = true;
    }
  }

  private loadGlobalSkills(): void {
    const globalSkillsDir = getGlobalSkillsDir();
    if (!existsSync(globalSkillsDir)) {
      console.log('[SkillRegistry] No global skills directory found at', globalSkillsDir);
      return;
    }

    const files = readdirSync(globalSkillsDir)
      .filter(f => f.endsWith('.md'));

    for (const file of files) {
      const filePath = join(globalSkillsDir, file);
      const skill = this.parseSkillFile(filePath);
      if (skill) {
        skill.source = 'global';
        skill.filePath = filePath;
        this.globalSkills.set(skill.id, skill);
      }
    }

    console.log(`[SkillRegistry] Loaded ${this.globalSkills.size} global skills`);
  }

  private parseSkillFile(filePath: string): SkillConfig | null {
    try {
      const content = readFileSync(filePath, 'utf-8');
      const filename = basename(filePath, extname(filePath));

      // Skip README files
      if (filename.toLowerCase() === 'readme') {
        return null;
      }

      let metadata: Record<string, unknown> = {};
      let body = content;

      // Try to extract frontmatter if present
      const frontmatterMatch = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
      if (frontmatterMatch) {
        const [, frontmatter, markdownBody] = frontmatterMatch;
        metadata = parseYaml(frontmatter) || {};
        body = markdownBody;
      } else {
        // No frontmatter - treat entire file as prompt content
        // Try to extract description from first heading or first line
        const firstHeadingMatch = content.match(/^#\s+(.+)$/m);
        const firstLineMatch = content.match(/^(.+)$/m);

        if (firstHeadingMatch) {
          metadata.description = firstHeadingMatch[1].trim();
        } else if (firstLineMatch && firstLineMatch[1].length < 200) {
          metadata.description = firstLineMatch[1].trim();
        }

        console.log(`[SkillRegistry] No frontmatter in ${filePath}, using defaults`);
      }

      // Derive ID from filename - must be lowercase with hyphens only
      const rawId = (metadata.id as string) || filename;
      const id = rawId.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-');

      // Derive name from filename (convert hyphens to spaces, title case)
      const derivedName = filename
        .replace(/[-_]/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

      // Store the markdown body as the prompt content
      const skillData = {
        id,
        name: (metadata.name as string) || derivedName,
        description: (metadata.description as string) || `Skill: ${derivedName}`,
        type: (metadata.type as string) || 'prompt',  // Default to prompt type
        promptContent: body.trim(),
        ...metadata,
      };

      return SkillConfigSchema.parse(skillData);
    } catch (error) {
      console.error(`[SkillRegistry] Failed to parse skill ${filePath}:`, error);
      return null;
    }
  }

  // Load skills for a specific repository
  // Checks both .claude/skills and .claudedesk/skills directories
  loadRepoSkills(repoId: string, repoPath: string): void {
    const skillsDirs = [
      join(repoPath, '.claude', 'skills'),      // Claude Code convention
      join(repoPath, '.claudedesk', 'skills'),  // ClaudeDesk convention
    ];

    console.log(`[SkillRegistry] Loading repo skills for ${repoId} from path: ${repoPath}`);

    const repoSkills = new Map<string, SkillConfig>();

    for (const skillsDir of skillsDirs) {
      const dirExists = existsSync(skillsDir);
      console.log(`[SkillRegistry] Checking ${skillsDir} - exists: ${dirExists}`);

      if (!dirExists) {
        continue;
      }

      const files = readdirSync(skillsDir).filter(f => f.endsWith('.md'));
      console.log(`[SkillRegistry] Found ${files.length} .md files in ${skillsDir}:`, files);

      for (const file of files) {
        const filePath = join(skillsDir, file);
        const skill = this.parseSkillFile(filePath);
        if (skill) {
          skill.source = 'repo';
          skill.filePath = filePath;
          // Don't override if already loaded (first directory has priority)
          if (!repoSkills.has(skill.id)) {
            repoSkills.set(skill.id, skill);
            console.log(`[SkillRegistry] Loaded skill: ${skill.id} from ${filePath}`);
          }
        } else {
          console.log(`[SkillRegistry] Failed to parse skill from ${filePath}`);
        }
      }
    }

    this.repoSkillsCache.set(repoId, repoSkills);
    console.log(`[SkillRegistry] Total: Loaded ${repoSkills.size} skills for repo ${repoId}`);
  }

  // Get a skill by ID with precedence: repo > global
  get(skillId: string, repoId?: string): SkillConfig | undefined {
    this.ensureGlobalSkillsLoaded();
    // Check repo skills first (higher precedence)
    if (repoId) {
      const repoSkills = this.repoSkillsCache.get(repoId);
      if (repoSkills?.has(skillId)) {
        return repoSkills.get(skillId);
      }
    }

    // Fall back to global skills
    return this.globalSkills.get(skillId);
  }

  // Get all skills available for a repository (merged)
  getAll(repoId?: string): SkillConfig[] {
    this.ensureGlobalSkillsLoaded();
    const skills = new Map<string, SkillConfig>();

    // Add global skills first
    for (const [id, skill] of this.globalSkills) {
      skills.set(id, skill);
    }

    // Override with repo skills (higher precedence)
    if (repoId) {
      const repoSkills = this.repoSkillsCache.get(repoId);
      if (repoSkills) {
        for (const [id, skill] of repoSkills) {
          skills.set(id, skill);
        }
      }
    }

    return Array.from(skills.values());
  }

  // Get only global skills
  getGlobal(): SkillConfig[] {
    this.ensureGlobalSkillsLoaded();
    return Array.from(this.globalSkills.values());
  }

  // Get only repo-specific skills
  getRepoSkills(repoId: string): SkillConfig[] {
    this.ensureGlobalSkillsLoaded();
    const repoSkills = this.repoSkillsCache.get(repoId);
    return repoSkills ? Array.from(repoSkills.values()) : [];
  }

  // Reload all global skills
  reload(): void {
    this.globalSkills.clear();
    this.globalSkillsLoaded = false;
    this.ensureGlobalSkillsLoaded();
  }

  // Reload skills for a specific repo
  reloadRepo(repoId: string, repoPath: string): void {
    this.loadRepoSkills(repoId, repoPath);
  }

  // Clear repo cache (useful when repo is removed)
  clearRepoCache(repoId: string): void {
    this.repoSkillsCache.delete(repoId);
  }
}

// Lazy singleton - only created on first access (after cli.ts has called process.chdir())
let _skillRegistry: SkillRegistry | null = null;

function getSkillRegistryInstance(): SkillRegistry {
  if (!_skillRegistry) {
    _skillRegistry = new SkillRegistry();
  }
  return _skillRegistry;
}

export const skillRegistry = new Proxy({} as SkillRegistry, {
  get(_, prop) {
    const instance = getSkillRegistryInstance();
    const value = (instance as unknown as Record<string | symbol, unknown>)[prop];
    return typeof value === 'function' ? (value as Function).bind(instance) : value;
  }
});
