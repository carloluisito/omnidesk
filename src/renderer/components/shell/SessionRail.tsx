// @atlas-entrypoint: Session rail — primary nav for the active repo.
// Beefy repo header → filter → Active/Idle groups → "New session" CTA.
import { useMemo, useRef, useState } from 'react';
import { P4Icon } from './P4Icon';
import {
  colorBg, colorFg, initials, agentLetter, agentColor,
  STATUS_META, formatLastActive,
  type SessionStatus, type RepoColor,
} from './shell-utils';
import { sessionBelongsToRepo } from './RepoActivityBar';
import type { RepoGroup } from '../../hooks/useRepos';
import type { Repo } from '../../hooks/useRepos';
import type { TabData } from '../ui/Tab';

// ─── TabData (running/exited/error) → prototype's richer status set ───
export function mapTabStatus(t: TabData): SessionStatus {
  if (t.status === 'error')  return 'errored';
  if (t.status === 'exited') return 'idle';
  return 'live';
}

export const ACTIVE_STATUSES: SessionStatus[] = ['live', 'thinking', 'awaiting', 'errored'];

// ─── Sessions are scoped to a repo by mainRepoPath OR working-directory prefix ───
export function sessionsForRepo(repo: Repo, sessions: TabData[]): TabData[] {
  return sessions.filter(s => sessionBelongsToRepo(repo.path, s));
}

export function liveCount(sessions: TabData[]): number {
  return sessions.filter(s => {
    const st = mapTabStatus(s);
    return st === 'live' || st === 'thinking';
  }).length;
}

// ─── A single session row in the rail ───
interface SessionRowProps {
  session: TabData;
  active: boolean;
  onSelect: (id: string) => void;
  onClose?: (id: string) => void;
  onContextMenu?: (id: string, x: number, y: number) => void;
  // Drag-reorder
  draggable?: boolean;
  dropIndicator?: 'top' | 'bottom' | null;
  onDragStart?: (id: string) => void;
  onDragOverRow?: (id: string, e: React.DragEvent) => void;
  onDropRow?: (id: string) => void;
  onDragEnd?: () => void;
}

function SessionRow({
  session, active, onSelect, onClose, onContextMenu,
  draggable, dropIndicator, onDragStart, onDragOverRow, onDropRow, onDragEnd,
}: SessionRowProps) {
  const status = mapTabStatus(session);
  const meta = STATUS_META[status];
  const agent = session.providerId ?? 'claude';
  // We don't track per-session color yet; derive a soft neutral from the name.
  const color: RepoColor = status === 'errored' ? 'error' :
                            status === 'live' ? 'accent' :
                            status === 'idle' ? 'neutral' : 'info';

  return (
    <div
      className={
        'p4-sess-row' + (active ? ' active' : '')
        + (dropIndicator === 'top' ? ' drop-before' : '')
        + (dropIndicator === 'bottom' ? ' drop-after' : '')
      }
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      draggable={draggable}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSelect(session.id); }
      }}
      onContextMenu={(e) => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(session.id, e.clientX, e.clientY);
      }}
      onDragStart={(e) => {
        if (!draggable) return;
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/x-omnidesk-session', session.id);
        onDragStart?.(session.id);
      }}
      onDragOver={(e) => onDragOverRow?.(session.id, e)}
      onDrop={(e) => { e.preventDefault(); onDropRow?.(session.id); }}
      onDragEnd={() => onDragEnd?.()}
    >
      <span
        className="sess-icon"
        style={{ background: colorBg(color), color: colorFg(color) }}
      >
        {initials(session.name)}
        <span
          className={'sess-status-dot' + (meta.pulse ? ' p4-pulse' : '')}
          style={{ background: meta.color }}
        />
      </span>
      <div className="sess-body">
        <div className="sess-name">
          <span className="sess-name-text">{session.name}</span>
        </div>
        <div className="sess-meta">
          <span style={{ color: agentColor(agent), fontWeight: 600 }}>{agentLetter(agent)}</span>
          <span className="sep">·</span>
          {session.worktreeBranch ? (
            <>
              <span>{session.worktreeBranch}</span>
              <span className="sep">·</span>
            </>
          ) : null}
          <span>{meta.label}</span>
        </div>
      </div>
      {onClose && (
        <button
          type="button"
          className="sess-close"
          aria-label={`Close ${session.name}`}
          title="Close session"
          onClick={(e) => { e.stopPropagation(); onClose(session.id); }}
        >
          <P4Icon name="x" size={11} />
        </button>
      )}
    </div>
  );
}

// ─── The rail itself ───
export interface SessionRailProps {
  repo: Repo;                  // current single repo (always set; the "focused member" when in a group)
  repos: Repo[];
  sessions: TabData[];
  activeSessionId: string | null;
  query: string;
  setQuery: (q: string) => void;
  onSelectSession: (id: string) => void;
  onCloseSession?: (id: string) => void;
  onSessionContextMenu?: (id: string, x: number, y: number) => void;
  onNewSession: () => void;
  onOpenRepoSwitcher: (anchorRect: DOMRect | null) => void;
  repoSwitcherOpen: boolean;
  formatRelative?: (epochMs: number) => string;
  /** When set, the rail is in group mode — header + session list aggregate across members. */
  group?: RepoGroup;
  /** Resolved member repos for the active group (in display order). */
  groupMembers?: Repo[];
  /** Per-repo session display order (drag-reorder). repoId → ordered session ids. */
  sessionOrders?: Record<string, string[]>;
  /** Reorder a session within its repo (only within the same status group). */
  onReorderSession?: (repoId: string, draggedId: string, targetId: string) => void;
}

/** Sort sessions by the persisted order; sessions not in the list keep their incoming order, after known ones. */
function applyOrder(list: TabData[], order: string[] | undefined): TabData[] {
  if (!order || order.length === 0) return list;
  const idx = new Map(order.map((id, i) => [id, i]));
  return [...list].sort((a, b) => {
    const ai = idx.has(a.id) ? idx.get(a.id)! : Number.MAX_SAFE_INTEGER;
    const bi = idx.has(b.id) ? idx.get(b.id)! : Number.MAX_SAFE_INTEGER;
    return ai - bi;
  });
}

export function SessionRail({
  repo,
  sessions,
  activeSessionId,
  query,
  setQuery,
  onSelectSession,
  onCloseSession,
  onSessionContextMenu,
  onNewSession,
  onOpenRepoSwitcher,
  repoSwitcherOpen,
  formatRelative = formatLastActive,
  group,
  groupMembers,
  sessionOrders,
  onReorderSession,
}: SessionRailProps) {
  const headerRef = useRef<HTMLButtonElement | null>(null);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);

  // ─── Compute session set based on whether we're in group or single-repo mode ───
  const contextRepos: Repo[] = group && groupMembers ? groupMembers : [repo];
  const allRepoSessions = useMemo(
    () => contextRepos.flatMap(r => sessionsForRepo(r, sessions)),
    [contextRepos, sessions],
  );

  const matches = (s: TabData): boolean => {
    if (!query) return true;
    const q = query.toLowerCase();
    return (
      s.name.toLowerCase().includes(q) ||
      (s.worktreeBranch?.toLowerCase().includes(q) ?? false)
    );
  };

  // For the single-repo view, the existing active/idle split is shown directly.
  // For group view, we still split active/idle but ALSO sub-group by repo.
  // In single-repo mode, apply the persisted drag order for this repo.
  const singleOrder = !group ? sessionOrders?.[repo.id] : undefined;
  const active = applyOrder(
    allRepoSessions.filter(s => ACTIVE_STATUSES.includes(mapTabStatus(s)) && matches(s)),
    singleOrder,
  );
  const idle = applyOrder(
    allRepoSessions.filter(s => !ACTIVE_STATUSES.includes(mapTabStatus(s)) && matches(s)),
    singleOrder,
  );

  const live = liveCount(allRepoSessions);
  const worktreeCount = new Set(
    allRepoSessions.map(s => s.worktreeBranch).filter(Boolean) as string[]
  ).size || (allRepoSessions.length > 0 ? 1 : 0);

  // formatRelative passed through for consumer-controlled clock — defaults to last-active helper.
  void formatRelative;

  // ─── Helpers used only in group sub-grouping ───
  const repoOfSession = (s: TabData): Repo | undefined =>
    contextRepos.find(r => sessionBelongsToRepo(r.path, s));

  const sessionsByRepoActive = new Map<string, TabData[]>();
  const sessionsByRepoIdle = new Map<string, TabData[]>();
  if (group) {
    for (const s of active) {
      const r = repoOfSession(s);
      if (!r) continue;
      if (!sessionsByRepoActive.has(r.id)) sessionsByRepoActive.set(r.id, []);
      sessionsByRepoActive.get(r.id)!.push(s);
    }
    for (const s of idle) {
      const r = repoOfSession(s);
      if (!r) continue;
      if (!sessionsByRepoIdle.has(r.id)) sessionsByRepoIdle.set(r.id, []);
      sessionsByRepoIdle.get(r.id)!.push(s);
    }
    // Apply per-repo order within each sub-chunk.
    for (const [rid, rows] of sessionsByRepoActive) sessionsByRepoActive.set(rid, applyOrder(rows, sessionOrders?.[rid]));
    for (const [rid, rows] of sessionsByRepoIdle) sessionsByRepoIdle.set(rid, applyOrder(rows, sessionOrders?.[rid]));
  }

  // ─── Drag-reorder: only within the same "bucket" (repo + status group) ───
  const bucketOf = (s: TabData): string => {
    const rid = (group ? repoOfSession(s)?.id : repo.id) ?? '';
    const isActive = ACTIVE_STATUSES.includes(mapTabStatus(s));
    return `${rid}:${isActive ? 'a' : 'i'}`;
  };
  const sameBucket = (aId: string, bId: string): boolean => {
    const a = allRepoSessions.find(s => s.id === aId);
    const b = allRepoSessions.find(s => s.id === bId);
    return !!a && !!b && bucketOf(a) === bucketOf(b);
  };
  const dragProps = (sessionId: string) => ({
    draggable: !!onReorderSession,
    dropIndicator: (dragId && overId === sessionId && dragId !== sessionId && sameBucket(dragId, sessionId))
      ? ('top' as const) : null,
    onDragStart: (id: string) => setDragId(id),
    onDragOverRow: (id: string, e: React.DragEvent) => {
      if (dragId && dragId !== id && sameBucket(dragId, id)) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        if (overId !== id) setOverId(id);
      }
    },
    onDropRow: (id: string) => {
      if (dragId && dragId !== id && sameBucket(dragId, id)) {
        const s = allRepoSessions.find(x => x.id === dragId);
        const rid = (group ? repoOfSession(s!)?.id : repo.id);
        if (rid) onReorderSession?.(rid, dragId, id);
      }
      setDragId(null);
      setOverId(null);
    },
    onDragEnd: () => { setDragId(null); setOverId(null); },
  });

  return (
    <aside className="p4-rail">
      <button
        ref={headerRef}
        type="button"
        className={'p4-repo-header' + (repoSwitcherOpen ? ' popped' : '')}
        title={group ? `Group · ${group.name}` : 'Click to switch repository'}
        onClick={() => onOpenRepoSwitcher(headerRef.current?.getBoundingClientRect() ?? null)}
      >
        <div
          className="p4-repo-icon"
          style={{
            background: group ? 'rgba(124,143,255,.18)' : colorBg(repo.color),
            color: group ? 'var(--accent-2)' : colorFg(repo.color),
            borderColor: 'transparent',
          }}
        >
          <P4Icon name="folder" size={18} />
        </div>
        <div className="p4-repo-info">
          <div className="p4-repo-name">
            {group ? (
              <>
                <span className="org">group</span>
                <span className="sl">/</span>
                <span>{group.name}</span>
              </>
            ) : (
              <>
                {repo.org ? (
                  <>
                    <span className="org">{repo.org}</span>
                    <span className="sl">/</span>
                  </>
                ) : null}
                <span>{repo.name}</span>
              </>
            )}
            <span className="open-indicator">
              <P4Icon name="chev_down" size={11} />
            </span>
          </div>
          <div className="p4-repo-stats">
            {group ? (
              <>
                <span>
                  <span className="num">{contextRepos.length}</span>
                  {' '}repo{contextRepos.length === 1 ? '' : 's'}
                </span>
                <span className="sep">·</span>
                <span><span className="acc">{live}</span> live</span>
                <span className="sep">·</span>
                <span>
                  <span className="num">{allRepoSessions.length}</span>
                  {' '}session{allRepoSessions.length === 1 ? '' : 's'}
                </span>
              </>
            ) : (
              <>
                {repo.branch && (
                  <span
                    className="branch"
                    title={repo.branch}
                    style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 130 }}
                  >
                    <P4Icon name="branch" size={9} /> {repo.branch}
                  </span>
                )}
                {repo.branch && <span className="sep">·</span>}
                <span><span className="acc">{live}</span> live</span>
                <span className="sep">·</span>
                <span>
                  <span className="num">{allRepoSessions.length}</span>
                  {' '}session{allRepoSessions.length === 1 ? '' : 's'}
                </span>
                {/* Worktree count is git-only and only when it diverges from session count. */}
                {repo.isGit && worktreeCount > 0 && worktreeCount !== allRepoSessions.length && (
                  <>
                    <span className="sep">·</span>
                    <span>
                      <span className="num">{worktreeCount}</span>
                      {' '}worktree{worktreeCount === 1 ? '' : 's'}
                    </span>
                  </>
                )}
                {!repo.isGit && (
                  <>
                    <span className="sep">·</span>
                    <span style={{ color: 'var(--text-quaternary)' }}>plain folder</span>
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </button>

      <div className="p4-rail-search" style={{ margin: '10px 10px 6px' }}>
        <P4Icon name="search" size={12} />
        <input
          placeholder="Filter sessions…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          aria-label="Filter sessions"
        />
      </div>

      <div className="p4-rail-list">
        {/* Group mode: sub-header per member repo within Active / Idle. Otherwise the
            original flat list of sessions in the single active repo. */}
        {group ? (
          <>
            {active.length > 0 && (
              <div className="p4-rail-group">
                <div className="p4-rail-group-head">
                  <span>Active</span>
                  <span className="p4-rail-group-count">{active.length}</span>
                </div>
                {contextRepos.map(r => {
                  const rows = sessionsByRepoActive.get(r.id) ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <div key={r.id} style={{ marginBottom: 4 }}>
                      <RepoSubHeader name={r.name} count={rows.length} />
                      {rows.map(s => (
                        <SessionRow
                          key={s.id}
                          session={s}
                          active={s.id === activeSessionId}
                          onSelect={onSelectSession}
                          onClose={onCloseSession}
                          onContextMenu={onSessionContextMenu}
                          {...dragProps(s.id)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}

            {idle.length > 0 && (
              <div className="p4-rail-group">
                <div className="p4-rail-group-head">
                  <span>Idle</span>
                  <span className="p4-rail-group-count">{idle.length}</span>
                </div>
                {contextRepos.map(r => {
                  const rows = sessionsByRepoIdle.get(r.id) ?? [];
                  if (rows.length === 0) return null;
                  return (
                    <div key={r.id} style={{ marginBottom: 4 }}>
                      <RepoSubHeader name={r.name} count={rows.length} />
                      {rows.map(s => (
                        <SessionRow
                          key={s.id}
                          session={s}
                          active={s.id === activeSessionId}
                          onSelect={onSelectSession}
                          onClose={onCloseSession}
                          onContextMenu={onSessionContextMenu}
                          {...dragProps(s.id)}
                        />
                      ))}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          <>
            {active.length > 0 && (
              <div className="p4-rail-group">
                <div className="p4-rail-group-head">
                  <span>Active</span>
                  <span className="p4-rail-group-count">{active.length}</span>
                </div>
                {active.map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    active={s.id === activeSessionId}
                    onSelect={onSelectSession}
                    onClose={onCloseSession}
                    onContextMenu={onSessionContextMenu}
                    {...dragProps(s.id)}
                  />
                ))}
              </div>
            )}

            {idle.length > 0 && (
              <div className="p4-rail-group">
                <div className="p4-rail-group-head">
                  <span>Idle</span>
                  <span className="p4-rail-group-count">{idle.length}</span>
                </div>
                {idle.map(s => (
                  <SessionRow
                    key={s.id}
                    session={s}
                    active={s.id === activeSessionId}
                    onSelect={onSelectSession}
                    onClose={onCloseSession}
                    onContextMenu={onSessionContextMenu}
                    {...dragProps(s.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}

        {allRepoSessions.length === 0 && (
          <div
            style={{
              padding: '24px 16px',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-sm)',
              textAlign: 'center',
            }}
          >
            {group
              ? `No sessions in any repo of "${group.name}" yet.`
              : 'No sessions in this repo yet.'}
          </div>
        )}
      </div>

      <div className="p4-rail-cta">
        <button className="p4-cta-btn" onClick={onNewSession}>
          <P4Icon name="plus" size={13} />
          New session
          <span className="shortcut">⌘N</span>
        </button>
      </div>
    </aside>
  );
}

// ─── Sub-header rendered before each repo's sessions when the rail is in group mode ───
function RepoSubHeader({ name, count }: { name: string; count: number }) {
  return (
    <div
      style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '4px 10px 2px',
        fontFamily: 'var(--font-mono)', fontSize: 9,
        textTransform: 'uppercase', letterSpacing: '.12em',
        color: 'var(--text-tertiary)',
      }}
    >
      <span>{name}</span>
      <span style={{ color: 'var(--text-quaternary)' }}>{count}</span>
    </div>
  );
}
