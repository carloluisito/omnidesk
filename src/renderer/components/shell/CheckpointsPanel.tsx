// @atlas-entrypoint: Checkpoint management UI (epic #214 child 5, final child) —
// list/create/update/delete/export checkpoints across all sessions. Mirrors the
// HistoryPanel convention (overlay + split-pane list/detail), but checkpoints are
// live data: useCheckpoints() keeps local state in sync via onCheckpointCreated /
// onCheckpointDeleted events rather than refresh-after-mutate, so create()/remove()
// here rely on that round-trip rather than touching local state directly. Only
// update() (rename/description/tags/isTemplate) optimistically patches local state.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { P4Icon } from './P4Icon';
import { formatLastActive } from './shell-utils';
import { useCheckpoints } from '../../hooks/useCheckpoints';
import { useHistory } from '../../hooks/useHistory';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { Checkpoint, CheckpointExportFormat, CheckpointGroup } from '../../../shared/types/checkpoint-types';

interface CheckpointsPanelProps {
  onClose: () => void;
}

export function CheckpointsPanel({ onClose }: CheckpointsPanelProps) {
  const { checkpoints, loading, error, create, remove, update, exportCheckpoint } = useCheckpoints();
  const { sessions } = useHistory();

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [showNewForm, setShowNewForm] = useState(false);
  const [newSessionId, setNewSessionId] = useState('');
  const [newName, setNewName] = useState('');
  const [newDescription, setNewDescription] = useState('');

  // Default the new-checkpoint session picker to the first known session once
  // sessions have loaded, so the form isn't stuck on an empty select.
  useEffect(() => {
    if (newSessionId === '' && sessions.length > 0) setNewSessionId(sessions[0].id);
  }, [sessions, newSessionId]);

  const sessionNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of sessions) map.set(s.id, s.name);
    return map;
  }, [sessions]);

  const groups = useMemo<CheckpointGroup[]>(() => {
    const bySession = new Map<string, Checkpoint[]>();
    for (const c of checkpoints) {
      const arr = bySession.get(c.sessionId);
      if (arr) arr.push(c);
      else bySession.set(c.sessionId, [c]);
    }
    const result: CheckpointGroup[] = [];
    for (const [sessionId, list] of bySession) {
      result.push({
        sessionId,
        sessionName: sessionNameById.get(sessionId) ?? sessionId,
        checkpoints: [...list].sort((a, b) => b.createdAt - a.createdAt),
      });
    }
    result.sort((a, b) => (b.checkpoints[0]?.createdAt ?? 0) - (a.checkpoints[0]?.createdAt ?? 0));
    return result;
  }, [checkpoints, sessionNameById]);

  const selected = useMemo(
    () => checkpoints.find((c) => c.id === selectedId) ?? null,
    [checkpoints, selectedId]
  );

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editIsTemplate, setEditIsTemplate] = useState(false);

  // Re-seed the edit form whenever the selection changes (not on every field
  // edit of the same checkpoint — this is a controlled form, saved explicitly).
  useEffect(() => {
    if (selected) {
      setEditName(selected.name);
      setEditDescription(selected.description ?? '');
      setEditTags((selected.tags ?? []).join(', '));
      setEditIsTemplate(!!selected.isTemplate);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const handleCreate = useCallback(async () => {
    if (newSessionId === '' || newName.trim() === '') return;
    const created = await create({
      sessionId: newSessionId,
      name: newName.trim(),
      description: newDescription.trim() === '' ? undefined : newDescription.trim(),
    });
    if (created) setSelectedId(created.id);
    setNewName('');
    setNewDescription('');
    setShowNewForm(false);
  }, [newSessionId, newName, newDescription, create]);

  const handleSave = useCallback(async () => {
    if (!selected) return;
    const tags = editTags.split(',').map((t) => t.trim()).filter((t) => t !== '');
    await update(selected.id, {
      name: editName.trim() === '' ? selected.name : editName.trim(),
      description: editDescription.trim() === '' ? undefined : editDescription.trim(),
      tags,
      isTemplate: editIsTemplate,
    });
  }, [selected, editName, editDescription, editTags, editIsTemplate, update]);

  const handleExport = useCallback(async (id: string, name: string, format: CheckpointExportFormat) => {
    const ext = format === 'markdown' ? 'md' : 'json';
    const path = await window.electronAPI.showSaveDialog({
      defaultPath: `${name}.${ext}`,
      filters: [{ name: format === 'markdown' ? 'Markdown' : 'JSON', extensions: [ext] }],
    });
    if (path === null) return; // user cancelled
    const content = await exportCheckpoint(id, format);
    if (content === null) return;
    await window.electronAPI.writeFile(path, content);
  }, [exportCheckpoint]);

  const handleConfirmDelete = useCallback(async () => {
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    const ok = await remove(id);
    if (ok && selectedId === id) setSelectedId(null);
  }, [confirmDeleteId, remove, selectedId]);

  return (
    <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Checkpoints">
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="snapshot" size={16} /></div>
          <div>
            <div className="t">Checkpoints</div>
            <div className="d">Save and restore named points in a session&apos;s history.</div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body" style={{ display: 'flex', gap: 12, minHeight: 320 }}>
          <div style={{ flex: '0 0 45%', overflowY: 'auto', borderRight: '1px solid var(--border, #2a2a2a)', paddingRight: 8 }}>
            <div className="p4-form-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="d">
                {checkpoints.length} checkpoint{checkpoints.length === 1 ? '' : 's'}
              </span>
              <button data-testid="checkpoint-new-toggle" onClick={() => setShowNewForm((v) => !v)}>
                New checkpoint
              </button>
            </div>

            {showNewForm && (
              <div
                className="p4-form-row"
                data-testid="checkpoint-new-form"
                style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
              >
                <label style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  Session
                  <select
                    data-testid="checkpoint-new-session"
                    value={newSessionId}
                    onChange={(e) => setNewSessionId(e.target.value)}
                  >
                    {sessions.length === 0 && <option value="">No sessions available</option>}
                    {sessions.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </label>
                <input
                  type="text"
                  placeholder="Checkpoint name"
                  data-testid="checkpoint-new-name"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                />
                <textarea
                  placeholder="Description (optional)"
                  data-testid="checkpoint-new-description"
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  rows={2}
                />
                <div style={{ display: 'flex', gap: 6 }}>
                  <button
                    data-testid="checkpoint-new-create"
                    disabled={newSessionId === '' || newName.trim() === ''}
                    onClick={() => void handleCreate()}
                  >
                    Create
                  </button>
                  <button data-testid="checkpoint-new-cancel" onClick={() => setShowNewForm(false)}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {loading ? (
              <div className="p4-form-row"><span className="d">Loading…</span></div>
            ) : error ? (
              <div className="p4-form-row">
                <span className="d" style={{ color: 'var(--danger, #F7678E)' }}>{error}</span>
              </div>
            ) : groups.length === 0 ? (
              <div className="p4-form-row"><span className="d">No checkpoints yet.</span></div>
            ) : (
              groups.map((g) => (
                <div key={g.sessionId} data-testid={`checkpoint-group-${g.sessionId}`}>
                  <div
                    className="d"
                    style={{ fontWeight: 600, fontSize: 11, textTransform: 'uppercase', opacity: 0.7, marginTop: 8 }}
                  >
                    {g.sessionName}
                  </div>
                  {g.checkpoints.map((c) => (
                    <div
                      key={c.id}
                      className="p4-form-row"
                      data-testid={`checkpoint-row-${c.id}`}
                      role="button"
                      tabIndex={0}
                      onClick={() => setSelectedId(c.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setSelectedId(c.id); }}
                      style={{
                        cursor: 'pointer',
                        background: selectedId === c.id ? 'var(--surface-hover, rgba(255,255,255,0.06))' : undefined,
                      }}
                    >
                      <div className="t" style={{ fontWeight: 600 }}>
                        {c.name}{c.isTemplate ? ' ★' : ''}
                      </div>
                      <div className="d">{formatLastActive(c.createdAt)}</div>
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>

          <div style={{ flex: '1 1 55%', overflowY: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selected === null ? (
              <div className="p4-form-row"><span className="d">Select a checkpoint to view its details.</span></div>
            ) : (
              <>
                <div className="p4-form-row" style={{ display: 'flex', gap: 6 }}>
                  <button
                    data-testid="checkpoint-export-md"
                    onClick={() => void handleExport(selected.id, selected.name, 'markdown')}
                  >
                    Export Markdown
                  </button>
                  <button
                    data-testid="checkpoint-export-json"
                    onClick={() => void handleExport(selected.id, selected.name, 'json')}
                  >
                    Export JSON
                  </button>
                  <button data-testid="checkpoint-delete" onClick={() => setConfirmDeleteId(selected.id)}>
                    Delete
                  </button>
                </div>

                <label className="p4-form-row" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  Name
                  <input
                    type="text"
                    data-testid="checkpoint-edit-name"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                  />
                </label>
                <label className="p4-form-row" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  Description
                  <textarea
                    data-testid="checkpoint-edit-description"
                    value={editDescription}
                    onChange={(e) => setEditDescription(e.target.value)}
                    rows={3}
                  />
                </label>
                <label className="p4-form-row" style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 12 }}>
                  Tags (comma separated)
                  <input
                    type="text"
                    data-testid="checkpoint-edit-tags"
                    value={editTags}
                    onChange={(e) => setEditTags(e.target.value)}
                  />
                </label>
                <label
                  className="p4-form-row"
                  style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}
                >
                  <input
                    type="checkbox"
                    data-testid="checkpoint-edit-template"
                    checked={editIsTemplate}
                    onChange={(e) => setEditIsTemplate(e.target.checked)}
                  />
                  Template
                </label>
                <div className="p4-form-row">
                  <button data-testid="checkpoint-save" onClick={() => void handleSave()}>Save</button>
                </div>

                <div className="p4-form-row" data-testid="checkpoint-meta">
                  <span className="d">
                    {formatLastActive(selected.createdAt)} · history position {selected.historyPosition} · segment {selected.historySegment}
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        title="Delete checkpoint"
        body="This will permanently delete this checkpoint. This cannot be undone."
        severity="destructive"
        confirmLabel="Delete"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
    </div>
  );
}
