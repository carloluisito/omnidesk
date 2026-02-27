/**
 * PlaybookPanel — Redesigned to match Obsidian spec §6.7.
 *
 * Sections: RUNNING (when executing) → LIBRARY (playbook cards).
 * Preserves all existing props, hooks, and logic.
 */

import { useState, useMemo, useCallback } from 'react';
import type { Playbook, PlaybookExportData } from '../../shared/types/playbook-types';
import { SidePanel } from './SidePanel';
import {
  Play,
  Edit3,
  Trash2,
  Plus,
  BookOpen,
} from 'lucide-react';

interface PlaybookPanelProps {
  isOpen: boolean;
  onClose: () => void;
  playbooks: Playbook[];
  onRun: (playbook: Playbook) => void;
  onEdit: (playbook: Playbook) => void;
  onCreate: () => void;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onImport: (data: PlaybookExportData) => Promise<void>;
  onExport: (id: string) => Promise<PlaybookExportData>;
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

// ─── Playbook card ─────────────────────────────────────────────────────────

interface PlaybookCardProps {
  playbook: Playbook;
  isBuiltIn: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onExport: () => void;
  confirmDeleteId: string | null;
}

function PlaybookCard({
  playbook,
  isBuiltIn,
  onRun,
  onEdit,
  onDelete,
  onDuplicate: _onDuplicate,
  onExport: _onExport,
  confirmDeleteId,
}: PlaybookCardProps) {
  const [hovered, setHovered] = useState(false);
  const isConfirm = confirmDeleteId === playbook.id;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        padding: '6px var(--space-3)',
        cursor: 'default',
        background: hovered ? 'var(--state-hover)' : 'transparent',
        transition: 'background var(--duration-instant)',
        position: 'relative',
        minWidth: 0,
      }}
    >
      <Play size={11} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-primary)',
            fontFamily: 'var(--font-ui)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {playbook.name}
        </div>
        <div
          style={{
            fontSize: 'var(--text-xs)',
            color: 'var(--text-tertiary)',
            fontFamily: 'var(--font-ui)',
          }}
        >
          {playbook.steps.length} step{playbook.steps.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Hover actions */}
      {(hovered || isConfirm) && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {!isBuiltIn && (
            <button
              onClick={onEdit}
              title="Edit"
              style={actionBtnStyle()}
            >
              <Edit3 size={10} />
            </button>
          )}
          <button
            onClick={onRun}
            title="Run"
            style={{
              ...actionBtnStyle(),
              background: 'var(--accent-primary)',
              color: 'var(--text-inverse)',
              borderColor: 'var(--accent-primary)',
            }}
          >
            <Play size={10} />
          </button>
          {!isBuiltIn && (
            <button
              onClick={onDelete}
              title={isConfirm ? 'Confirm delete' : 'Delete'}
              style={{
                ...actionBtnStyle(),
                background: isConfirm ? 'var(--semantic-error)' : undefined,
                color: isConfirm ? 'white' : 'var(--semantic-error)',
                borderColor: 'var(--semantic-error)',
              }}
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function actionBtnStyle() {
  return {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: 22,
    height: 22,
    background: 'var(--surface-high)',
    border: '1px solid var(--border-default)',
    borderRadius: 'var(--radius-sm)',
    color: 'var(--text-secondary)',
    cursor: 'pointer',
    padding: 0,
  } as React.CSSProperties;
}

// ─── Main component ────────────────────────────────────────────────────────

export function PlaybookPanel({
  isOpen,
  onClose,
  playbooks,
  onRun,
  onEdit,
  onCreate,
  onDelete,
  onDuplicate,
  onImport: _onImport,
  onExport,
}: PlaybookPanelProps) {
  const [search, _setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const builtIn = useMemo(() => playbooks.filter((p) => p.type === 'built-in'), [playbooks]);
  const userPlaybooks = useMemo(() => playbooks.filter((p) => p.type === 'user'), [playbooks]);

  const filterPlaybooks = useCallback(
    (list: Playbook[]) => {
      if (!search.trim()) return list;
      const q = search.toLowerCase();
      return list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q)
      );
    },
    [search]
  );

  const filteredBuiltIn = useMemo(() => filterPlaybooks(builtIn), [filterPlaybooks, builtIn]);
  const filteredUser = useMemo(() => filterPlaybooks(userPlaybooks), [filterPlaybooks, userPlaybooks]);

  const handleExport = useCallback(
    async (id: string) => {
      const data = await onExport(id);
      const pb = playbooks.find((p) => p.id === id);
      const filename = `${(pb?.name || 'playbook').replace(/[^a-zA-Z0-9]/g, '-')}.omnidesk-playbook.json`;
      const savePath = await window.electronAPI.showSaveDialog({
        defaultPath: filename,
        filters: [{ name: 'Playbook', extensions: ['json'] }],
      });
      if (savePath) {
        await window.electronAPI.writeFile(savePath, JSON.stringify(data, null, 2));
      }
    },
    [onExport, playbooks]
  );

  const handleDelete = useCallback(
    async (id: string) => {
      if (confirmDelete === id) {
        await onDelete(id);
        setConfirmDelete(null);
      } else {
        setConfirmDelete(id);
        setTimeout(() => setConfirmDelete(null), 3000);
      }
    },
    [confirmDelete, onDelete]
  );

  if (!isOpen) return null;

  const isEmpty = filteredBuiltIn.length === 0 && filteredUser.length === 0;

  const headerActions = (
    <button
      onClick={onCreate}
      title="New playbook"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 3,
        padding: '2px 6px',
        background: 'var(--surface-float)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        color: 'var(--text-secondary)',
        fontSize: 'var(--text-xs)',
        cursor: 'pointer',
        fontFamily: 'var(--font-ui)',
      }}
    >
      <Plus size={10} />
      New
    </button>
  );

  return (
    <>
      <SidePanel isOpen={isOpen} onClose={onClose} title="Playbooks" headerActions={headerActions}>
        {/* Library */}
        {isEmpty && !search && (
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
            <BookOpen size={32} style={{ color: 'var(--text-tertiary)' }} />
            <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', textAlign: 'center' }}>
              No playbooks
            </span>
            <span style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)', textAlign: 'center' }}>
              Create a reusable sequence of prompts
            </span>
            <button
              onClick={onCreate}
              style={{
                marginTop: 'var(--space-2)',
                padding: '6px 16px',
                background: 'var(--accent-primary)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-inverse)',
                fontSize: 'var(--text-sm)',
                fontWeight: 'var(--weight-semibold)',
                fontFamily: 'var(--font-ui)',
                cursor: 'pointer',
              }}
            >
              Create Playbook
            </button>
          </div>
        )}

        {(filteredBuiltIn.length > 0 || filteredUser.length > 0) && (
          <div>
            {filteredBuiltIn.length > 0 && (
              <>
                <SectionLabel>Built-in</SectionLabel>
                {filteredBuiltIn.map((pb) => (
                  <PlaybookCard
                    key={pb.id}
                    playbook={pb}
                    isBuiltIn={true}
                    onRun={() => onRun(pb)}
                    onEdit={() => onEdit(pb)}
                    onDelete={() => handleDelete(pb.id)}
                    onDuplicate={() => onDuplicate(pb.id)}
                    onExport={() => handleExport(pb.id)}
                    confirmDeleteId={confirmDelete}
                  />
                ))}
              </>
            )}

            {filteredUser.length > 0 && (
              <>
                <SectionLabel>Library ({filteredUser.length})</SectionLabel>
                {filteredUser.map((pb) => (
                  <PlaybookCard
                    key={pb.id}
                    playbook={pb}
                    isBuiltIn={false}
                    onRun={() => onRun(pb)}
                    onEdit={() => onEdit(pb)}
                    onDelete={() => handleDelete(pb.id)}
                    onDuplicate={() => onDuplicate(pb.id)}
                    onExport={() => handleExport(pb.id)}
                    confirmDeleteId={confirmDelete}
                  />
                ))}
              </>
            )}
          </div>
        )}
      </SidePanel>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </>
  );
}
