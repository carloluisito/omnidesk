/**
 * CheckpointPanel — Side panel for viewing and managing checkpoints.
 *
 * Layout: PanelShell + "Recent (last 24h)" / "Older" PanelSection groups.
 * Empty / loading / error states use PanelEmpty / PanelLoading / PanelError primitives.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useCheckpoints, CheckpointGroup } from '../hooks/useCheckpoints';
import type { Checkpoint } from '../../shared/ipc-types';
import { showToast } from '../utils/toast';
import { PanelShell, PanelSection, PanelEmpty, PanelLoading, PanelError } from './ui';
import { SidePanel } from './SidePanel';
import { Camera, Copy, Download, Trash2 } from 'lucide-react';

// ─── V2 row ───────────────────────────────────────────────────────────────

function formatRelTime(timestamp: number): string {
  const diff = Date.now() - timestamp;
  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  return `${days}d ago`;
}

function V2CheckpointRow({
  checkpoint,
  onCopy,
  onExport,
  onDelete,
}: {
  checkpoint: Checkpoint;
  onCopy: () => void;
  onExport: () => void;
  onDelete: () => void;
}) {
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="anim-lift"
      style={{
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 10px', borderRadius: 'var(--radius-md, 6px)',
        background: 'var(--v2-surface-mid)', cursor: 'default',
      }}
    >
      <Camera size={12} style={{ color: 'var(--v2-accent)', flexShrink: 0 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 'var(--text-sm, 12px)', fontWeight: 600, color: 'var(--v2-text-primary)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {checkpoint.name}
        </div>
        <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 10, color: 'var(--v2-text-tertiary)' }}>
          {formatRelTime(checkpoint.createdAt)}
        </div>
      </div>
      {hovered && (
        <div style={{ display: 'flex', gap: 3, flexShrink: 0 }}>
          <button onClick={onCopy} title="Copy" style={cpBtn(false)}><Copy size={10} /></button>
          <button onClick={onExport} title="Export" style={cpBtn(false)}><Download size={10} /></button>
          <button onClick={onDelete} title="Delete" style={cpBtn(true)}><Trash2 size={10} /></button>
        </div>
      )}
    </div>
  );
}

function cpBtn(danger: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22,
    background: danger ? 'none' : 'var(--v2-surface-high)',
    border: `1px solid ${danger ? 'var(--v2-error)' : 'var(--v2-border-default)'}`,
    borderRadius: 4,
    color: danger ? 'var(--v2-error)' : 'var(--v2-text-secondary)',
    cursor: 'pointer', padding: 0,
  };
}

// ─── Main component ────────────────────────────────────────────────────────

interface CheckpointPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
}


export function CheckpointPanel({ isOpen, onClose, sessionId }: CheckpointPanelProps) {
  const [checkpointGroups, setCheckpointGroups] = useState<CheckpointGroup[]>([]);

  const {
    checkpoints,
    isLoading,
    error,
    deleteCheckpoint,
    exportCheckpoint,
    getCheckpointGroups,
  } = useCheckpoints(sessionId);

  // Update checkpoint groups when checkpoints change
  useEffect(() => {
    if (checkpoints.length > 0) {
      getCheckpointGroups(checkpoints).then(setCheckpointGroups);
    } else {
      setCheckpointGroups([]);
    }
  }, [checkpoints, getCheckpointGroups]);

  // Handle delete checkpoint
  const handleDelete = useCallback(
    async (checkpointId: string) => {
      if (!confirm('Are you sure you want to delete this checkpoint?')) {
        return;
      }

      try {
        await deleteCheckpoint(checkpointId);
      } catch (err) {
        console.error('Failed to delete checkpoint:', err);
      }
    },
    [deleteCheckpoint]
  );

  // Handle copy to clipboard
  const handleCopy = useCallback(
    async (checkpointId: string) => {
      try {
        const content = await exportCheckpoint(checkpointId, 'markdown');
        await navigator.clipboard.writeText(content);
        const lineCount = content.split('\n').length;
        showToast(`Copied ${lineCount} lines to clipboard`, 'success');
      } catch (err) {
        console.error('Failed to copy checkpoint:', err);
        showToast('Failed to copy checkpoint', 'error');
      }
    },
    [exportCheckpoint]
  );

  // Handle export to file
  const handleExportToFile = useCallback(
    async (checkpointId: string, format: 'markdown' | 'json') => {
      try {
        const checkpoint = await window.electronAPI.getCheckpoint(checkpointId);
        if (!checkpoint) throw new Error('Checkpoint not found');

        const extension = format === 'markdown' ? 'md' : 'json';
        const defaultFilename = `${checkpoint.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_checkpoint.${extension}`;

        const filePath = await window.electronAPI.showSaveDialog({
          defaultPath: defaultFilename,
          filters: [
            { name: format === 'markdown' ? 'Markdown' : 'JSON', extensions: [extension] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (!filePath) return;

        const content = await exportCheckpoint(checkpointId, format);
        const success = await window.electronAPI.writeFile(filePath, content);

        if (success) {
          showToast(`Exported to ${filePath.split(/[\\/]/).pop()}`, 'success');
        } else {
          throw new Error('Failed to write file');
        }
      } catch (err) {
        console.error('Failed to export checkpoint:', err);
        showToast('Failed to export checkpoint', 'error');
      }
    },
    [exportCheckpoint]
  );

  if (!isOpen) return null;

  const now = Date.now();
  const dayMs = 86_400_000;
  const recentGroups: CheckpointGroup[] = [];
  const olderGroups: CheckpointGroup[] = [];
  for (const group of checkpointGroups) {
    const recent = group.checkpoints.filter((c) => now - c.createdAt < dayMs);
    const older = group.checkpoints.filter((c) => now - c.createdAt >= dayMs);
    if (recent.length) recentGroups.push({ ...group, checkpoints: recent });
    if (older.length) olderGroups.push({ ...group, checkpoints: older });
  }
  const totalCount = checkpoints.length;

  return (
    <SidePanel isOpen={isOpen} onClose={onClose} title="Checkpoints">
      <div style={{ height: '100%' }}>
        <PanelShell
          icon={<Camera size={13} />}
          title="Checkpoints"
          count={totalCount > 0 ? `${totalCount}` : undefined}
        >
          {isLoading ? (
            <PanelLoading rows={3} />
          ) : error ? (
            <PanelError
              title="Could not load checkpoints"
              message={error}
              recover={{ label: 'Retry', onClick: () => {} }}
            />
          ) : checkpoints.length === 0 ? (
            <PanelEmpty
              icon={<Camera size={26} />}
              title="No checkpoints yet"
              body="Snapshot a session's state and resume it later. Useful before a risky refactor or to fork an experiment."
            />
          ) : (
            <div style={{ padding: '8px 6px 0' }}>
              {recentGroups.length > 0 && (
                <PanelSection title="Recent (last 24h)" count={recentGroups.reduce((s, g) => s + g.checkpoints.length, 0)}>
                  {recentGroups.flatMap((group) =>
                    group.checkpoints.map((cp) => (
                      <V2CheckpointRow
                        key={cp.id}
                        checkpoint={cp}
                        onCopy={() => handleCopy(cp.id)}
                        onExport={() => handleExportToFile(cp.id, 'markdown')}
                        onDelete={() => handleDelete(cp.id)}
                      />
                    ))
                  )}
                </PanelSection>
              )}
              {olderGroups.length > 0 && (
                <PanelSection title="Older" count={olderGroups.reduce((s, g) => s + g.checkpoints.length, 0)} defaultOpen={recentGroups.length === 0}>
                  {olderGroups.flatMap((group) =>
                    group.checkpoints.map((cp) => (
                      <V2CheckpointRow
                        key={cp.id}
                        checkpoint={cp}
                        onCopy={() => handleCopy(cp.id)}
                        onExport={() => handleExportToFile(cp.id, 'markdown')}
                        onDelete={() => handleDelete(cp.id)}
                      />
                    ))
                  )}
                </PanelSection>
              )}
            </div>
          )}
        </PanelShell>
      </div>
    </SidePanel>
  );
}
