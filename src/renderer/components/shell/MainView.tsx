// @atlas-entrypoint: Main view — mode bar + Focus/Grid stage.
// Composes SessionPane (Focus) or grid-of-SessionTile (Grid). The actual xterm
// instances live in TerminalHost above us; we just expose slots for them.
import { P4Icon } from './P4Icon';
import { SessionPane } from './SessionPane';
import { SessionTile } from './SessionTile';
import { colorBg, colorFg, initials } from './shell-utils';
import { sessionsForRepo } from './SessionRail';
import type { Repo } from '../../hooks/useRepos';
import type { TabData } from '../ui/Tab';

export type ViewMode = 'focus' | 'grid';

interface MainViewProps {
  mode: ViewMode;
  setMode: (m: ViewMode) => void;
  repo: Repo;
  sessions: TabData[];
  activeSessionId: string | null;
  /** Last activity time per session id — drives the "X min ago" text on tiles. */
  lastActivityAt: Record<string, number>;
  onSelectSession: (id: string) => void;
  onCloseSession?: (id: string) => void;
  onRestartSession?: (id: string) => void;
  onKillSession?: (id: string) => void;
  onOpenRepoSwitcher: () => void;
  onNewSession: () => void;
}

export function MainView({
  mode,
  setMode,
  repo,
  sessions,
  activeSessionId,
  lastActivityAt,
  onSelectSession,
  onCloseSession,
  onRestartSession,
  onKillSession,
  onOpenRepoSwitcher,
  onNewSession,
}: MainViewProps) {
  const repoSessions = sessionsForRepo(repo, sessions);
  const active = repoSessions.find(s => s.id === activeSessionId) ?? repoSessions[0] ?? null;
  const liveOrThinking = repoSessions.filter(s => s.status === 'running').length;

  return (
    <div className="p4-main">
      <div className="p4-mode-bar">
        <div className="crumb">
          <button
            type="button"
            className="repo-mini"
            onClick={onOpenRepoSwitcher}
            style={{
              cursor: 'pointer', border: 0, background: 'transparent',
              font: 'inherit', padding: 0, color: 'inherit',
            }}
          >
            <P4Icon name="folder" size={11} style={{ color: 'var(--text-tertiary)' }} />
            <b>{repo.name}</b>
            <P4Icon name="chev_down" size={10} style={{ color: 'var(--text-tertiary)' }} />
          </button>
          <span style={{ color: 'var(--text-quaternary)' }}>›</span>
          {mode === 'grid' ? (
            <>
              <P4Icon name="grid" size={13} style={{ color: 'var(--accent)' }} />
              <b>All {repoSessions.length} session{repoSessions.length === 1 ? '' : 's'}</b>
            </>
          ) : active ? (
            <>
              <span
                style={{
                  width: 20, height: 20, borderRadius: 5,
                  background: colorBg('accent'), color: colorFg('accent'),
                  display: 'inline-grid', placeItems: 'center',
                  fontFamily: 'var(--font-mono)', fontSize: 9, fontWeight: 700,
                }}
              >
                {initials(active.name)}
              </span>
              <b>{active.name}</b>
            </>
          ) : (
            <span style={{ color: 'var(--text-tertiary)' }}>no active session</span>
          )}
        </div>

        <div className="p4-mode-switch" style={{ marginLeft: 16 }}>
          <button
            type="button"
            className={mode === 'focus' ? 'on' : ''}
            onClick={() => setMode('focus')}
            title="Focus (⌘1)"
            aria-pressed={mode === 'focus'}
          >
            <P4Icon name="focus" size={13} />
          </button>
          <button
            type="button"
            className={mode === 'grid' ? 'on' : ''}
            onClick={() => setMode('grid')}
            title="Grid (⌘2)"
            aria-pressed={mode === 'grid'}
          >
            <P4Icon name="grid" size={13} />
          </button>
        </div>

        <div className="right">
          {/* Aggregate live-count is only useful in Grid mode. In Focus you can
              already see the active session's status on its identity strip. */}
          {mode === 'grid' && liveOrThinking > 0 && (
            <span
              className="p4-chip success"
              style={{ animation: 'p4-pulse 1.6s var(--ease-in-out) infinite' }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%', background: 'var(--success)',
              }} />
              {liveOrThinking} live
            </span>
          )}
        </div>
      </div>

      {/* Empty repo */}
      {repoSessions.length === 0 ? (
        <div className="p4-mode-stage">
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            background: 'var(--surface-base)',
            color: 'var(--text-secondary)',
            padding: 32, textAlign: 'center',
          }}>
            <div style={{
              width: 56, height: 56, borderRadius: 'var(--radius-lg)',
              background: 'rgba(0,201,167,.10)',
              border: '1px solid rgba(0,201,167,.22)',
              color: 'var(--accent)',
              display: 'grid', placeItems: 'center', marginBottom: 16,
            }}>
              <P4Icon name="terminal" size={24} stroke={1.5} />
            </div>
            <div style={{
              color: 'var(--text-primary)', fontWeight: 600,
              fontSize: 'var(--text-md)', marginBottom: 6,
            }}>
              No sessions in {repo.name}
            </div>
            <div style={{
              fontSize: 'var(--text-sm)', maxWidth: 320,
              lineHeight: 1.55, marginBottom: 16,
            }}>
              Start a new terminal session in this repository to begin.
            </div>
            <button className="p4-btn primary" onClick={onNewSession}>
              <P4Icon name="plus" size={13} /> New session
            </button>
          </div>
        </div>
      ) : mode === 'grid' ? (
        <div className="p4-grid">
          {repoSessions.map(s => (
            <SessionTile
              key={s.id}
              session={s}
              active={s.id === activeSessionId}
              lastActiveAt={lastActivityAt[s.id]}
              onSelect={(id) => { onSelectSession(id); setMode('focus'); }}
            />
          ))}
        </div>
      ) : active ? (
        <div className="p4-mode-stage">
          <SessionPane session={active} onClose={onCloseSession} onRestart={onRestartSession} onKill={onKillSession} />
        </div>
      ) : (
        <div className="p4-mode-stage" />
      )}
    </div>
  );
}
