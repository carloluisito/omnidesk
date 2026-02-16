import { useState, useCallback } from 'react';
import type { TeamInfo, SessionMetadata } from '../../shared/ipc-types';
import { ConfirmDialog } from './ui';
import { TaskBoard } from './TaskBoard';
import { MessageStream } from './MessageStream';
import { AgentGraph } from './AgentGraph';

type TeamView = 'overview' | 'tasks' | 'messages' | 'graph';

interface TeamPanelProps {
  isOpen: boolean;
  onClose: () => void;
  teams: TeamInfo[];
  sessions: SessionMetadata[];
  onCloseTeam: (teamName: string) => Promise<boolean>;
  onFocusSession: (sessionId: string) => void;
}

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

  const handleExpandTeam = useCallback((teamName: string) => {
    setExpandedTeam(prev => prev === teamName ? null : teamName);
  }, []);

  const handleViewChange = useCallback((teamName: string, newView: TeamView) => {
    setSelectedTeam(teamName);
    setView(newView);
  }, []);

  const handleBack = useCallback(() => {
    setView('overview');
    setSelectedTeam(null);
  }, []);

  const handleCloseTeam = useCallback(async () => {
    if (confirmCloseTeam) {
      await onCloseTeam(confirmCloseTeam);
      setConfirmCloseTeam(null);
      setExpandedTeam(null);
    }
  }, [confirmCloseTeam, onCloseTeam]);

  const getTeamSessions = (teamName: string) =>
    sessions.filter(s => s.teamName === teamName);

  const getTaskStats = (team: TeamInfo) => {
    const pending = team.tasks.filter(t => t.status === 'pending').length;
    const inProgress = team.tasks.filter(t => t.status === 'in_progress').length;
    const completed = team.tasks.filter(t => t.status === 'completed').length;
    return { pending, inProgress, completed, total: team.tasks.length };
  };

  if (!isOpen) return null;

  const activeTeam = selectedTeam ? teams.find(t => t.name === selectedTeam) : null;

  return (
    <>
      <div className="team-panel-overlay" onClick={onClose} />
      <div className="team-panel">
        <div className="team-panel-header">
          {view !== 'overview' && (
            <button className="team-panel-back" onClick={handleBack} title="Back to overview">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M19 12H5M12 19l-7-7 7-7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          )}
          <h3 className="team-panel-title">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
            </svg>
            {view === 'overview' ? 'Agent Teams' : activeTeam?.name || 'Team'}
          </h3>
          <button className="team-panel-close" onClick={onClose}>
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <path d="M3 3l10 10M13 3L3 13" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        <div className="team-panel-body">
          {view === 'overview' && (
            <>
              {teams.length === 0 ? (
                <div className="team-empty">
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
                  </svg>
                  <p>No active teams</p>
                  <span>Teams appear when Claude Code creates agent teams</span>
                </div>
              ) : (
                <div className="team-list">
                  {teams.map(team => {
                    const teamSessions = getTeamSessions(team.name);
                    const stats = getTaskStats(team);
                    const isExpanded = expandedTeam === team.name;

                    return (
                      <div key={team.name} className="team-card">
                        <div className="team-card-header" onClick={() => handleExpandTeam(team.name)}>
                          <div className="team-card-info">
                            <div className="team-card-name">
                              {team.name}
                              <span className="team-member-count">{team.members.length}</span>
                            </div>
                            {stats.total > 0 && (
                              <div className="team-task-summary">
                                {stats.inProgress > 0 && <span className="task-badge in-progress">{stats.inProgress} active</span>}
                                {stats.pending > 0 && <span className="task-badge pending">{stats.pending} pending</span>}
                                {stats.completed > 0 && <span className="task-badge completed">{stats.completed} done</span>}
                              </div>
                            )}
                          </div>
                          <svg className={`team-expand-icon ${isExpanded ? 'expanded' : ''}`} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <path d="M6 9l6 6 6-6" />
                          </svg>
                        </div>

                        {isExpanded && (
                          <div className="team-card-body">
                            <div className="team-members">
                              {team.members.map(member => {
                                const session = teamSessions.find(s => s.agentId === member.agentId);
                                return (
                                  <div
                                    key={member.agentId}
                                    className={`team-member ${session ? 'linked' : ''}`}
                                    onClick={() => session && onFocusSession(session.id)}
                                    title={session ? 'Click to focus session' : 'No linked session'}
                                  >
                                    <span
                                      className={`member-role ${member.agentType}`}
                                      style={member.color ? {
                                        color: member.color,
                                        background: `${member.color}1f`,
                                      } : undefined}
                                    >
                                      {member.agentType === 'lead' ? (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                                          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
                                        </svg>
                                      ) : (
                                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                                          <circle cx="12" cy="7" r="4" />
                                        </svg>
                                      )}
                                    </span>
                                    <span className="member-name">{member.name}</span>
                                    <span className={`member-status ${session?.status || 'disconnected'}`} />
                                  </div>
                                );
                              })}
                            </div>

                            <div className="team-actions-grid">
                              <button className="team-view-btn" onClick={() => handleViewChange(team.name, 'tasks')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" />
                                </svg>
                                Tasks
                              </button>
                              <button className="team-view-btn" onClick={() => handleViewChange(team.name, 'messages')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
                                </svg>
                                Messages
                              </button>
                              <button className="team-view-btn" onClick={() => handleViewChange(team.name, 'graph')}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                  <circle cx="12" cy="5" r="3" /><circle cx="5" cy="19" r="3" /><circle cx="19" cy="19" r="3" />
                                  <line x1="12" y1="8" x2="5" y2="16" /><line x1="12" y1="8" x2="19" y2="16" />
                                </svg>
                                Graph
                              </button>
                            </div>

                            <button
                              className="team-close-btn"
                              onClick={() => setConfirmCloseTeam(team.name)}
                            >
                              Close Team
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}

          {view === 'tasks' && activeTeam && (
            <TaskBoard tasks={activeTeam.tasks} members={activeTeam.members} />
          )}

          {view === 'messages' && activeTeam && (
            <MessageStream
              teamName={activeTeam.name}
              members={activeTeam.members}
              sessions={sessions.filter(s => s.status === 'running')}
            />
          )}

          {view === 'graph' && activeTeam && (
            <AgentGraph
              team={activeTeam}
              sessions={sessions.filter(s => s.teamName === activeTeam.name)}
              onFocusSession={onFocusSession}
            />
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmCloseTeam !== null}
        title="Close Team?"
        message={`This will close all sessions in the team "${confirmCloseTeam}". This action cannot be undone.`}
        confirmLabel="Close Team"
        cancelLabel="Cancel"
        isDangerous={true}
        onConfirm={handleCloseTeam}
        onCancel={() => setConfirmCloseTeam(null)}
      />

      <style>{teamPanelStyles}</style>
    </>
  );
}

const teamPanelStyles = `
  .team-panel-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.4);
    z-index: 900;
  }

  .team-panel {
    position: fixed;
    top: 36px;
    right: 0;
    bottom: 0;
    width: 340px;
    background: #1a1b26;
    border-left: 1px solid #292e42;
    z-index: 901;
    display: flex;
    flex-direction: column;
    animation: team-panel-slide-in 0.2s ease;
    font-family: 'JetBrains Mono', monospace;
  }

  @keyframes team-panel-slide-in {
    from { transform: translateX(100%); }
    to { transform: translateX(0); }
  }

  .team-panel-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 16px 16px;
    border-bottom: 1px solid #292e42;
    flex-shrink: 0;
  }

  .team-panel-back {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s ease;
    flex-shrink: 0;
  }

  .team-panel-back:hover {
    background: #1e2030;
    color: #7aa2f7;
    border-color: #7aa2f7;
  }

  .team-panel-title {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 14px;
    font-weight: 600;
    color: #c0caf5;
    margin: 0;
  }

  .team-panel-title svg {
    color: #7aa2f7;
  }

  .team-panel-close {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: #565f89;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .team-panel-close:hover {
    background: #292e42;
    color: #a9b1d6;
  }

  .team-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
  }

  .team-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 48px 24px;
    text-align: center;
  }

  .team-empty svg { color: #3b4261; margin-bottom: 12px; }
  .team-empty p { font-size: 13px; color: #565f89; margin: 0 0 4px 0; }
  .team-empty span { font-size: 11px; color: #3b4261; }

  .team-list { display: flex; flex-direction: column; gap: 8px; }

  .team-card {
    background: #16161e;
    border: 1px solid #292e42;
    border-radius: 8px;
    overflow: hidden;
    transition: border-color 0.15s ease;
  }

  .team-card:hover { border-color: #3b4261; }

  .team-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 14px;
    cursor: pointer;
    user-select: none;
  }

  .team-card-info { flex: 1; min-width: 0; }

  .team-card-name {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    font-weight: 600;
    color: #c0caf5;
  }

  .team-member-count {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    background: rgba(122, 162, 247, 0.15);
    border-radius: 9px;
    font-size: 10px;
    font-weight: 600;
    color: #7aa2f7;
  }

  .team-task-summary {
    display: flex;
    gap: 6px;
    margin-top: 6px;
  }

  .task-badge {
    font-size: 10px;
    font-weight: 500;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .task-badge.pending { background: rgba(224, 175, 104, 0.15); color: #e0af68; }
  .task-badge.in-progress { background: rgba(122, 162, 247, 0.15); color: #7aa2f7; }
  .task-badge.completed { background: rgba(158, 206, 106, 0.15); color: #9ece6a; }

  .team-expand-icon {
    color: #565f89;
    transition: transform 0.2s ease;
    flex-shrink: 0;
  }

  .team-expand-icon.expanded { transform: rotate(180deg); }

  .team-card-body {
    padding: 0 14px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    border-top: 1px solid #292e42;
  }

  .team-members {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-top: 10px;
  }

  .team-member {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    transition: background 0.15s ease;
  }

  .team-member.linked { cursor: pointer; }
  .team-member.linked:hover { background: rgba(122, 162, 247, 0.08); }

  .member-role {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    border-radius: 4px;
    flex-shrink: 0;
  }

  .member-role.lead { color: #fbbf24; background: rgba(251, 191, 36, 0.12); }
  .member-role.teammate { color: #7aa2f7; background: rgba(122, 162, 247, 0.12); }

  .member-name {
    flex: 1;
    font-size: 12px;
    color: #a9b1d6;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .member-status {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .member-status.running { background: #9ece6a; box-shadow: 0 0 4px rgba(158, 206, 106, 0.4); }
  .member-status.starting { background: #e0af68; }
  .member-status.exited { background: #f7768e; }
  .member-status.error { background: #f7768e; }
  .member-status.disconnected { background: #3b4261; }

  .team-actions-grid {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }

  .team-view-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    padding: 7px 0;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #565f89;
    font-size: 10px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .team-view-btn:hover {
    border-color: #7aa2f7;
    color: #7aa2f7;
    background: rgba(122, 162, 247, 0.06);
  }

  .team-close-btn {
    width: 100%;
    padding: 7px 0;
    background: transparent;
    border: 1px solid rgba(247, 118, 142, 0.3);
    border-radius: 6px;
    color: #f7768e;
    font-size: 11px;
    font-weight: 500;
    font-family: inherit;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .team-close-btn:hover {
    background: rgba(247, 118, 142, 0.1);
    border-color: #f7768e;
  }
`;
