// @atlas-entrypoint: ⌘K palette (Phase 4).
// Actions (top) + sessions (in active repo). Keyboard nav: ↑↓ / Enter / Esc.
import { useEffect, useMemo, useRef, useState } from 'react';
import { P4Icon, type P4IconName } from './P4Icon';
import {
  colorBg, colorFg, initials, agentLetter,
  STATUS_META, type RepoColor,
} from './shell-utils';
import { mapTabStatus, sessionsForRepo } from './SessionRail';
import type { Repo } from '../../hooks/useRepos';
import type { TabData } from '../ui/Tab';

export interface PaletteAction {
  id: string;
  icon: P4IconName;
  title: string;
  sub: string;
  shortcut?: string[];
  run: () => void;
}

interface PaletteProps {
  repo: Repo;
  sessions: TabData[];
  onPickSession: (id: string) => void;
  onClose: () => void;
  actions: PaletteAction[];
}

export function Palette({
  repo,
  sessions,
  onPickSession,
  onClose,
  actions,
}: PaletteProps) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const repoSessions = useMemo(() => sessionsForRepo(repo, sessions), [repo, sessions]);

  const results = useMemo(() => {
    const needle = q.toLowerCase();
    const filteredSessions = needle
      ? repoSessions.filter(s =>
          s.name.toLowerCase().includes(needle) ||
          (s.worktreeBranch?.toLowerCase().includes(needle) ?? false))
      : repoSessions;
    const filteredActions = needle
      ? actions.filter(a => a.title.toLowerCase().includes(needle))
      : actions;
    return { actions: filteredActions, sessions: filteredSessions };
  }, [q, repoSessions, actions]);

  const total = results.actions.length + results.sessions.length;
  useEffect(() => { setSel(0); }, [q]);

  const handleKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { setSel(s => Math.min(total - 1, s + 1)); e.preventDefault(); }
    else if (e.key === 'ArrowUp')   { setSel(s => Math.max(0, s - 1)); e.preventDefault(); }
    else if (e.key === 'Enter') {
      if (sel < results.actions.length) {
        results.actions[sel]?.run();
      } else {
        const s = results.sessions[sel - results.actions.length];
        if (s) onPickSession(s.id);
      }
      e.preventDefault();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  return (
    <div
      className="p4-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="p4-palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div className="p4-palette-input">
          <P4Icon name="search" size={15} style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Search sessions, actions, branches…"
          />
          <kbd className="p4-kbd">⎋</kbd>
        </div>

        <div className="p4-palette-list">
          {results.actions.length > 0 && (
            <>
              <div className="p4-palette-group">Actions</div>
              {results.actions.map((a, i) => (
                <button
                  key={a.id}
                  type="button"
                  className={'p4-palette-row' + (sel === i ? ' on' : '')}
                  onClick={a.run}
                  onMouseEnter={() => setSel(i)}
                  style={{
                    width: '100%', border: 0, background: 'transparent',
                    color: 'inherit', font: 'inherit', textAlign: 'left',
                  }}
                >
                  <P4Icon className="ic" name={a.icon} size={15} />
                  <div style={{ flex: 1 }}>
                    <div className="txt">{a.title}</div>
                    <div className="sub">{a.sub}</div>
                  </div>
                  {a.shortcut && (
                    <span className="kbd">
                      {a.shortcut.map((k, j) => <kbd key={j} className="p4-kbd">{k}</kbd>)}
                    </span>
                  )}
                </button>
              ))}
            </>
          )}

          {results.sessions.length > 0 && (
            <>
              <div className="p4-palette-group">Sessions in {repo.name}</div>
              {results.sessions.map((s, i) => {
                const idx = results.actions.length + i;
                const status = mapTabStatus(s);
                const meta = STATUS_META[status];
                const color: RepoColor = status === 'errored' ? 'error' :
                                          status === 'live' ? 'accent' :
                                          status === 'idle' ? 'neutral' : 'info';
                return (
                  <button
                    key={s.id}
                    type="button"
                    className={'p4-palette-row' + (sel === idx ? ' on' : '')}
                    onClick={() => onPickSession(s.id)}
                    onMouseEnter={() => setSel(idx)}
                    style={{
                      width: '100%', border: 0, background: 'transparent',
                      color: 'inherit', font: 'inherit', textAlign: 'left',
                    }}
                  >
                    <span style={{
                      width: 20, height: 20, borderRadius: 5,
                      background: colorBg(color), color: colorFg(color),
                      display: 'grid', placeItems: 'center',
                      fontFamily: 'var(--font-mono)', fontSize: 10, fontWeight: 700,
                      flexShrink: 0,
                    }}>{initials(s.name)}</span>
                    <div style={{ flex: 1, marginLeft: 2 }}>
                      <div className="txt">{s.name}</div>
                      <div className="sub">
                        {agentLetter(s.providerId)}{s.worktreeBranch ? ` · ${s.worktreeBranch}` : ''}
                      </div>
                    </div>
                    <span
                      className={'p4-chip ' + (meta.chip || '')}
                      style={{
                        animation: meta.pulse ? 'p4-pulse 1.6s var(--ease-in-out) infinite' : undefined,
                      }}
                    >
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: meta.color, display: 'inline-block',
                      }} />
                      {meta.label}
                    </span>
                  </button>
                );
              })}
            </>
          )}

          {total === 0 && (
            <div style={{
              padding: 24, textAlign: 'center',
              color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
            }}>
              No matches.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
