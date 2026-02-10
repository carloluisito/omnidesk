import { BrowserWindow } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { app } from 'electron';
import { IPCEmitter } from './ipc-emitter';
import type {
  TeamMember,
  Task,
  TeamInfo,
  SessionMetadata,
} from '../shared/ipc-types';

const CLAUDE_DIR = path.join(app.getPath('home'), '.claude');
const TEAMS_DIR = path.join(CLAUDE_DIR, 'teams');
const TASKS_DIR = path.join(CLAUDE_DIR, 'tasks');

const DEBOUNCE_MS = 200;
const WATCHER_RETRY_COUNT = 3;
const WATCHER_RETRY_DELAY_MS = 2000;
const AUTO_LINK_WINDOW_MS = 30000; // 30 seconds
const STALE_TEAM_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes — skip teams older than this on startup

/**
 * Map real Claude Code agent types to our internal types.
 * Real values: "team-lead", "general-purpose"
 * Our values: "lead", "teammate"
 */
function normalizeAgentType(raw: string): 'lead' | 'teammate' {
  if (raw === 'team-lead') return 'lead';
  return 'teammate';
}

export class AgentTeamManager {
  private teams: Map<string, TeamInfo> = new Map();
  private sessionTeamMap: Map<string, string> = new Map(); // sessionId → teamName
  private teamsWatcher: fs.FSWatcher | null = null;
  private tasksWatcher: fs.FSWatcher | null = null;
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private emitter: IPCEmitter | null = null;
  private getSessionsFn: (() => SessionMetadata[]) | null = null;
  private updateSessionMetadataFn: ((sessionId: string, teamData: Partial<SessionMetadata>) => void) | null = null;
  private closeSessionFn: ((sessionId: string) => Promise<boolean>) | null = null;

  setMainWindow(window: BrowserWindow): void {
    this.emitter = new IPCEmitter(window);
  }

  setSessionAccessors(
    getSessions: () => SessionMetadata[],
    updateMetadata: (sessionId: string, teamData: Partial<SessionMetadata>) => void,
    closeSession: (sessionId: string) => Promise<boolean>,
  ): void {
    this.getSessionsFn = getSessions;
    this.updateSessionMetadataFn = updateMetadata;
    this.closeSessionFn = closeSession;
  }

  async initialize(): Promise<void> {
    // Ensure directories exist
    this.ensureDir(TEAMS_DIR);
    this.ensureDir(TASKS_DIR);

    // Scan existing directories
    await this.scanTeams();
    await this.scanTasks();

    // Start watchers
    this.startTeamsWatcher();
    this.startTasksWatcher();
  }

  destroy(): void {
    if (this.teamsWatcher) {
      this.teamsWatcher.close();
      this.teamsWatcher = null;
    }
    if (this.tasksWatcher) {
      this.tasksWatcher.close();
      this.tasksWatcher = null;
    }
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.teams.clear();
    this.sessionTeamMap.clear();
  }

  // ── Public API ──

  getTeams(): TeamInfo[] {
    return Array.from(this.teams.values());
  }

  getTeamForSession(sessionId: string): TeamInfo | null {
    const teamName = this.sessionTeamMap.get(sessionId);
    if (!teamName) return null;
    return this.teams.get(teamName) || null;
  }

  getTeamSessions(teamName: string): SessionMetadata[] {
    if (!this.getSessionsFn) return [];
    const sessions = this.getSessionsFn();
    return sessions.filter(s => s.teamName === teamName);
  }

  linkSessionToTeam(sessionId: string, teamName: string, agentId: string): boolean {
    const team = this.teams.get(teamName);
    if (!team) return false;

    const member = team.members.find(m => m.agentId === agentId);
    if (!member) return false;

    this.sessionTeamMap.set(sessionId, teamName);

    if (this.updateSessionMetadataFn) {
      this.updateSessionMetadataFn(sessionId, {
        teamName,
        agentId,
        agentType: member.agentType,
        isTeammate: member.agentType === 'teammate',
      });
    }

    return true;
  }

  unlinkSessionFromTeam(sessionId: string): boolean {
    const hadTeam = this.sessionTeamMap.has(sessionId);
    this.sessionTeamMap.delete(sessionId);

    if (this.updateSessionMetadataFn) {
      this.updateSessionMetadataFn(sessionId, {
        teamName: undefined,
        agentId: undefined,
        agentType: undefined,
        isTeammate: undefined,
      });
    }

    return hadTeam;
  }

  async closeTeam(teamName: string): Promise<boolean> {
    const team = this.teams.get(teamName);
    if (!team || !this.closeSessionFn || !this.getSessionsFn) return false;

    const sessions = this.getSessionsFn().filter(s => s.teamName === teamName);
    for (const session of sessions) {
      await this.closeSessionFn(session.id);
      this.sessionTeamMap.delete(session.id);
    }

    return true;
  }

  /**
   * Called when a session is closed or exits.
   * Removes the session→team mapping and cleans up the team
   * if it has no remaining linked sessions.
   */
  onSessionClosed(sessionId: string): void {
    const teamName = this.sessionTeamMap.get(sessionId);
    if (!teamName) return;

    this.sessionTeamMap.delete(sessionId);

    // Check if any sessions still belong to this team
    const hasRemaining = Array.from(this.sessionTeamMap.values()).some(t => t === teamName);
    if (!hasRemaining) {
      // No more sessions for this team — remove it from memory
      this.teams.delete(teamName);
      this.emitter?.emit('onTeamRemoved', { teamName });
    }
  }

  // ── Auto-linking ──

  autoLinkSessions(teamName: string): void {
    if (!this.getSessionsFn || !this.updateSessionMetadataFn) return;

    const team = this.teams.get(teamName);
    if (!team) return;

    const now = Date.now();
    const sessions = this.getSessionsFn();

    // Find sessions created recently that haven't been linked
    const recentUnlinked = sessions
      .filter(s => !s.teamName && (now - s.createdAt) < AUTO_LINK_WINDOW_MS)
      .sort((a, b) => a.createdAt - b.createdAt); // oldest first

    if (recentUnlinked.length === 0) return;

    // Find the lead member
    const leadMember = team.members.find(m => m.agentType === 'lead');
    if (!leadMember) return;

    // Link the oldest recent session as lead
    const leadSession = recentUnlinked.find(s => s.status === 'running') || recentUnlinked[0];
    if (leadSession) {
      this.linkSessionToTeam(leadSession.id, teamName, leadMember.agentId);
      team.leadSessionId = leadSession.id;
    }
  }

  // ── Directory & File Helpers ──

  private ensureDir(dir: string): void {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    } catch (err) {
      console.error(`Failed to create directory ${dir}:`, err);
    }
  }

  /**
   * Scan ~/.claude/teams/ for team directories.
   * Each team is a directory containing config.json.
   * On startup, skip stale teams (config not modified recently).
   */
  private async scanTeams(): Promise<void> {
    try {
      const entries = fs.readdirSync(TEAMS_DIR, { withFileTypes: true });
      const now = Date.now();
      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        // Check config.json freshness — skip stale teams from previous runs
        const configPath = path.join(TEAMS_DIR, entry.name, 'config.json');
        try {
          const stat = fs.statSync(configPath);
          if (now - stat.mtimeMs > STALE_TEAM_THRESHOLD_MS) {
            continue; // Stale team from a previous session
          }
        } catch {
          continue; // No config.json
        }

        this.loadTeamConfig(entry.name);
      }
    } catch (err) {
      console.error('Failed to scan teams directory:', err);
    }
  }

  /**
   * Load a team's config from ~/.claude/teams/<teamName>/config.json
   */
  private loadTeamConfig(teamName: string): void {
    try {
      const configPath = path.join(TEAMS_DIR, teamName, 'config.json');
      if (!fs.existsSync(configPath)) return;

      const content = fs.readFileSync(configPath, 'utf-8');
      const config = JSON.parse(content);

      if (!config.members || !Array.isArray(config.members)) return;

      const existing = this.teams.get(teamName);

      const members: TeamMember[] = config.members.map((m: any) => ({
        name: m.name || m.agentId || 'Unknown',
        agentId: m.agentId || m.name || 'unknown',
        agentType: normalizeAgentType(m.agentType || ''),
        color: m.color,
        model: m.model,
      }));

      const team: TeamInfo = {
        name: teamName,
        description: config.description,
        leadSessionId: config.leadSessionId || existing?.leadSessionId,
        members,
        tasks: existing?.tasks || [],
        createdAt: existing?.createdAt || Date.now(),
        updatedAt: Date.now(),
      };

      const isNew = !existing;
      this.teams.set(teamName, team);

      if (isNew) {
        this.emitter?.emit('onTeamDetected', team);
        // Try auto-linking
        this.autoLinkSessions(teamName);
      }

      // Check for new teammates
      if (existing) {
        const existingIds = new Set(existing.members.map(m => m.agentId));
        for (const member of team.members) {
          if (!existingIds.has(member.agentId)) {
            this.emitter?.emit('onTeammateAdded', {
              teamName,
              member,
            });
          }
        }
      }
    } catch (err) {
      // Skip malformed configs silently
      console.warn(`Failed to parse team config for ${teamName}:`, err);
    }
  }

  /**
   * Scan ~/.claude/tasks/ for per-team task directories.
   */
  private async scanTasks(): Promise<void> {
    try {
      const entries = fs.readdirSync(TASKS_DIR, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) {
          this.loadTeamTasks(entry.name);
        }
      }
    } catch (err) {
      console.error('Failed to scan tasks directory:', err);
    }
  }

  /**
   * Load all task files from ~/.claude/tasks/<teamName>/*.json
   * Skips .lock files.
   */
  private loadTeamTasks(teamName: string): void {
    try {
      const taskDir = path.join(TASKS_DIR, teamName);
      if (!fs.existsSync(taskDir)) return;

      const files = fs.readdirSync(taskDir);
      const tasks: Task[] = [];

      for (const file of files) {
        // Skip non-JSON and lock files
        if (!file.endsWith('.json') || file === '.lock') continue;

        try {
          const filePath = path.join(taskDir, file);
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);
          const task = this.normalizeTask(data);
          if (task) tasks.push(task);
        } catch (err) {
          // Skip individual malformed task files
          console.warn(`Failed to parse task file ${teamName}/${file}:`, err);
        }
      }

      // Find the matching team (or any team if name doesn't match directly)
      let team = this.teams.get(teamName);
      if (!team) {
        // Try to find team by checking task owners against team members
        for (const [, t] of this.teams) {
          const memberIds = new Set(t.members.map(m => m.agentId));
          if (tasks.some(task => task.owner && memberIds.has(task.owner))) {
            team = t;
            break;
          }
        }
      }

      if (team && tasks.length > 0) {
        team.tasks = tasks;
        team.updatedAt = Date.now();
        this.emitter?.emit('onTasksUpdated', { teamName: team.name, tasks });
      }
    } catch (err) {
      console.warn(`Failed to load tasks for team ${teamName}:`, err);
    }
  }

  private normalizeTask(data: any): Task | null {
    if (!data || typeof data !== 'object') return null;
    if (!data.id && !data.taskId && !data.subject) return null;

    return {
      taskId: String(data.id || data.taskId || `task-${Date.now()}`),
      subject: String(data.subject || data.title || 'Untitled'),
      description: String(data.description || ''),
      status: this.normalizeTaskStatus(data.status),
      owner: data.owner ? String(data.owner) : undefined,
      blockedBy: Array.isArray(data.blockedBy) ? data.blockedBy.map(String) : undefined,
      blocks: Array.isArray(data.blocks) ? data.blocks.map(String) : undefined,
    };
  }

  private normalizeTaskStatus(status: any): 'pending' | 'in_progress' | 'completed' {
    const s = String(status || '').toLowerCase();
    if (s === 'in_progress' || s === 'in-progress' || s === 'active' || s === 'running') return 'in_progress';
    if (s === 'completed' || s === 'done' || s === 'finished') return 'completed';
    return 'pending';
  }

  // ── File Watchers ──

  /**
   * Watch ~/.claude/teams/ recursively.
   * Parses relative paths to determine what changed:
   *   <team-name>/config.json → reload team config
   *   new directory at top level → check for config.json
   *   team directory deleted → remove team
   */
  private startTeamsWatcher(retryCount = 0): void {
    try {
      this.teamsWatcher = fs.watch(TEAMS_DIR, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        // Normalize path separators (Windows uses backslashes)
        const normalized = filename.replace(/\\/g, '/');
        const parts = normalized.split('/');

        if (parts.length === 0) return;

        const teamName = parts[0];

        this.debounce(`team:${teamName}`, () => {
          const teamDir = path.join(TEAMS_DIR, teamName);

          if (!fs.existsSync(teamDir)) {
            // Team directory was deleted
            if (this.teams.has(teamName)) {
              this.teams.delete(teamName);
              this.emitter?.emit('onTeamRemoved', { teamName });
            }
            return;
          }

          // Check if it's a directory (new or updated team)
          try {
            const stat = fs.statSync(teamDir);
            if (stat.isDirectory()) {
              this.loadTeamConfig(teamName);
            }
          } catch {
            // Stat failed, directory may have been removed between check and stat
          }
        });
      });

      this.teamsWatcher.on('error', (err) => {
        console.error('Teams watcher error:', err);
        this.teamsWatcher?.close();
        this.teamsWatcher = null;
        if (retryCount < WATCHER_RETRY_COUNT) {
          setTimeout(() => this.startTeamsWatcher(retryCount + 1), WATCHER_RETRY_DELAY_MS);
        }
      });
    } catch (err) {
      console.error('Failed to start teams watcher:', err);
      if (retryCount < WATCHER_RETRY_COUNT) {
        setTimeout(() => this.startTeamsWatcher(retryCount + 1), WATCHER_RETRY_DELAY_MS);
      }
    }
  }

  /**
   * Watch ~/.claude/tasks/ recursively.
   * Parses relative paths: <team-name>/<id>.json → reload that team's tasks.
   * Skips .lock files.
   */
  private startTasksWatcher(retryCount = 0): void {
    try {
      this.tasksWatcher = fs.watch(TASKS_DIR, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;

        // Normalize path separators
        const normalized = filename.replace(/\\/g, '/');
        const parts = normalized.split('/');

        // We expect <team-name>/<file>.json
        if (parts.length < 2) return;

        const teamName = parts[0];
        const file = parts[parts.length - 1];

        // Skip non-JSON and lock files
        if (!file.endsWith('.json') || file === '.lock') return;

        this.debounce(`tasks:${teamName}`, () => {
          this.loadTeamTasks(teamName);
        });
      });

      this.tasksWatcher.on('error', (err) => {
        console.error('Tasks watcher error:', err);
        this.tasksWatcher?.close();
        this.tasksWatcher = null;
        if (retryCount < WATCHER_RETRY_COUNT) {
          setTimeout(() => this.startTasksWatcher(retryCount + 1), WATCHER_RETRY_DELAY_MS);
        }
      });
    } catch (err) {
      console.error('Failed to start tasks watcher:', err);
      if (retryCount < WATCHER_RETRY_COUNT) {
        setTimeout(() => this.startTasksWatcher(retryCount + 1), WATCHER_RETRY_DELAY_MS);
      }
    }
  }

  private debounce(key: string, fn: () => void): void {
    const existing = this.debounceTimers.get(key);
    if (existing) clearTimeout(existing);
    this.debounceTimers.set(key, setTimeout(() => {
      this.debounceTimers.delete(key);
      fn();
    }, DEBOUNCE_MS));
  }
}
