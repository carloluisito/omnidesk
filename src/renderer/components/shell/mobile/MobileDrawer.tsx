import type { MobileShellProps } from './types';
import './MobileDrawer.css';

interface Props extends MobileShellProps { open: boolean; onClose: () => void; }

export function MobileDrawer(props: Props) {
  const { open, onClose, activeRepo, sessions, activeSessionId, onSelectSession, onNewSession, onOpenRemote } = props;
  if (!open) return null;
  const pick = (id: string) => { onSelectSession(id); onClose(); };
  return (
    <>
      <div className="mdrawer-backdrop" onClick={onClose} />
      <nav className="mdrawer-panel" aria-label="Sessions">
        <div className="mdrawer-repo">{activeRepo?.name ?? '—'}</div>
        <ul className="mdrawer-list">
          {sessions.map(s => (
            <li key={s.id}>
              <button
                className={'mdrawer-item' + (s.id === activeSessionId ? ' active' : '')}
                onClick={() => pick(s.id)}
              >
                {s.name}
              </button>
            </li>
          ))}
        </ul>
        <button className="mdrawer-new" onClick={() => { onNewSession(); onClose(); }}>+ New session</button>
        <button className="mdrawer-remote" onClick={() => { onOpenRemote(); onClose(); }}>Remote access…</button>
      </nav>
    </>
  );
}
