import { useState, useCallback, useEffect, useMemo } from 'react';
import type { GitFileEntry, GitDiffResult, GitFileArea } from '../../shared/types/git-types';

interface UseDiffViewerOptions {
  files: GitFileEntry[];
  viewDiff: (filePath: string, staged: boolean) => Promise<void>;
  viewFileContent: (filePath: string) => Promise<void>;
  stageFiles: (files: string[]) => Promise<void>;
  unstageFiles: (files: string[]) => Promise<void>;
  discardFile: (filePath: string) => Promise<void>;
  selectedDiff: GitDiffResult | null;
}

export function useDiffViewer({
  files,
  viewDiff,
  viewFileContent,
  stageFiles,
  unstageFiles,
  discardFile,
  selectedDiff,
}: UseDiffViewerOptions) {
  const [activeFile, setActiveFile] = useState<GitFileEntry | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Ordered file list for J/K navigation: staged → unstaged → untracked → conflicted
  const orderedFiles = useMemo(() => {
    const order: GitFileArea[] = ['staged', 'unstaged', 'untracked', 'conflicted'];
    return [...files].sort((a, b) => order.indexOf(a.area) - order.indexOf(b.area));
  }, [files]);

  const loadDiff = useCallback(async (file: GitFileEntry) => {
    setActiveFile(file);
    setIsLoading(true);
    try {
      if (file.area === 'untracked') {
        await viewFileContent(file.path);
      } else {
        await viewDiff(file.path, file.area === 'staged');
      }
    } finally {
      setIsLoading(false);
    }
  }, [viewDiff, viewFileContent]);

  const navigateNext = useCallback(() => {
    if (!activeFile || orderedFiles.length === 0) return;
    const idx = orderedFiles.findIndex(
      f => f.path === activeFile.path && f.area === activeFile.area
    );
    const next = orderedFiles[(idx + 1) % orderedFiles.length];
    if (next) loadDiff(next);
  }, [activeFile, orderedFiles, loadDiff]);

  const navigatePrev = useCallback(() => {
    if (!activeFile || orderedFiles.length === 0) return;
    const idx = orderedFiles.findIndex(
      f => f.path === activeFile.path && f.area === activeFile.area
    );
    const prev = orderedFiles[(idx - 1 + orderedFiles.length) % orderedFiles.length];
    if (prev) loadDiff(prev);
  }, [activeFile, orderedFiles, loadDiff]);

  const stageActive = useCallback(async () => {
    if (!activeFile) return;
    if (activeFile.area === 'unstaged' || activeFile.area === 'untracked') {
      await stageFiles([activeFile.path]);
    }
  }, [activeFile, stageFiles]);

  const unstageActive = useCallback(async () => {
    if (!activeFile) return;
    if (activeFile.area === 'staged') {
      await unstageFiles([activeFile.path]);
    }
  }, [activeFile, unstageFiles]);

  const discardActive = useCallback(async () => {
    if (!activeFile) return;
    if (activeFile.area === 'unstaged') {
      await discardFile(activeFile.path);
    }
  }, [activeFile, discardFile]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed(prev => !prev);
  }, []);

  // Keyboard handler — to be registered in the DiffViewer component
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't handle if user is typing in an input
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.key === 'j' || e.key === 'J') {
      e.preventDefault();
      navigateNext();
    } else if (e.key === 'k' || e.key === 'K') {
      e.preventDefault();
      navigatePrev();
    } else if (e.key === 'Enter' && e.ctrlKey) {
      e.preventDefault();
      if (activeFile?.area === 'staged') {
        unstageActive();
      } else {
        stageActive();
      }
    } else if (e.key === 'b' && e.ctrlKey) {
      e.preventDefault();
      toggleSidebar();
    }
  }, [navigateNext, navigatePrev, stageActive, unstageActive, activeFile, toggleSidebar]);

  // Update activeFile reference when files change (e.g. after stage/unstage)
  useEffect(() => {
    if (!activeFile) return;
    const updated = files.find(f => f.path === activeFile.path);
    if (updated && updated.area !== activeFile.area) {
      setActiveFile(updated);
    } else if (!updated) {
      // File was removed from status (e.g. discarded) — navigate to next or clear
      if (orderedFiles.length > 0) {
        loadDiff(orderedFiles[0]);
      } else {
        setActiveFile(null);
      }
    }
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    activeFile,
    diff: selectedDiff,
    isLoading,
    sidebarCollapsed,
    loadDiff,
    navigateNext,
    navigatePrev,
    stageActive,
    unstageActive,
    discardActive,
    toggleSidebar,
    handleKeyDown,
    orderedFiles,
  };
}
