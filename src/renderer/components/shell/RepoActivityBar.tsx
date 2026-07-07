// @atlas-entrypoint: Activity bar (Phase 4). Stack of items where each is
// either a single repo or a group of repos. Groups appear as a folder icon
// that can be expanded inline to reveal their member repos. Drag-and-drop a
// repo onto another → create group (prompts for name). Drag onto a group →
// add to it.
import { useState } from 'react';
import { P4Icon } from './P4Icon';
import { ContextMenu, type ContextMenuItem } from './ContextMenu';
import { colorBg, colorFg, type RepoColor } from './shell-utils';
import type { Repo } from '../../hooks/useRepos';
import type { RepoGroup } from '../../hooks/useRepos';

// Path-prefix matcher logic (preserved exports for back-compat). The actual
// session→repo membership rules live in SessionRail; we just need to know if a
// session's CWD belongs to a repo for the live-dot count.
const norm = (s: string) => s.replace(/\\/g, '/').replace(/\/+$/, '');

function isPathPrefix(repoPath: string, sessionDir: string): boolean {
  if (!sessionDir) return false;
  const a = norm(repoPath);
  const b = norm(sessionDir);
  return b === a || b.startsWith(a + '/');
}

export function sessionBelongsToRepo(
  repoPath: string,
  session: { workingDirectory: string; mainRepoPath?: string | null }
): boolean {
  if (session.mainRepoPath && norm(session.mainRepoPath) === norm(repoPath)) return true;
  if (isPathPrefix(repoPath, session.workingDirectory)) return true;
  const parts = norm(repoPath).split('/');
  const repoName = parts[parts.length - 1];
  const parent = parts.slice(0, -1).join('/');
  if (repoName && parent) {
    const worktreeRoot = `${parent}/${repoName}-worktrees/`;
    if (norm(session.workingDirectory).startsWith(worktreeRoot)) return true;
  }
  return false;
}

export { isPathPrefix };

// ─── Selection state passed in ───
export type ActiveSelection =
  | { kind: 'repo';  id: string }
  | { kind: 'group'; id: string }
  | null;

export interface RepoActivityBarProps {
  repos: Repo[];                            // visible repos (filtered by App)
  groups: RepoGroup[];                      // user-defined groups
  active: ActiveSelection;
  liveCountByRepo: Record<string, number>;
  onSelectRepo: (id: string) => void;
  onSelectGroup: (id: string) => void;
  onCloseRepo?: (id: string) => void;
  onAddRepo: () => void;
  onCreateGroupFromDrop: (fromRepoId: string, ontoRepoId: string) => void;
  onAddRepoToGroup: (groupId: string, repoId: string) => void;
  onRequestRenameGroup: (groupId: string) => void;
  onRequestUngroup: (groupId: string) => void;
  onOpenRemote?: () => void;                // open the Remote Access panel
}

// Track which group icons are expanded inline.
const EXPANDED_KEY = 'omnidesk.repo.expandedGroups';

const readExpanded = (): Set<string> => {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY);
    return new Set(raw ? JSON.parse(raw) as string[] : []);
  } catch { return new Set(); }
};

const writeExpanded = (s: Set<string>) => {
  try { localStorage.setItem(EXPANDED_KEY, JSON.stringify([...s])); } catch { /* ignore */ }
};

export function RepoActivityBar({
  repos,
  groups,
  active,
  liveCountByRepo,
  onSelectRepo,
  onSelectGroup,
  onCloseRepo,
  onAddRepo,
  onCreateGroupFromDrop,
  onAddRepoToGroup,
  onRequestRenameGroup,
  onRequestUngroup,
  onOpenRemote,
}: RepoActivityBarProps) {
  const [expanded, setExpanded] = useState<Set<string>>(() => readExpanded());
  const [dragOverTarget, setDragOverTarget] = useState<string | null>(null);
  // Open context menu for a group icon (rename / ungroup).
  const [groupMenu, setGroupMenu] = useState<{ groupId: string; x: number; y: number } | null>(null);

  const toggleExpanded = (groupId: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId); else next.add(groupId);
      writeExpanded(next);
      return next;
    });
  };

  // Build display order: groups (with their members nested when expanded),
  // then ungrouped repos. Each member appears under exactly one group; we
  // skip any visible repo that's a member when we render the ungrouped list.
  const groupMemberIds = new Set<string>(groups.flatMap(g => g.repoIds));
  const visibleGroupedById = new Map<string, RepoGroup>();
  for (const g of groups) {
    // Only render a group if at least one of its repos is currently visible.
    if (g.repoIds.some(rid => repos.some(r => r.id === rid))) {
      visibleGroupedById.set(g.id, g);
    }
  }
  const ungrouped = repos.filter(r => !groupMemberIds.has(r.id));

  // ─── Drag handlers ───
  const onDragStart = (e: React.DragEvent, payload: { kind: 'repo'; id: string }) => {
    e.dataTransfer.setData('text/x-omnidesk-repo-id', payload.id);
    e.dataTransfer.effectAllowed = 'move';
  };
  const onDragOverItem = (e: React.DragEvent, target: string) => {
    if (e.dataTransfer.types.includes('text/x-omnidesk-repo-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      setDragOverTarget(target);
    }
  };
  const onDragLeave = () => setDragOverTarget(null);

  return (
    <nav
      className="p4-activity"
      aria-label="Repositories"
      // dragend fires on the source when a drag finishes (drop OR cancel) and
      // bubbles here, so the drop-target highlight clears even when a child's
      // dragleave/drop is missed (a common HTML5 DnD quirk).
      onDragEnd={() => setDragOverTarget(null)}
    >
      {[...visibleGroupedById.values()].map(g => {
        const members = g.repoIds
          .map(rid => repos.find(r => r.id === rid))
          .filter((r): r is Repo => !!r);
        const live = members.reduce((acc, r) => acc + (liveCountByRepo[r.id] ?? 0), 0);
        const isExpanded = expanded.has(g.id);
        const isActive = active?.kind === 'group' && active.id === g.id;
        return (
          <div key={g.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '100%' }}>
            <button
              type="button"
              className={'p4-ab p4-ab-group' + (isActive ? ' active' : '') + (dragOverTarget === g.id ? ' drop-target' : '')}
              title={`${g.name} (${members.length} repos)${live ? ` · ${live} live` : ''}\nRight-click for options`}
              onClick={() => { onSelectGroup(g.id); }}
              onDoubleClick={() => toggleExpanded(g.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setGroupMenu({ groupId: g.id, x: e.clientX, y: e.clientY });
              }}
              onDragOver={(e) => onDragOverItem(e, g.id)}
              onDragLeave={onDragLeave}
              onDrop={(e) => {
                const rid = e.dataTransfer.getData('text/x-omnidesk-repo-id');
                setDragOverTarget(null);
                if (rid && !g.repoIds.includes(rid)) onAddRepoToGroup(g.id, rid);
              }}
            >
              <span className="repo-mark" style={{
                background: 'rgba(124,143,255,.18)',
                color: 'var(--accent-2)',
                position: 'relative',
              }}>
                <P4Icon name="folder" size={14} />
                <span style={{
                  position: 'absolute', bottom: -2, right: -2,
                  fontSize: 8, fontFamily: 'var(--font-mono)', fontWeight: 700,
                  background: 'var(--surface-base)',
                  color: 'var(--accent-2)',
                  borderRadius: 4, padding: '0 3px', minWidth: 12,
                  textAlign: 'center',
                }}>{members.length}</span>
              </span>
              {live > 0 && <span className="repo-live-dot p4-pulse" aria-hidden="true" />}
            </button>

            {/* Expand toggle below the group icon */}
            <button
              type="button"
              onClick={() => toggleExpanded(g.id)}
              style={{
                border: 0, background: 'transparent', cursor: 'pointer',
                color: 'var(--text-tertiary)', padding: 0, marginTop: -2, marginBottom: 2,
                height: 12,
              }}
              title={isExpanded ? 'Collapse group' : 'Expand group'}
              aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
            >
              <P4Icon name={isExpanded ? 'chev_up' : 'chev_down'} size={10} />
            </button>

            {isExpanded && members.map(r => (
              <RepoIcon
                key={r.id}
                repo={r}
                live={liveCountByRepo[r.id] ?? 0}
                isActive={active?.kind === 'repo' && active.id === r.id}
                onSelect={() => onSelectRepo(r.id)}
                onClose={onCloseRepo}
                onDragStart={onDragStart}
                onDragOver={onDragOverItem}
                onDragLeave={onDragLeave}
                onDrop={() => {/* repo→member drop: same group, no-op */}}
                dragOverActive={dragOverTarget === r.id}
                isMember
              />
            ))}
          </div>
        );
      })}

      {ungrouped.map(r => (
        <RepoIcon
          key={r.id}
          repo={r}
          live={liveCountByRepo[r.id] ?? 0}
          isActive={active?.kind === 'repo' && active.id === r.id}
          onSelect={() => onSelectRepo(r.id)}
          onClose={onCloseRepo}
          onDragStart={onDragStart}
          onDragOver={onDragOverItem}
          onDragLeave={onDragLeave}
          onDrop={(_e, droppedId) => {
            if (droppedId === r.id) return;
            onCreateGroupFromDrop(droppedId, r.id);
          }}
          dragOverActive={dragOverTarget === r.id}
        />
      ))}

      <button
        className="p4-ab p4-ab-add"
        title="Add repository — open folder or clone from URL"
        aria-label="Add repository"
        onClick={onAddRepo}
      >
        <P4Icon name="plus" />
      </button>

      <div className="p4-ab-spacer" />

      {onOpenRemote && (
        <button
          className="p4-ab p4-ab-add"
          title="Remote access — reach OmniDesk from a browser over a tunnel"
          aria-label="Remote access"
          onClick={onOpenRemote}
        >
          <P4Icon name="tunnel" />
        </button>
      )}

      {groupMenu && (() => {
        const g = groups.find(x => x.id === groupMenu.groupId);
        if (!g) return null;
        const items: ContextMenuItem[] = [
          {
            label: 'Rename group…',
            icon: 'sparkle',
            onSelect: () => onRequestRenameGroup(g.id),
          },
          {
            label: 'Ungroup',
            icon: 'x',
            variant: 'danger',
            onSelect: () => onRequestUngroup(g.id),
          },
        ];
        return (
          <ContextMenu
            x={groupMenu.x}
            y={groupMenu.y}
            items={items}
            onClose={() => setGroupMenu(null)}
          />
        );
      })()}
    </nav>
  );
}

// ─── Single repo icon (used in both ungrouped list and expanded group members) ───
interface RepoIconProps {
  repo: Repo;
  live: number;
  isActive: boolean;
  isMember?: boolean;
  dragOverActive: boolean;
  onSelect: () => void;
  onClose?: (id: string) => void;
  onDragStart: (e: React.DragEvent, payload: { kind: 'repo'; id: string }) => void;
  onDragOver: (e: React.DragEvent, target: string) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent, droppedId: string) => void;
}

function RepoIcon({
  repo,
  live,
  isActive,
  isMember,
  dragOverActive,
  onSelect,
  onClose,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
}: RepoIconProps) {
  const title =
    `${repo.org ? repo.org + '/' : ''}${repo.name}` +
    (live ? ` · ${live} live` : '') +
    (onClose ? '  (right-click to close)' : '');
  return (
    <button
      type="button"
      className={
        'p4-ab p4-ab-repo'
        + (isActive ? ' active' : '')
        + (isMember ? ' p4-ab-member' : '')
        + (dragOverActive ? ' drop-target' : '')
      }
      title={title}
      aria-label={title}
      aria-current={isActive ? 'page' : undefined}
      draggable
      onClick={onSelect}
      onDragStart={(e) => onDragStart(e, { kind: 'repo', id: repo.id })}
      onDragOver={(e) => onDragOver(e, repo.id)}
      onDragLeave={onDragLeave}
      onDrop={(e) => {
        const rid = e.dataTransfer.getData('text/x-omnidesk-repo-id');
        if (rid) onDrop(e, rid);
      }}
      onContextMenu={(e) => {
        if (!onClose) return;
        e.preventDefault();
        onClose(repo.id);
      }}
    >
      <span
        className="repo-mark"
        style={{
          background: colorBg(repo.color as RepoColor),
          color: colorFg(repo.color as RepoColor),
        }}
      >
        {repo.name[0]?.toUpperCase() ?? '?'}
      </span>
      {live > 0 && <span className="repo-live-dot p4-pulse" aria-hidden="true" />}
    </button>
  );
}
