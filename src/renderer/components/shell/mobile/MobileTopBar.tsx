import { P4Icon } from '../index';
import './MobileTopBar.css';

interface Props { title: string; onMenu: () => void; onNewSession: () => void; }

export function MobileTopBar({ title, onMenu, onNewSession }: Props) {
  return (
    <header className="mtb">
      <button className="mtb-btn" aria-label="Open navigation" onClick={onMenu}>
        <P4Icon name="layers" size={18} />
      </button>
      <span className="mtb-title" title={title}>{title}</span>
      <button className="mtb-btn" aria-label="New session" onClick={onNewSession}>
        <P4Icon name="plus" size={18} />
      </button>
    </header>
  );
}
