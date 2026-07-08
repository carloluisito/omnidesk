import { useState } from 'react';
import { useTerminalSlot } from '../TerminalHost';
import { MobileTopBar } from './MobileTopBar';
import { MobileDrawer } from './MobileDrawer';
import type { MobileShellProps } from './types';
import './MobileShell.css';

export function MobileShell(props: MobileShellProps) {
  const { activeRepo, sessions, activeSessionId, onNewSession } = props;
  const [drawerOpen, setDrawerOpen] = useState(false);
  const slotRef = useTerminalSlot(activeSessionId ?? '');
  const active = sessions.find(s => s.id === activeSessionId) ?? null;

  if (!activeRepo) {
    return (
      <div className="ms-shell ms-empty">
        <p>No project open.</p>
        <button className="ms-primary" onClick={props.onAddRepo}>+ Open project</button>
        <button className="ms-secondary" onClick={props.onOpenRemote}>Remote access…</button>
      </div>
    );
  }

  return (
    <div className="ms-shell">
      <MobileTopBar
        title={active?.name ?? activeRepo.name}
        onMenu={() => setDrawerOpen(true)}
        onNewSession={onNewSession}
      />
      {/* Terminal slot: TerminalHost paints the active session's xterm over this. */}
      <div className="ms-terminal" ref={slotRef} />
      <MobileDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        {...props}
      />
    </div>
  );
}
