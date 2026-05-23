// @atlas-entrypoint: Repo switcher popover (⌘⇧K).
// Anchored to the rail's repo header. Filter + list of open repos with live counts.
import { useEffect, useMemo, useRef, useState } from 'react';
import { P4Icon } from './P4Icon';
import { colorBg, colorFg, formatLastActive, type RepoColor } from './shell-utils';
import type { Repo } from '../../hooks/useRepos';
import type { TabData } from '../ui/Tab';
import { sessionsForRepo, liveCount } from './SessionRail';

interface RepoSwitcherProps {
  repos: Repo[];
  activeRepoId: string | null;
  sessions: TabData[];
  anchorRect: DOMRect | null;
  onPick: (repoId: string) => void;
  onAddRepo: () => void;
  onClose: () => void;
}

export function RepoSwitcher({
  repos,
  activeRepoId,
  sessions,
  anchorRect,
  onPick,
  onAddRepo,
  onClose,
}: RepoSwitcherProps) {
  const popRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [q, setQ] = useState('');

  useEffect(() => { inputRef.current?.focus(); }, []);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    // Defer the document listener so the opening click doesn't immediately close us.
    const t = window.setTimeout(() => document.addEventListener('mousedown', onDoc), 0);
    document.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const filtered = useMemo(() => {
    if (!q) return repos;
    const needle = q.toLowerCase();
    return repos.filter(r =>
      r.name.toLowerCase().includes(needle) ||
      r.org.toLowerCase().includes(needle) ||
      r.path.toLowerCase().includes(needle)
    );
  }, [repos, q]);

  const style: React.CSSProperties = anchorRect
    ? {
        position: 'fixed',
        top: anchorRect.bottom + 6,
        left: anchorRect.left,
        width: Math.max(anchorRect.width, 360),
      }
    : { position: 'fixed', top: 80, left: 60, width: 360 };

  return (
    <>
      {/* Click-through dim layer */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 95, background: 'transparent',
        }}
      />
      <div ref={popRef} className="p4-repo-switcher" style={style} role="dialog" aria-label="Switch repository">
        <div className="p4-rs-input">
          <P4Icon name="search" size={13} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Find a repository…"
          />
        </div>

        <div className="p4-rs-list">
          <div className="p4-rs-group">Open repositories</div>
          {filtered.map(r => {
            const repoSessions = sessionsForRepo(r, sessions);
            const live = liveCount(repoSessions);
            const total = repoSessions.length;
            const isActive = r.id === activeRepoId;
            return (
              <button
                key={r.id}
                type="button"
                className={'p4-rs-row' + (isActive ? ' active' : '')}
                onClick={() => onPick(r.id)}
                style={{
                  border: 0, font: 'inherit', textAlign: 'left',
                  color: 'inherit', width: '100%',
                  background: isActive ? 'var(--surface-high)' : 'transparent',
                }}
              >
                <span
                  className="p4-rs-icon"
                  style={{ background: colorBg(r.color as RepoColor), color: colorFg(r.color as RepoColor) }}
                >
                  <P4Icon name="folder" size={14} />
                </span>
                <div className="p4-rs-body">
                  <div className="p4-rs-name">
                    {r.org && (
                      <>
                        <span className="org">{r.org}</span>
                        <span className="sl">/</span>
                      </>
                    )}
                    <span>{r.name}</span>
                    {isActive && (
                      <span className="p4-chip accent" style={{ marginLeft: 4 }}>open</span>
                    )}
                  </div>
                  <div className="p4-rs-meta">
                    {r.branch && (
                      <>
                        <span><P4Icon name="branch" size={9} /> {r.branch}</span>
                        <span className="sep">·</span>
                      </>
                    )}
                    {live > 0 ? (
                      <span style={{ color: 'var(--success)' }}>
                        <span
                          style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: 'var(--success)', display: 'inline-block',
                            marginRight: 3,
                            animation: 'p4-pulse 1.6s var(--ease-in-out) infinite',
                          }}
                        />
                        {live} live
                      </span>
                    ) : (
                      <span style={{ color: 'var(--text-quaternary)' }}>·</span>
                    )}
                    <span className="sep">·</span>
                    <span>{total} session{total === 1 ? '' : 's'}</span>
                  </div>
                </div>
                <span className="p4-rs-last">{formatLastActive(r.lastOpened)}</span>
              </button>
            );
          })}

          {filtered.length === 0 && (
            <div style={{
              padding: 18, textAlign: 'center',
              color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
            }}>
              No matches.
            </div>
          )}
        </div>

        <div
          style={{
            display: 'flex', alignItems: 'center', gap: 4,
            padding: 8, borderTop: '1px solid var(--border-subtle)',
            background: 'var(--surface-mid)',
          }}
        >
          <button
            className="p4-btn"
            style={{ fontSize: 'var(--text-xs)', padding: '4px 10px' }}
            onClick={() => { onClose(); onAddRepo(); }}
          >
            <P4Icon name="plus" size={11} /> Add repository
          </button>
        </div>
      </div>
    </>
  );
}
