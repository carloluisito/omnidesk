/**
 * CheckpointPanel - Side panel for viewing and managing checkpoints
 */

import React, { useState, useEffect, useCallback } from 'react';
import { useCheckpoints, CheckpointGroup } from '../hooks/useCheckpoints';
import type { Checkpoint } from '../../shared/ipc-types';
import { showToast } from '../utils/toast';

interface CheckpointPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
}

type TabType = 'timeline' | 'export';

export function CheckpointPanel({ isOpen, onClose, sessionId }: CheckpointPanelProps) {
  const [activeTab, setActiveTab] = useState<TabType>('timeline');
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<Checkpoint | null>(null);
  const [checkpointGroups, setCheckpointGroups] = useState<CheckpointGroup[]>([]);
  const [isExporting, setIsExporting] = useState(false);

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

  // Handle overlay click (close panel)
  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onClose();
      }
    },
    [onClose]
  );

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

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
      setIsExporting(true);

      try {
        const checkpoint = await window.electronAPI.getCheckpoint(checkpointId);
        if (!checkpoint) {
          throw new Error('Checkpoint not found');
        }

        const extension = format === 'markdown' ? 'md' : 'json';
        const defaultFilename = `${checkpoint.name.replace(/[^a-z0-9]/gi, '_').toLowerCase()}_checkpoint.${extension}`;

        // Show save dialog
        const filePath = await window.electronAPI.showSaveDialog({
          defaultPath: defaultFilename,
          filters: [
            { name: format === 'markdown' ? 'Markdown' : 'JSON', extensions: [extension] },
            { name: 'All Files', extensions: ['*'] },
          ],
        });

        if (!filePath) {
          // User cancelled
          setIsExporting(false);
          return;
        }

        // Get checkpoint content
        const content = await exportCheckpoint(checkpointId, format);

        // Write to file
        const success = await window.electronAPI.writeFile(filePath, content);

        if (success) {
          showToast(`Exported to ${filePath.split(/[\\/]/).pop()}`, 'success');
        } else {
          throw new Error('Failed to write file');
        }
      } catch (err) {
        console.error('Failed to export checkpoint:', err);
        showToast('Failed to export checkpoint', 'error');
      } finally {
        setIsExporting(false);
      }
    },
    [exportCheckpoint]
  );

  // Format relative time
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    return `${days}d ago`;
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 z-[1000] flex items-center justify-end"
      onClick={handleOverlayClick}
    >
      <div
        className="bg-[var(--surface-overlay, #1A1B26)] h-full w-[500px] shadow-2xl flex flex-col animate-slide-in-right"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--border-default, #292E44)]">
          <h2 className="text-lg font-semibold text-[var(--text-secondary, #9DA3BE)]">Checkpoints</h2>
          <button
            onClick={onClose}
            className="text-[var(--text-tertiary, #5C6080)] hover:text-[var(--text-secondary, #9DA3BE)] transition-colors"
            aria-label="Close panel"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-[var(--border-default, #292E44)]">
          <button
            onClick={() => setActiveTab('timeline')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'timeline'
                ? 'text-[var(--accent-primary, #00C9A7)] border-b-2 border-[var(--accent-primary, #00C9A7)]'
                : 'text-[var(--text-tertiary, #5C6080)] hover:text-[var(--text-secondary, #9DA3BE)]'
            }`}
          >
            Timeline
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'export'
                ? 'text-[var(--accent-primary, #00C9A7)] border-b-2 border-[var(--accent-primary, #00C9A7)]'
                : 'text-[var(--text-tertiary, #5C6080)] hover:text-[var(--text-secondary, #9DA3BE)]'
            }`}
          >
            Export
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {isLoading && (
            <div className="flex items-center justify-center h-32">
              <div className="text-[var(--text-tertiary, #5C6080)]">Loading checkpoints...</div>
            </div>
          )}

          {error && (
            <div className="m-4 p-4 bg-[var(--semantic-error, #F7678E)]/10 border border-[var(--semantic-error, #F7678E)]/20 rounded text-[var(--semantic-error, #F7678E)] text-sm">
              {error}
            </div>
          )}

          {!isLoading && !error && activeTab === 'timeline' && (
            <div className="p-4">
              {checkpointGroups.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📌</div>
                  <div className="text-[var(--text-tertiary, #5C6080)] mb-2">No checkpoints yet</div>
                  <div className="text-sm text-[var(--border-strong, #3D4163)]">
                    Press <kbd className="px-2 py-1 bg-[var(--border-default, #292E44)] rounded text-xs">Ctrl+Shift+S</kbd> to
                    create a checkpoint
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {checkpointGroups.map((group) => (
                    <div key={group.sessionId} className="checkpoint-group">
                      <div className="text-xs font-semibold text-[var(--text-tertiary, #5C6080)] uppercase tracking-wider mb-3">
                        Session: {group.sessionName}
                      </div>
                      <div className="space-y-3">
                        {group.checkpoints.map((checkpoint) => (
                          <div
                            key={checkpoint.id}
                            className="bg-[var(--border-default, #292E44)]/50 rounded-lg p-4 hover:bg-[var(--border-default, #292E44)] transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <div className="text-xl pt-1">📌</div>
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-[var(--text-secondary, #9DA3BE)] mb-1 truncate">
                                  {checkpoint.name}
                                </div>
                                <div className="text-xs text-[var(--text-tertiary, #5C6080)] mb-2">
                                  {formatRelativeTime(checkpoint.createdAt)}
                                  {checkpoint.tags && checkpoint.tags.length > 0 && (
                                    <span className="ml-2">
                                      {checkpoint.tags.map((tag) => (
                                        <span
                                          key={tag}
                                          className="inline-block px-2 py-0.5 bg-[var(--accent-primary, #00C9A7)]/10 text-[var(--accent-primary, #00C9A7)] rounded text-xs mr-1"
                                        >
                                          {tag}
                                        </span>
                                      ))}
                                    </span>
                                  )}
                                </div>
                                {checkpoint.description && (
                                  <div className="text-sm text-[var(--text-tertiary, #5C6080)] mb-3">
                                    {checkpoint.description}
                                  </div>
                                )}
                                {checkpoint.conversationSummary && (
                                  <div className="text-xs text-[var(--border-strong, #3D4163)] bg-[var(--surface-overlay, #1A1B26)] rounded p-2 mb-3 font-mono overflow-hidden">
                                    <div className="line-clamp-3">{checkpoint.conversationSummary}</div>
                                  </div>
                                )}
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleCopy(checkpoint.id)}
                                    className="text-xs px-3 py-1.5 bg-[var(--accent-primary, #00C9A7)]/10 text-[var(--accent-primary, #00C9A7)] rounded hover:bg-[var(--accent-primary, #00C9A7)]/20 transition-colors"
                                  >
                                    Copy
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedCheckpoint(checkpoint);
                                      setActiveTab('export');
                                    }}
                                    className="text-xs px-3 py-1.5 bg-[var(--text-tertiary, #5C6080)]/10 text-[var(--text-secondary, #9DA3BE)] rounded hover:bg-[var(--text-tertiary, #5C6080)]/20 transition-colors"
                                  >
                                    Export
                                  </button>
                                  <button
                                    onClick={() => handleDelete(checkpoint.id)}
                                    className="text-xs px-3 py-1.5 bg-[var(--semantic-error, #F7678E)]/10 text-[var(--semantic-error, #F7678E)] rounded hover:bg-[var(--semantic-error, #F7678E)]/20 transition-colors ml-auto"
                                  >
                                    Delete
                                  </button>
                                </div>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {!isLoading && !error && activeTab === 'export' && (
            <div className="p-4">
              {selectedCheckpoint ? (
                <div className="space-y-4">
                  <div className="bg-[var(--border-default, #292E44)]/50 rounded-lg p-4">
                    <div className="text-sm font-medium text-[var(--text-secondary, #9DA3BE)] mb-2">Selected Checkpoint</div>
                    <div className="text-lg font-semibold text-[var(--text-secondary, #9DA3BE)] mb-1">
                      {selectedCheckpoint.name}
                    </div>
                    <div className="text-xs text-[var(--text-tertiary, #5C6080)]">
                      {formatRelativeTime(selectedCheckpoint.createdAt)}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <div className="text-sm font-medium text-[var(--text-secondary, #9DA3BE)]">Export Format</div>

                    <button
                      onClick={() => handleExportToFile(selectedCheckpoint.id, 'markdown')}
                      disabled={isExporting}
                      className="w-full px-4 py-3 bg-[var(--border-default, #292E44)] hover:bg-[#343b58] rounded-lg transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-medium text-[var(--text-secondary, #9DA3BE)] mb-1">Markdown (.md)</div>
                      <div className="text-xs text-[var(--text-tertiary, #5C6080)]">
                        Human-readable format with conversation history
                      </div>
                    </button>

                    <button
                      onClick={() => handleExportToFile(selectedCheckpoint.id, 'json')}
                      disabled={isExporting}
                      className="w-full px-4 py-3 bg-[var(--border-default, #292E44)] hover:bg-[#343b58] rounded-lg transition-colors text-left disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <div className="font-medium text-[var(--text-secondary, #9DA3BE)] mb-1">JSON (.json)</div>
                      <div className="text-xs text-[var(--text-tertiary, #5C6080)]">Structured data for programmatic access</div>
                    </button>
                  </div>

                  {isExporting && (
                    <div className="text-center py-4 text-[var(--text-tertiary, #5C6080)]">
                      Exporting checkpoint...
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-12">
                  <div className="text-4xl mb-4">📦</div>
                  <div className="text-[var(--text-tertiary, #5C6080)] mb-2">No checkpoint selected</div>
                  <div className="text-sm text-[var(--border-strong, #3D4163)]">
                    Select a checkpoint from the Timeline tab to export
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
