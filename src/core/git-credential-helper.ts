import { writeFileSync, unlinkSync, existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';

/**
 * Git credential helper utilities for injecting OAuth tokens into git operations.
 * This allows OAuth-authenticated git operations (push, pull, fetch) without
 * requiring separate SSH keys or credential helpers.
 */

// Lazy path resolution - evaluated when needed, not at module load time
function getTempDir(): string {
  return join(process.cwd(), 'temp', 'git-credentials');
}

function ensureTempDir(): string {
  const tempDir = getTempDir();
  if (!existsSync(tempDir)) {
    mkdirSync(tempDir, { recursive: true });
  }
  return tempDir;
}

/**
 * Creates a temporary credential helper script that returns the OAuth token.
 * The script is compatible with git's credential helper protocol.
 * @param token - The OAuth access token
 * @param platform - The git platform ('github' or 'gitlab')
 * @returns Path to the temporary credential helper script
 */
export function createCredentialHelperScript(token: string, platform: 'github' | 'gitlab'): string {
  const scriptId = randomUUID();
  const isWindows = process.platform === 'win32';
  const scriptExt = isWindows ? '.bat' : '.sh';
  const scriptPath = join(ensureTempDir(), `git-askpass-${scriptId}${scriptExt}`);

  // The script simply echoes the token when called by git
  // GIT_ASKPASS is called with a prompt, but we just return the token
  let scriptContent: string;

  if (isWindows) {
    // Windows batch script
    scriptContent = `@echo off
echo ${token}
`;
  } else {
    // Unix shell script
    scriptContent = `#!/bin/sh
echo "${token}"
`;
  }

  writeFileSync(scriptPath, scriptContent);

  // Make executable on Unix
  if (!isWindows) {
    try {
      chmodSync(scriptPath, 0o700);
    } catch {
      // Ignore chmod errors on Windows
    }
  }

  return scriptPath;
}

/**
 * Removes a temporary credential helper script.
 * SEC-06: Improved cleanup with logging for debugging failed deletions.
 * @param scriptPath - Path to the script to remove
 */
export function removeCredentialHelperScript(scriptPath: string): void {
  try {
    if (existsSync(scriptPath)) {
      // Overwrite file content before deletion to reduce token exposure window
      try {
        writeFileSync(scriptPath, '# cleaned\n');
      } catch {
        // Continue with deletion even if overwrite fails
      }
      unlinkSync(scriptPath);
    }
  } catch (error) {
    // Log cleanup errors for debugging instead of silently ignoring
    console.warn(`[git-credential-helper] Failed to remove credential script ${scriptPath}:`, error instanceof Error ? error.message : String(error));
  }
}

/**
 * Get environment variables to inject for git authentication.
 * These environment variables enable git to use the OAuth token for HTTPS operations.
 *
 * @param token - The OAuth access token
 * @param platform - The git platform ('github' or 'gitlab')
 * @param username - Optional username (defaults based on platform)
 * @returns Record of environment variables to set
 */
export function getGitCredentialEnv(
  token: string,
  platform: 'github' | 'gitlab',
  username?: string
): Record<string, string> {
  const env: Record<string, string> = {};

  // Set platform-specific tokens that CLI tools and git credential helpers recognize
  if (platform === 'github') {
    // GitHub CLI and many tools recognize these
    env.GH_TOKEN = token;
    env.GITHUB_TOKEN = token;
  } else if (platform === 'gitlab') {
    // GitLab CLI and many tools recognize this
    env.GITLAB_TOKEN = token;
    env.GL_TOKEN = token; // Some tools use this
  }

  // Disable interactive prompts - git should fail rather than hang
  env.GIT_TERMINAL_PROMPT = '0';

  // Create a GIT_ASKPASS script that echoes the token
  // This is the most reliable method for HTTPS git auth
  const askpassScript = createCredentialHelperScript(token, platform);
  env.GIT_ASKPASS = askpassScript;
  env._GIT_ASKPASS_CLEANUP = askpassScript; // Store for cleanup

  // Set username for the credential helper
  // GitHub uses 'oauth2' or 'x-access-token' as username for token auth
  // GitLab uses 'oauth2' as well
  const authUsername = username || 'oauth2';
  env.GIT_AUTHOR_NAME = env.GIT_AUTHOR_NAME || authUsername;

  return env;
}

/**
 * Clean up any temporary files created by getGitCredentialEnv.
 * Call this after git operations complete.
 *
 * @param env - The environment object returned by getGitCredentialEnv
 */
export function cleanupGitCredentialEnv(env: Record<string, string>): void {
  const cleanupPath = env._GIT_ASKPASS_CLEANUP;
  if (cleanupPath) {
    removeCredentialHelperScript(cleanupPath);
  }
}

/**
 * Configure git to use token authentication for a specific remote URL.
 * This modifies the URL to include the token inline (for temporary use).
 *
 * @param remoteUrl - The original remote URL (e.g., https://github.com/user/repo.git)
 * @param token - The OAuth access token
 * @param platform - The git platform
 * @returns The modified URL with embedded credentials
 */
export function getAuthenticatedRemoteUrl(
  remoteUrl: string,
  token: string,
  platform: 'github' | 'gitlab'
): string {
  // Only modify HTTPS URLs
  if (!remoteUrl.startsWith('https://')) {
    return remoteUrl;
  }

  // Insert token into URL: https://oauth2:TOKEN@github.com/user/repo.git
  try {
    const url = new URL(remoteUrl);
    url.username = 'oauth2';
    url.password = token;
    return url.toString();
  } catch {
    // If URL parsing fails, try simple string replacement
    return remoteUrl.replace('https://', `https://oauth2:${token}@`);
  }
}

/**
 * Detect the git platform from a remote URL.
 *
 * @param remoteUrl - The remote URL to analyze
 * @returns 'github', 'gitlab', or null if unknown
 */
export function detectPlatformFromUrl(remoteUrl: string): 'github' | 'gitlab' | null {
  const urlLower = remoteUrl.toLowerCase();

  if (urlLower.includes('github.com') || urlLower.includes('github.')) {
    return 'github';
  }

  if (urlLower.includes('gitlab.com') || urlLower.includes('gitlab.')) {
    return 'gitlab';
  }

  return null;
}

/**
 * Check if a remote URL is using HTTPS (vs SSH).
 * OAuth tokens only work with HTTPS remotes.
 *
 * @param remoteUrl - The remote URL to check
 * @returns true if the URL is HTTPS
 */
export function isHttpsRemote(remoteUrl: string): boolean {
  return remoteUrl.startsWith('https://') || remoteUrl.startsWith('http://');
}
