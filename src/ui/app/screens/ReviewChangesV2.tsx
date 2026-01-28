/**
 * ReviewChangesV2.tsx - Enhanced Diff/Change Review Screen
 * Uses new V2 components with Shiki syntax highlighting
 */

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BackgroundTexture } from '../components/ui/BackgroundTexture';
import { ReviewTopBar } from '../components/review';
import { ReviewLayout } from '../components/review/ReviewLayout';
import { FileTree } from '../components/review/FileTree';
import { DiffViewerV2, type DiffLine } from '../components/review/DiffViewerV2';
import { ApprovalSummary } from '../components/review/ApprovalSummary';
import { useTerminalStore } from '../store/terminalStore';
import { api } from '../lib/api';

interface ShipSummaryFile {
  path: string;
  insertions: number;
  deletions: number;
  status: 'added' | 'modified' | 'deleted' | 'renamed';
  oldPath?: string;
}

interface ShipSummary {
  files: ShipSummaryFile[];
  totalInsertions: number;
  totalDeletions: number;
  currentBranch: string;
  baseBranch: string;
  hasUncommittedChanges: boolean;
  hasChangesToShip: boolean;
}


// Parse git diff output into structured lines
function parseDiffLines(diffText: string): DiffLine[] {
  const lines = diffText.split('\n');
  const result: DiffLine[] = [];
  let oldLineNum = 0;
  let newLineNum = 0;

  for (const line of lines) {
    // Skip diff header lines
    if (line.startsWith('diff --git') || line.startsWith('index ') ||
        line.startsWith('---') || line.startsWith('+++') ||
        line.startsWith('Binary files')) {
      continue;
    }

    // Parse hunk header
    const hunkMatch = line.match(/^@@\s+-(\d+)(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunkMatch) {
      oldLineNum = parseInt(hunkMatch[1], 10);
      newLineNum = parseInt(hunkMatch[2], 10);
      result.push({
        type: 'context',
        content: line,
        oldLineNumber: undefined,
        newLineNumber: undefined,
      });
      continue;
    }

    if (line.startsWith('+')) {
      result.push({
        type: 'added',
        content: line.slice(1),
        oldLineNumber: undefined,
        newLineNumber: newLineNum++,
      });
    } else if (line.startsWith('-')) {
      result.push({
        type: 'removed',
        content: line.slice(1),
        oldLineNumber: oldLineNum++,
        newLineNumber: undefined,
      });
    } else if (line.startsWith(' ') || line === '') {
      result.push({
        type: 'context',
        content: line.startsWith(' ') ? line.slice(1) : line,
        oldLineNumber: oldLineNum++,
        newLineNumber: newLineNum++,
      });
    }
  }

  return result;
}


export default function ReviewChangesV2() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const { sessions } = useTerminalStore();
  const session = sessions.find((s) => s.id === sessionId);

  // State
  const [files, setFiles] = useState<ShipSummaryFile[]>([]);
  const [approvedPaths, setApprovedPaths] = useState<Set<string>>(new Set());
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [diffLines, setDiffLines] = useState<DiffLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [viewMode, setViewMode] = useState<'unified' | 'split'>('unified');

  // Get selected file info
  const selectedFile = useMemo(() => {
    return files.find(f => f.path === selectedPath);
  }, [files, selectedPath]);

  // Convert files to FileTree format (flat list with correct field names)
  const fileTreeData = useMemo(() => {
    return files.map(f => ({
      path: f.path,
      status: f.status,
      additions: f.insertions,
      deletions: f.deletions,
      approved: approvedPaths.has(f.path),
    }));
  }, [files, approvedPaths]);

  // Compute total file change count from session messages for reactive updates
  const fileChangeCount = useMemo(() => {
    if (!session?.messages) return 0;
    return session.messages.reduce(
      (sum, m) => sum + (m.fileChanges?.length || 0),
      0
    );
  }, [session?.messages]);

  // Load ship summary to get file list
  const loadFiles = useCallback(async () => {
    if (!sessionId) return;
    setLoading(prev => prev); // don't flash spinner on re-fetches
    try {
      const summary = await api<ShipSummary>(
        'GET',
        `/terminal/sessions/${sessionId}/ship-summary`
      );
      setFiles(summary.files);
      setSelectedPath(prev =>
        prev && summary.files.some(f => f.path === prev)
          ? prev
          : summary.files[0]?.path || null
      );
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Load diff for selected file
  const loadDiff = useCallback(async (filePath: string) => {
    if (!sessionId) return;
    setLoadingDiff(true);
    try {
      const data = await api<{ diff: string }>(
        'POST',
        `/terminal/sessions/${sessionId}/file-diff`,
        { filePath, staged: false }
      );
      const parsed = parseDiffLines(data.diff || '');
      setDiffLines(parsed);
    } catch (error) {
      console.error('Failed to load diff:', error);
      setDiffLines([]);
    } finally {
      setLoadingDiff(false);
    }
  }, [sessionId]);

  // Load files on mount
  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Re-fetch when session transitions from running → idle
  const prevStatusRef = useRef(session?.status);

  useEffect(() => {
    const prev = prevStatusRef.current;
    prevStatusRef.current = session?.status;

    if (prev === 'running' && session?.status === 'idle') {
      loadFiles();
    }
  }, [session?.status, loadFiles]);

  // Re-fetch (debounced) when file changes arrive mid-prompt
  const prevFileChangeCountRef = useRef(fileChangeCount);

  useEffect(() => {
    if (fileChangeCount > prevFileChangeCountRef.current) {
      prevFileChangeCountRef.current = fileChangeCount;
      const timer = setTimeout(() => loadFiles(), 800);
      return () => clearTimeout(timer);
    }
    prevFileChangeCountRef.current = fileChangeCount;
  }, [fileChangeCount, loadFiles]);

  // Load diff when selected file changes
  useEffect(() => {
    if (selectedPath) {
      loadDiff(selectedPath);
    }
  }, [selectedPath, loadDiff]);

  // Toggle file approval
  const handleApprove = useCallback((path: string) => {
    setApprovedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  }, []);

  // Approve all files
  const handleApproveAll = useCallback(() => {
    setApprovedPaths(new Set(files.map(f => f.path)));
  }, [files]);

  // Reject all files
  const handleRejectAll = useCallback(() => {
    setApprovedPaths(new Set());
  }, []);

  // Navigate to pre-ship
  const handleProceed = useCallback(() => {
    navigate(`/pre-ship?sessionId=${sessionId}`);
  }, [navigate, sessionId]);

  // Redirect if no session
  if (!sessionId) {
    return (
      <div className="h-screen flex flex-col overflow-hidden bg-[#05070c] text-white items-center justify-center">
        <div className="text-center">
          <p className="text-white/50">No session specified</p>
          <button
            onClick={() => navigate('/terminal')}
            className="mt-4 rounded-2xl bg-white/10 px-4 py-2 text-sm hover:bg-white/15"
          >
            Back to Terminal
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-[#05070c] text-white">
      <BackgroundTexture />

      <div className="relative flex-1 flex flex-col overflow-hidden min-h-0">
        <ReviewTopBar
          title="Review Changes"
          subtitle="Inspect diffs before committing and shipping"
          sessionId={sessionId}
        />

        <div className="flex-1 flex flex-col overflow-hidden min-h-0 w-full p-4">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            </div>
          ) : (
            <ReviewLayout
              fileList={
                <FileTree
                  files={fileTreeData}
                  selectedPath={selectedPath || undefined}
                  onSelectFile={setSelectedPath}
                  onApproveFile={handleApprove}
                  showApprovalActions={true}
                />
              }
              diffViewer={
                selectedPath && selectedFile ? (
                  <DiffViewerV2
                    filePath={selectedPath}
                    language={selectedPath.split('.').pop() || 'text'}
                    lines={diffLines}
                    viewMode={viewMode}
                    onViewModeChange={setViewMode}
                    isLoading={loadingDiff}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-white/50">
                    Select a file to view changes
                  </div>
                )
              }
              summary={
                <ApprovalSummary
                  totalFiles={files.length}
                  approvedFiles={approvedPaths.size}
                  additions={files.reduce((sum, f) => sum + f.insertions, 0)}
                  deletions={files.reduce((sum, f) => sum + f.deletions, 0)}
                  onApproveAll={handleApproveAll}
                  onRejectAll={handleRejectAll}
                  onProceed={handleProceed}
                  canProceed={approvedPaths.size === files.length}
                />
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
