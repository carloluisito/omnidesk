// @atlas-entrypoint: Right inspector (Phase 4).
// Per-session scope: identity, branch, last activity, mode. Toggle via ⌘.
import { P4Icon } from './P4Icon';
import {
  STATUS_META, formatLastActive,
} from './shell-utils';
import { mapTabStatus } from './SessionRail';
import type { TabData } from '../ui/Tab';

interface RightInspectorProps {
  session: TabData | null;
  lastActiveAt?: number;
  onClose: () => void;
}

export function RightInspector({ session, lastActiveAt, onClose }: RightInspectorProps) {
  return (
    <aside className="p4-right" aria-label="Session inspector">
      <div className="p4-right-head">
        <span className="title">Inspector</span>
        {session && <span className="scope" title={session.workingDirectory}>{session.name}</span>}
        <button
          className="p4-btn ghost"
          style={{ padding: 4, marginLeft: 4 }}
          onClick={onClose}
          aria-label="Close inspector"
          title="Close (⌘.)"
        >
          <P4Icon name="x" size={13} />
        </button>
      </div>

      <div className="p4-right-body">
        {!session ? (
          <div style={{
            padding: 24, textAlign: 'center',
            color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)',
          }}>
            No session selected.
          </div>
        ) : (
          <>
            <SectionHeading>Status</SectionHeading>
            <Row label="State">
              <StatusChip session={session} />
            </Row>
            <Row label="Last activity">{formatLastActive(lastActiveAt)}</Row>

            <SectionHeading>Identity</SectionHeading>
            <Row label="Agent">
              {session.providerId === 'codex' ? 'Codex' : 'Claude'}
            </Row>
            {session.worktreeBranch && (
              <Row label="Branch">
                <code style={{
                  fontFamily: 'var(--font-mono)', fontSize: 11,
                  color: 'var(--accent)',
                  background: 'var(--surface-mid)',
                  padding: '1px 6px', borderRadius: 'var(--radius-sm)',
                }}>
                  {session.worktreeBranch}
                </code>
              </Row>
            )}
            <Row label="Permissions">
              {session.permissionMode === 'skip-permissions' ? 'skip perms' : 'standard'}
            </Row>

            <SectionHeading>Location</SectionHeading>
            <div style={{
              padding: '6px 10px',
              fontFamily: 'var(--font-mono)', fontSize: 11,
              color: 'var(--text-secondary)',
              wordBreak: 'break-all',
              lineHeight: 1.5,
            }}>
              {session.workingDirectory}
            </div>
          </>
        )}
      </div>
    </aside>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      padding: '10px 10px 4px',
      fontFamily: 'var(--font-mono)', fontSize: 10,
      textTransform: 'uppercase', letterSpacing: '.12em',
      color: 'var(--text-tertiary)',
    }}>{children}</div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 8,
      padding: '6px 10px',
      fontSize: 'var(--text-sm)',
    }}>
      <span style={{ color: 'var(--text-tertiary)', minWidth: 88 }}>{label}</span>
      <span style={{ color: 'var(--text-primary)' }}>{children}</span>
    </div>
  );
}

function StatusChip({ session }: { session: TabData }) {
  const meta = STATUS_META[mapTabStatus(session)];
  return (
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
  );
}
