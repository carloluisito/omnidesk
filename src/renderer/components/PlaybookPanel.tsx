import { useState, useMemo, useCallback } from 'react';
import type { Playbook, PlaybookExportData } from '../../shared/types/playbook-types';

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

export function PlaybookPanel({
  isOpen,
  onClose,
  playbooks,
  onRun,
  onEdit,
  onCreate,
  onDelete,
  onDuplicate,
  onImport,
  onExport,
}: PlaybookPanelProps) {
  const [search, setSearch] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const builtIn = useMemo(() => playbooks.filter(p => p.type === 'built-in'), [playbooks]);
  const userPlaybooks = useMemo(() => playbooks.filter(p => p.type === 'user'), [playbooks]);

  const filterPlaybooks = useCallback((list: Playbook[]) => {
    if (!search.trim()) return list;
    const q = search.toLowerCase();
    return list.filter(p =>
      p.name.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
  }, [search]);

  const filteredBuiltIn = useMemo(() => filterPlaybooks(builtIn), [filterPlaybooks, builtIn]);
  const filteredUser = useMemo(() => filterPlaybooks(userPlaybooks), [filterPlaybooks, userPlaybooks]);

  const handleImport = useCallback(async () => {
    try {
      // Use a file input trick since we can't use Electron file picker directly for JSON parsing
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.claudedesk-playbook.json';
      input.onchange = async (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) return;
        if (file.size > 1024 * 1024) {
          alert('File too large (max 1MB)');
          return;
        }
        const text = await file.text();
        const data = JSON.parse(text) as PlaybookExportData;
        await onImport(data);
      };
      input.click();
    } catch (err) {
      console.error('Failed to import:', err);
    }
  }, [onImport]);

  const handleExport = useCallback(async (id: string) => {
    try {
      const data = await onExport(id);
      const playbook = playbooks.find(p => p.id === id);
      const filename = `${(playbook?.name || 'playbook').replace(/[^a-zA-Z0-9]/g, '-')}.claudedesk-playbook.json`;
      const savePath = await window.electronAPI.showSaveDialog({
        defaultPath: filename,
        filters: [{ name: 'Playbook', extensions: ['json'] }],
      });
      if (savePath) {
        await window.electronAPI.writeFile(savePath, JSON.stringify(data, null, 2));
      }
    } catch (err) {
      console.error('Failed to export:', err);
    }
  }, [onExport, playbooks]);

  const handleDelete = useCallback(async (id: string) => {
    if (confirmDelete === id) {
      await onDelete(id);
      setConfirmDelete(null);
    } else {
      setConfirmDelete(id);
      setTimeout(() => setConfirmDelete(null), 3000);
    }
  }, [confirmDelete, onDelete]);

  if (!isOpen) return null;

  const renderCard = (playbook: Playbook, isBuiltIn: boolean) => (
    <div key={playbook.id} className="pb-panel-card">
      <div className="pb-panel-card-header">
        <span className="pb-panel-card-icon">{playbook.icon}</span>
        <div className="pb-panel-card-info">
          <div className="pb-panel-card-name">{playbook.name}</div>
          <div className="pb-panel-card-desc">{playbook.description}</div>
        </div>
      </div>
      <div className="pb-panel-card-meta">
        <span className="pb-panel-card-category">{playbook.category}</span>
        <span className="pb-panel-card-counts">
          {playbook.steps.length} steps{playbook.variables.length > 0 ? ` \u00B7 ${playbook.variables.length} params` : ''}
        </span>
      </div>
      <div className="pb-panel-card-actions">
        <button className="pb-panel-card-btn primary" onClick={() => onRun(playbook)}>Run</button>
        {isBuiltIn ? (
          <button className="pb-panel-card-btn" onClick={() => onDuplicate(playbook.id)}>Duplicate</button>
        ) : (
          <>
            <button className="pb-panel-card-btn" onClick={() => onEdit(playbook)}>Edit</button>
            <button className="pb-panel-card-btn" onClick={() => handleExport(playbook.id)}>Export</button>
            <button
              className={`pb-panel-card-btn danger ${confirmDelete === playbook.id ? 'confirm' : ''}`}
              onClick={() => handleDelete(playbook.id)}
            >
              {confirmDelete === playbook.id ? 'Confirm?' : 'Delete'}
            </button>
          </>
        )}
      </div>
    </div>
  );

  return (
    <div className="pb-panel-overlay" onClick={onClose}>
      <div className="pb-panel" onClick={e => e.stopPropagation()}>
        <div className="pb-panel-header">
          <h2 className="pb-panel-title">Session Playbooks</h2>
          <div className="pb-panel-header-actions">
            <button className="pb-panel-import-btn" onClick={handleImport}>Import</button>
            <button className="pb-panel-create-btn" onClick={onCreate}>Create</button>
            <button className="pb-panel-close" onClick={onClose}>&times;</button>
          </div>
        </div>

        <div className="pb-panel-search">
          <input
            type="text"
            placeholder="Search playbooks..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <div className="pb-panel-body">
          {filteredBuiltIn.length > 0 && (
            <div className="pb-panel-section">
              <h3 className="pb-panel-section-title">Built-in</h3>
              {filteredBuiltIn.map(p => renderCard(p, true))}
            </div>
          )}

          <div className="pb-panel-section">
            <h3 className="pb-panel-section-title">My Playbooks</h3>
            {filteredUser.length === 0 ? (
              <div className="pb-panel-empty">
                <p>No custom playbooks yet.</p>
                <button className="pb-panel-empty-btn" onClick={onCreate}>Create your first playbook</button>
              </div>
            ) : (
              filteredUser.map(p => renderCard(p, false))
            )}
          </div>
        </div>
      </div>

      <style>{panelStyles}</style>
    </div>
  );
}

const panelStyles = `
  .pb-panel-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.3);
    z-index: 900;
  }

  .pb-panel {
    position: fixed;
    top: 36px;
    right: 0;
    bottom: 0;
    width: 500px;
    background: #1f2335;
    border-left: 1px solid #292e42;
    display: flex;
    flex-direction: column;
    z-index: 901;
    box-shadow: -4px 0 24px rgba(0, 0, 0, 0.3);
  }

  .pb-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 20px;
    border-bottom: 1px solid #292e42;
  }

  .pb-panel-title {
    color: #c0caf5;
    font-size: 16px;
    font-weight: 600;
    margin: 0;
  }

  .pb-panel-header-actions {
    display: flex;
    gap: 8px;
    align-items: center;
  }

  .pb-panel-import-btn,
  .pb-panel-create-btn {
    font-size: 12px;
    padding: 4px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    border: none;
  }

  .pb-panel-import-btn {
    background: #292e42;
    color: #a9b1d6;
  }

  .pb-panel-import-btn:hover {
    background: #3b4261;
  }

  .pb-panel-create-btn {
    background: #7aa2f7;
    color: #1a1b26;
    font-weight: 600;
  }

  .pb-panel-create-btn:hover {
    background: #89b4fa;
  }

  .pb-panel-close {
    background: none;
    border: none;
    color: #565f89;
    font-size: 20px;
    cursor: pointer;
    padding: 0 4px;
    line-height: 1;
  }

  .pb-panel-close:hover {
    color: #c0caf5;
  }

  .pb-panel-search {
    padding: 12px 20px;
    border-bottom: 1px solid #292e42;
  }

  .pb-panel-search input {
    width: 100%;
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 6px;
    color: #c0caf5;
    font-size: 13px;
    font-family: 'JetBrains Mono', monospace;
    padding: 8px 12px;
    outline: none;
  }

  .pb-panel-search input:focus {
    border-color: #7aa2f7;
  }

  .pb-panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 8px 20px 20px;
  }

  .pb-panel-section {
    margin-top: 16px;
  }

  .pb-panel-section-title {
    color: #565f89;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin: 0 0 8px;
    font-weight: 600;
  }

  .pb-panel-card {
    background: #1a1b26;
    border: 1px solid #292e42;
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 8px;
  }

  .pb-panel-card-header {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .pb-panel-card-icon {
    font-size: 20px;
    flex-shrink: 0;
  }

  .pb-panel-card-info {
    flex: 1;
    min-width: 0;
  }

  .pb-panel-card-name {
    color: #c0caf5;
    font-size: 13px;
    font-weight: 500;
  }

  .pb-panel-card-desc {
    color: #565f89;
    font-size: 11px;
    margin-top: 2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pb-panel-card-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .pb-panel-card-category {
    font-size: 10px;
    padding: 1px 6px;
    border-radius: 4px;
    background: rgba(187, 154, 247, 0.15);
    color: #bb9af7;
  }

  .pb-panel-card-counts {
    font-size: 10px;
    color: #565f89;
  }

  .pb-panel-card-actions {
    display: flex;
    gap: 6px;
    margin-top: 10px;
  }

  .pb-panel-card-btn {
    font-size: 11px;
    padding: 3px 10px;
    border-radius: 4px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
    border: 1px solid #292e42;
    background: #292e42;
    color: #a9b1d6;
  }

  .pb-panel-card-btn:hover {
    background: #3b4261;
  }

  .pb-panel-card-btn.primary {
    background: #7aa2f7;
    border-color: #7aa2f7;
    color: #1a1b26;
    font-weight: 600;
  }

  .pb-panel-card-btn.primary:hover {
    background: #89b4fa;
  }

  .pb-panel-card-btn.danger {
    color: #f7768e;
    border-color: transparent;
    background: transparent;
  }

  .pb-panel-card-btn.danger:hover {
    background: rgba(247, 118, 142, 0.1);
  }

  .pb-panel-card-btn.danger.confirm {
    background: #f7768e;
    color: #1a1b26;
    font-weight: 600;
  }

  .pb-panel-empty {
    text-align: center;
    padding: 32px 16px;
    color: #565f89;
    font-size: 13px;
  }

  .pb-panel-empty p {
    margin: 0 0 12px;
  }

  .pb-panel-empty-btn {
    background: transparent;
    border: 1px dashed #3b4261;
    border-radius: 6px;
    color: #7aa2f7;
    font-size: 12px;
    padding: 8px 16px;
    cursor: pointer;
    font-family: 'JetBrains Mono', monospace;
  }

  .pb-panel-empty-btn:hover {
    background: rgba(122, 162, 247, 0.05);
    border-color: #7aa2f7;
  }
`;
