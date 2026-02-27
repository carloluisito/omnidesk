import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from 'xterm';
import { FitAddon } from 'xterm-addon-fit';
import { WebLinksAddon } from 'xterm-addon-web-links';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { DragDropOverlay } from './DragDropOverlay';
import { DragDropContextMenu } from './DragDropContextMenu';
import { ClaudeReadinessProgress } from './ui/ClaudeReadinessProgress';
import { FileInfo, DragDropSettings, DragDropInsertMode, PathFormat } from '../../shared/ipc-types';
import type { ProviderId } from '../../shared/types/provider-types';
import { isClaudeReady as checkClaudeReadyPatterns, findClaudeOutputStart } from '../../shared/claude-detector';
import 'xterm/css/xterm.css';

// Utility function to format paths for terminal (renderer-side implementation)
function formatPathForTerminal(filePath: string, format: PathFormat): string {
  const isWindows = navigator.platform.toLowerCase().includes('win');

  // Normalize path separators for platform
  let formatted = isWindows
    ? filePath.replace(/\//g, '\\')
    : filePath.replace(/\\/g, '/');

  switch (format) {
    case 'quoted':
      // Quote paths with spaces or special characters
      if (formatted.includes(' ') || formatted.includes('(') || formatted.includes(')')) {
        formatted = `"${formatted}"`;
      }
      break;

    case 'escaped':
      // Escape spaces and special characters
      formatted = formatted
        .replace(/ /g, '\\ ')
        .replace(/\(/g, '\\(')
        .replace(/\)/g, '\\)')
        .replace(/&/g, '\\&')
        .replace(/\$/g, '\\$');
      break;

    case 'unquoted':
    default:
      // No transformation
      break;
  }

  return formatted;
}

interface TerminalProps {
  sessionId: string;
  isVisible: boolean; // Terminal is displayed in a pane
  isFocused: boolean; // Terminal has keyboard focus
  providerId?: ProviderId; // For provider-aware loading overlay copy
  readOnly?: boolean;  // Observer mode: disables input forwarding, shows overlay
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onReady: (sessionId: string, terminal: XTerm, checkClaudeReady: (data: string) => void) => void;
}

function providerIdToName(providerId?: ProviderId): string | undefined {
  if (providerId === 'claude') return 'Claude Code';
  if (providerId === 'codex')  return 'Codex CLI';
  return undefined;
}

export function Terminal({ sessionId, isVisible, isFocused, providerId, readOnly = false, onInput, onResize, onReady }: TerminalProps) {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);
  const handleResizeRef = useRef<() => void>(() => {});
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isClaudeReady, setIsClaudeReady] = useState(false);

  // Drag-drop state
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFiles, setDraggedFiles] = useState<FileInfo[]>([]);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [contextMenuPos, setContextMenuPos] = useState({ x: 0, y: 0 });
  const [pendingFiles, setPendingFiles] = useState<FileInfo[]>([]);
  const [settings, setSettings] = useState<DragDropSettings | null>(null);
  const dropQueueRef = useRef<Array<{ files: FileInfo[]; mode: DragDropInsertMode }>>([]);

  // Load drag-drop settings
  useEffect(() => {
    const loadSettings = async () => {
      try {
        const appSettings = await window.electronAPI.getSettings();
        if (appSettings.dragDropSettings) {
          setSettings(appSettings.dragDropSettings);
        }
      } catch (err) {
        console.error('Failed to load drag-drop settings:', err);
      }
    };
    loadSettings();
  }, []);

  // Process drop queue when Claude becomes ready
  useEffect(() => {
    if (isClaudeReady && dropQueueRef.current.length > 0) {
      const queue = [...dropQueueRef.current];
      dropQueueRef.current = [];
      queue.forEach(({ files, mode }) => {
        insertFiles(files, mode);
      });
    }
  }, [isClaudeReady]);

  // Track Shift key state
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(true);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') {
        setIsShiftPressed(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  const insertFiles = useCallback(async (files: FileInfo[], mode: DragDropInsertMode) => {
    if (!xtermRef.current || !settings) return;

    try {
      const parts: string[] = [];

      for (const file of files) {
        if (mode === 'content') {
          // Insert file content
          if (file.isBinary) {
            console.warn('Skipping binary file:', file.name);
            continue;
          }

          const maxSize = settings.categoryOverrides[file.category]?.maxSizeKB ?? settings.maxContentSizeKB;
          const result = await window.electronAPI.readFileContent(file.path, maxSize);

          if (result.truncated) {
            parts.push(`# ${file.name} (truncated to ${maxSize}KB)\n${result.content}`);
          } else {
            parts.push(`# ${file.name}\n${result.content}`);
          }
        } else {
          // Insert file path
          const formatted = formatPathForTerminal(file.path, settings.pathFormat);
          parts.push(formatted);
        }
      }

      if (parts.length > 0) {
        const separator = settings.multiFileSeparator === 'newline' ? '\n' : ' ';
        const text = parts.join(separator);
        xtermRef.current.paste(text);
      }
    } catch (err) {
      console.error('Failed to insert files:', err);
    }
  }, [settings]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isVisible) return;

    setIsDragging(true);
  }, [isVisible]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    // Only clear if leaving the terminal container
    if (e.currentTarget === e.target) {
      setIsDragging(false);
      setDraggedFiles([]);
    }
  }, []);

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    setIsDragging(false);

    if (!isVisible || !settings) return;

    // Get file paths from drag event
    const filePaths: string[] = [];
    if (e.dataTransfer.files) {
      for (let i = 0; i < e.dataTransfer.files.length; i++) {
        const file = e.dataTransfer.files[i] as File & { path: string };
        filePaths.push(file.path);
      }
    }

    if (filePaths.length === 0) return;

    // Get file info
    const fileInfos = await window.electronAPI.getFileInfo(filePaths);
    if (fileInfos.length === 0) return;

    // Determine insert mode
    const effectiveMode = isShiftPressed ? 'content' : settings.defaultInsertMode;

    if (effectiveMode === 'ask') {
      // Show context menu
      setPendingFiles(fileInfos);
      setContextMenuPos({ x: e.clientX, y: e.clientY });
      setShowContextMenu(true);
    } else if (isClaudeReady) {
      // Insert immediately
      insertFiles(fileInfos, effectiveMode);
    } else {
      // Queue for later
      dropQueueRef.current.push({ files: fileInfos, mode: effectiveMode });
    }

    setDraggedFiles([]);
  }, [isVisible, isShiftPressed, settings, isClaudeReady, insertFiles]);

  // Update dragged files info on drag over
  useEffect(() => {
    if (!isDragging) return;

    const handleDragOverWindow = async (e: DragEvent) => {
      if (!e.dataTransfer?.items) return;

      const filePaths: string[] = [];
      for (let i = 0; i < e.dataTransfer.items.length; i++) {
        const item = e.dataTransfer.items[i];
        if (item.kind === 'file') {
          // We can't get file path here, just count
          filePaths.push(`file${i}`);
        }
      }

      if (filePaths.length > 0 && draggedFiles.length === 0) {
        // Create placeholder file infos
        const placeholders: FileInfo[] = filePaths.map((_, idx) => ({
          path: '',
          name: `File ${idx + 1}`,
          extension: '',
          sizeBytes: 0,
          category: 'other' as const,
          isBinary: false,
        }));
        setDraggedFiles(placeholders);
      }
    };

    window.addEventListener('dragover', handleDragOverWindow);
    return () => window.removeEventListener('dragover', handleDragOverWindow);
  }, [isDragging, draggedFiles.length]);

  const handleContextMenuInsertPath = useCallback(() => {
    setShowContextMenu(false);
    if (pendingFiles.length > 0) {
      if (isClaudeReady) {
        insertFiles(pendingFiles, 'path');
      } else {
        dropQueueRef.current.push({ files: pendingFiles, mode: 'path' });
      }
    }
    setPendingFiles([]);
  }, [pendingFiles, isClaudeReady, insertFiles]);

  const handleContextMenuInsertContent = useCallback(() => {
    setShowContextMenu(false);
    if (pendingFiles.length > 0) {
      if (isClaudeReady) {
        insertFiles(pendingFiles, 'content');
      } else {
        dropQueueRef.current.push({ files: pendingFiles, mode: 'content' });
      }
    }
    setPendingFiles([]);
  }, [pendingFiles, isClaudeReady, insertFiles]);

  const handleContextMenuCancel = useCallback(() => {
    setShowContextMenu(false);
    setPendingFiles([]);
  }, []);

  const handleResize = useCallback(() => {
    if (fitAddonRef.current && xtermRef.current && isVisible) {
      fitAddonRef.current.fit();
      const { cols, rows } = xtermRef.current;
      onResize(sessionId, cols, rows);
    }
  }, [sessionId, isVisible, onResize]);

  // Keep ref in sync so the init effect's ResizeObserver always uses the latest handleResize
  handleResizeRef.current = handleResize;

  const handleConfirmClose = useCallback(() => {
    setShowCloseConfirm(false);
    window.electronAPI.closeSession(sessionId);
  }, [sessionId]);

  const handleCancelClose = useCallback(() => {
    setShowCloseConfirm(false);
    // Don't send Ctrl+C - just cancel and stay in the session
  }, []);

  // Check if output indicates Claude is ready
  const checkClaudeReady = useCallback((data: string) => {
    if (!isClaudeReady && checkClaudeReadyPatterns(data)) {
      setIsClaudeReady(true);
    }
  }, [isClaudeReady]);

  // Fallback timeout: show terminal after 2 seconds even if Claude not detected
  useEffect(() => {
    const timeout = setTimeout(() => {
      if (!isClaudeReady) {
        setIsClaudeReady(true);
      }
    }, 2000);

    return () => clearTimeout(timeout);
  }, [isClaudeReady]);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || initializedRef.current) return;

    const xterm = new XTerm({
      theme: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#c0caf5',
        cursorAccent: '#1a1b26',
        selectionBackground: '#33467c',
        selectionForeground: '#c0caf5',
        black: '#32344a',
        red: '#f7768e',
        green: '#9ece6a',
        yellow: '#e0af68',
        blue: '#7aa2f7',
        magenta: '#ad8ee6',
        cyan: '#449dab',
        white: '#787c99',
        brightBlack: '#444b6a',
        brightRed: '#ff7a93',
        brightGreen: '#b9f27c',
        brightYellow: '#ff9e64',
        brightBlue: '#7da6ff',
        brightMagenta: '#bb9af7',
        brightCyan: '#0db9d7',
        brightWhite: '#acb0d0',
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, Monaco, monospace',
      fontSize: 14,
      lineHeight: 1.2,
      cursorBlink: true,
      cursorStyle: 'block',
      allowTransparency: false,
      scrollback: 10000,
      convertEol: true,
    });

    xtermRef.current = xterm;
    initializedRef.current = true;

    // Add fit addon
    const fitAddon = new FitAddon();
    fitAddonRef.current = fitAddon;
    xterm.loadAddon(fitAddon);

    // Add web links addon
    const webLinksAddon = new WebLinksAddon();
    xterm.loadAddon(webLinksAddon);

    // Open terminal in container
    xterm.open(terminalRef.current);

    // Allow browser-native paste (Ctrl+V / Cmd+V / Shift+Insert) and app shortcuts
    // Without this, xterm.js consumes these keys instead of letting the app handle them
    xterm.attachCustomKeyEventHandler((e) => {
      if (e.type === 'keydown') {
        const isPaste = (e.ctrlKey || e.metaKey) && e.key === 'v';
        const isShiftInsert = e.shiftKey && e.key === 'Insert';

        // Allow Ctrl+Shift+M (model cycling) to pass through to app
        const isModelCycle = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M';

        if (isPaste || isShiftInsert || isModelCycle) {
          return false; // Let browser/app handle → our window event listener picks it up
        }
      }
      return true;
    });

    // Handle terminal input
    xterm.onData((data) => {
      // CRITICAL: Always intercept Ctrl+C — even in read-only/observer mode.
      // Never forward \x03 to the PTY (it exits Claude immediately).
      if (data === '\x03') {
        if (!readOnly) {
          // Host: show close confirm dialog
          setShowCloseConfirm(true);
        }
        // Observer: silently swallow — do NOT forward to PTY
        return;
      }

      // In read-only mode, discard all other input (observer watching only)
      if (readOnly) return;

      // Normal input handling
      onInput(sessionId, data);
    });

    // Initial fit and notify ready
    setTimeout(() => {
      handleResizeRef.current();
      onReady(sessionId, xterm, checkClaudeReady);
    }, 0);

    // Handle window resize — use ref so we always call the latest handleResize
    const resizeObserver = new ResizeObserver(() => {
      handleResizeRef.current();
    });
    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      xterm.dispose();
      xtermRef.current = null;
      fitAddonRef.current = null;
      initializedRef.current = false;
    };
    // Use stable deps only — handleResize is accessed via ref to avoid
    // re-running the entire init effect on visibility changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, onInput, onReady]);

  // Focus terminal when focused (and visible)
  useEffect(() => {
    if (isFocused && isVisible && xtermRef.current) {
      xtermRef.current.focus();
      handleResize();
    }
  }, [isFocused, isVisible, handleResize]);

  // Force xterm canvas repaint when terminal becomes visible (opacity 0 → 1)
  useEffect(() => {
    if (isClaudeReady && xtermRef.current && fitAddonRef.current && isVisible) {
      // Small delay to let the opacity transition start and container become visible
      const timer = setTimeout(() => {
        fitAddonRef.current?.fit();
        xtermRef.current?.refresh(0, xtermRef.current.rows - 1);
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isClaudeReady, isVisible]);

  return (
    <>
      <ClaudeReadinessProgress
        isVisible={isVisible && !isClaudeReady}
        providerName={providerIdToName(providerId)}
      />

      <div
        ref={terminalRef}
        className="terminal"
        aria-readonly={readOnly || undefined}
        style={{
          display:  isVisible ? 'block' : 'none',
          opacity:  isClaudeReady ? 1 : 0,
          transition: 'opacity 0.3s ease',
          position: 'relative',
        }}
        onClick={() => xtermRef.current?.focus()}
        onDragEnter={!readOnly ? handleDragEnter : undefined}
        onDragOver={!readOnly ? handleDragOver : undefined}
        onDragLeave={!readOnly ? handleDragLeave : undefined}
        onDrop={!readOnly ? handleDrop : undefined}
      >
        {/* Read-only observer banner */}
        {readOnly && isVisible && (
          <div
            style={{
              position:        'absolute',
              top:             0,
              left:            0,
              right:           0,
              zIndex:          10,
              backgroundColor: 'rgba(26, 27, 38, 0.88)',
              borderBottom:    '1px solid rgba(122,162,247,0.2)',
              padding:         '4px var(--space-3)',
              display:         'flex',
              alignItems:      'center',
              gap:             'var(--space-2)',
              userSelect:      'none',
              pointerEvents:   'none',
            }}
            aria-live="polite"
          >
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" aria-hidden="true">
              <rect x="2" y="5.5" width="8" height="5.5" rx="1" stroke="#7aa2f7" strokeWidth="1.3" fill="none" />
              <path d="M4 5.5V3.5a2 2 0 014 0v2" stroke="#7aa2f7" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span style={{
              fontSize:   'var(--text-xs)',
              fontFamily: '"JetBrains Mono", monospace',
              color:      '#7aa2f7',
            }}>
              Read-only — Request control to interact
            </span>
          </div>
        )}

        {isVisible && isDragging && !readOnly && (
          <DragDropOverlay
            isVisible={true}
            files={draggedFiles}
            isShiftPressed={isShiftPressed}
          />
        )}
      </div>

      <DragDropContextMenu
        isOpen={showContextMenu}
        position={contextMenuPos}
        files={pendingFiles}
        onInsertPath={handleContextMenuInsertPath}
        onInsertContent={handleContextMenuInsertContent}
        onCancel={handleContextMenuCancel}
      />

      <ConfirmDialog
        isOpen={showCloseConfirm}
        title="Close this session?"
        message="You pressed Ctrl+C. Do you want to close this session?"
        confirmLabel="Close Session"
        cancelLabel="Cancel"
        isDangerous={true}
        onConfirm={handleConfirmClose}
        onCancel={handleCancelClose}
      />
    </>
  );
}

// Multi-terminal container that manages multiple Terminal instances
interface MultiTerminalProps {
  sessionIds: string[];
  visibleSessionIds: string[]; // Sessions displayed in panes
  focusedSessionId: string | null; // Session with keyboard focus
  sessionProviderMap?: Record<string, ProviderId>; // sessionId → providerId for loading overlay
  readOnlySessionIds?: string[]; // Sessions in read-only (observer) mode
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onOutput: (callback: (sessionId: string, data: string) => void) => () => void;
}

export function MultiTerminal({
  sessionIds,
  visibleSessionIds,
  focusedSessionId,
  sessionProviderMap,
  readOnlySessionIds = [],
  onInput,
  onResize,
  onOutput,
}: MultiTerminalProps) {
  const terminalsRef = useRef<Map<string, XTerm>>(new Map());
  const claudeReadyCallbacksRef = useRef<Map<string, (data: string) => void>>(new Map());
  const outputBuffersRef = useRef<Map<string, string>>(new Map());
  const isReadyRef = useRef<Map<string, boolean>>(new Map());
  // Buffer for output that arrives before the terminal xterm instance is registered
  const pendingOutputRef = useRef<Map<string, string[]>>(new Map());

  // Set up output listener
  useEffect(() => {
    const cleanup = onOutput((sessionId: string, data: string) => {
      const terminal = terminalsRef.current.get(sessionId);
      if (!terminal) {
        // Terminal not yet registered — buffer the output for later
        const pending = pendingOutputRef.current.get(sessionId) || [];
        pending.push(data);
        pendingOutputRef.current.set(sessionId, pending);
        return;
      }

      // Check if Claude is already detected as ready for this session
      const isReady = isReadyRef.current.get(sessionId);

      if (isReady) {
        // Claude is ready, write directly to terminal
        terminal.write(data);
      } else {
        // Buffer the output and check for Claude patterns
        const currentBuffer = outputBuffersRef.current.get(sessionId) || '';
        const newBuffer = currentBuffer + data;
        outputBuffersRef.current.set(sessionId, newBuffer);

        // Check if Claude is ready using centralized detection
        if (checkClaudeReadyPatterns(newBuffer)) {

          // Find where Claude's output starts
          let startIndex = 0;

          // Strategy 1: Look for escape sequence that starts the welcome box
          const escapeIndex = newBuffer.indexOf('\x1b[');
          if (escapeIndex !== -1) {
            startIndex = escapeIndex;
          } else {
            // Strategy 2: Look for box drawing characters
            const boxChars = ['┌', '╭', '┏'];
            for (const char of boxChars) {
              const boxIndex = newBuffer.indexOf(char);
              if (boxIndex !== -1) {
                startIndex = boxIndex;
                break;
              }
            }

            // Strategy 3: Find earliest pattern match and go back to line start
            if (startIndex === 0) {
              const patternIndex = findClaudeOutputStart(newBuffer);
              if (patternIndex !== -1) {
                const beforePattern = newBuffer.substring(0, patternIndex);
                const lastNewline = Math.max(
                  beforePattern.lastIndexOf('\n'),
                  beforePattern.lastIndexOf('\r')
                );
                startIndex = lastNewline !== -1 ? lastNewline + 1 : patternIndex;
              }
            }
          }

          // Write only Claude's output
          const claudeOutput = newBuffer.substring(startIndex);
          terminal.write(claudeOutput);

          // Mark this session as ready
          isReadyRef.current.set(sessionId, true);

          // Notify the Terminal component via callback — pass the full buffer
          // so readiness pattern detection works across chunk boundaries
          const checkCallback = claudeReadyCallbacksRef.current.get(sessionId);
          if (checkCallback) {
            checkCallback(newBuffer);
          }

          // Clear the buffer
          outputBuffersRef.current.delete(sessionId);
        }
      }
    });

    return cleanup;
  }, [onOutput]);

  const handleReady = useCallback((sessionId: string, terminal: XTerm, checkClaudeReady: (data: string) => void) => {
    terminalsRef.current.set(sessionId, terminal);
    claudeReadyCallbacksRef.current.set(sessionId, checkClaudeReady);

    // Flush any output that arrived before the terminal was registered
    const pending = pendingOutputRef.current.get(sessionId);
    if (pending && pending.length > 0) {
      pendingOutputRef.current.delete(sessionId);
      for (const data of pending) {
        // Re-process through the same output pipeline
        const isReady = isReadyRef.current.get(sessionId);
        if (isReady) {
          terminal.write(data);
        } else {
          const currentBuffer = outputBuffersRef.current.get(sessionId) || '';
          const newBuffer = currentBuffer + data;
          outputBuffersRef.current.set(sessionId, newBuffer);

          if (checkClaudeReadyPatterns(newBuffer)) {
            let startIndex = 0;
            const escapeIndex = newBuffer.indexOf('\x1b[');
            if (escapeIndex !== -1) {
              startIndex = escapeIndex;
            } else {
              const boxChars = ['┌', '╭', '┏'];
              for (const char of boxChars) {
                const boxIndex = newBuffer.indexOf(char);
                if (boxIndex !== -1) {
                  startIndex = boxIndex;
                  break;
                }
              }
              if (startIndex === 0) {
                const patternIndex = findClaudeOutputStart(newBuffer);
                if (patternIndex !== -1) {
                  const beforePattern = newBuffer.substring(0, patternIndex);
                  const lastNewline = Math.max(
                    beforePattern.lastIndexOf('\n'),
                    beforePattern.lastIndexOf('\r')
                  );
                  startIndex = lastNewline !== -1 ? lastNewline + 1 : patternIndex;
                }
              }
            }

            const claudeOutput = newBuffer.substring(startIndex);
            terminal.write(claudeOutput);
            isReadyRef.current.set(sessionId, true);
            checkClaudeReady(newBuffer);
            outputBuffersRef.current.delete(sessionId);
          }
        }
      }
    }

    window.electronAPI.sessionReady(sessionId);
  }, []);

  // Clean up terminals when sessions are removed
  useEffect(() => {
    const currentIds = new Set(sessionIds);
    for (const id of terminalsRef.current.keys()) {
      if (!currentIds.has(id)) {
        terminalsRef.current.delete(id);
        claudeReadyCallbacksRef.current.delete(id);
        outputBuffersRef.current.delete(id);
        isReadyRef.current.delete(id);
        pendingOutputRef.current.delete(id);
      }
    }
  }, [sessionIds]);

  if (sessionIds.length === 0) {
    return null;
  }

  return (
    <div className="terminals-container">
      {sessionIds.map(sessionId => (
        <Terminal
          key={sessionId}
          sessionId={sessionId}
          isVisible={visibleSessionIds.includes(sessionId)}
          isFocused={sessionId === focusedSessionId}
          providerId={sessionProviderMap?.[sessionId]}
          readOnly={readOnlySessionIds.includes(sessionId)}
          onInput={onInput}
          onResize={onResize}
          onReady={handleReady}
        />
      ))}

      <style>{`
        .terminals-container {
          height: 100%;
          width: 100%;
        }

        .terminal {
          height: 100%;
          width: 100%;
        }

        .terminal-loading {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          gap: 16px;
          color: var(--text-secondary, #9DA3BE);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--border-default, #292E44);
          border-top-color: var(--accent-primary, #00C9A7);
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to { transform: rotate(360deg); }
        }

        .xterm {
          height: 100%;
          padding: 4px;
        }

        .xterm-viewport {
          overflow-y: auto !important;
        }

        .xterm-viewport::-webkit-scrollbar {
          width: 8px;
        }

        .xterm-viewport::-webkit-scrollbar-track {
          background: transparent;
        }

        .xterm-viewport::-webkit-scrollbar-thumb {
          background-color: var(--border-strong, #3D4163);
          border-radius: 4px;
        }

        .xterm-viewport::-webkit-scrollbar-thumb:hover {
          background-color: var(--text-tertiary, #5C6080);
        }
      `}</style>
    </div>
  );
}
