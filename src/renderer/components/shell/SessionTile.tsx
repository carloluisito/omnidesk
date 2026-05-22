// @atlas-entrypoint: Session tile — single card in the Grid view.
// Header + terminal slot (the SAME persistent xterm as Focus mode) + footer.
// TerminalHost portals the xterm DOM into our slot ref when the tile mounts.
import { P4Icon } from './P4Icon';
import {
  colorBg, colorFg, initials, agentLetter, agentColor,
  STATUS_META, formatLastActive, type RepoColor,
} from './shell-utils';
import { mapTabStatus } from './SessionRail';
import { useTerminalSlot } from './TerminalHost';
import type { TabData } from '../ui/Tab';

interface SessionTileProps {
  session: TabData;
  active: boolean;
  /** Epoch ms of the last activity, if known (from the output stream). */
  lastActiveAt?: number;
  onSelect: (id: string) => void;
}

export function SessionTile({
  session,
  active,
  lastActiveAt,
  onSelect,
}: SessionTileProps) {
  const slotRef = useTerminalSlot(session.id);

  const status = mapTabStatus(session);
  const meta = STATUS_META[status];
  const agent = session.providerId ?? 'claude';
  const color: RepoColor = status === 'errored' ? 'error' :
                            status === 'live' ? 'accent' :
                            status === 'idle' ? 'neutral' : 'info';

  return (
    <div
      className={'p4-tile' + (active ? ' active' : '')}
      onClick={() => onSelect(session.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onSelect(session.id);
        }
      }}
    >
      <div className="p4-tile-head">
        <span
          className="ic"
          style={{ background: colorBg(color), color: colorFg(color) }}
        >
          {initials(session.name)}
        </span>
        <span className="name">{session.name}</span>
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
      </div>

      {/* Slot — the persistent xterm for this session is portaled in here. */}
      <div ref={slotRef} className="p4-tile-preview p4-tile-slot" aria-hidden="true" />

      <div className="p4-tile-foot">
        <span style={{ color: agentColor(agent), fontWeight: 600 }}>{agentLetter(agent)}</span>
        {session.worktreeBranch && (
          <>
            <span style={{ color: 'var(--text-quaternary)' }}>·</span>
            <span>
              <P4Icon name="branch" size={9} style={{ verticalAlign: -1, marginRight: 2 }} />
              {session.worktreeBranch}
            </span>
          </>
        )}
        <span style={{ marginLeft: 'auto', color: 'var(--text-quaternary)' }}>
          {lastActiveAt ? formatLastActive(lastActiveAt) : '—'}
        </span>
      </div>
    </div>
  );
}
