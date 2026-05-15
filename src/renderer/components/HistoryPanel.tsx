/**
 * HistoryPanel — Redesigned to match Obsidian spec §6.8.
 *
 * PanelShell + date-grouped PanelSection rows (Today / Yesterday / This week / Older).
 * Provider filter chips at top.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useHistory } from '../hooks/useHistory';
import type {
  HistorySessionEntry,
  HistorySearchResult,
} from '../../shared/types/history-types';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { SidePanel } from './SidePanel';
import { PanelShell, PanelSection, PanelEmpty, PanelLoading } from './ui';
import { Search, Trash2, Download, History } from 'lucide-react';

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

// ─── V2 session row ───────────────────────────────────────────────────────

function V2SessionRow({
  session,
  isSelected,
  onSelect,
  onDelete,
  onExport,
}: {
  session: HistorySessionEntry;
  isSelected: boolean;
  onSelect: () => void;
  onDelete: () => void;
  onExport: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onClick={onSelect}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="anim-lift"
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          8,
        padding:      '7px 10px',
        borderRadius: 'var(--radius-md, 6px)',
        background:   isSelected ? 'var(--v2-surface-high)' : 'var(--v2-surface-mid)',
        borderLeft:   isSelected ? '2px solid var(--v2-accent)' : '2px solid transparent',
        cursor:       'pointer',
        position:     'relative',
        transition:   'background 120ms ease, border-color 120ms ease',
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-sm, 12px)', fontWeight: 600, color: 'var(--v2-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {session.name || `Session ${session.id.slice(0, 8)}`}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--v2-text-tertiary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {formatTimeAgo(session.lastUpdatedAt)} · {formatTokenCount(session.sizeBytes)}
        </div>
      </div>
      {hovered && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }} onClick={(e) => e.stopPropagation()}>
          <button onClick={onExport} title="Export" style={histBtn(false)}><Download size={10} /></button>
          <button onClick={onDelete} title="Delete" style={histBtn(true)}><Trash2 size={10} /></button>
        </div>
      )}
    </div>
  );
}

function histBtn(danger: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22,
    background: 'none',
    border: `1px solid ${danger ? 'var(--v2-error)' : 'var(--v2-border-default)'}`,
    borderRadius: 4,
    color: danger ? 'var(--v2-error)' : 'var(--v2-text-secondary)',
    cursor: 'pointer', padding: 0,
  };
}

// ─── Main component ────────────────────────────────────────────────────────

export function HistoryPanel({ isOpen, onClose }: HistoryPanelProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSession, setSelectedSession] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
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
    const t = setTimeout(async () => {
      const results = await history.searchHistory(searchQuery, false);
      setSearchResults(results);
    }, 300);
    return () => clearTimeout(t);
  }, [searchQuery]);

  const handleDelete = useCallback(async (id: string) => {
    await history.deleteSession(id);
    setShowDeleteConfirm(null);
    if (selectedSession === id) setSelectedSession(null);
  }, [history, selectedSession]);

  const handleExport = useCallback(async (id: string) => {
    const session = history.sessions.find((s) => s.id === id);
    if (!session) return;
    const sanitized = session.name.replace(/[^a-zA-Z0-9-_]/g, '_');
    const ts = new Date(session.lastUpdatedAt).toISOString().split('T')[0];
    await history.exportMarkdown(id, `${sanitized}_${ts}.md`);
  }, [history]);

  if (!isOpen) return null;

  const isFiltered = searchQuery.trim().length > 0;
  const displaySessions: HistorySessionEntry[] = isFiltered
    ? searchResults.map((r) => r.session)
    : history.sessions;
  const groups = groupSessionsByDate(displaySessions);
  const isEmpty = !history.isLoading && displaySessions.length === 0;

  return (
    <>
      <SidePanel isOpen={isOpen} onClose={onClose} title="History">
        <div style={{ height: '100%' }}>
          <PanelShell
            icon={<History size={13} />}
            title="History"
            count={history.sessions.length > 0 ? `${history.sessions.length}` : undefined}
            actions={
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <Search size={12} style={{ color: 'var(--v2-text-tertiary)' }} />
              </div>
            }
          >
            {/* Search */}
            <div style={{ padding: '8px 10px 0', borderBottom: '1px solid var(--v2-border-subtle)' }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '5px 8px',
                background: 'var(--v2-surface-mid)', borderRadius: 'var(--radius-md, 6px)',
                border: '1px solid var(--v2-border-subtle)',
                marginBottom: 8,
              }}>
                <Search size={11} style={{ color: 'var(--v2-text-tertiary)', flexShrink: 0 }} />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search sessions..."
                  style={{
                    flex: 1, background: 'none', border: 'none', outline: 'none',
                    fontSize: 'var(--text-sm, 12px)', color: 'var(--v2-text-primary)',
                  }}
                />
              </div>
            </div>
            {/* Content */}
            {history.isLoading ? (
              <PanelLoading rows={3} />
            ) : isEmpty ? (
              <PanelEmpty
                icon={<History size={26} />}
                title="No session history"
                body="Sessions appear here as you use OmniDesk. Each entry stores its working directory and size."
              />
            ) : (
              <div style={{ padding: '8px 6px 0' }}>
                {groups.map(({ label, sessions }) => (
                  <PanelSection key={label} title={label} count={sessions.length}>
                    {sessions.map((session) => (
                      <V2SessionRow
                        key={session.id}
                        session={session}
                        isSelected={selectedSession === session.id}
                        onSelect={() => setSelectedSession(session.id === selectedSession ? null : session.id)}
                        onDelete={() => setShowDeleteConfirm(session.id)}
                        onExport={() => handleExport(session.id)}
                      />
                    ))}
                  </PanelSection>
                ))}
              </div>
            )}
          </PanelShell>
        </div>
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
    </>
  );
}
