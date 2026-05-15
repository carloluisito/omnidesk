/**
 * PlaybookPanel — Redesigned to match Obsidian spec §6.7.
 *
 * PanelShell + "Built-in" / "Custom" PanelSection groups.
 * Active step in a running playbook gets .anim-status-pulse.
 */

import { useState, useMemo, useCallback } from 'react';
import type { Playbook, PlaybookExportData } from '../../shared/types/playbook-types';
import { SidePanel } from './SidePanel';
import { PanelShell, PanelSection, PanelEmpty } from './ui';
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

// ─── V2 playbook row ───────────────────────────────────────────────────────

interface V2PlaybookRowProps {
  playbook: Playbook;
  isBuiltIn: boolean;
  onRun: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isActiveStep?: boolean;
}

function V2PlaybookRow({ playbook, isBuiltIn, onRun, onEdit, onDelete, isActiveStep }: V2PlaybookRowProps) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="anim-lift"
      style={{
        display:       'flex',
        alignItems:    'center',
        gap:           8,
        padding:       '7px 10px',
        borderRadius:  'var(--radius-md, 6px)',
        background:    'var(--v2-surface-mid)',
        cursor:        'default',
        position:      'relative',
      }}
    >
      {/* Active step pulse indicator */}
      {isActiveStep && (
        <div
          className="anim-status-pulse"
          style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: 'var(--v2-accent)',
          }}
        />
      )}
      {!isActiveStep && (
        <Play size={11} style={{ color: 'var(--v2-text-tertiary)', flexShrink: 0 }} />
      )}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-sm, 12px)', fontWeight: 600,
          color: 'var(--v2-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {playbook.name}
        </div>
        <div style={{
          fontFamily: 'var(--font-mono, monospace)', fontSize: 10,
          color: 'var(--v2-text-tertiary)',
        }}>
          {playbook.steps.length} step{playbook.steps.length !== 1 ? 's' : ''}
        </div>
      </div>
      {hovered && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          {!isBuiltIn && (
            <button
              onClick={onEdit}
              title="Edit"
              style={v2ActionBtn()}
            >
              <Edit3 size={10} />
            </button>
          )}
          <button
            onClick={onRun}
            title="Run"
            style={{ ...v2ActionBtn(), background: 'var(--v2-accent)', color: '#0A0B11', borderColor: 'var(--v2-accent)' }}
          >
            <Play size={10} />
          </button>
          {!isBuiltIn && (
            <button
              onClick={onDelete}
              title="Delete"
              style={{ ...v2ActionBtn(), color: 'var(--v2-error)', borderColor: 'var(--v2-error)' }}
            >
              <Trash2 size={10} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function v2ActionBtn(): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22,
    background: 'var(--v2-surface-high)', border: '1px solid var(--v2-border-default)',
    borderRadius: 4, color: 'var(--v2-text-secondary)', cursor: 'pointer', padding: 0,
  };
}

// ─── V2 PlaybookPanel ─────────────────────────────────────────────────────

function V2PlaybookPanelInner({
  playbooks,
  onRun,
  onEdit,
  onCreate,
  onDelete,
  onDuplicate: _onDuplicate,
  onExport: _onExport,
}: {
  playbooks: Playbook[];
  onRun: (pb: Playbook) => void;
  onEdit: (pb: Playbook) => void;
  onCreate: () => void;
  onDelete: (id: string) => Promise<void>;
  onDuplicate: (id: string) => Promise<void>;
  onExport: (id: string) => Promise<PlaybookExportData>;
}) {
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const builtIn = useMemo(() => playbooks.filter((p) => p.type === 'built-in'), [playbooks]);
  const userPlaybooks = useMemo(() => playbooks.filter((p) => p.type === 'user'), [playbooks]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirmDelete === id) {
      await onDelete(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  }, [confirmDelete, onDelete]);

  const footer = (
    <button
      onClick={onCreate}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        padding: '7px 0', background: 'var(--v2-accent)', color: '#0A0B11',
        border: 'none', borderRadius: 'var(--radius-md, 6px)',
        fontSize: 'var(--text-sm, 12px)', fontWeight: 600, cursor: 'pointer',
      }}
    >
      <Plus size={12} /> New Playbook
    </button>
  );

  return (
    <PanelShell
      icon={<BookOpen size={13} />}
      title="Playbooks"
      count={playbooks.length > 0 ? `${playbooks.length}` : undefined}
      actions={
        <button
          onClick={onCreate}
          title="New playbook"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 22, height: 22, background: 'none', border: 'none',
            color: 'var(--v2-text-tertiary)', cursor: 'pointer', borderRadius: 4,
          }}
        >
          <Plus size={12} />
        </button>
      }
      footer={playbooks.length > 0 ? footer : undefined}
    >
      {playbooks.length === 0 ? (
        <PanelEmpty
          icon={<BookOpen size={26} />}
          title="No playbooks yet"
          body="Create reusable prompt sequences to automate repetitive workflows. Run them in any session."
          cta={{ label: 'Create the first one', onClick: onCreate }}
        />
      ) : (
        <div style={{ padding: '8px 6px 0' }}>
          {builtIn.length > 0 && (
            <PanelSection title="Built-in" count={builtIn.length}>
              {builtIn.map((pb) => (
                <V2PlaybookRow
                  key={pb.id}
                  playbook={pb}
                  isBuiltIn={true}
                  onRun={() => onRun(pb)}
                  onEdit={() => onEdit(pb)}
                  onDelete={() => handleDelete(pb.id)}
                />
              ))}
            </PanelSection>
          )}
          {userPlaybooks.length > 0 && (
            <PanelSection title="Custom" count={userPlaybooks.length}>
              {userPlaybooks.map((pb) => (
                <V2PlaybookRow
                  key={pb.id}
                  playbook={pb}
                  isBuiltIn={false}
                  onRun={() => onRun(pb)}
                  onEdit={() => onEdit(pb)}
                  onDelete={() => handleDelete(pb.id)}
                />
              ))}
            </PanelSection>
          )}
        </div>
      )}
    </PanelShell>
  );
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
  if (!isOpen) return null;

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Playbooks">
      <div style={{ height: '100%' }}>
        <V2PlaybookPanelInner
          playbooks={playbooks}
          onRun={onRun}
          onEdit={onEdit}
          onCreate={onCreate}
          onDelete={onDelete}
          onDuplicate={onDuplicate}
          onExport={onExport}
        />
      </div>
    </SidePanel>
  );
}

