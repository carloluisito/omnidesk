/**
 * ReviewChanges.tsx - Diff/Change Review Screen
 * Full-screen review page to approve file changes before shipping
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { BackgroundTexture } from '../components/ui/BackgroundTexture';
import {
  ReviewTopBar,
  ReviewFileList,
  ReviewDiffViewer,
  ReviewSummaryPanel,
  ReviewFile,
} from '../components/review';
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

export default function ReviewChanges() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const sessionId = searchParams.get('sessionId');

  const { sessions } = useTerminalStore();
  const session = sessions.find((s) => s.id === sessionId);

  // File list with approval state
  const [files, setFiles] = useState<ReviewFile[]>([]);
  const [selectedFile, setSelectedFile] = useState<ReviewFile | null>(null);
  const [diffLines, setDiffLines] = useState<string[]>([]);
  const [fileContent, setFileContent] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingDiff, setLoadingDiff] = useState(false);

  // Load ship summary to get file list
  const loadFiles = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const summary = await api<ShipSummary>(
        'GET',
        `/terminal/sessions/${sessionId}/ship-summary`
      );
      const reviewFiles: ReviewFile[] = summary.files.map((f) => ({
        path: f.path,
        status: f.status === 'added' ? 'created' : f.status === 'renamed' ? 'modified' : f.status,
        approved: false,
      }));
      setFiles(reviewFiles);
      if (reviewFiles.length > 0) {
        setSelectedFile(reviewFiles[0]);
      }
    } catch (error) {
      console.error('Failed to load files:', error);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  // Load diff for selected file
  const loadDiff = useCallback(async (filePath: string, fileStatus: string) => {
    if (!sessionId) return;
    setLoadingDiff(true);
    setFileContent([]);
    try {
      const data = await api<{ diff: string }>(
        'POST',
        `/terminal/sessions/${sessionId}/file-diff`,
        { filePath, staged: false }
      );
      const lines = data.diff ? data.diff.split('\n') : [];
      setDiffLines(lines);

      // For created/deleted files with no diff, load the file content
      if (lines.length === 0 && (fileStatus === 'created' || fileStatus === 'deleted')) {
        try {
          const contentData = await api<{ content: string }>(
            'POST',
            `/terminal/sessions/${sessionId}/read-file`,
            { filePath }
          );
          setFileContent(contentData.content ? contentData.content.split('\n') : []);
        } catch {
          // File might not be readable (e.g., binary file or deleted)
          setFileContent([]);
        }
      }
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

  // Load diff when selected file changes
  useEffect(() => {
    if (selectedFile) {
      loadDiff(selectedFile.path, selectedFile.status);
    }
  }, [selectedFile, loadDiff]);

  // Toggle file approval
  const toggleApproval = useCallback((path: string) => {
    setFiles((prev) =>
      prev.map((f) => (f.path === path ? { ...f, approved: !f.approved } : f))
    );
  }, []);

  // Approve all files
  const approveAll = useCallback(() => {
    setFiles((prev) => prev.map((f) => ({ ...f, approved: true })));
  }, []);

  // Select file
  const selectFile = useCallback((path: string) => {
    const file = files.find((f) => f.path === path);
    if (file) {
      setSelectedFile(file);
    }
  }, [files]);

  // Calculate approval stats
  const approvedCount = useMemo(() => files.filter((f) => f.approved).length, [files]);
  const totalCount = files.length;

  // Navigate to pre-ship
  const proceedToShip = useCallback(() => {
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

        <div className="flex-1 flex flex-col overflow-hidden min-h-0 w-full px-6 pt-6">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/20 border-t-white/70" />
            </div>
          ) : (
            <div className="flex-1 flex flex-col gap-4 lg:flex-row overflow-hidden min-h-0">
              {/* File list - 1/4 width */}
              <div className="space-y-2 lg:w-1/4 overflow-y-auto min-h-0">
                <ReviewFileList
                  files={files}
                  selectedPath={selectedFile?.path}
                  onSelectFile={selectFile}
                  onToggleApproval={toggleApproval}
                />
              </div>

              {/* Diff viewer - 1/2 width */}
              <div className="lg:flex-1 flex flex-col min-h-0 overflow-hidden">
                {selectedFile ? (
                  <div className="flex-1 overflow-y-auto min-h-0">
                    <ReviewDiffViewer
                      filePath={selectedFile.path}
                      status={selectedFile.status}
                      diffLines={diffLines}
                      fileContent={fileContent}
                      isLoading={loadingDiff}
                      isApproved={files.find((f) => f.path === selectedFile.path)?.approved ?? false}
                      onApprove={() => toggleApproval(selectedFile.path)}
                    />
                  </div>
                ) : (
                  <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10 flex items-center justify-center flex-1">
                    <span className="text-white/50">Select a file to view diff</span>
                  </div>
                )}
              </div>

              {/* Summary panel - 1/4 width */}
              <div className="lg:w-1/4 flex-shrink-0">
                <ReviewSummaryPanel
                  total={totalCount}
                  approved={approvedCount}
                  onProceedToShip={proceedToShip}
                  onApproveAll={approveAll}
                />
              </div>
            </div>
          )}

          <div className="mt-4 pb-4 flex-shrink-0 text-center text-xs text-white/45">
            Tip: Approving diffs is your last safety net before code hits the repository.
          </div>
        </div>
      </div>
    </div>
  );
}
