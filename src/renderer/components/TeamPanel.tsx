/**
 * TeamPanel — Redesigned to match Obsidian spec §6.6.
 *
 * PanelShell with PanelSection groups ("Active Teams" / "Recent Teams"),
 * PanelEmpty, PanelLoading, PanelError states.
 * Each row uses --v2-surface-mid bg + .anim-lift on hover + --v2-surface-high when selected.
 */

import { useState, useCallback } from 'react';
import type { TeamInfo, SessionMetadata } from '../../shared/ipc-types';
import { ConfirmDialog } from './ui';
import { SidePanel } from './SidePanel';
import { PanelShell, PanelSection, PanelEmpty } from './ui';
import { Users, Plus } from 'lucide-react';

interface TeamPanelProps {
  isOpen: boolean;
  onClose: () => void;
  teams: TeamInfo[];
  sessions: SessionMetadata[];
  onCloseTeam: (teamName: string) => Promise<boolean>;
  onFocusSession: (sessionId: string) => void;
}

// ─── Status dot ────────────────────────────────────────────────────────────

// ─── V2 row ───────────────────────────────────────────────────────────────

function V2TeamRow({
  team,
  isSelected,
  onToggle,
}: {
  team: TeamInfo;
  isSelected: boolean;
  onToggle: () => void;
}) {
  const activeTasks = team.tasks.filter((t) => t.status === 'in_progress').length;

  return (
    <div
      onClick={onToggle}
      className="anim-lift"
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           8,
        padding:       '7px 10px',
        borderRadius:  'var(--radius-md, 6px)',
        background:    isSelected ? 'var(--v2-surface-high)' : 'var(--v2-surface-mid)',
        cursor:        'pointer',
        userSelect:    'none',
        borderLeft:    isSelected ? '2px solid var(--v2-accent)' : '2px solid transparent',
        transition:    'background 120ms ease, border-color 120ms ease',
      }}
    >
      <Users size={13} style={{ color: 'var(--v2-accent)', flexShrink: 0 }} />
      <span style={{
        flex:          1,
        fontSize:      'var(--text-sm, 12px)',
        fontWeight:    600,
        color:         'var(--v2-text-primary)',
        overflow:      'hidden',
        textOverflow:  'ellipsis',
        whiteSpace:    'nowrap',
      }}>
        {team.name}
      </span>
      <span style={{
        fontFamily:    'var(--font-mono, monospace)',
        fontSize:      10,
        color:         'var(--v2-text-tertiary)',
      }}>
        {team.members.length}a
      </span>
      {activeTasks > 0 && (
        <span style={{
          fontFamily:  'var(--font-mono, monospace)',
          fontSize:    10,
          color:       'var(--v2-accent)',
          background:  'rgba(0,201,167,.12)',
          padding:     '1px 5px',
          borderRadius: 4,
        }}>
          {activeTasks} active
        </span>
      )}
    </div>
  );
}

// ─── V2 TeamPanel ──────────────────────────────────────────────────────────

function V2TeamPanel({
  teams,
  sessions,
  onCloseTeam,
  onFocusSession,
}: {
  teams: TeamInfo[];
  sessions: SessionMetadata[];
  onCloseTeam: (teamName: string) => Promise<boolean>;
  onFocusSession: (sessionId: string) => void;
}) {
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [confirmCloseTeam, setConfirmCloseTeam] = useState<string | null>(null);

  const handleCloseTeam = useCallback(async () => {
    if (confirmCloseTeam) {
      await onCloseTeam(confirmCloseTeam);
      setConfirmCloseTeam(null);
      setSelectedTeam(null);
    }
  }, [confirmCloseTeam, onCloseTeam]);

  const activeTeams = teams.filter((t) => t.tasks.some((k) => k.status === 'in_progress'));
  const recentTeams = teams.filter((t) => !activeTeams.includes(t));

  return (
    <>
      <PanelShell
        icon={<Users size={13} />}
        title="Agent Teams"
        count={teams.length > 0 ? `${teams.length}` : undefined}
        actions={
          <button
            aria-label="Refresh teams"
            title="Refresh"
            style={{
              display:       'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, background: 'none', border: 'none',
              color: 'var(--v2-text-tertiary)', cursor: 'pointer', borderRadius: 4,
            }}
          >
            <Plus size={12} />
          </button>
        }
      >
        {teams.length === 0 ? (
          <PanelEmpty
            icon={<Users size={26} />}
            title="No active teams"
            body="Agent teams appear when Claude Code creates multi-agent workflows. Start a session to see teams here."
          />
        ) : (
          <div style={{ padding: '8px 6px 0' }}>
            {activeTeams.length > 0 && (
              <PanelSection title="Active Teams" count={activeTeams.length}>
                {activeTeams.map((team) => (
                  <V2TeamRow
                    key={team.name}
                    team={team}
                    isSelected={selectedTeam === team.name}
                    onToggle={() => setSelectedTeam(selectedTeam === team.name ? null : team.name)}
                  />
                ))}
              </PanelSection>
            )}
            {recentTeams.length > 0 && (
              <PanelSection title="Recent Teams" count={recentTeams.length} defaultOpen={activeTeams.length === 0}>
                {recentTeams.map((team) => (
                  <V2TeamRow
                    key={team.name}
                    team={team}
                    isSelected={selectedTeam === team.name}
                    onToggle={() => setSelectedTeam(selectedTeam === team.name ? null : team.name)}
                  />
                ))}
              </PanelSection>
            )}
            {/* Selected team detail */}
            {selectedTeam && (() => {
              const team = teams.find((t) => t.name === selectedTeam);
              if (!team) return null;
              const teamSessions = sessions.filter((s) => s.teamName === team.name);
              return (
                <div style={{
                  margin: '8px 0',
                  padding: '10px',
                  background: 'var(--v2-surface-mid)',
                  borderRadius: 'var(--radius-md, 6px)',
                  border: '1px solid var(--v2-border-subtle)',
                }}>
                  <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--v2-text-tertiary)', textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 8 }}>
                    {team.name} · {team.members.length} agents
                  </div>
                  {team.members.map((member) => {
                    const session = teamSessions.find((s) => s.agentId === member.agentId);
                    return (
                      <div
                        key={member.agentId}
                        onClick={() => session && onFocusSession(session.id)}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 6,
                          padding: '3px 0', cursor: session ? 'pointer' : 'default',
                        }}
                      >
                        <div style={{
                          width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                          background: session?.status === 'running' ? 'var(--v2-success)' : 'var(--v2-text-quaternary)',
                        }} />
                        <span style={{ flex: 1, fontSize: 'var(--text-xs, 11px)', color: 'var(--v2-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {member.name}
                        </span>
                        <span style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--v2-text-quaternary)' }}>
                          {member.agentType}
                        </span>
                      </div>
                    );
                  })}
                  <button
                    onClick={() => setConfirmCloseTeam(team.name)}
                    style={{
                      marginTop: 8, width: '100%', padding: '4px', background: 'none',
                      border: '1px solid var(--v2-error)', borderRadius: 4,
                      color: 'var(--v2-error)', fontSize: 'var(--text-xs, 11px)', cursor: 'pointer',
                    }}
                  >
                    Close team
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </PanelShell>

      {confirmCloseTeam && (
        <ConfirmDialog
          isOpen={true}
          title="Close Team?"
          message={`This will close the "${confirmCloseTeam}" team and unlink its sessions.`}
          confirmLabel="Close Team"
          cancelLabel="Cancel"
          onConfirm={handleCloseTeam}
          onCancel={() => setConfirmCloseTeam(null)}
          isDangerous={false}
        />
      )}
    </>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function TeamPanel({
  isOpen,
  onClose,
  teams,
  sessions,
  onCloseTeam,
  onFocusSession,
}: TeamPanelProps) {
  if (!isOpen) return null;

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Agent Teams">
      <div style={{ height: '100%' }}>
        <V2TeamPanel
          teams={teams}
          sessions={sessions}
          onCloseTeam={onCloseTeam}
          onFocusSession={onFocusSession}
        />
      </div>
    </SidePanel>
  );
}
