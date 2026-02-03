import { execSync } from 'child_process';
import https from 'https';
import { workspaceManager } from '../config/workspaces.js';
import { GitHubAPI } from './github-oauth.js';

/**
 * Helper to make synchronous-like HTTPS requests using native Node.js https module.
 * Avoids embedding tokens in shell commands.
 */
function httpsRequest(options: https.RequestOptions, data?: string): Promise<{ statusCode: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ statusCode: res.statusCode || 0, body }));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

export enum GitHubErrorType {
  ORG_ACCESS_REQUIRED = 'org_access_required',
  TOKEN_INVALID = 'token_invalid',
  TOKEN_EXPIRED = 'token_expired',
  REPO_NOT_FOUND = 'repo_not_found',
  BRANCH_NOT_FOUND = 'branch_not_found',
  PR_ALREADY_EXISTS = 'pr_already_exists',
  RATE_LIMITED = 'rate_limited',
  NETWORK_ERROR = 'network_error',
  UNKNOWN = 'unknown'
}

export interface GitHubErrorDetails {
  type: GitHubErrorType;
  message: string;
  statusCode?: number;
  owner?: string;
  repo?: string;
  organizationUrl?: string;
  retryable: boolean;
  actionable: boolean;
  suggestPAT?: boolean;  // Suggest PAT setup as alternative
}

// GitHub OAuth Client ID
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || 'Iv1.2ebd9b5c6e58a9d1';

export interface PRResult {
  success: boolean;
  prUrl?: string;
  error?: string;
  errorDetails?: GitHubErrorDetails;
  usedPAT?: boolean;  // Indicates PAT was used as fallback
}

/**
 * Parse owner and repo from a GitHub remote URL.
 * Supports both SSH and HTTPS formats.
 */
function parseGitHubRemote(remoteUrl: string): { owner: string; repo: string } | null {
  // SSH format: git@github.com:owner/repo.git
  // HTTPS format: https://github.com/owner/repo.git
  const sshMatch = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
  if (sshMatch) {
    return { owner: sshMatch[1], repo: sshMatch[2].replace(/\.git$/, '') };
  }
  return null;
}

export class GitHubIntegration {
  /**
   * Check if GitHub CLI (gh) is installed and authenticated
   */
  isAvailable(): boolean {
    try {
      execSync('gh auth status', { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create a pull request using GitHub API with OAuth token.
   * This method is preferred over CLI as it doesn't require `gh` to be installed.
   *
   * @param repoPath - Path to the repository (to get remote URL)
   * @param branch - Branch to create PR from
   * @param title - PR title
   * @param body - PR body/description
   * @param token - OAuth access token
   * @param baseBranch - Base branch for the PR (optional, defaults to main/master)
   * @param fallbackToPAT - Whether to retry with PAT if OAuth fails with org access error
   * @returns PRResult with success status and PR URL
   */
  async createPRWithToken(
    repoPath: string,
    branch: string,
    title: string,
    body: string,
    token: string,
    baseBranch?: string,
    fallbackToPAT: boolean = true
  ): Promise<PRResult> {
    try {
      // Get the remote URL to determine owner/repo
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      const parsed = parseGitHubRemote(remoteUrl);
      if (!parsed) {
        return { success: false, error: 'Could not parse GitHub remote URL' };
      }

      const { owner, repo } = parsed;

      // Determine base branch if not provided
      if (!baseBranch) {
        try {
          // Try to detect main branch
          const branches = execSync('git branch -a', {
            cwd: repoPath,
            encoding: 'utf-8',
            stdio: ['pipe', 'pipe', 'pipe'],
          });
          baseBranch = branches.includes('remotes/origin/main') ? 'main' : 'master';
        } catch {
          baseBranch = 'main';
        }
      }

      // Create PR via GitHub API using native https module (SEC-01 fix: no token in shell)
      const data = JSON.stringify({
        title,
        body,
        head: branch,
        base: baseBranch,
      });

      const response = await httpsRequest(
        {
          hostname: 'api.github.com',
          path: `/repos/${owner}/${repo}/pulls`,
          method: 'POST',
          headers: {
            Accept: 'application/vnd.github+json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'ClaudeDesk-App',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data),
            'X-GitHub-Api-Version': '2022-11-28',
          },
        },
        data
      );

      if (response.statusCode >= 200 && response.statusCode < 300) {
        const pr = JSON.parse(response.body);
        console.log(`[GitHubIntegration] PR created via API: ${pr.html_url}`);
        return { success: true, prUrl: pr.html_url };
      } else {
        // Parse and classify error
        const errorDetails = this.parseGitHubError(response.statusCode, response.body, owner, repo);
        console.error(`[GitHubIntegration] API error creating PR:`, errorDetails);

        // NEW: If org access error and PAT fallback enabled, try PAT
        if (
          fallbackToPAT &&
          errorDetails.type === GitHubErrorType.ORG_ACCESS_REQUIRED
        ) {
          const workspace = workspaceManager.getWorkspaceForRepo(repoPath);
          if (workspace) {
            const pat = await workspaceManager.getGitHubPAT(workspace.id);
            if (pat) {
              console.log(`[GitHubIntegration] OAuth lacks org access, retrying with PAT`);
              // Retry with PAT, but disable fallback to prevent infinite loop
              const result = await this.createPRWithToken(repoPath, branch, title, body, pat, baseBranch, false);
              if (result.success) {
                // Mark that PAT was used for analytics/UI feedback
                result.usedPAT = true;
              }
              return result;
            } else {
              // No PAT configured, suggest PAT setup
              errorDetails.suggestPAT = true;
              errorDetails.message = `${errorDetails.message}\n\nAlternatively, configure a Personal Access Token to bypass organization approval.`;
            }
          }
        }

        return {
          success: false,
          error: errorDetails.message,
          errorDetails
        };
      }
    } catch (error: unknown) {
      const err = error as { stderr?: Buffer | string; message?: string };
      const errorMsg = err.stderr?.toString() || err.message || 'Unknown error';
      console.error(`[GitHubIntegration] Failed to create PR via API: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Parse GitHub API error response and classify error type
   */
  private parseGitHubError(
    statusCode: number,
    body: string,
    owner: string,
    repo: string
  ): GitHubErrorDetails {
    let errorJson: any = {};
    try {
      errorJson = JSON.parse(body);
    } catch {
      // Use raw body if JSON parsing fails
    }

    const message = errorJson.message || body || 'Unknown error';
    const baseDetails = { owner, repo, statusCode };

    // 403 Forbidden - Multiple possible causes
    if (statusCode === 403) {
      // Organization access issue
      if (
        message.toLowerCase().includes('resource not accessible') ||
        message.toLowerCase().includes('not accessible by integration')
      ) {
        return {
          type: GitHubErrorType.ORG_ACCESS_REQUIRED,
          message: `Your GitHub token doesn't have access to ${owner} repositories. To create a PR in ${repo}, grant organization access in GitHub.`,
          ...baseDetails,
          organizationUrl: `https://github.com/settings/connections/applications/${GITHUB_CLIENT_ID}`,
          retryable: true,
          actionable: true,
        };
      }

      // Rate limiting
      if (message.toLowerCase().includes('rate limit')) {
        return {
          type: GitHubErrorType.RATE_LIMITED,
          message: 'GitHub API rate limit exceeded. Please try again later.',
          ...baseDetails,
          retryable: true,
          actionable: false,
        };
      }

      // Generic 403 - permission denied
      return {
        type: GitHubErrorType.TOKEN_INVALID,
        message: 'GitHub access denied. Your token may not have required permissions.',
        ...baseDetails,
        retryable: false,
        actionable: true,
      };
    }

    // 401 Unauthorized - Invalid or expired token
    if (statusCode === 401) {
      return {
        type: GitHubErrorType.TOKEN_EXPIRED,
        message: 'Your GitHub authentication has expired. Reconnect to continue.',
        ...baseDetails,
        retryable: false,
        actionable: true,
      };
    }

    // 404 Not Found - Repository doesn't exist or no access
    if (statusCode === 404) {
      return {
        type: GitHubErrorType.REPO_NOT_FOUND,
        message: `Repository "${repo}" doesn't exist or you don't have access.`,
        ...baseDetails,
        organizationUrl: `https://github.com/settings/connections/applications/${GITHUB_CLIENT_ID}`,
        retryable: false,
        actionable: true,
      };
    }

    // 422 Unprocessable Entity - Validation error
    if (statusCode === 422) {
      // PR already exists
      if (message.toLowerCase().includes('already exists')) {
        return {
          type: GitHubErrorType.PR_ALREADY_EXISTS,
          message: 'A pull request already exists for this branch.',
          ...baseDetails,
          retryable: false,
          actionable: false,
        };
      }

      // Branch not found
      if (message.toLowerCase().includes('branch') || message.toLowerCase().includes('ref')) {
        return {
          type: GitHubErrorType.BRANCH_NOT_FOUND,
          message: `Branch doesn't exist on the remote. Enable "Push to remote" and try again.`,
          ...baseDetails,
          retryable: true,
          actionable: true,
        };
      }

      // Generic validation error
      return {
        type: GitHubErrorType.UNKNOWN,
        message: `Validation error: ${message}`,
        ...baseDetails,
        retryable: false,
        actionable: false,
      };
    }

    // Unknown error
    return {
      type: GitHubErrorType.UNKNOWN,
      message: `GitHub API error (${statusCode}): ${message}`,
      ...baseDetails,
      retryable: true,
      actionable: false,
    };
  }

  /**
   * Create a pull request.
   * First tries OAuth API if workspace has a token, then falls back to gh CLI.
   *
   * @param repoPath - Path to the repository (working directory for git commands)
   * @param branch - Branch to create PR from
   * @param title - PR title
   * @param body - PR body/description
   * @param workspaceLookupPath - Optional path used for workspace token lookup (for worktree support)
   * @returns PRResult with success status and PR URL
   */
  async createPR(repoPath: string, branch: string, title: string, body: string, workspaceLookupPath?: string, baseBranch?: string): Promise<PRResult> {
    // First, check if this repo belongs to a workspace with GitHub token
    // Use workspaceLookupPath if provided (for worktree mode), otherwise use repoPath
    const workspace = workspaceManager.getWorkspaceForRepo(workspaceLookupPath || repoPath);
    const token = workspace ? workspaceManager.getGitHubToken(workspace.id) : null;

    if (token) {
      console.log(`[GitHubIntegration] Using OAuth token for PR creation`);
      const result = await this.createPRWithToken(repoPath, branch, title, body, token, baseBranch);
      if (result.success) {
        return result;
      }
      // If API fails, fall through to CLI
      console.log(`[GitHubIntegration] OAuth PR creation failed, trying CLI fallback: ${result.error}`);
    }

    // Fall back to gh CLI
    return this.createPRWithCLI(repoPath, branch, title, body, baseBranch);
  }

  /**
   * Create a pull request using GitHub CLI (gh).
   * Fallback method when OAuth is not available.
   */
  private createPRWithCLI(repoPath: string, branch: string, title: string, body: string, baseBranch?: string): PRResult {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'GitHub CLI (gh) is not installed or not authenticated. Install from https://cli.github.com/, or connect GitHub OAuth in workspace settings.',
      };
    }

    try {
      // Escape special characters in title and body for shell
      const escapedTitle = title.replace(/"/g, '\\"').replace(/`/g, '\\`');
      const escapedBody = body.replace(/"/g, '\\"').replace(/`/g, '\\`');

      // Build command with optional base branch
      let cmd = `gh pr create --title "${escapedTitle}" --body "${escapedBody}" --head "${branch}"`;
      if (baseBranch) {
        cmd += ` --base "${baseBranch}"`;
      }

      const result = execSync(
        cmd,
        {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 60000, // 60s timeout
        }
      ).trim();

      // gh pr create outputs the PR URL on success
      const prUrl = result.match(/https:\/\/github\.com\/.+\/pull\/\d+/)?.[0] || result;

      console.log(`[GitHubIntegration] PR created via CLI: ${prUrl}`);
      return { success: true, prUrl };
    } catch (error: unknown) {
      const err = error as { stderr?: Buffer | string; message?: string };
      const errorMsg = err.stderr?.toString() || err.message || 'Unknown error';
      console.error(`[GitHubIntegration] Failed to create PR via CLI: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Create a new repository on GitHub and push local code
   * First checks if workspace has a GitHub token, otherwise falls back to gh CLI
   * @param repoPath - Path to the local repository
   * @param repoName - Name for the GitHub repository
   * @param isPrivate - Whether the repo should be private (default: true)
   * @returns Result with success status and remote URL
   */
  async createRepo(repoPath: string, repoName: string, isPrivate: boolean = true): Promise<PRResult> {
    // First, check if this repo belongs to a workspace with GitHub token
    const workspace = workspaceManager.getWorkspaceForRepo(repoPath);
    const token = workspace ? workspaceManager.getGitHubToken(workspace.id) : null;

    if (token) {
      // Use GitHub API with workspace token
      return this.createRepoWithToken(repoPath, repoName, isPrivate, token);
    }

    // Fall back to gh CLI
    return this.createRepoWithCLI(repoPath, repoName, isPrivate);
  }

  /**
   * Create repo using GitHub API with OAuth token
   */
  private async createRepoWithToken(
    repoPath: string,
    repoName: string,
    isPrivate: boolean,
    token: string
  ): Promise<PRResult> {
    try {
      // Create repo via GitHub API using native https module (SEC-01 fix: no token in shell)
      const repoData = JSON.stringify({
        name: repoName,
        private: isPrivate,
        auto_init: false,
      });

      const response = await httpsRequest(
        {
          hostname: 'api.github.com',
          path: '/user/repos',
          method: 'POST',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${token}`,
            'User-Agent': 'ClaudeDesk-App',
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(repoData),
          },
        },
        repoData
      );

      if (response.statusCode < 200 || response.statusCode >= 300) {
        console.error(`[GitHubIntegration] API error: ${response.body}`);
        return { success: false, error: response.body };
      }

      const repo = JSON.parse(response.body);
      const htmlUrl = repo.html_url;
      const cloneUrl = repo.clone_url;

      // Now add remote and push using git commands with token auth
      // Use credential helper instead of embedding token in URL
      const { createCredentialHelperScript, removeCredentialHelperScript } = await import('./git-credential-helper.js');
      const scriptPath = createCredentialHelperScript(token, 'github');

      try {
        // Add remote (without token in URL)
        execSync(`git remote add origin "${cloneUrl}"`, {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
        });

        // Push with credential helper
        const pushCmd = process.platform === 'win32'
          ? 'cmd /c "git push -u origin main || git push -u origin master"'
          : 'git push -u origin main || git push -u origin master';

        execSync(pushCmd, {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 120000,
          env: {
            ...process.env,
            GIT_ASKPASS: scriptPath,
            GIT_TERMINAL_PROMPT: '0',
          },
        });
      } finally {
        // Always clean up credential helper script
        removeCredentialHelperScript(scriptPath);
      }

      console.log(`[GitHubIntegration] Repo created via API: ${htmlUrl}`);
      return { success: true, prUrl: htmlUrl };
    } catch (error: unknown) {
      const err = error as { stderr?: Buffer | string; message?: string };
      const errorMsg = err.stderr?.toString() || err.message || 'Unknown error';
      console.error(`[GitHubIntegration] Failed to create repo via API: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Create repo using GitHub CLI (gh)
   */
  private createRepoWithCLI(repoPath: string, repoName: string, isPrivate: boolean): PRResult {
    if (!this.isAvailable()) {
      return {
        success: false,
        error: 'GitHub CLI (gh) is not installed or not authenticated. Install from https://cli.github.com/',
      };
    }

    try {
      const visibility = isPrivate ? '--private' : '--public';

      // gh repo create will create the repo and set up remote origin
      // --source=. uses current directory
      // --remote=origin sets up the remote
      // --push pushes the code
      const result = execSync(
        `gh repo create ${repoName} ${visibility} --source=. --remote=origin --push`,
        {
          cwd: repoPath,
          encoding: 'utf-8',
          stdio: ['pipe', 'pipe', 'pipe'],
          timeout: 120000, // 2 min timeout for push
        }
      ).trim();

      // Extract the repo URL from output
      const repoUrl = result.match(/https:\/\/github\.com\/[^\s]+/)?.[0] || result;

      console.log(`[GitHubIntegration] Repo created via CLI: ${repoUrl}`);
      return { success: true, prUrl: repoUrl };
    } catch (error: unknown) {
      const err = error as { stderr?: Buffer | string; message?: string };
      const errorMsg = err.stderr?.toString() || err.message || 'Unknown error';
      console.error(`[GitHubIntegration] Failed to create repo via CLI: ${errorMsg}`);
      return { success: false, error: errorMsg };
    }
  }

  /**
   * Get the URL to create a PR manually in the browser
   * @param repoPath - Path to the repository
   * @param branch - Branch to create PR from
   */
  getPRCreateUrl(repoPath: string, branch: string): string | null {
    try {
      // Get the remote URL
      const remoteUrl = execSync('git remote get-url origin', {
        cwd: repoPath,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();

      // Parse GitHub URL from remote
      // Supports: git@github.com:user/repo.git, https://github.com/user/repo.git
      let match = remoteUrl.match(/github\.com[:/]([^/]+)\/([^/.]+)/);
      if (!match) return null;

      const [, owner, repo] = match;
      return `https://github.com/${owner}/${repo}/compare/main...${branch}?expand=1`;
    } catch {
      return null;
    }
  }
}

// Singleton instance
export const githubIntegration = new GitHubIntegration();
