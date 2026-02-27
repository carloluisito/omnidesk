/**
 * HistoryPanel — Redesigned to match Obsidian spec §6.8.
 *
 * Layout: Search input → Filter row → Date-grouped session cards.
 * Preserves all existing hooks, IPC calls, and history functionality.
 */

import { useState, useEffect, useCallback } from 'react';
import { useHistory } from '../hooks/useHistory';
import type {
  HistorySessionEntry,
  HistorySearchResult,
} from '../../shared/types/history-types';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { SidePanel } from './SidePanel';
import { Search, Clock, Trash2, Download } from 'lucide-react';

interface HistoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function formatTimeAgo(timestamp: number): string {
  const delta = Date.now() - timestamp;
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}

function formatTokenCount(bytes: number): string {
  // Approximate: 1 token ≈ 4 bytes
  const tokens = Math.round(bytes / 4);
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k tokens`;
}

function getDateGroupLabel(timestamp: number): string {
  const date = new Date(timestamp);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) return 'TODAY';
  if (date.toDateString() === yesterday.toDateString()) return 'YESTERDAY';

  const daysAgo = Math.floor((today.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));
  if (daysAgo < 7) return `${daysAgo} DAYS AGO`;
  if (daysAgo < 14) return 'LAST WEEK';
  if (daysAgo < 30) return 'THIS MONTH';
  return date.toLocaleString('default', { month: 'long', year: 'numeric' }).toUpperCase();
}

interface GroupedSessions {
  label: string;
  sessions: HistorySessionEntry[];
}

function groupSessionsByDate(sessions: HistorySessionEntry[]): GroupedSessions[] {
  const groups: Map<string, HistorySessionEntry[]> = new Map();
  for (const session of sessions) {
    const label = getDateGroupLabel(session.lastUpdatedAt);
    if (!groups.has(label)) groups.set(label, []);
    groups.get(label)!.push(session);
  }
  return Array.from(groups.entries()).map(([label, sessions]) => ({ label, sessions }));
}

// ─── Session Card ──────────────────────────────────────────────────────────

interface SessionCardProps {
  session: HistorySessionEntry;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onExport: () => void;
}

function SessionCard({ session, isSelected, onSelect, onDelete, onExport }: SessionCardProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        padding: 'var(--space-2) var(--space-3)',
        cursor: 'pointer',
        background: isSelected ? 'var(--accent-primary-muted)' : hovered ? 'var(--state-hover)' : 'transparent',
        borderLeft: isSelected ? '2px solid var(--border-accent)' : '2px solid transparent',
        transition: 'background var(--duration-instant), border-color var(--duration-instant)',
        position: 'relative',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 2 }}>
        {/* Provider badge placeholder */}
        <span
          style={{
            fontSize: 8,
            fontWeight: 700,
            fontFamily: 'var(--font-mono-ui)',
            color: 'var(--provider-claude)',
            background: 'rgba(204,133,51,0.15)',
            padding: '1px 4px',
            borderRadius: 2,
            flexShrink: 0,
          }}
        >
          CL
        </span>
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
          {session.name || `Session ${session.id.slice(0, 8)}`}
        </span>
        <span
          style={{
            fontSize: 'var(--text-2xs)',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-mono-ui)',
            flexShrink: 0,
          }}
        >
          {formatTimeAgo(session.lastUpdatedAt)}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
        <span
          style={{
            flex: 1,
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono-ui)',
            color: 'var(--text-tertiary)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={session.workingDirectory}
        >
          {session.workingDirectory || '(no directory)'}
        </span>
        <span
          style={{
            fontSize: 'var(--text-2xs)',
            fontFamily: 'var(--font-mono-ui)',
            color: 'var(--text-tertiary)',
            flexShrink: 0,
          }}
        >
          {formatTokenCount(session.sizeBytes)}
        </span>
      </div>
      {/* Actions overlay */}
      {hovered && (
        <div
          style={{
            position: 'absolute',
            right: 8,
            top: '50%',
            transform: 'translateY(-50%)',
            display: 'flex',
            gap: 4,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={onExport}
            title="Export"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              background: 'var(--surface-high)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-tertiary)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Download size={11} />
          </button>
          <button
            onClick={onDelete}
            title="Delete"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 22,
              height: 22,
              background: 'var(--semantic-error-muted)',
              border: '1px solid var(--semantic-error)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--semantic-error)',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <Trash2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Date group header ─────────────────────────────────────────────────────

function DateGroupHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '10px var(--space-3) 4px',
      }}
    >
      <span
        style={{
          fontSize: 'var(--text-2xs)',
          fontWeight: 'var(--weight-semibold)',
          color: 'var(--text-tertiary)',
          fontFamily: 'var(--font-ui)',
          letterSpacing: 'var(--tracking-widest)',
          textTransform: 'uppercase',
        }}
      >
        {label}
      </span>
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function HistoryPanel({ isOpen, onClose }: HistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<HistorySearchResult[]>([]);

  const history = useHistory();

  useEffect(() => {
    if (isOpen) {
      history.loadSessions();
    }
  }, [isOpen]);

  // Debounced search
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    const t = setTimeout(async () => {
      const results = await history.searchHistory(searchQuery, false);
      setSearchResults(results);
      setIsSearching(false);
    }, 300);
    return () => { clearTimeout(t); setIsSearching(false); };
  }, [searchQuery]);

  const handleDelete = useCallback(async (id: string) => {
    await history.deleteSession(id);
    setShowDeleteConfirm(null);
    if (selectedSession === id) setSelectedSession(null);
  }, [history, selectedSession]);

  const handleDeleteAll = useCallback(async () => {
    await history.deleteAllSessions();
    setShowDeleteAllConfirm(false);
    setSelectedSession(null);
  }, [history]);

  const handleExport = useCallback(async (id: string) => {
    const session = history.sessions.find((s) => s.id === id);
    if (!session) return;
    const sanitized = session.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const ts = new Date(session.lastUpdatedAt).toISOString().split('T')[0];
    await history.exportMarkdown(id, `${sanitized}_${ts}.md`);
  }, [history]);

  if (!isOpen) return null;

  // Decide what to show
  const isFiltered = searchQuery.trim().length > 0;
  const displaySessions: HistorySessionEntry[] = isFiltered
    ? searchResults.map((r) => r.session)
    : history.sessions;
  const groups = groupSessionsByDate(displaySessions);
  const isEmpty = !history.isLoading && displaySessions.length === 0;

  return (
    <>
      <SidePanel isOpen={isOpen} onClose={onClose} title="History">
        {/* Search input */}
        <div
          style={{
            padding: 'var(--space-2) var(--space-3)',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '5px var(--space-2)',
              background: 'var(--surface-float)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid transparent',
              transition: 'border-color var(--duration-fast)',
            }}
            onFocus={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'var(--border-accent)';
            }}
            onBlur={(e) => {
              (e.currentTarget as HTMLDivElement).style.borderColor = 'transparent';
            }}
          >
            <Search size={12} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search sessions..."
              style={{
                flex: 1,
                background: 'none',
                border: 'none',
                outline: 'none',
                fontSize: 'var(--text-sm)',
                fontFamily: 'var(--font-ui)',
                color: 'var(--text-primary)',
              }}
            />
            {isSearching && (
              <span style={{ fontSize: 'var(--text-2xs)', color: 'var(--text-tertiary)' }}>...</span>
            )}
          </div>
        </div>

        {/* Content */}
        {history.isLoading && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-8)',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Loading...
          </div>
        )}

        {!history.isLoading && isEmpty && !isFiltered && (
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
            <Clock size={32} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No session history
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              Sessions will appear here as you use OmniDesk
            </span>
          </div>
        )}

        {!history.isLoading && isEmpty && isFiltered && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-6) var(--space-4)',
              gap: 'var(--space-1)',
            }}
          >
            <Search size={24} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No sessions found
            </span>
          </div>
        )}

        {!history.isLoading && groups.map(({ label, sessions }) => (
          <div key={label}>
            <DateGroupHeader label={label} />
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isSelected={selectedSession === session.id}
                onSelect={() => setSelectedSession(session.id === selectedSession ? null : session.id)}
                onDelete={() => setShowDeleteConfirm(session.id)}
                onExport={() => handleExport(session.id)}
              />
            ))}
          </div>
        ))}
      </SidePanel>

      {showDeleteConfirm && (
        <ConfirmDialog
          isOpen={true}
          title="Delete Session History?"
          message="This will permanently delete the history for this session. This action cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          onConfirm={() => handleDelete(showDeleteConfirm)}
          onCancel={() => setShowDeleteConfirm(null)}
          isDangerous={true}
        />
      )}

      {showDeleteAllConfirm && (
        <ConfirmDialog
          isOpen={true}
          title="Delete All History?"
          message="This will permanently delete all session history. This action cannot be undone."
          confirmLabel="Delete All"
          cancelLabel="Cancel"
          onConfirm={handleDeleteAll}
          onCancel={() => setShowDeleteAllConfirm(false)}
          isDangerous={true}
        />
      )}
    </>
  );
}
