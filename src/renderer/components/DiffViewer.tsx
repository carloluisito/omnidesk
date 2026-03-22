import { useEffect, useState } from 'react';
import type { GitFileEntry, GitDiffResult } from '../../shared/types/git-types';
import { useDiffViewer } from '../hooks/useDiffViewer';
import { DiffViewerHeader } from './DiffViewerHeader';
import { DiffFileNav } from './DiffFileNav';
import { DiffContentArea } from './DiffContentArea';
import { ConfirmDialog } from './ui';

interface DiffViewerProps {
  isOpen: boolean;
  initialFile: GitFileEntry | null;
  files: GitFileEntry[];
  selectedDiff: GitDiffResult | null;
  onClose: () => void;
  viewDiff: (filePath: string, staged: boolean) => Promise<void>;
  viewFileContent: (filePath: string) => Promise<void>;
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  discardFile: (filePath: string) => Promise<void>;
}

export function DiffViewer({
  isOpen,
  initialFile,
  files,
  selectedDiff,
  onClose,
  viewDiff,
  viewFileContent,
  stageFiles,
  unstageFiles,
  discardFile,
}: DiffViewerProps) {
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);

  const viewer = useDiffViewer({
    files,
    viewDiff,
    viewFileContent,
    stageFiles,
    unstageFiles,
    discardFile,
    selectedDiff,
  });

  // Load initial file when viewer opens
  useEffect(() => {
    if (isOpen && initialFile) {
      viewer.loadDiff(initialFile);
    }
  }, [isOpen, initialFile]); // eslint-disable-line react-hooks/exhaustive-deps

  // Register keyboard handler
  useEffect(() => {
    if (!isOpen) return;

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      viewer.handleKeyDown(e);
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose, viewer.handleKeyDown]);

  if (!isOpen) return null;

  return (
    <>
      <div className="diff-viewer-backdrop" onClick={onClose} />
      <div className="diff-viewer-overlay" role="dialog" aria-label="Diff Viewer">
        <DiffViewerHeader
          file={viewer.activeFile}
          onStage={viewer.stageActive}
          onUnstage={viewer.unstageActive}
          onDiscard={() => setShowDiscardConfirm(true)}
          onClose={onClose}
        />
        <div className="diff-viewer-body">
          <DiffFileNav
            files={files}
            activeFile={viewer.activeFile}
            collapsed={viewer.sidebarCollapsed}
            onFileSelect={(file) => viewer.loadDiff(file)}
          />
          <DiffContentArea
            file={viewer.activeFile}
            diff={viewer.diff}
            isLoading={viewer.isLoading}
          />
        </div>
      </div>

      <ConfirmDialog
        isOpen={showDiscardConfirm}
        title="Discard Changes?"
        message={`Discard all changes to ${viewer.activeFile?.path || 'this file'}? This cannot be undone.`}
        confirmLabel="Discard"
        cancelLabel="Cancel"
        isDangerous={true}
        onConfirm={() => {
          viewer.discardActive();
          setShowDiscardConfirm(false);
        }}
        onCancel={() => setShowDiscardConfirm(false)}
      />

      <style>{diffViewerStyles}</style>
    </>
  );
}

const diffViewerStyles = `
  .diff-viewer-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    z-index: 9000;
  }

  .diff-viewer-overlay {
    position: fixed;
    top: 56px;
    left: 20px;
    right: 20px;
    bottom: 20px;
    z-index: 9001;
    background: var(--surface-overlay);
    border: 1px solid var(--border-default);
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5);
    animation: diffViewerFadeIn 150ms ease-out;
  }

  @keyframes diffViewerFadeIn {
    from { opacity: 0; transform: scale(0.98); }
    to { opacity: 1; transform: scale(1); }
  }

  /* ── Header ── */
  .diff-viewer-header {
    height: 48px;
    padding: 0 16px;
    background: var(--surface-float);
    border-bottom: 1px solid var(--border-default);
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-shrink: 0;
  }

  .diff-viewer-header-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
    flex: 1;
  }

  .diff-viewer-filepath {
    font-size: 13px;
    color: var(--text-primary);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    direction: rtl;
    text-align: left;
  }

  .diff-viewer-badge {
    font-size: 11px;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    padding: 2px 8px;
    border-radius: 3px;
    flex-shrink: 0;
    font-weight: 600;
  }

  .diff-viewer-header-right {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
  }

  .diff-viewer-action-btn {
    padding: 5px 12px;
    border: 1px solid;
    border-radius: 4px;
    font-size: 12px;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    cursor: pointer;
    background: transparent;
    font-weight: 500;
  }

  .diff-viewer-stage-btn {
    color: var(--semantic-success);
    border-color: var(--semantic-success);
  }
  .diff-viewer-stage-btn:hover { background: rgba(61, 214, 140, 0.15); }

  .diff-viewer-unstage-btn {
    color: var(--semantic-warning);
    border-color: var(--semantic-warning);
  }
  .diff-viewer-unstage-btn:hover { background: color-mix(in srgb, var(--semantic-warning) 15%, transparent); }

  .diff-viewer-discard-btn {
    color: var(--semantic-error);
    border-color: var(--semantic-error);
  }
  .diff-viewer-discard-btn:hover { background: color-mix(in srgb, var(--semantic-error) 15%, transparent); }

  .diff-viewer-close-btn {
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: none;
    border: none;
    color: var(--text-tertiary);
    cursor: pointer;
    border-radius: 4px;
  }

  .diff-viewer-close-btn:hover { background: var(--border-default); color: var(--text-primary); }

  /* ── Body ── */
  .diff-viewer-body {
    flex: 1;
    display: flex;
    min-height: 0;
    overflow: hidden;
  }

  /* ── File Nav Sidebar ── */
  .diff-file-nav {
    width: 240px;
    flex-shrink: 0;
    background: var(--surface-overlay);
    border-right: 1px solid var(--border-default);
    overflow-y: auto;
  }

  .diff-nav-section { border-bottom: 1px solid var(--border-default); }

  .diff-nav-section-header {
    padding: 8px 12px;
    display: flex;
    align-items: center;
    gap: 6px;
    cursor: pointer;
    background: var(--surface-float);
    border-left: 3px solid;
    user-select: none;
  }

  .diff-nav-section-header:hover { background: var(--surface-high); }

  .diff-nav-section-title {
    font-size: 10px;
    font-weight: 600;
    color: var(--text-primary);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    flex: 1;
  }

  .diff-nav-section-count {
    font-size: 10px;
    color: var(--text-tertiary);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
  }

  .diff-nav-file {
    padding: 6px 12px 6px 24px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    cursor: pointer;
    border-left: 3px solid transparent;
    transition: background 100ms;
  }

  .diff-nav-file:hover { background: var(--surface-float); }

  .diff-nav-file.active {
    background: color-mix(in srgb, var(--accent-primary) 10%, transparent);
    border-left-color: var(--accent-primary);
  }

  .diff-nav-file-name {
    font-size: 12px;
    color: var(--text-primary);
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    flex: 1;
    min-width: 0;
  }

  .diff-nav-file-status {
    font-size: 11px;
    font-weight: 600;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    flex-shrink: 0;
    margin-left: 6px;
  }

  /* ── Content Area ── */
  .diff-content-area {
    flex: 1;
    overflow-y: auto;
    min-width: 0;
  }

  .diff-content-empty {
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-size: 13px;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    color: var(--text-tertiary);
  }

  .diff-content-spinner {
    width: 20px;
    height: 20px;
    border: 2px solid var(--border-default);
    border-top-color: var(--accent-primary);
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  .diff-content-banner {
    padding: 8px 16px;
    font-size: 12px;
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .diff-content-banner-new {
    background: rgba(61, 214, 140, 0.1);
    color: var(--semantic-success);
    border-bottom: 1px solid rgba(61, 214, 140, 0.2);
  }

  .diff-content-banner-deleted {
    background: color-mix(in srgb, var(--semantic-error) 10%, transparent);
    color: var(--semantic-error);
    border-bottom: 1px solid color-mix(in srgb, var(--semantic-error) 20%, transparent);
  }

  .diff-content-banner-truncated {
    background: color-mix(in srgb, var(--semantic-warning) 10%, transparent);
    color: var(--semantic-warning);
    border-bottom: 1px solid color-mix(in srgb, var(--semantic-warning) 20%, transparent);
  }

  .diff-content-lines {
    font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
    font-size: 12px;
    line-height: 1.5;
  }

  /* ── Chunk header ── */
  .diff-chunk-header {
    display: flex;
    background: color-mix(in srgb, var(--accent-primary) 8%, transparent);
    padding: 4px 0;
    position: sticky;
    top: 0;
    z-index: 1;
  }

  .diff-chunk-gutter {
    width: 50px;
    flex-shrink: 0;
  }

  .diff-chunk-text {
    flex: 1;
    color: var(--accent-primary);
    font-style: italic;
    padding: 0 12px;
  }

  /* ── Diff lines ── */
  .diff-line {
    display: flex;
    min-height: 18px;
  }

  .diff-line-add {
    background: rgba(61, 214, 140, 0.12);
  }

  .diff-line-remove {
    background: color-mix(in srgb, var(--semantic-error) 12%, transparent);
  }

  .diff-line-context {
    background: transparent;
  }

  .diff-line-gutter {
    width: 50px;
    flex-shrink: 0;
    text-align: right;
    padding-right: 8px;
    color: var(--text-tertiary);
    user-select: none;
    box-sizing: border-box;
  }

  .diff-line-gutter-old {
    border-right: 1px solid var(--border-default);
  }

  .diff-line-prefix {
    width: 16px;
    flex-shrink: 0;
    text-align: center;
    user-select: none;
  }

  .diff-line-add .diff-line-prefix { color: var(--semantic-success); }
  .diff-line-remove .diff-line-prefix { color: var(--semantic-error); }
  .diff-line-context .diff-line-prefix { color: var(--text-tertiary); }

  .diff-line-content {
    flex: 1;
    white-space: pre;
    overflow-x: auto;
    padding-right: 16px;
    color: var(--text-secondary);
  }

  .diff-line-add .diff-line-content { color: var(--semantic-success); }
  .diff-line-remove .diff-line-content { color: var(--semantic-error); }

  /* Scrollbar styling */
  .diff-content-area::-webkit-scrollbar,
  .diff-file-nav::-webkit-scrollbar {
    width: 6px;
  }

  .diff-content-area::-webkit-scrollbar-track,
  .diff-file-nav::-webkit-scrollbar-track {
    background: transparent;
  }

  .diff-content-area::-webkit-scrollbar-thumb,
  .diff-file-nav::-webkit-scrollbar-thumb {
    background: var(--border-default);
    border-radius: 3px;
  }

  .diff-content-area::-webkit-scrollbar-thumb:hover,
  .diff-file-nav::-webkit-scrollbar-thumb:hover {
    background: var(--border-strong);
  }
`;
