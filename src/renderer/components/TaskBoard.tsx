import { useState, useMemo } from 'react';
import type { Task, TeamMember } from '../../shared/ipc-types';

interface TaskBoardProps {
  tasks: Task[];
  members: TeamMember[];
}

export function TaskBoard({ tasks, members }: TaskBoardProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'owned' | 'blocked' | 'unblocked'>('all');
  const [filterMember, setFilterMember] = useState<string>('');
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  const filteredTasks = useMemo(() => {
    let result = tasks;
    if (filterMember) {
      result = result.filter(t => t.owner === filterMember);
    }
    if (filterStatus === 'owned') {
      result = result.filter(t => t.owner);
    } else if (filterStatus === 'blocked') {
      result = result.filter(t => t.blockedBy && t.blockedBy.length > 0);
    } else if (filterStatus === 'unblocked') {
      result = result.filter(t => !t.blockedBy || t.blockedBy.length === 0);
    }
    return result;
  }, [tasks, filterStatus, filterMember]);

  const pending = filteredTasks.filter(t => t.status === 'pending');
  const inProgress = filteredTasks.filter(t => t.status === 'in_progress');
  const completed = filteredTasks.filter(t => t.status === 'completed');

  const isBlocked = (task: Task) => task.blockedBy && task.blockedBy.length > 0;

  return (
    <div className="task-board">
      <div className="task-board-filters">
        <select
          className="task-filter-select"
          value={filterStatus}
          onChange={e => setFilterStatus(e.target.value as any)}
        >
          <option value="all">All Tasks</option>
          <option value="owned">Assigned</option>
          <option value="blocked">Blocked</option>
          <option value="unblocked">Unblocked</option>
        </select>
        <select
          className="task-filter-select"
          value={filterMember}
          onChange={e => setFilterMember(e.target.value)}
        >
          <option value="">All Members</option>
          {members.map(m => (
            <option key={m.agentId} value={m.agentId}>{m.name}</option>
          ))}
        </select>
      </div>

      <div className="task-columns">
        {[
          { title: 'Pending', items: pending, className: 'pending' },
          { title: 'In Progress', items: inProgress, className: 'in-progress' },
          { title: 'Completed', items: completed, className: 'completed' },
        ].map(col => (
          <div key={col.className} className="task-column">
            <div className={`task-column-header ${col.className}`}>
              <span className="task-column-title">{col.title}</span>
              <span className="task-column-count">{col.items.length}</span>
            </div>
            <div className="task-column-body">
              {col.items.length === 0 ? (
                <div className="task-column-empty">No tasks</div>
              ) : (
                col.items.map(task => (
                  <div
                    key={task.taskId}
                    className={`task-card ${isBlocked(task) ? 'blocked' : ''} ${expandedTask === task.taskId ? 'expanded' : ''}`}
                    onClick={() => setExpandedTask(prev => prev === task.taskId ? null : task.taskId)}
                  >
                    <div className="task-card-subject">{task.subject}</div>
                    {task.owner && (
                      <div className="task-card-owner">
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        {task.owner}
                      </div>
                    )}
                    {expandedTask === task.taskId && (
                      <div className="task-card-details">
                        {task.description && (
                          <div className="task-detail-section">
                            <span className="task-detail-label">Description</span>
                            <p className="task-detail-text">{task.description}</p>
                          </div>
                        )}
                        {task.blockedBy && task.blockedBy.length > 0 && (
                          <div className="task-detail-section">
                            <span className="task-detail-label blocked-label">Blocked by</span>
                            <div className="task-dep-list">
                              {task.blockedBy.map(id => (
                                <span key={id} className="task-dep-tag blocked">{id}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        {task.blocks && task.blocks.length > 0 && (
                          <div className="task-detail-section">
                            <span className="task-detail-label">Blocks</span>
                            <div className="task-dep-list">
                              {task.blocks.map(id => (
                                <span key={id} className="task-dep-tag">{id}</span>
                              ))}
                            </div>
                          </div>
                        )}
                        <div className="task-detail-id">ID: {task.taskId}</div>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        ))}
      </div>

      <style>{taskBoardStyles}</style>
    </div>
  );
}

const taskBoardStyles = `
  .task-board {
    display: flex;
    flex-direction: column;
    gap: 10px;
    height: 100%;
  }

  .task-board-filters {
    display: flex;
    gap: 6px;
  }

  .task-filter-select {
    flex: 1;
    height: 30px;
    padding: 0 8px;
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
    color: var(--text-secondary, #9DA3BE);
    font-size: 11px;
    font-family: inherit;
    cursor: pointer;
    appearance: none;
  }

  .task-filter-select:focus {
    outline: none;
    border-color: var(--accent-primary, #00C9A7);
  }

  .task-columns {
    display: flex;
    flex-direction: column;
    gap: 12px;
    flex: 1;
    overflow-y: auto;
  }

  .task-column {
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 8px;
    overflow: hidden;
  }

  .task-column-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 12px;
    border-bottom: 1px solid var(--border-default, #292E44);
  }

  .task-column-header.pending { border-left: 3px solid var(--semantic-warning, #F7A84A); }
  .task-column-header.in-progress { border-left: 3px solid var(--accent-primary, #00C9A7); }
  .task-column-header.completed { border-left: 3px solid var(--semantic-success, #3DD68C); }

  .task-column-title {
    font-size: 11px;
    font-weight: 600;
    color: var(--text-secondary, #9DA3BE);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .task-column-count {
    font-size: 10px;
    color: var(--text-tertiary, #5C6080);
    background: var(--surface-overlay, #1A1B26);
    padding: 1px 6px;
    border-radius: 8px;
  }

  .task-column-body {
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .task-column-empty {
    padding: 12px;
    text-align: center;
    font-size: 11px;
    color: var(--border-strong, #3D4163);
  }

  .task-card {
    padding: 8px 10px;
    background: var(--surface-overlay, #1A1B26);
    border: 1px solid var(--border-default, #292E44);
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .task-card:hover { border-color: var(--border-strong, #3D4163); }
  .task-card.blocked { border-left: 3px solid var(--semantic-error, #F7678E); }

  .task-card-subject {
    font-size: 11px;
    font-weight: 500;
    color: var(--text-primary, #E2E4F0);
    line-height: 1.4;
  }

  .task-card-owner {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 4px;
    font-size: 10px;
    color: var(--text-tertiary, #5C6080);
  }

  .task-card-details {
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--border-default, #292E44);
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .task-detail-section {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .task-detail-label {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-tertiary, #5C6080);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .task-detail-label.blocked-label { color: var(--semantic-error, #F7678E); }

  .task-detail-text {
    font-size: 11px;
    color: var(--text-secondary, #9DA3BE);
    margin: 0;
    line-height: 1.4;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .task-dep-list {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .task-dep-tag {
    font-size: 10px;
    padding: 1px 6px;
    background: rgba(0, 201, 167, 0.1);
    border-radius: 4px;
    color: var(--accent-primary, #00C9A7);
  }

  .task-dep-tag.blocked {
    background: rgba(247, 103, 142, 0.1);
    color: var(--semantic-error, #F7678E);
  }

  .task-detail-id {
    font-size: 10px;
    color: var(--border-strong, #3D4163);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }
`;
