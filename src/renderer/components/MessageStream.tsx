import { useState, useRef, useEffect, useMemo } from 'react';
import type { TeamMember, SessionMetadata } from '../../shared/ipc-types';
import { useMessageStream } from '../hooks/useMessageStream';

interface MessageStreamProps {
  teamName: string;
  members: TeamMember[];
  sessions: SessionMetadata[];
}

// Generate consistent color from agent name
function agentColor(name: string): string {
  const colors = ['var(--text-accent, #00C9A7)', 'var(--accent-secondary, #7C3AED)', 'var(--semantic-success, #3DD68C)', 'var(--semantic-warning, #F7A84A)', 'var(--semantic-error, #F7678E)', 'var(--accent-primary, #00C9A7)', 'var(--accent-primary-dim, #009E84)', 'var(--semantic-warning, #F7A84A)'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = ((hash << 5) - hash) + name.charCodeAt(i);
    hash |= 0;
  }
  return colors[Math.abs(hash) % colors.length];
}

export function MessageStream({ sessions }: MessageStreamProps) {
  const sessionIds = useMemo(() => sessions.map(s => s.id), [sessions]);
  const { messages } = useMessageStream(sessionIds);

  const [search, setSearch] = useState('');
  const [filterSender, setFilterSender] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length]);

  const filteredMessages = useMemo(() => {
    let result = messages;
    if (filterSender) {
      result = result.filter(m => m.sender === filterSender || m.receiver === filterSender);
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(m =>
        m.content.toLowerCase().includes(q) ||
        m.sender.toLowerCase().includes(q) ||
        (m.receiver && m.receiver.toLowerCase().includes(q))
      );
    }
    return result;
  }, [messages, search, filterSender]);

  const uniqueSenders = useMemo(() => {
    const senders = new Set<string>();
    messages.forEach(m => {
      senders.add(m.sender);
      if (m.receiver) senders.add(m.receiver);
    });
    return Array.from(senders).sort();
  }, [messages]);

  return (
    <div className="message-stream">
      <div className="message-stream-filters">
        <input
          className="message-search"
          type="text"
          placeholder="Search messages..."
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
        <select
          className="message-filter-select"
          value={filterSender}
          onChange={e => setFilterSender(e.target.value)}
        >
          <option value="">All agents</option>
          {uniqueSenders.map(s => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      <div className="message-timeline">
        {filteredMessages.length === 0 ? (
          <div className="message-empty">
            {messages.length === 0
              ? 'No messages yet. Messages appear as agents communicate.'
              : 'No messages match filters.'}
          </div>
        ) : (
          filteredMessages.map(msg => (
            <div
              key={msg.id}
              className={`message-item ${expandedId === msg.id ? 'expanded' : ''}`}
              onClick={() => setExpandedId(prev => prev === msg.id ? null : msg.id)}
            >
              <div className="message-header">
                <span className="message-sender" style={{ color: agentColor(msg.sender) }}>
                  {msg.sender}
                </span>
                {msg.receiver && (
                  <>
                    <span className="message-arrow">→</span>
                    <span className="message-receiver" style={{ color: agentColor(msg.receiver) }}>
                      {msg.receiver}
                    </span>
                  </>
                )}
                <span className="message-time">
                  {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                </span>
              </div>
              <div className="message-content">{msg.content}</div>
              {expandedId === msg.id && (
                <div className="message-details">
                  <div className="message-detail-row">
                    <span className="message-detail-label">ID:</span>
                    <span className="message-detail-value">{msg.id}</span>
                  </div>
                  <div className="message-detail-row">
                    <span className="message-detail-label">Session:</span>
                    <span className="message-detail-value">{msg.sessionId.slice(0, 8)}...</span>
                  </div>
                  <div className="message-raw">{msg.raw}</div>
                </div>
              )}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      <style>{messageStreamStyles}</style>
    </div>
  );
}

const messageStreamStyles = `
  .message-stream {
    display: flex;
    flex-direction: column;
    gap: 8px;
    height: 100%;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .message-stream-filters {
    display: flex;
    gap: 6px;
  }

  .message-search {
    flex: 1;
    height: 28px;
    padding: 0 var(--space-2, 8px);
    background: var(--surface-float, #222435);
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-md, 6px);
    color: var(--text-secondary, #9DA3BE);
    font-size: var(--text-xs, 11px);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    outline: none;
  }

  .message-search::placeholder { color: var(--text-tertiary, #5C6080); }
  .message-search:focus { border-color: var(--border-accent, #00C9A7); }

  .message-filter-select {
    width: 100px;
    height: 28px;
    padding: 0 6px;
    background: var(--surface-float, #222435);
    border: 1px solid var(--border-default, #292E44);
    border-radius: var(--radius-md, 6px);
    color: var(--text-secondary, #9DA3BE);
    font-size: var(--text-xs, 11px);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    cursor: pointer;
    appearance: none;
    outline: none;
  }

  .message-timeline {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .message-empty {
    padding: 24px;
    text-align: center;
    font-size: var(--text-xs, 11px);
    color: var(--text-tertiary, #5C6080);
  }

  .message-item {
    padding: var(--space-2, 8px) var(--space-2, 8px);
    background: var(--surface-raised, #13141C);
    border: 1px solid var(--border-subtle, #1E2030);
    border-radius: var(--radius-md, 6px);
    cursor: pointer;
    transition: border-color var(--duration-fast, 150ms) ease;
  }

  .message-item:hover { border-color: var(--border-default, #292E44); }

  .message-header {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-bottom: 3px;
  }

  .message-sender, .message-receiver {
    font-size: var(--text-xs, 11px);
    font-weight: var(--weight-semibold, 600);
    font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
  }

  .message-arrow {
    font-size: 10px;
    color: var(--text-tertiary, #5C6080);
  }

  .message-time {
    margin-left: auto;
    font-size: 10px;
    color: var(--text-tertiary, #5C6080);
    font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
  }

  .message-content {
    font-size: var(--text-xs, 11px);
    color: var(--text-secondary, #9DA3BE);
    line-height: 1.4;
    word-break: break-word;
  }

  .message-details {
    margin-top: 6px;
    padding-top: 6px;
    border-top: 1px solid var(--border-subtle, #1E2030);
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .message-detail-row {
    display: flex;
    gap: 6px;
    font-size: 10px;
  }

  .message-detail-label { color: var(--text-tertiary, #5C6080); }
  .message-detail-value { color: var(--text-accent, #00C9A7); font-family: var(--font-mono-ui, 'JetBrains Mono', monospace); }

  .message-raw {
    margin-top: 4px;
    padding: 6px;
    background: var(--surface-base, #0D0E14);
    border-radius: var(--radius-sm, 3px);
    font-size: 10px;
    color: var(--text-tertiary, #5C6080);
    font-family: var(--font-mono, 'JetBrains Mono', monospace);
    white-space: pre-wrap;
    word-break: break-all;
  }
`;
