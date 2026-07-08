import { sessionsForRepo } from '../SessionRail';
import type { MobileShellProps } from './types';
import './MobileDrawer.css';

interface Props extends MobileShellProps { open: boolean; onClose: () => void; }

export function MobileDrawer(props: Props) {
  const {
    open, onClose, repos, activeRepo, sessions, activeSessionId,
    onSelectSession, onSelectRepo, onNewSession, onAddRepo, onOpenRemote,
  } = props;
  if (!open) return null;

  const pickSession = (id: string) => { onSelectSession(id); onClose(); };
  const pickRepo = (id: string) => { onSelectRepo(id); onClose(); };

  // Group sessions under each open project. Any session that doesn't match a
  // listed project (e.g. its repo was closed) falls into "Other" so it stays
  // reachable — the whole point of this drawer is that nothing is stranded.
  const grouped = repos.map(r => ({ repo: r, repoSessions: sessionsForRepo(r, sessions) }));
  const claimed = new Set(grouped.flatMap(g => g.repoSessions.map(s => s.id)));
  const orphans = sessions.filter(s => !claimed.has(s.id));

  return (
    <>
      <div className="mdrawer-backdrop" onClick={onClose} />
      <nav className="mdrawer-panel" aria-label="Projects and sessions">
        <div className="mdrawer-title">Projects</div>

        <div className="mdrawer-list">
          {grouped.map(({ repo, repoSessions }) => (
            <div key={repo.id} className="mdrawer-group">
              <button
                className={'mdrawer-project' + (repo.id === activeRepo?.id ? ' active' : '')}
                aria-current={repo.id === activeRepo?.id ? 'true' : undefined}
                onClick={() => pickRepo(repo.id)}
              >
                <span className="mdrawer-project-name">{repo.name}</span>
                <span className="mdrawer-count">{repoSessions.length}</span>
              </button>
              {repoSessions.map(s => (
                <button
                  key={s.id}
                  className={'mdrawer-item' + (s.id === activeSessionId ? ' active' : '')}
                  aria-current={s.id === activeSessionId ? 'true' : undefined}
                  onClick={() => pickSession(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          ))}

          {orphans.length > 0 && (
            <div className="mdrawer-group">
              <div className="mdrawer-project mdrawer-project-static">Other sessions</div>
              {orphans.map(s => (
                <button
                  key={s.id}
                  className={'mdrawer-item' + (s.id === activeSessionId ? ' active' : '')}
                  aria-current={s.id === activeSessionId ? 'true' : undefined}
                  onClick={() => pickSession(s.id)}
                >
                  {s.name}
                </button>
              ))}
            </div>
          )}

          {grouped.length === 0 && orphans.length === 0 && (
            <div className="mdrawer-empty">No projects open.</div>
          )}
        </div>

        <button className="mdrawer-new" onClick={() => { onNewSession(); onClose(); }}>+ New session</button>
        <button className="mdrawer-open" onClick={() => { onAddRepo(); onClose(); }}>+ Open project</button>
        <button className="mdrawer-remote" onClick={() => { onOpenRemote(); onClose(); }}>Remote access…</button>
      </nav>
    </>
  );
}
