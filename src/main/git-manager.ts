import { BrowserWindow } from 'electron';
import { execFile } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';
import { IPCEmitter } from './ipc-emitter';
import type {
  GitStatus,
  GitFileStatus,
  GitBranchInfo,
  GitCommitInfo,
  GitDiffResult,
  GitOperationResult,
  GitCommitRequest,
  GeneratedCommitMessage,
  CommitType,
  CommitConfidence,
  GitErrorCode,
  GitWorktreeEntry,
  WorktreeCreateRequest,
  WorktreeRemoveRequest,
  WorktreeSettings,
  WorktreeErrorCode,
} from '../shared/types/git-types';

interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

export class GitManager {
  private emitter: IPCEmitter | null = null;
  private watchers: Map<string, fs.FSWatcher> = new Map();
  private debounceTimers: Map<string, NodeJS.Timeout> = new Map();
  private mutexes: Map<string, Promise<void>> = new Map();
  private gitBinary: string | null = null;
  private checkpointManager: any;
  private defaultTimeoutMs = 30000;
  private maxDiffSizeBytes = 102400; // 100KB

  constructor(checkpointManager?: any) {
    this.checkpointManager = checkpointManager || null;
    this.detectGitBinary();
  }

  setMainWindow(window: BrowserWindow): void {
    this.emitter = new IPCEmitter(window);
  }

  destroy(): void {
    for (const [workDir, watcher] of this.watchers) {
      watcher.close();
      const timer = this.debounceTimers.get(workDir);
      if (timer) clearTimeout(timer);
    }
    this.watchers.clear();
    this.debounceTimers.clear();
    this.mutexes.clear();
    this.emitter = null;
  }

  // ── Git binary detection ──

  private detectGitBinary(): void {
    const cmd = process.platform === 'win32' ? 'where' : 'which';
    const arg = 'git';
    try {
      execFile(cmd, [arg], { timeout: 5000 }, (err, stdout) => {
        if (!err && stdout.trim()) {
          this.gitBinary = stdout.trim().split('\n')[0].trim();
          console.log('[GitManager] Found git binary:', this.gitBinary);
        } else {
          console.warn('[GitManager] Git binary not found');
          this.gitBinary = null;
        }
      });
    } catch {
      this.gitBinary = null;
    }
  }

  // ── Low-level command execution ──

  private execGit(workDir: string, args: string[], timeoutMs?: number): Promise<ExecResult> {
    return new Promise((resolve) => {
      const binary = this.gitBinary || 'git';
      const timeout = timeoutMs || this.defaultTimeoutMs;

      execFile(
        binary,
        args,
        {
          cwd: workDir,
          timeout,
          maxBuffer: 10 * 1024 * 1024, // 10MB
          env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
        },
        (err, stdout, stderr) => {
          const exitCode = err && 'code' in err ? (err as any).code : (err ? 1 : 0);
          resolve({
            stdout: stdout || '',
            stderr: stderr || '',
            exitCode: typeof exitCode === 'number' ? exitCode : 1,
          });
        }
      );
    });
  }

  private async withMutex<T>(workDir: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.mutexes.get(workDir) || Promise.resolve();
    let resolve: () => void;
    const next = new Promise<void>((r) => { resolve = r; });
    this.mutexes.set(workDir, next);

    await prev;
    try {
      return await fn();
    } finally {
      resolve!();
    }
  }

  private detectErrorCode(stderr: string, exitCode: number): GitErrorCode {
    const msg = stderr.toLowerCase();
    if (msg.includes('not a git repository')) return 'NOT_A_REPO';
    if (msg.includes('authentication failed') || msg.includes('could not read username')) return 'AUTH_FAILED';
    if (msg.includes('merge conflict') || msg.includes('unmerged')) return 'MERGE_CONFLICTS';
    if (msg.includes('no upstream') || msg.includes('has no upstream branch')) return 'NO_UPSTREAM';
    if (msg.includes('rejected') || msg.includes('non-fast-forward')) return 'PUSH_REJECTED';
    if (msg.includes('already exists')) return 'BRANCH_EXISTS';
    if (msg.includes('not found') || msg.includes('did not match')) return 'BRANCH_NOT_FOUND';
    if (msg.includes('uncommitted changes') || msg.includes('local changes')) return 'UNCOMMITTED_CHANGES';
    if (msg.includes('nothing to commit')) return 'NOTHING_TO_COMMIT';
    if (exitCode === 128) return 'NOT_A_REPO';
    return 'UNKNOWN';
  }

  private makeError(stderr: string, exitCode: number): GitOperationResult {
    const errorCode = this.detectErrorCode(stderr, exitCode);
    return {
      success: false,
      message: stderr.trim() || `Git operation failed (exit code ${exitCode})`,
      errorCode,
    };
  }

  // ── Status parsing (porcelain v2) ──

  private parseStatus(raw: string): GitStatus {
    const status: GitStatus = {
      isRepo: true,
      isDetached: false,
      hasConflicts: false,
      branch: null,
      upstream: null,
      ahead: 0,
      behind: 0,
      files: [],
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
    };

    const lines = raw.split('\n');
    for (const line of lines) {
      if (!line) continue;

      // Branch headers
      if (line.startsWith('# branch.head ')) {
        const head = line.slice('# branch.head '.length);
        if (head === '(detached)') {
          status.isDetached = true;
          status.branch = null;
        } else {
          status.branch = head;
        }
        continue;
      }
      if (line.startsWith('# branch.upstream ')) {
        status.upstream = line.slice('# branch.upstream '.length);
        continue;
      }
      if (line.startsWith('# branch.ab ')) {
        const match = line.match(/\+(\d+) -(\d+)/);
        if (match) {
          status.ahead = parseInt(match[1], 10);
          status.behind = parseInt(match[2], 10);
        }
        continue;
      }

      // Changed entries (ordinary): 1 XY N1 N2 N3 hH hI path
      if (line.startsWith('1 ')) {
        const parts = line.split(' ');
        if (parts.length >= 9) {
          const xy = parts[1];
          const filePath = parts.slice(8).join(' ');
          const indexChar = xy[0];
          const workChar = xy[1];

          // Staged change
          if (indexChar !== '.') {
            status.files.push({
              path: filePath,
              originalPath: null,
              indexStatus: this.charToStatus(indexChar),
              workTreeStatus: this.charToStatus(workChar),
              area: 'staged',
            });
            status.stagedCount++;
          }

          // Unstaged change (not already counted if also staged)
          if (workChar !== '.' && indexChar === '.') {
            status.files.push({
              path: filePath,
              originalPath: null,
              indexStatus: this.charToStatus(indexChar),
              workTreeStatus: this.charToStatus(workChar),
              area: 'unstaged',
            });
            status.unstagedCount++;
          } else if (workChar !== '.' && indexChar !== '.') {
            // Both staged and unstaged changes
            status.files.push({
              path: filePath,
              originalPath: null,
              indexStatus: this.charToStatus(indexChar),
              workTreeStatus: this.charToStatus(workChar),
              area: 'unstaged',
            });
            status.unstagedCount++;
          }
        }
        continue;
      }

      // Renamed entries: 2 XY N1 N2 N3 hH hI Rxx path\torigPath
      if (line.startsWith('2 ')) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const firstParts = parts[0].split(' ');
          const xy = firstParts[1];
          const filePath = parts[0].split(' ').slice(9).join(' ');
          const originalPath = parts[1];
          const indexChar = xy[0];

          if (indexChar !== '.') {
            status.files.push({
              path: filePath,
              originalPath,
              indexStatus: 'renamed',
              workTreeStatus: this.charToStatus(xy[1]),
              area: 'staged',
            });
            status.stagedCount++;
          }
        }
        continue;
      }

      // Unmerged entries: u XY N1 N2 N3 N4 h1 h2 h3 path
      if (line.startsWith('u ')) {
        const parts = line.split(' ');
        if (parts.length >= 11) {
          const filePath = parts.slice(10).join(' ');
          status.files.push({
            path: filePath,
            originalPath: null,
            indexStatus: 'unmerged',
            workTreeStatus: 'unmerged',
            area: 'conflicted',
          });
          status.conflictedCount++;
          status.hasConflicts = true;
        }
        continue;
      }

      // Untracked entries: ? path
      if (line.startsWith('? ')) {
        const filePath = line.slice(2);
        status.files.push({
          path: filePath,
          originalPath: null,
          indexStatus: 'untracked',
          workTreeStatus: 'untracked',
          area: 'untracked',
        });
        status.untrackedCount++;
        continue;
      }
    }

    return status;
  }

  private charToStatus(c: string): GitFileStatus {
    switch (c) {
      case 'A': return 'added';
      case 'M': return 'modified';
      case 'D': return 'deleted';
      case 'R': return 'renamed';
      case 'C': return 'copied';
      case '?': return 'untracked';
      case '!': return 'ignored';
      case 'U': return 'unmerged';
      default: return 'modified';
    }
  }

  // ── Branch parsing ──

  private parseBranches(raw: string): GitBranchInfo[] {
    const branches: GitBranchInfo[] = [];
    const lines = raw.split('\n').filter(l => l.trim());

    for (const line of lines) {
      // Format: "branchname upstream:short upstream:track"
      // e.g. "main origin/main [ahead 1]"
      // or  "* main origin/main [ahead 1, behind 2]"
      const isCurrent = line.startsWith('* ');
      const clean = isCurrent ? line.slice(2) : line;
      const parts = clean.trim().split(/\s+/);
      const name = parts[0];
      if (!name) continue;

      let upstream: string | null = null;
      let ahead = 0;
      let behind = 0;

      if (parts.length > 1 && parts[1] && !parts[1].startsWith('[')) {
        upstream = parts[1];
      }

      // Parse ahead/behind from track info
      const trackMatch = clean.match(/\[ahead (\d+)(?:, behind (\d+))?\]/);
      if (trackMatch) {
        ahead = parseInt(trackMatch[1], 10);
        behind = trackMatch[2] ? parseInt(trackMatch[2], 10) : 0;
      }
      const behindMatch = clean.match(/\[behind (\d+)\]/);
      if (behindMatch && ahead === 0) {
        behind = parseInt(behindMatch[1], 10);
      }

      branches.push({ name, isCurrent, upstream, ahead, behind });
    }

    return branches;
  }

  // ── Public API: Core status ──

  async getStatus(workDir: string): Promise<GitStatus> {
    return this.withMutex(workDir, async () => {
      // Check if it's a git repo
      const check = await this.execGit(workDir, ['rev-parse', '--is-inside-work-tree']);
      if (check.exitCode !== 0) {
        return {
          isRepo: false,
          isDetached: false,
          hasConflicts: false,
          branch: null,
          upstream: null,
          ahead: 0,
          behind: 0,
          files: [],
          stagedCount: 0,
          unstagedCount: 0,
          untrackedCount: 0,
          conflictedCount: 0,
        };
      }

      const result = await this.execGit(workDir, ['status', '--porcelain=v2', '--branch']);
      return this.parseStatus(result.stdout);
    });
  }

  async getBranches(workDir: string): Promise<GitBranchInfo[]> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, [
        'branch', '--list', '--format=%(if)%(HEAD)%(then)* %(end)%(refname:short) %(upstream:short) %(upstream:track)',
      ]);
      if (result.exitCode !== 0) return [];
      return this.parseBranches(result.stdout);
    });
  }

  // ── Public API: Staging ──

  async stageFiles(workDir: string, files: string[]): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['add', '--', ...files]);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: `Staged ${files.length} file(s)`, errorCode: null };
    });
  }

  async unstageFiles(workDir: string, files: string[]): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['reset', 'HEAD', '--', ...files]);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: `Unstaged ${files.length} file(s)`, errorCode: null };
    });
  }

  async stageAll(workDir: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['add', '-A']);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: 'Staged all changes', errorCode: null };
    });
  }

  async unstageAll(workDir: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['reset', 'HEAD']);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: 'Unstaged all changes', errorCode: null };
    });
  }

  // ── Public API: Commit ──

  async commit(request: GitCommitRequest): Promise<GitOperationResult> {
    return this.withMutex(request.workingDirectory, async () => {
      const result = await this.execGit(request.workingDirectory, ['commit', '-m', request.message]);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);

      // Parse commit hash from output
      const hashMatch = result.stdout.match(/\[[\w\-/]+ ([a-f0-9]+)\]/);
      const shortHash = hashMatch ? hashMatch[1] : 'unknown';

      // Create checkpoint if requested
      if (request.createCheckpoint && request.sessionId && this.checkpointManager) {
        try {
          await this.checkpointManager.createCheckpoint({
            sessionId: request.sessionId,
            name: `git: ${shortHash} ${request.message}`.slice(0, 50),
            description: `Git commit: ${request.message}\n\nHash: ${shortHash}`,
            tags: ['git-commit'],
          });
        } catch (err) {
          console.warn('[GitManager] Failed to create checkpoint:', err);
        }
      }

      return { success: true, message: `Committed: ${shortHash} ${request.message}`, errorCode: null };
    });
  }

  async generateMessage(workDir: string): Promise<GeneratedCommitMessage> {
    return this.withMutex(workDir, async () => {
      // Get staged file stats
      const statResult = await this.execGit(workDir, ['diff', '--cached', '--numstat']);
      const nameResult = await this.execGit(workDir, ['diff', '--cached', '--name-only']);

      if (!nameResult.stdout.trim()) {
        return {
          message: 'chore: update files',
          type: 'chore',
          scope: null,
          description: 'update files',
          confidence: 'low',
          reasoning: 'No staged changes found',
        };
      }

      const files = nameResult.stdout.trim().split('\n').filter(f => f);
      let totalInsertions = 0;
      let totalDeletions = 0;

      // Parse numstat
      const statLines = statResult.stdout.trim().split('\n').filter(l => l);
      for (const line of statLines) {
        const parts = line.split('\t');
        if (parts.length >= 2) {
          const ins = parseInt(parts[0], 10);
          const del = parseInt(parts[1], 10);
          if (!isNaN(ins)) totalInsertions += ins;
          if (!isNaN(del)) totalDeletions += del;
        }
      }

      // Analyze file types
      const extensions = files.map(f => path.extname(f).toLowerCase());
      const directories = files.map(f => {
        const dir = path.dirname(f);
        return dir === '.' ? '' : dir.split(/[/\\]/)[0];
      });

      // Detect type using heuristics
      const { type, confidence, reasoning } = this.inferCommitType(files, extensions, totalInsertions, totalDeletions);

      // Detect scope
      const scope = this.inferScope(directories);

      // Generate description
      const description = this.generateDescription(files, extensions, totalInsertions, totalDeletions);

      const message = scope
        ? `${type}(${scope}): ${description}`
        : `${type}: ${description}`;

      return { message, type, scope, description, confidence, reasoning };
    });
  }

  private inferCommitType(
    files: string[],
    _extensions: string[],
    insertions: number,
    deletions: number
  ): { type: CommitType; confidence: CommitConfidence; reasoning: string } {
    // Test files
    if (files.every(f =>
      f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__/')
    )) {
      return { type: 'test', confidence: 'high', reasoning: 'All changed files are test files' };
    }

    // Documentation files
    if (files.every(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.md', '.txt', '.rst'].includes(ext) || f.startsWith('docs/');
    })) {
      return { type: 'docs', confidence: 'high', reasoning: 'All changed files are documentation' };
    }

    // CI/CD files
    if (files.every(f =>
      f.includes('Dockerfile') || f.endsWith('.yml') || f.endsWith('.yaml') ||
      f.startsWith('.github/') || f.includes('Jenkinsfile')
    )) {
      return { type: 'ci', confidence: 'high', reasoning: 'All changed files are CI/CD configuration' };
    }

    // Style files (balanced changes)
    if (files.every(f => {
      const ext = path.extname(f).toLowerCase();
      return ['.css', '.scss', '.less'].includes(ext);
    })) {
      const ratio = insertions > 0 ? deletions / insertions : 0;
      if (ratio > 0.8 && ratio < 1.2) {
        return { type: 'style', confidence: 'medium', reasoning: 'All changed files are stylesheets with balanced changes' };
      }
    }

    // Build files
    if (files.every(f => {
      const name = path.basename(f).toLowerCase();
      return name === 'package.json' || f.endsWith('.lock') ||
        name.startsWith('webpack.') || name.startsWith('tsconfig.') || name.startsWith('vite.');
    })) {
      return { type: 'build', confidence: 'medium', reasoning: 'All changed files are build configuration' };
    }

    // Refactor (heavy deletions)
    if (deletions > insertions * 2 && deletions > 50) {
      return { type: 'refactor', confidence: 'medium', reasoning: `Deletions (${deletions}) significantly exceed insertions (${insertions})` };
    }

    // New feature (mostly additions)
    if (files.every(f => !f.includes('.test.') && !f.includes('.spec.')) && insertions > 0 && deletions === 0) {
      return { type: 'feat', confidence: 'medium', reasoning: 'Only additions, no modifications to existing files' };
    }

    // Small fix
    if (files.length <= 3 && (insertions + deletions) < 20) {
      return { type: 'fix', confidence: 'low', reasoning: `Small change: ${files.length} file(s), ${insertions + deletions} lines` };
    }

    return { type: 'chore', confidence: 'low', reasoning: 'No specific pattern detected' };
  }

  private inferScope(directories: string[]): string | null {
    const nonEmpty = directories.filter(d => d);
    if (nonEmpty.length === 0) return null;

    // Count occurrences
    const counts = new Map<string, number>();
    for (const dir of nonEmpty) {
      counts.set(dir, (counts.get(dir) || 0) + 1);
    }

    // If all in same directory, use it
    if (counts.size === 1) {
      return nonEmpty[0];
    }

    // If most files in one directory (>60%)
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (sorted[0][1] / nonEmpty.length > 0.6) {
      return sorted[0][0];
    }

    return null;
  }

  private generateDescription(
    files: string[],
    extensions: string[],
    insertions: number,
    deletions: number
  ): string {
    const count = files.length;

    // Determine primary file type
    const extCounts = new Map<string, number>();
    for (const ext of extensions) {
      if (ext) extCounts.set(ext, (extCounts.get(ext) || 0) + 1);
    }
    const primaryExt = [...extCounts.entries()].sort((a, b) => b[1] - a[1])[0];

    const fileTypeMap: Record<string, string> = {
      '.ts': 'TypeScript',
      '.tsx': 'TypeScript',
      '.js': 'JavaScript',
      '.jsx': 'JavaScript',
      '.css': 'CSS',
      '.scss': 'SCSS',
      '.md': 'markdown',
      '.json': 'JSON',
      '.py': 'Python',
      '.rs': 'Rust',
      '.go': 'Go',
    };

    const fileType = primaryExt ? (fileTypeMap[primaryExt[0]] || primaryExt[0].slice(1)) : 'files';

    // Determine verb
    let verb = 'update';
    if (deletions === 0 && insertions > 0) verb = 'add';
    else if (insertions === 0 && deletions > 0) verb = 'remove';
    else if (deletions > insertions * 2) verb = 'refactor';

    if (count === 1) {
      const basename = path.basename(files[0]);
      return `${verb} ${basename}`;
    }

    return `${verb} ${count} ${fileType} files`;
  }

  // ── Public API: Remote operations ──

  async push(workDir: string, setUpstream?: boolean): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      // Get current branch
      const branchResult = await this.execGit(workDir, ['rev-parse', '--abbrev-ref', 'HEAD']);
      const branch = branchResult.stdout.trim();

      const args = setUpstream
        ? ['push', '-u', 'origin', branch]
        : ['push', 'origin', branch];

      const result = await this.execGit(workDir, args);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: `Pushed to origin/${branch}`, errorCode: null };
    });
  }

  async pull(workDir: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['pull']);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: result.stdout.trim() || 'Pulled successfully', errorCode: null };
    });
  }

  async fetch(workDir: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['fetch', 'origin']);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: 'Fetched from origin', errorCode: null };
    });
  }

  // ── Public API: Branches ──

  async switchBranch(workDir: string, branch: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['checkout', branch]);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: `Switched to branch '${branch}'`, errorCode: null };
    });
  }

  async createBranch(workDir: string, branch: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['checkout', '-b', branch]);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: `Created and switched to branch '${branch}'`, errorCode: null };
    });
  }

  // ── Public API: History & Diff ──

  async log(workDir: string, count: number = 50): Promise<GitCommitInfo[]> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, [
        'log', `--format=%H|%h|%an|%ae|%aI|%s`, `-${count}`, '--shortstat',
      ]);
      if (result.exitCode !== 0) return [];

      const commits: GitCommitInfo[] = [];
      const lines = result.stdout.split('\n');
      let current: GitCommitInfo | null = null;

      for (const line of lines) {
        if (!line.trim()) continue;

        // Check if it's a commit line (starts with hash)
        if (line.includes('|') && line.match(/^[a-f0-9]{40}\|/)) {
          if (current) commits.push(current);
          const parts = line.split('|');
          current = {
            hash: parts[0],
            shortHash: parts[1],
            authorName: parts[2],
            authorEmail: parts[3],
            date: parts[4],
            subject: parts.slice(5).join('|'),
            filesChanged: 0,
            insertions: 0,
            deletions: 0,
          };
        } else if (current && line.includes('file')) {
          // Parse shortstat: " 3 files changed, 45 insertions(+), 12 deletions(-)"
          const filesMatch = line.match(/(\d+) files? changed/);
          const insMatch = line.match(/(\d+) insertions?\(\+\)/);
          const delMatch = line.match(/(\d+) deletions?\(-\)/);
          if (filesMatch) current.filesChanged = parseInt(filesMatch[1], 10);
          if (insMatch) current.insertions = parseInt(insMatch[1], 10);
          if (delMatch) current.deletions = parseInt(delMatch[1], 10);
        }
      }
      if (current) commits.push(current);

      return commits;
    });
  }

  async diff(workDir: string, filePath: string, staged: boolean): Promise<GitDiffResult> {
    return this.withMutex(workDir, async () => {
      const args = staged
        ? ['diff', '--cached', '--', filePath]
        : ['diff', '--', filePath];

      const result = await this.execGit(workDir, args);
      const totalSize = Buffer.byteLength(result.stdout, 'utf-8');
      const isTruncated = totalSize > this.maxDiffSizeBytes;
      const diff = isTruncated
        ? result.stdout.slice(0, this.maxDiffSizeBytes)
        : result.stdout;

      return { filePath, diff, isTruncated, totalSizeBytes: totalSize };
    });
  }

  async fileContent(workDir: string, filePath: string): Promise<GitDiffResult> {
    const fullPath = path.resolve(workDir, filePath);
    try {
      const content = await fs.promises.readFile(fullPath, 'utf-8');
      const totalSize = Buffer.byteLength(content, 'utf-8');
      const isTruncated = totalSize > this.maxDiffSizeBytes;
      const raw = isTruncated ? content.slice(0, this.maxDiffSizeBytes) : content;

      // Format as unified diff: every line prefixed with +
      const lines = raw.split('\n');
      if (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
      const header = `diff --git a/${filePath} b/${filePath}\nnew file mode 100644\n--- /dev/null\n+++ b/${filePath}\n@@ -0,0 +1,${lines.length} @@\n`;
      const diffBody = lines.map(l => `+${l}`).join('\n');
      const diff = header + diffBody;

      return { filePath, diff, isTruncated, totalSizeBytes: totalSize };
    } catch (err: any) {
      return { filePath, diff: '', isTruncated: false, totalSizeBytes: 0 };
    }
  }

  async commitDiff(workDir: string, hash: string): Promise<GitCommitInfo> {
    return this.withMutex(workDir, async () => {
      // Get commit info
      const logResult = await this.execGit(workDir, [
        'log', `--format=%H|%h|%an|%ae|%aI|%s`, '-1', hash,
      ]);

      const statResult = await this.execGit(workDir, [
        'diff-tree', '--no-commit-id', '-r', '--stat', hash,
      ]);

      const parts = logResult.stdout.trim().split('|');
      const commit: GitCommitInfo = {
        hash: parts[0] || hash,
        shortHash: parts[1] || hash.slice(0, 7),
        authorName: parts[2] || '',
        authorEmail: parts[3] || '',
        date: parts[4] || '',
        subject: parts.slice(5).join('|') || '',
        filesChanged: 0,
        insertions: 0,
        deletions: 0,
      };

      // Parse stat output for file count
      const statLines = statResult.stdout.trim().split('\n').filter(l => l.trim());
      if (statLines.length > 0) {
        const summaryLine = statLines[statLines.length - 1];
        const filesMatch = summaryLine.match(/(\d+) files? changed/);
        const insMatch = summaryLine.match(/(\d+) insertions?\(\+\)/);
        const delMatch = summaryLine.match(/(\d+) deletions?\(-\)/);
        if (filesMatch) commit.filesChanged = parseInt(filesMatch[1], 10);
        if (insMatch) commit.insertions = parseInt(insMatch[1], 10);
        if (delMatch) commit.deletions = parseInt(delMatch[1], 10);
      }

      return commit;
    });
  }

  // ── Public API: Discard ──

  async discardFile(workDir: string, filePath: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['checkout', '--', filePath]);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: `Discarded changes to ${filePath}`, errorCode: null };
    });
  }

  async discardAll(workDir: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['checkout', '--', '.']);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: 'Discarded all unstaged changes', errorCode: null };
    });
  }

  // ── Public API: Init ──

  async init(workDir: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['init']);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: 'Initialized git repository', errorCode: null };
    });
  }

  // ── Public API: Worktrees ──

  private gitVersionCache: string | null = null;

  async getGitVersion(): Promise<string | null> {
    if (this.gitVersionCache) return this.gitVersionCache;
    const binary = this.gitBinary || 'git';
    return new Promise((resolve) => {
      execFile(binary, ['--version'], { timeout: 5000 }, (err, stdout) => {
        if (err || !stdout) { resolve(null); return; }
        const match = stdout.match(/(\d+\.\d+(?:\.\d+)?)/);
        if (match) {
          this.gitVersionCache = match[1];
          resolve(match[1]);
        } else {
          resolve(null);
        }
      });
    });
  }

  private isVersionAtLeast(version: string, minimum: string): boolean {
    const v = version.split('.').map(Number);
    const m = minimum.split('.').map(Number);
    for (let i = 0; i < m.length; i++) {
      const a = v[i] || 0;
      const b = m[i] || 0;
      if (a > b) return true;
      if (a < b) return false;
    }
    return true;
  }

  async isWorktree(workDir: string): Promise<boolean> {
    const commonDir = await this.execGit(workDir, ['rev-parse', '--git-common-dir']);
    const gitDir = await this.execGit(workDir, ['rev-parse', '--git-dir']);
    if (commonDir.exitCode !== 0 || gitDir.exitCode !== 0) return false;
    const common = path.resolve(workDir, commonDir.stdout.trim());
    const git = path.resolve(workDir, gitDir.stdout.trim());
    return common !== git;
  }

  async getMainRepoPath(workDir: string): Promise<string> {
    const commonDir = await this.execGit(workDir, ['rev-parse', '--git-common-dir']);
    if (commonDir.exitCode !== 0) return workDir;
    const resolved = path.resolve(workDir, commonDir.stdout.trim());
    // git-common-dir points to the .git dir of main repo; parent is the repo root
    return path.dirname(resolved);
  }

  async listWorktrees(workDir: string): Promise<GitWorktreeEntry[]> {
    const version = await this.getGitVersion();
    if (!version || !this.isVersionAtLeast(version, '2.5')) return [];

    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['worktree', 'list', '--porcelain']);
      if (result.exitCode !== 0) return [];
      return this.parseWorktreeListPorcelain(result.stdout, workDir);
    });
  }

  private parseWorktreeListPorcelain(raw: string, _mainRepoPath: string): GitWorktreeEntry[] {
    const entries: GitWorktreeEntry[] = [];
    // Split on blank lines (double newline)
    const blocks = raw.split(/\n\n/).filter(b => b.trim());

    for (const block of blocks) {
      const lines = block.split('\n').filter(l => l.trim());
      let wtPath = '';
      let head = '';
      let branch: string | null = null;
      let isBare = false;
      let isLocked = false;
      let isPrunable = false;
      let isMainWorktree = false;

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          wtPath = line.slice('worktree '.length);
        } else if (line.startsWith('HEAD ')) {
          head = line.slice('HEAD '.length);
        } else if (line.startsWith('branch ')) {
          branch = line.slice('branch '.length).replace('refs/heads/', '');
        } else if (line === 'bare') {
          isBare = true;
        } else if (line.startsWith('locked')) {
          isLocked = true;
        } else if (line.startsWith('prunable')) {
          isPrunable = true;
        }
      }

      // First entry is always the main worktree
      if (entries.length === 0) {
        isMainWorktree = true;
      }

      if (wtPath) {
        entries.push({
          path: wtPath,
          head,
          branch,
          isMainWorktree,
          isBare,
          isLocked,
          isPrunable,
          linkedSessionId: null,
          managedByClaudeDesk: false,
        });
      }
    }

    return entries;
  }

  sanitizeBranchNameForDir(branch: string): string {
    let sanitized = branch
      .replace(/[/\\]/g, '-')
      .replace(/\.\./g, '-')
      .replace(/^\./, '_')
      .replace(/\.lock$/i, '_lock')
      .replace(/[~^:?*[\]@{}\s]/g, '-')
      .replace(/-{2,}/g, '-')
      .replace(/^-|-$/g, '');

    if (sanitized.length > 100) {
      sanitized = sanitized.slice(0, 100);
    }

    return sanitized || 'worktree';
  }

  computeWorktreePath(mainRepoPath: string, branch: string, settings: WorktreeSettings): string {
    const sanitized = this.sanitizeBranchNameForDir(branch);
    const repoName = path.basename(mainRepoPath);

    switch (settings.basePath) {
      case 'sibling': {
        const parent = path.dirname(mainRepoPath);
        return path.join(parent, `${repoName}-worktrees`, sanitized);
      }
      case 'subdirectory': {
        return path.join(mainRepoPath, '.worktrees', sanitized);
      }
      case 'custom': {
        const base = settings.customBasePath || path.join(path.dirname(mainRepoPath), `${repoName}-worktrees`);
        return path.join(base, sanitized);
      }
      default: {
        const parent = path.dirname(mainRepoPath);
        return path.join(parent, `${repoName}-worktrees`, sanitized);
      }
    }
  }

  async addWorktree(request: WorktreeCreateRequest, settings: WorktreeSettings): Promise<GitOperationResult & { worktreePath?: string }> {
    const version = await this.getGitVersion();
    if (!version || !this.isVersionAtLeast(version, '2.5')) {
      return { success: false, message: 'Git version 2.5+ required for worktrees', errorCode: 'GIT_VERSION_TOO_OLD' as any };
    }

    const targetPath = request.customPath || this.computeWorktreePath(request.mainRepoPath, request.branch, settings);

    // Ensure parent directory exists
    const parentDir = path.dirname(targetPath);
    try {
      if (!fs.existsSync(parentDir)) {
        fs.mkdirSync(parentDir, { recursive: true });
      }
    } catch (err) {
      return { success: false, message: `Failed to create directory: ${parentDir}`, errorCode: 'UNKNOWN' };
    }

    // Use main repo path as mutex key (all worktree ops modify shared .git/worktrees)
    return this.withMutex(request.mainRepoPath, async () => {
      const args = ['worktree', 'add'];

      if (request.isNewBranch) {
        args.push('-b', request.branch, targetPath);
        if (request.baseBranch) {
          args.push(request.baseBranch);
        }
      } else {
        args.push(targetPath, request.branch);
      }

      const result = await this.execGit(request.mainRepoPath, args);

      if (result.exitCode !== 0) {
        const errorCode = this.detectWorktreeErrorCode(result.stderr);
        return {
          success: false,
          message: result.stderr.trim() || `Failed to create worktree (exit code ${result.exitCode})`,
          errorCode: errorCode as any,
          worktreePath: undefined,
        };
      }

      // Emit event
      if (this.emitter) {
        this.emitter.emit('onWorktreeCreated', {
          mainRepoPath: request.mainRepoPath,
          worktreePath: targetPath,
          branch: request.branch,
          managedByClaudeDesk: true,
          createdAt: Date.now(),
        });
      }

      return {
        success: true,
        message: `Created worktree at ${targetPath}`,
        errorCode: null,
        worktreePath: targetPath,
      };
    });
  }

  async removeWorktree(request: WorktreeRemoveRequest): Promise<GitOperationResult> {
    return this.withMutex(request.mainRepoPath, async () => {
      const args = ['worktree', 'remove'];
      if (request.force) args.push('--force');
      args.push(request.worktreePath);

      const result = await this.execGit(request.mainRepoPath, args);

      if (result.exitCode !== 0) {
        const errorCode = this.detectWorktreeErrorCode(result.stderr);
        return {
          success: false,
          message: result.stderr.trim() || `Failed to remove worktree (exit code ${result.exitCode})`,
          errorCode: errorCode as any,
        };
      }

      // Emit event
      if (this.emitter) {
        this.emitter.emit('onWorktreeRemoved', request.worktreePath);
      }

      return { success: true, message: `Removed worktree at ${request.worktreePath}`, errorCode: null };
    });
  }

  async pruneWorktrees(workDir: string): Promise<GitOperationResult> {
    return this.withMutex(workDir, async () => {
      const result = await this.execGit(workDir, ['worktree', 'prune']);
      if (result.exitCode !== 0) return this.makeError(result.stderr, result.exitCode);
      return { success: true, message: 'Pruned stale worktrees', errorCode: null };
    });
  }

  private detectWorktreeErrorCode(stderr: string): WorktreeErrorCode | GitErrorCode {
    const msg = stderr.toLowerCase();
    if (msg.includes('is already checked out') || msg.includes('already used by worktree')) return 'WORKTREE_BRANCH_IN_USE';
    if (msg.includes('already exists')) return 'WORKTREE_PATH_EXISTS';
    if (msg.includes('is not a working tree') || msg.includes('is not a valid')) return 'WORKTREE_NOT_FOUND';
    if (msg.includes('is locked')) return 'WORKTREE_LOCKED';
    if (msg.includes('contains modified or untracked files') || msg.includes('dirty')) return 'WORKTREE_DIRTY';
    return this.detectErrorCode(stderr, 1);
  }

  // ── Public API: Watching ──

  startWatching(workDir: string): boolean {
    if (this.watchers.has(workDir)) return true;

    const gitDir = path.join(workDir, '.git');
    if (!fs.existsSync(gitDir)) return false;

    try {
      const watcher = fs.watch(gitDir, { recursive: false }, () => {
        this.debouncedRefresh(workDir);
      });

      // Also watch the index file specifically
      const indexPath = path.join(gitDir, 'index');
      if (fs.existsSync(indexPath)) {
        try {
          const indexWatcher = fs.watch(indexPath, () => {
            this.debouncedRefresh(workDir);
          });
          // Store with a modified key
          this.watchers.set(workDir + ':index', indexWatcher);
        } catch {
          // Index watch failed, git dir watch is enough
        }
      }

      this.watchers.set(workDir, watcher);

      watcher.on('error', (err) => {
        console.warn('[GitManager] Watch error for', workDir, err);
        this.stopWatching(workDir);
      });

      return true;
    } catch (err) {
      console.warn('[GitManager] Failed to watch', workDir, err);
      return false;
    }
  }

  stopWatching(workDir: string): boolean {
    const watcher = this.watchers.get(workDir);
    if (watcher) {
      watcher.close();
      this.watchers.delete(workDir);
    }

    const indexWatcher = this.watchers.get(workDir + ':index');
    if (indexWatcher) {
      indexWatcher.close();
      this.watchers.delete(workDir + ':index');
    }

    const timer = this.debounceTimers.get(workDir);
    if (timer) {
      clearTimeout(timer);
      this.debounceTimers.delete(workDir);
    }

    return true;
  }

  private debouncedRefresh(workDir: string): void {
    const existing = this.debounceTimers.get(workDir);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(async () => {
      this.debounceTimers.delete(workDir);
      try {
        const status = await this.getStatus(workDir);
        if (this.emitter) {
          this.emitter.emit('onGitStatusChanged', status);
        }
      } catch (err) {
        console.warn('[GitManager] Failed to refresh status for', workDir, err);
      }
    }, 500);

    this.debounceTimers.set(workDir, timer);
  }
}
