import * as path from 'path';

function normalizeForCompare(p: string): string {
  const normalized = path.normalize(p);
  return process.platform === 'win32' ? normalized.toLowerCase() : normalized;
}

export function isPathWithin(child: string, parent: string): boolean {
  const c = normalizeForCompare(child);
  const p = normalizeForCompare(parent);
  if (c === p) return true;
  const parentWithSep = p.endsWith(path.sep) ? p : p + path.sep;
  return c.startsWith(parentWithSep);
}

/**
 * Compares two filesystem paths for equality, tolerating slash-direction and
 * (on Windows) drive-letter/segment case differences — e.g. worktree paths
 * reported by `git worktree list` vs. paths persisted in the worktree
 * registry or recorded on session metadata.
 */
export function arePathsEqual(a: string, b: string): boolean {
  return normalizeForCompare(a) === normalizeForCompare(b);
}

// Roots the user explicitly chose via a native OS dialog (e.g. the "Browse…"
// folder picker). Stored resolved; descendants are allowed. This closes the
// chicken-and-egg where the add-repo flow must scan a folder to decide whether
// to register it, but the folder isn't a registered workspace yet — and lives
// outside the home directory (common on Windows: C:\src, C:\neldevsrc, …).
const approvedRoots = new Set<string>();

export function approvePickedRoot(pickedPath: string): void {
  approvedRoots.add(path.resolve(pickedPath));
}

function isApprovedRoot(resolved: string): boolean {
  for (const root of approvedRoots) {
    if (isPathWithin(resolved, root)) return true;
  }
  return false;
}

export function isPathAllowed(resolved: string, homeDir: string, workspacePaths: string[]): boolean {
  // homeDir must be resolved the same way workspacePaths are below, otherwise
  // a resolved (drive-lettered on win32) child path can fail to match an
  // unresolved homeDir that lacks a drive letter, causing false rejections.
  if (isPathWithin(resolved, path.resolve(homeDir))) return true;
  for (const ws of workspacePaths) {
    if (isPathWithin(resolved, path.resolve(ws))) return true;
  }
  return isApprovedRoot(resolved);
}

// Test-only: clear the approved-roots set between tests.
export function _resetApprovedRoots(): void {
  approvedRoots.clear();
}
