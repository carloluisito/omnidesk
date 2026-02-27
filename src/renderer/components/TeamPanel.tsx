/**
 * TeamPanel — Redesigned to match Obsidian spec §6.6.
 *
 * Narrow panel view: team list with agents + active task count.
 * AGENTS section: StatusDot + name + status text.
 * TASKS section: status icon + number + description + status label.
 * [expand ↗] expands to full-area view (Tasks / Messages / Graph).
 *
 * Preserves all existing props and sub-component usage.
 */

import { useState, useCallback } from 'react';
import type { TeamInfo, SessionMetadata } from '../../shared/ipc-types';
import { ConfirmDialog } from './ui';
import { TaskBoard } from './TaskBoard';
import { MessageStream } from './MessageStream';
import { AgentGraph } from './AgentGraph';
import { SidePanel } from './SidePanel';
import { Users, CheckCircle, Circle, XCircle, Clock, Maximize2, ArrowLeft } from 'lucide-react';

type TeamView = 'overview' | 'tasks' | 'messages' | 'graph';

interface TeamPanelProps {
  isOpen: boolean;
  onClose: () => void;
  teams: TeamInfo[];
  sessions: SessionMetadata[];
  onCloseTeam: (teamName: string) => Promise<boolean>;
  onFocusSession: (sessionId: string) => void;
}

// ─── Status dot ────────────────────────────────────────────────────────────

function StatusDot({ status }: { status: string }) {
  let color = 'var(--text-tertiary)';
  if (status === 'running' || status === 'active') color = 'var(--semantic-success)';
  else if (status === 'idle') color = 'var(--semantic-warning)';
  else if (status === 'error' || status === 'failed') color = 'var(--semantic-error)';

  return (
    <div
      style={{
        width: 7,
        height: 7,
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
        animation: (status === 'running' || status === 'active') ? 'pulse 2s ease-in-out infinite' : 'none',
      }}
    />
  );
}

// ─── Task status icon ──────────────────────────────────────────────────────

function TaskStatusIcon({ status }: { status: string }) {
  const sz = 12;
  switch (status) {
    case 'completed':
      return <CheckCircle size={sz} style={{ color: 'var(--semantic-success)', flexShrink: 0 }} />;
    case 'in_progress':
      return <Clock size={sz} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />;
    case 'failed':
      return <XCircle size={sz} style={{ color: 'var(--semantic-error)', flexShrink: 0 }} />;
    default:
      return <Circle size={sz} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />;
  }
}

// ─── Section label ─────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        padding: '8px var(--space-3) 4px',
        fontSize: 'var(--text-xs)',
        fontWeight: 'var(--weight-semibold)',
        color: 'var(--text-tertiary)',
        textTransform: 'uppercase',
        letterSpacing: 'var(--tracking-wide)',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {children}
    </div>
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
  const [expandedTeam, setExpandedTeam] = useState<string | null>(null);
  const [view, setView] = useState<TeamView>('overview');
  const [selectedTeam, setSelectedTeam] = useState<string | null>(null);
  const [confirmCloseTeam, setConfirmCloseTeam] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);

  const handleExpandTeam = useCallback((teamName: string) => {
    setExpandedTeam((prev) => (prev === teamName ? null : teamName));
  }, []);

  const handleViewChange = useCallback((teamName: string, newView: TeamView) => {
    setSelectedTeam(teamName);
    setView(newView);
  }, []);

  const handleBack = useCallback(() => {
    setView('overview');
    setSelectedTeam(null);
    setIsExpanded(false);
  }, []);

  const handleCloseTeam = useCallback(async () => {
    if (confirmCloseTeam) {
      await onCloseTeam(confirmCloseTeam);
      setConfirmCloseTeam(null);
      setExpandedTeam(null);
    }
  }, [confirmCloseTeam, onCloseTeam]);

  const getTeamSessions = (teamName: string) =>
    sessions.filter((s) => s.teamName === teamName);

  const getActiveTasks = (team: TeamInfo) =>
    team.tasks.filter((t) => t.status === 'in_progress').length;

  if (!isOpen) return null;

  const activeTeam = selectedTeam ? teams.find((t) => t.name === selectedTeam) : null;

  // Expanded full-area view
  if (isExpanded && activeTeam) {
    return (
      <>
        <div
          style={{
            position: 'fixed',
            inset: 0,
            top: 'calc(var(--title-bar-height) + var(--tab-bar-height))',
            bottom: 'var(--status-bar-height)',
            background: 'var(--surface-base)',
            zIndex: 'var(--z-panel)' as any,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Expanded header */}
          <div
            style={{
              height: 38,
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '0 var(--space-3)',
              borderBottom: '1px solid var(--border-default)',
              background: 'var(--surface-raised)',
              flexShrink: 0,
            }}
          >
            <button
              onClick={handleBack}
              style={{
                display: 'flex', alignItems: 'center', gap: 3,
                background: 'none', border: 'none',
                color: 'var(--text-tertiary)', cursor: 'pointer',
                fontSize: 'var(--text-xs)', fontFamily: 'var(--font-ui)',
                padding: '2px 4px', borderRadius: 'var(--radius-sm)',
              }}
            >
              <ArrowLeft size={12} />
              Back
            </button>
            <span
              style={{
                flex: 1, fontSize: 'var(--text-sm)', fontWeight: 'var(--weight-semibold)',
                color: 'var(--text-primary)', fontFamily: 'var(--font-ui)',
              }}
            >
              {activeTeam.name}
            </span>
            {/* Tab buttons */}
            {(['tasks', 'messages', 'graph'] as TeamView[]).map((v) => (
              <button
                key={v}
                onClick={() => setView(v)}
                style={{
                  padding: '3px 10px',
                  background: view === v ? 'var(--accent-primary-muted)' : 'none',
                  border: `1px solid ${view === v ? 'var(--border-accent)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-sm)',
                  color: view === v ? 'var(--text-accent)' : 'var(--text-secondary)',
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-ui)',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {v}
              </button>
            ))}
            <button
              onClick={onClose}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                width: 24, height: 24, background: 'none', border: 'none',
                color: 'var(--text-tertiary)', cursor: 'pointer', padding: 0,
                borderRadius: 'var(--radius-sm)',
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Expanded content — 3 columns */}
          <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
            {view === 'tasks' && (
              <TaskBoard tasks={activeTeam.tasks} members={activeTeam.members} />
            )}
            {view === 'messages' && (
              <MessageStream
                teamName={activeTeam.name}
                members={activeTeam.members}
                sessions={sessions.filter((s) => s.status === 'running')}
              />
            )}
            {view === 'graph' && (
              <AgentGraph
                team={activeTeam}
                sessions={sessions.filter((s) => s.teamName === activeTeam.name)}
                onFocusSession={onFocusSession}
              />
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <SidePanel isOpen={isOpen} onClose={onClose} title="Agent Teams">

        {/* Empty state */}
        {teams.length === 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-8) var(--space-4)',
              gap: 'var(--space-2)',
            }}
          >
            <Users size={32} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No active agent teams
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              Teams appear when Claude Code creates agent teams
            </span>
          </div>
        )}

        {/* Team list */}
        {teams.map((team) => {
          const teamSessions = getTeamSessions(team.name);
          const activeTasks = getActiveTasks(team);
          const exp = expandedTeam === team.name;

          return (
            <div
              key={team.name}
              style={{
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              {/* Team header row */}
              <div
                onClick={() => handleExpandTeam(team.name)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-2)',
                  padding: '8px var(--space-3)',
                  cursor: 'pointer',
                  background: exp ? 'var(--accent-primary-muted)' : 'transparent',
                  transition: 'background var(--duration-instant)',
                  userSelect: 'none',
                }}
              >
                <svg
                  width="10" height="10" viewBox="0 0 10 10"
                  style={{
                    color: 'var(--text-tertiary)',
                    transform: exp ? 'rotate(0)' : 'rotate(-90deg)',
                    transition: 'transform var(--duration-fast)',
                    flexShrink: 0,
                  }}
                  fill="currentColor"
                >
                  <path d="M5 7L1 3h8L5 7z" />
                </svg>
                <span
                  style={{
                    flex: 1,
                    fontSize: 'var(--text-sm)',
                    fontWeight: 'var(--weight-medium)',
                    color: 'var(--text-primary)',
                    fontFamily: 'var(--font-ui)',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {team.name}
                </span>
                <span
                  style={{
                    fontSize: 'var(--text-2xs)',
                    fontFamily: 'var(--font-mono-ui)',
                    color: 'var(--text-tertiary)',
                  }}
                >
                  {team.members.length} agents
                </span>
                {activeTasks > 0 && (
                  <span
                    style={{
                      fontSize: 'var(--text-2xs)',
                      fontFamily: 'var(--font-mono-ui)',
                      color: 'var(--accent-primary)',
                      background: 'var(--accent-primary-muted)',
                      padding: '1px 5px',
                      borderRadius: 'var(--radius-sm)',
                    }}
                  >
                    {activeTasks} active
                  </span>
                )}
              </div>

              {/* Expanded team detail */}
              {exp && (
                <div style={{ paddingBottom: 'var(--space-2)' }}>
                  {/* AGENTS section */}
                  <SectionLabel>Agents</SectionLabel>
                  {team.members.map((member) => {
                    const session = teamSessions.find((s) => s.agentId === member.agentId);
                    return (
                      <div
                        key={member.agentId}
                        onClick={() => session && onFocusSession(session.id)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          padding: '4px var(--space-3)',
                          cursor: session ? 'pointer' : 'default',
                        }}
                      >
                        <StatusDot status={session?.status || 'disconnected'} />
                        <span
                          style={{
                            flex: 1,
                            fontSize: 'var(--text-xs)',
                            fontFamily: 'var(--font-ui)',
                            color: 'var(--text-secondary)',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {member.name}
                        </span>
                        <span
                          style={{
                            fontSize: 'var(--text-2xs)',
                            fontFamily: 'var(--font-mono-ui)',
                            color: 'var(--text-tertiary)',
                          }}
                        >
                          {member.agentType}
                        </span>
                      </div>
                    );
                  })}

                  {/* TASKS section */}
                  {team.tasks.length > 0 && (
                    <>
                      <SectionLabel>Tasks</SectionLabel>
                      {team.tasks.slice(0, 5).map((task, i) => (
                        <div
                          key={task.taskId || i}
                          style={{
                            display: 'flex',
                            alignItems: 'flex-start',
                            gap: 'var(--space-2)',
                            padding: '4px var(--space-3)',
                          }}
                        >
                          <TaskStatusIcon status={task.status} />
                          <span
                            style={{
                              flex: 1,
                              fontSize: 'var(--text-xs)',
                              fontFamily: 'var(--font-ui)',
                              color: 'var(--text-secondary)',
                              lineHeight: 'var(--leading-normal)',
                            }}
                          >
                            {task.description || task.subject}
                          </span>
                          <span
                            style={{
                              fontSize: 'var(--text-2xs)',
                              fontFamily: 'var(--font-mono-ui)',
                              color: task.status === 'completed'
                                ? 'var(--semantic-success)'
                                : task.status === 'in_progress'
                                  ? 'var(--accent-primary)'
                                  : 'var(--text-tertiary)',
                              flexShrink: 0,
                            }}
                          >
                            {task.status}
                          </span>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Actions */}
                  <div
                    style={{
                      display: 'flex',
                      gap: 'var(--space-2)',
                      padding: '8px var(--space-3) 4px',
                    }}
                  >
                    <button
                      onClick={() => {
                        setIsExpanded(true);
                        handleViewChange(team.name, 'tasks');
                      }}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 3,
                        padding: '4px',
                        background: 'var(--surface-float)',
                        border: '1px solid var(--border-default)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-accent)',
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-ui)',
                        cursor: 'pointer',
                      }}
                    >
                      <Maximize2 size={10} />
                      expand ↗
                    </button>
                    <button
                      onClick={() => setConfirmCloseTeam(team.name)}
                      style={{
                        padding: '4px 10px',
                        background: 'none',
                        border: '1px solid var(--semantic-error)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--semantic-error)',
                        fontSize: 'var(--text-xs)',
                        fontFamily: 'var(--font-ui)',
                        cursor: 'pointer',
                      }}
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </SidePanel>

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

      <style>{`@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }`}</style>
    </>
  );
}
