// useRepos — surface git REPOSITORIES (subdirs of workspaces) for the activity bar.
// A Workspace is a parent directory; the actual repos are the git subdirs inside it.
// Each workspace contributes 0..N repos; the union is what the sidebar shows.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Workspace, WorkspaceCreateRequest, WorkspaceValidationResult, GitRepoEntry } from '../../shared/ipc-types';
import { colorFromString, type RepoColor } from '../components/shell/shell-utils';

const LAST_OPENED_KEY = 'omnidesk.repo.lastOpened';
const ACTIVE_REPO_KEY = 'omnidesk.repo.activeId';
/** Repos the user has explicitly "opened" (via Open folder / Clone). Pinned to the sidebar
 *  regardless of session count. Cleared per-repo by user action. */
const OPENED_REPOS_KEY = 'omnidesk.repo.openedIds';
/** Persisted repository groups — collections of repos the user manually merged. */
const GROUPS_KEY = 'omnidesk.repo.groups';
/** Plain (non-git) folders the user opened directly. The workspace scan only
 *  finds git repos, so these are tracked separately. */
const PLAIN_FOLDERS_KEY = 'omnidesk.repo.plainFolders';

export interface Repo {
  /** Stable id derived from the repo's absolute path. */
  id: string;
  /** Folder name. */
  name: string;
  /** "Org" — we use the workspace name as the grouping label. */
  org: string;
  /** Absolute path to the repo's working tree. */
  path: string;
  /** Absolute path to the parent workspace. */
  workspacePath: string;
  /** Current branch (from .git/HEAD), if known. */
  branch?: string;
  /** Epoch ms last switched to, tracked in localStorage. */
  lastOpened: number;
  /** Deterministic color for the activity bar mark. */
  color: RepoColor;
  /** Whether this is a git repo. Plain folders (isGit=false) have no branches
   *  or worktrees — sessions run directly in the folder. */
  isGit: boolean;
}

interface PlainFolder {
  name: string;
  path: string;
}

const readPlainFolders = (): PlainFolder[] => {
  try {
    const raw = localStorage.getItem(PLAIN_FOLDERS_KEY);
    return raw ? (JSON.parse(raw) as PlainFolder[]) : [];
  } catch { return []; }
};

const writePlainFolders = (fs: PlainFolder[]) => {
  try { localStorage.setItem(PLAIN_FOLDERS_KEY, JSON.stringify(fs)); } catch { /* ignore */ }
};

const readLastOpenedMap = (): Record<string, number> => {
  try {
    const raw = localStorage.getItem(LAST_OPENED_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
};

const writeLastOpenedMap = (m: Record<string, number>) => {
  try { localStorage.setItem(LAST_OPENED_KEY, JSON.stringify(m)); } catch { /* ignore */ }
};

const readOpenedIds = (): Set<string> => {
  try {
    const raw = localStorage.getItem(OPENED_REPOS_KEY);
    return new Set(raw ? JSON.parse(raw) as string[] : []);
  } catch { return new Set(); }
};

const writeOpenedIds = (s: Set<string>) => {
  try { localStorage.setItem(OPENED_REPOS_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
};

export interface RepoGroup {
  id: string;
  name: string;
  repoIds: string[];
  createdAt: number;
}

const readGroups = (): RepoGroup[] => {
  try {
    const raw = localStorage.getItem(GROUPS_KEY);
    return raw ? (JSON.parse(raw) as RepoGroup[]) : [];
  } catch { return []; }
};

const writeGroups = (gs: RepoGroup[]) => {
  try { localStorage.setItem(GROUPS_KEY, JSON.stringify(gs)); } catch { /* ignore */ }
};

const genGroupId = (): string =>
  `g_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

const repoIdOf = (absPath: string): string => absPath;

const deriveOrg = (absPath: string): string => {
  const parts = absPath.replace(/\\/g, '/').split('/').filter(Boolean);
  return parts.length >= 2 ? parts[parts.length - 2] : '';
};

const toRepo = (
  entry: GitRepoEntry,
  workspaceName: string,
  lastOpenedMap: Record<string, number>,
): Repo => {
  const id = repoIdOf(entry.path);
  return {
    id,
    name: entry.name,
    org: workspaceName,
    path: entry.path,
    workspacePath: entry.workspacePath,
    branch: entry.branch,
    lastOpened: lastOpenedMap[id] ?? 0,
    color: colorFromString(id),
    isGit: true,
  };
};

const plainToRepo = (f: PlainFolder, lastOpenedMap: Record<string, number>): Repo => {
  const id = repoIdOf(f.path);
  return {
    id,
    name: f.name,
    org: deriveOrg(f.path),
    path: f.path,
    workspacePath: f.path.replace(/[\\/][^\\/]+$/, '') || f.path,
    branch: undefined,
    lastOpened: lastOpenedMap[id] ?? 0,
    color: colorFromString(id),
    isGit: false,
  };
};

export function useRepos() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [repos, setRepos] = useState<Repo[]>([]);
  const [activeRepoId, setActiveRepoIdState] = useState<string | null>(() => localStorage.getItem(ACTIVE_REPO_KEY));
  const [openedRepoIds, setOpenedRepoIds] = useState<Set<string>>(() => readOpenedIds());
  const [groups, setGroups] = useState<RepoGroup[]>(() => readGroups());
  const [plainFolders, setPlainFolders] = useState<PlainFolder[]>(() => readPlainFolders());
  const [isLoading, setIsLoading] = useState(true);

  /** Scan every workspace for git repos and rebuild the repo list. Returns the new list. */
  const refresh = useCallback(async (): Promise<Repo[]> => {
    try {
      const loadedWorkspaces = await window.electronAPI.listWorkspaces();
      setWorkspaces(loadedWorkspaces);
      const map = readLastOpenedMap();

      const scans = await Promise.all(
        loadedWorkspaces.map(async (w) => {
          try {
            const entries = await window.electronAPI.listGitRepos(w.path);
            return entries.map(e => toRepo(e, w.name, map));
          } catch (err) {
            console.error(`useRepos: failed to scan workspace ${w.name}`, err);
            return [];
          }
        })
      );

      // Flatten + de-dup by id (a folder shouldn't appear under two workspaces, but guard anyway).
      const seen = new Set<string>();
      const next: Repo[] = [];
      for (const list of scans) {
        for (const r of list) {
          if (seen.has(r.id)) continue;
          seen.add(r.id);
          next.push(r);
        }
      }
      // Merge in plain (non-git) folders the user opened directly. If a plain
      // folder later becomes a git repo (e.g. user ran git init elsewhere), the
      // git scan wins and we drop the plain entry.
      const plain = readPlainFolders();
      setPlainFolders(plain);
      for (const f of plain) {
        const id = repoIdOf(f.path);
        if (seen.has(id)) continue;
        seen.add(id);
        next.push(plainToRepo(f, map));
      }
      // Stable sort: most-recently-opened first, then by name.
      next.sort((a, b) => (b.lastOpened - a.lastOpened) || a.name.localeCompare(b.name));
      setRepos(next);

      // Fix up activeRepoId if it points at a repo that no longer exists.
      setActiveRepoIdState(prev => {
        if (prev && next.some(r => r.id === prev)) return prev;
        if (next.length === 0) return null;
        const top = next[0].id;
        try { localStorage.setItem(ACTIVE_REPO_KEY, top); } catch { /* ignore */ }
        return top;
      });
      return next;
    } catch (err) {
      console.error('useRepos: failed to load workspaces', err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const reposById = useMemo(() => {
    const m: Record<string, Repo> = {};
    for (const r of repos) m[r.id] = r;
    return m;
  }, [repos]);

  const activeRepo = activeRepoId ? reposById[activeRepoId] ?? null : null;

  const setActiveRepoId = useCallback((id: string | null) => {
    setActiveRepoIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_REPO_KEY, id);
      else    localStorage.removeItem(ACTIVE_REPO_KEY);
    } catch { /* ignore */ }
    if (!id) return;
    const map = readLastOpenedMap();
    const next = { ...map, [id]: Date.now() };
    writeLastOpenedMap(next);
    setRepos(prev => prev.map(r => r.id === id ? { ...r, lastOpened: Date.now() } : r));
  }, []);

  /** ─── Groups ─── */

  // Mutate state + persist. Auto-dissolves groups with fewer than 2 members.
  const writeAndSet = useCallback((next: RepoGroup[]) => {
    const cleaned = next.filter(g => g.repoIds.length >= 2);
    writeGroups(cleaned);
    setGroups(cleaned);
    return cleaned;
  }, []);

  const createGroup = useCallback((name: string, repoIds: string[]): string => {
    const id = genGroupId();
    const group: RepoGroup = {
      id,
      name: name.trim() || 'New group',
      repoIds: [...new Set(repoIds)],
      createdAt: Date.now(),
    };
    setGroups(prev => {
      // Strip any repo that was already in a group — a repo can belong to at most one.
      const cleaned = prev.map(g => ({
        ...g,
        repoIds: g.repoIds.filter(rid => !group.repoIds.includes(rid)),
      }));
      const merged = [...cleaned.filter(g => g.repoIds.length >= 2), group];
      writeGroups(merged);
      return merged;
    });
    return id;
  }, []);

  const addRepoToGroup = useCallback((groupId: string, repoId: string) => {
    setGroups(prev => {
      // Pull the repo out of any other group first.
      const stripped = prev.map(g => ({
        ...g,
        repoIds: g.repoIds.filter(rid => rid !== repoId),
      }));
      const merged = stripped.map(g =>
        g.id === groupId
          ? { ...g, repoIds: [...new Set([...g.repoIds, repoId])] }
          : g
      );
      return writeAndSet(merged);
    });
  }, [writeAndSet]);

  const removeRepoFromGroup = useCallback((groupId: string, repoId: string) => {
    setGroups(prev => {
      const next = prev.map(g =>
        g.id === groupId
          ? { ...g, repoIds: g.repoIds.filter(rid => rid !== repoId) }
          : g
      );
      return writeAndSet(next);
    });
  }, [writeAndSet]);

  const dissolveGroup = useCallback((groupId: string) => {
    setGroups(prev => {
      const next = prev.filter(g => g.id !== groupId);
      writeGroups(next);
      return next;
    });
  }, []);

  const renameGroup = useCallback((groupId: string, name: string) => {
    setGroups(prev => {
      const next = prev.map(g => g.id === groupId ? { ...g, name: name.trim() || g.name } : g);
      writeGroups(next);
      return next;
    });
  }, []);

  /** Group containing the given repo, or null. */
  const groupOf = useCallback(
    (repoId: string): RepoGroup | null => groups.find(g => g.repoIds.includes(repoId)) ?? null,
    [groups],
  );

  /** Mark a repo as "opened" so the sidebar pins it even when it has no sessions. */
  const openRepo = useCallback((repoId: string) => {
    setOpenedRepoIds(prev => {
      if (prev.has(repoId)) return prev;
      const next = new Set(prev);
      next.add(repoId);
      writeOpenedIds(next);
      return next;
    });
  }, []);

  /** Close (unpin) a repo from the sidebar. Does NOT delete the underlying workspace/repo. */
  const closeRepo = useCallback((repoId: string) => {
    setOpenedRepoIds(prev => {
      if (!prev.has(repoId)) return prev;
      const next = new Set(prev);
      next.delete(repoId);
      writeOpenedIds(next);
      return next;
    });
  }, []);

  /** Register a new workspace (parent dir). Triggers a rescan to pick up its repos. */
  const addWorkspace = useCallback(async (req: WorkspaceCreateRequest): Promise<Workspace> => {
    const created = await window.electronAPI.addWorkspace(req);
    await refresh();
    return created;
  }, [refresh]);

  /** Open a non-git folder directly as a plain-folder repo. Persisted in localStorage. */
  const openPlainFolder = useCallback(async (path: string, name: string): Promise<Repo> => {
    const existing = readPlainFolders();
    const norm = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    if (!existing.some(f => norm(f.path) === norm(path))) {
      const next = [...existing, { path, name }];
      writePlainFolders(next);
      setPlainFolders(next);
    }
    const fresh = await refresh();
    const id = repoIdOf(path);
    return fresh.find(r => r.id === id) ?? plainToRepo({ path, name }, readLastOpenedMap());
  }, [refresh]);

  /** Remove a plain-folder repo from the persisted list (e.g. on close). */
  const removePlainFolder = useCallback((repoId: string) => {
    const next = readPlainFolders().filter(f => repoIdOf(f.path) !== repoId);
    writePlainFolders(next);
    setPlainFolders(next);
  }, []);

  const deleteWorkspace = useCallback(async (id: string): Promise<void> => {
    await window.electronAPI.deleteWorkspace(id);
    await refresh();
  }, [refresh]);

  const validatePath = useCallback(async (
    path: string,
    excludeId?: string
  ): Promise<WorkspaceValidationResult> => {
    return window.electronAPI.validateWorkspacePath(path, excludeId);
  }, []);

  return {
    repos,
    reposById,
    workspaces,
    activeRepo,
    activeRepoId,
    openedRepoIds,
    groups,
    groupOf,
    isLoading,
    setActiveRepoId,
    openRepo,
    closeRepo,
    addWorkspace,
    deleteWorkspace,
    validatePath,
    refresh,
    plainFolders,
    openPlainFolder,
    removePlainFolder,
    createGroup,
    addRepoToGroup,
    removeRepoFromGroup,
    dissolveGroup,
    renameGroup,
  };
}
