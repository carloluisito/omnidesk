import { useEffect, useRef, useCallback, useState } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import { ConfirmDialog } from './ui/ConfirmDialog';
import { VoiceControls } from './shell/VoiceControls';
import { ClaudeReadinessProgress } from './ui/ClaudeReadinessProgress';
import { FileInfo, DragDropSettings, DragDropInsertMode } from '../../shared/ipc-types';
import type { ProviderId } from '../../shared/types/provider-types';
import { isClaudeReady as checkClaudeReadyPatterns, findClaudeOutputStart } from '../../shared/claude-detector';
import { formatPathForTerminal } from '../../shared/format-terminal-path';
import { KittyKeyboardState, encodeKittyKey } from '../terminal/kitty-keyboard';
import { shouldShowCloseDialog, isNewlineChord, isOutputReady } from '../terminal/shell-key-rules';
import { takeScrollLines, TOUCH_SCROLL_THRESHOLD_PX } from '../terminal/touch-scroll';
import type { SessionKind } from '../../shared/ipc-types';
import { useTouchMode } from '../hooks/useTouchMode';
import '@xterm/xterm/css/xterm.css';

interface TerminalProps {
  sessionId: string;
  isVisible: boolean; // Terminal is displayed in a pane
  isFocused: boolean; // Terminal has keyboard focus
  providerId?: ProviderId; // For provider-aware loading overlay copy
  kind?: SessionKind; // 'shell' disables Claude-specific key handling & readiness
  readOnly?: boolean;  // Observer mode: disables input forwarding, shows overlay
  getKittyFlags?: () => number;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onReady: (sessionId: string, terminal: XTerm, checkClaudeReady: (data: string) => void) => void;
}

function providerIdToName(providerId?: ProviderId): string | undefined {
  if (providerId === 'claude') return 'Claude Code';
  if (providerId === 'codex')  return 'Codex CLI';
  return undefined;
}

export function Terminal({ sessionId, isVisible, isFocused, providerId, kind, readOnly = false, getKittyFlags, onInput, onResize, onReady }: TerminalProps) {
  const touchMode = useTouchMode();
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const initializedRef = useRef(false);
  const handleResizeRef = useRef<() => void>(() => {});
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);
  const [isClaudeReady, setIsClaudeReady] = useState(false);
  // Tracks whether this session's PTY has exited, so a later restart can re-run
  // the correct-size startup handshake (the Terminal is mount-stable and is not
  // remounted on restart). See the restart effect below.
  const wasExitedRef = useRef(false);

  // Drag-drop state (ask-mode UI retired — files are inserted immediately per settings.defaultInsertMode)
  const [isDragging, setIsDragging] = useState(false);
  const [draggedFiles, setDraggedFiles] = useState<FileInfo[]>([]);
  const [isShiftPressed, setIsShiftPressed] = useState(false);
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

  // Seed the session's one-shot initialPrompt (work intake) at CLI readiness.
  // Main owns the once-only guard (the prompt is cleared before the write), so
  // this firing again — or from a second attached renderer — is a no-op. It
  // TYPES the prompt only; the user reviews and presses Enter themselves.
  const seedRequestedRef = useRef(false);
  useEffect(() => {
    if (isClaudeReady && !readOnly && !seedRequestedRef.current) {
      seedRequestedRef.current = true;
      window.electronAPI.seedInitialPrompt(sessionId);
    }
  }, [isClaudeReady, readOnly, sessionId]);

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
          const isWindows = navigator.platform.toLowerCase().includes('win');
          const formatted = formatPathForTerminal(file.path, settings.pathFormat, isWindows);
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
    // The "ask" context menu is retired; treat ask as 'path' (the prior default).
    const rawMode = isShiftPressed ? 'content' : settings.defaultInsertMode;
    const effectiveMode: DragDropInsertMode = rawMode === 'ask' ? 'path' : rawMode;

    if (isClaudeReady) {
      insertFiles(fileInfos, effectiveMode);
    } else {
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

  // Shell sessions have no AI CLI to wait for — ready as soon as the PTY is up.
  useEffect(() => {
    if (kind === 'shell') setIsClaudeReady(true);
  }, [kind]);

  // Initialize terminal
  useEffect(() => {
    if (!terminalRef.current || initializedRef.current) return;

    const xterm = new XTerm({
      theme: {
        background:          '#0D0E14',  // --term-background
        foreground:          '#C0C4D6',  // --term-foreground
        cursor:              '#00C9A7',  // --term-cursor
        cursorAccent:        '#0D0E14',  // --term-background
        selectionBackground: '#3D416380', // --term-selection
        selectionForeground: '#E2E4F0',  // --term-bright-white
        black:               '#1A1B26',  // --term-black
        red:                 '#F7678E',  // --term-red
        green:               '#3DD68C',  // --term-green
        yellow:              '#F7A84A',  // --term-yellow
        blue:                '#7C8FFF',  // --term-blue
        magenta:             '#BB9AF7',  // --term-magenta
        cyan:                '#00C9A7',  // --term-cyan
        white:               '#C0C4D6',  // --term-white
        brightBlack:         '#3D4163',  // --term-bright-black
        brightRed:           '#FF9EAE',  // --term-bright-red
        brightGreen:         '#6AEAAB',  // --term-bright-green
        brightYellow:        '#FFCB8A',  // --term-bright-yellow
        brightBlue:          '#A3B4FF',  // --term-bright-blue
        brightMagenta:       '#BB9AF7',  // --term-magenta (no separate bright variant)
        brightCyan:          '#4DE8D0',  // --term-bright-cyan
        brightWhite:         '#E2E4F0',  // --term-bright-white
      },
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", Consolas, Monaco, monospace',
      fontSize: touchMode ? 15 : 14,
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

    // Add web links addon with a custom handler so URLs open in the system
    // browser via shell.openExternal rather than navigating the Electron window.
    const webLinksAddon = new WebLinksAddon((_event, url) => {
      window.electronAPI.openExternal(url).catch((err: unknown) => {
        console.error('Failed to open external URL:', err);
      });
    });
    xterm.loadAddon(webLinksAddon);

    // Open terminal in container
    xterm.open(terminalRef.current);

    // Mobile soft-keyboard support: xterm's own helper textarea is the real
    // input element. Give it the attributes a touch keyboard needs; focusing it
    // (via the container onClick, a user gesture) then raises the keyboard.
    if (touchMode && xterm.textarea) {
      const ta = xterm.textarea;
      ta.setAttribute('inputmode', 'text');
      ta.setAttribute('enterkeyhint', 'send');
      ta.setAttribute('autocapitalize', 'off');
      ta.setAttribute('autocorrect', 'off');
      ta.setAttribute('spellcheck', 'false');
    }

    // Allow browser-native paste (Ctrl+V / Cmd+V / Shift+Insert) and app shortcuts
    // Without this, xterm.js consumes these keys instead of letting the app handle them
    xterm.attachCustomKeyEventHandler((e) => {
      const flags = getKittyFlags?.() ?? 0;

      // Kitty keyboard protocol active: encode and send directly, bypass xterm.
      if (flags !== 0 && !readOnly) {
        const encoded = encodeKittyKey(e, flags);
        if (encoded !== null) {
          e.preventDefault();
          onInput(sessionId, encoded);
          return false;
        }
        // encoded === null -> fall through to legacy handling below.
      }

      if (e.type === 'keydown') {
        const isPaste = (e.ctrlKey || e.metaKey) && e.key === 'v';
        const isShiftInsert = e.shiftKey && e.key === 'Insert';
        const isModelCycle = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'M';

        const isCopy = (e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C';
        if (isCopy) {
          const selection = xterm.getSelection();
          if (selection) navigator.clipboard.writeText(selection);
          return false;
        }

        // Newline insertion (legacy renderer only — Kitty path handled above; agent sessions only).
        if (isNewlineChord(e, kind)) {
          e.preventDefault();
          if (!readOnly) onInput(sessionId, '\n');
          return false;
        }

        if (isPaste || isShiftInsert || isModelCycle) return false;
      }
      return true;
    });

    // Handle terminal input
    xterm.onData((data) => {
      const flags = getKittyFlags?.() ?? 0;
      // Close-confirm interception (agent sessions, legacy mode only). Shell
      // sessions let Ctrl+C pass through to interrupt the running command.
      if (shouldShowCloseDialog(data, flags, kind)) {
        if (!readOnly) setShowCloseConfirm(true);
        return;
      }
      if (readOnly) return;
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
    // re-running the entire init effect on visibility changes.
    // `getKittyFlags` and `readOnly` are read inside the handler closures but
    // intentionally omitted from deps: getKittyFlags reads LIVE state via the
    // stable kittyStateRef, and readOnly is effectively constant per mounted
    // session in the current shell (observer mode is dormant — SingleTerminalSlot
    // never passes readOnlySessionIds, so every Terminal mounts readOnly=false).
    // If observer↔host control transfer is ever wired without a remount, switch
    // readOnly to a ref (mirror handleResizeRef) so the handlers read it live.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, onInput, onReady]);

  // Focus terminal when focused (and visible)
  useEffect(() => {
    if (isFocused && isVisible && xtermRef.current) {
      xtermRef.current.focus();
      handleResize();
    }
  }, [isFocused, isVisible, handleResize]);

  // Refit + refresh when the terminal becomes visible after being hidden
  // (e.g. mode switch focus ↔ grid). xterm's FitAddon needs the container
  // to be laid out before it can read dimensions; `display: none` zeros them.
  // We schedule TWO passes: an rAF (immediately after the next layout) and
  // a delayed pass (catches CSS transitions). Each pass calls the full
  // handleResize so the PTY also learns the new cols/rows.
  useEffect(() => {
    if (!isVisible || !xtermRef.current || !fitAddonRef.current) return;
    const refit = () => {
      try {
        handleResizeRef.current?.();
        const xt = xtermRef.current;
        if (xt) xt.refresh(0, xt.rows - 1);
      } catch { /* fitAddon throws if container is detached — safe to ignore */ }
    };
    const raf = requestAnimationFrame(refit);
    const timer = window.setTimeout(refit, 100);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [isVisible]);

  // Refit once the CLI is ready. On cold start the provider CLI launches and
  // paints its full-screen UI before it installs a SIGWINCH handler, so the
  // resizes fired during startup (init + the isVisible passes above) can be
  // missed — leaving the CLI drawn at stale rows (input floating mid-screen
  // with blank space below) until the user manually resizes or reselects the
  // session. Re-firing handleResize here — the same path a session switch uses
  // to fix it — sends a resize the now-ready CLI honors, forcing a clean
  // repaint at the true viewport size. Two passes catch late layout/font
  // settling. Gated on isVisible so a background session doesn't fit to a
  // zero-sized (display:none) container.
  useEffect(() => {
    if (!isClaudeReady || !isVisible || !xtermRef.current || !fitAddonRef.current) return;
    const refit = () => {
      try {
        handleResizeRef.current?.();
        const xt = xtermRef.current;
        if (xt) xt.refresh(0, xt.rows - 1);
      } catch { /* fitAddon throws if container is detached — safe to ignore */ }
    };
    const raf = requestAnimationFrame(refit);
    const timer = window.setTimeout(refit, 250);
    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(timer);
    };
  }, [isClaudeReady, isVisible]);

  // Restart handling. The Terminal is mount-stable — restarting a session spawns
  // a fresh PTY but reuses this same component and xterm, so the startup
  // handshake that a new session runs on mount (initial fit → releases the
  // deferred CLI launch at the true size → readiness → refit) never re-runs.
  // Without this, a restarted CLI launches at the fallback 80×24 and stays
  // garbled until a manual resize. Re-run the handshake on the exit→running
  // transition: reset readiness (re-shows the loading overlay and re-arms
  // detection) on exit, then re-fit once the new PTY is running so its deferred
  // launch starts at the correct dimensions. Skipped for shell sessions, whose
  // readiness is kind-driven, not CLI-launch-driven.
  useEffect(() => {
    if (kind === 'shell') return;
    const offExited = window.electronAPI.onSessionExited((evt) => {
      if (evt.sessionId !== sessionId) return;
      wasExitedRef.current = true;
      setIsClaudeReady(false);
    });
    const offUpdated = window.electronAPI.onSessionUpdated((meta) => {
      if (meta.id !== sessionId || !wasExitedRef.current) return;
      if (meta.status === 'running') {
        wasExitedRef.current = false;
        // New PTY is up — fit so the deferred launch starts at the real size.
        // If this lands before the PTY is ready it's a harmless no-op; the
        // deferred-launch fallback and the readiness refit still correct it.
        handleResizeRef.current?.();
      }
    });
    return () => { offExited(); offUpdated(); };
  }, [sessionId, kind]);

  // Mobile: when the soft keyboard opens it shrinks the visual viewport. Refit
  // so the prompt stays visible above the keyboard. ResizeObserver/window.resize
  // don't reliably fire for a visualViewport-only change, so listen explicitly.
  useEffect(() => {
    if (!touchMode) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const onChange = () => {
      handleResizeRef.current?.();
      xtermRef.current?.scrollToBottom();
    };
    vv.addEventListener('resize', onChange);
    vv.addEventListener('scroll', onChange);
    return () => { vv.removeEventListener('resize', onChange); vv.removeEventListener('scroll', onChange); };
  }, [touchMode]);

  // Mobile: xterm only scrolls the viewport on touch-drag when the program has
  // NOT enabled mouse tracking. Agentic CLIs (Claude, Codex) turn mouse tracking
  // ON, so xterm forwards touches as mouse input and the scrollback can't be
  // reached by finger. Drive scrollback ourselves for those sessions. When mouse
  // tracking is off we leave xterm's own handling alone (no double-scroll).
  useEffect(() => {
    if (!touchMode) return;
    const el = terminalRef.current;
    if (!el) return;

    let lastY = 0;
    let startY = 0;
    let accumPx = 0;
    let engaged = false; // crossed the tap→scroll threshold this gesture
    let active = false;  // this session needs our custom handling

    const rowPx = (): number => {
      const x = xtermRef.current;
      const box = x?.element?.getBoundingClientRect();
      return box && x && x.rows > 0 ? box.height / x.rows : 18;
    };

    const onStart = (e: TouchEvent) => {
      const x = xtermRef.current;
      active =
        !!x &&
        e.touches.length === 1 &&
        x.modes.mouseTrackingMode !== 'none' &&
        x.buffer.active.type === 'normal';
      if (!active) return;
      startY = lastY = e.touches[0].clientY;
      accumPx = 0;
      engaged = false;
    };

    const onMove = (e: TouchEvent) => {
      const x = xtermRef.current;
      if (!active || !x || e.touches.length !== 1) return;
      const y = e.touches[0].clientY;
      if (!engaged) {
        // Wait until the finger has clearly moved before hijacking, so taps
        // (which fire synthesized clicks the CLI needs) still get through.
        if (Math.abs(y - startY) < TOUCH_SCROLL_THRESHOLD_PX) { lastY = y; return; }
        engaged = true;
        lastY = y;
      }
      accumPx += lastY - y; // finger up (y↓) => positive => scroll toward newest
      lastY = y;
      const { lines, remainderPx } = takeScrollLines(accumPx, rowPx());
      accumPx = remainderPx;
      if (lines !== 0) x.scrollLines(lines);
      e.preventDefault();  // stop page rubber-band + mouse-event synthesis
      e.stopPropagation();
    };

    const onEnd = () => { active = false; engaged = false; };

    el.addEventListener('touchstart', onStart, { passive: true });
    el.addEventListener('touchmove', onMove, { passive: false });
    el.addEventListener('touchend', onEnd, { passive: true });
    el.addEventListener('touchcancel', onEnd, { passive: true });
    return () => {
      el.removeEventListener('touchstart', onStart);
      el.removeEventListener('touchmove', onMove);
      el.removeEventListener('touchend', onEnd);
      el.removeEventListener('touchcancel', onEnd);
    };
  }, [touchMode]);

  return (
    <>
      <ClaudeReadinessProgress
        isVisible={isVisible && !isClaudeReady}
        providerName={providerIdToName(providerId)}
      />

      <div
        ref={terminalRef}
        className={'terminal' + (touchMode ? ' touch' : '')}
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
              backgroundColor: 'color-mix(in srgb, var(--v2-surface-overlay) 88%, transparent)',
              borderBottom:    '1px solid color-mix(in srgb, var(--v2-accent) 20%, transparent)',
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
              <rect x="2" y="5.5" width="8" height="5.5" rx="1" stroke="var(--v2-accent)" strokeWidth="1.3" fill="none" />
              <path d="M4 5.5V3.5a2 2 0 014 0v2" stroke="var(--v2-accent)" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            <span style={{
              fontSize:   'var(--text-xs)',
              fontFamily: '"JetBrains Mono", monospace',
              color:      'var(--v2-accent)',
            }}>
              Read-only — Request control to interact
            </span>
          </div>
        )}

        {isVisible && (
          <VoiceControls
            readOnly={readOnly}
            onInject={(text) => xtermRef.current?.paste(text)}
          />
        )}
      </div>

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
  sessionKindMap?: Record<string, SessionKind>; // sessionId → kind for behavior gating
  readOnlySessionIds?: string[]; // Sessions in read-only (observer) mode
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onOutput: (callback: (sessionId: string, data: string) => void) => () => void;
}

// Readiness-gate hard-flush thresholds (see readinessTimersRef). A terminal
// must never stay blank waiting for a ready banner that never comes.
const READINESS_FLUSH_BYTES = 8 * 1024;
const READINESS_FLUSH_MS = 2500;

export function MultiTerminal({
  sessionIds,
  visibleSessionIds,
  focusedSessionId,
  sessionProviderMap,
  sessionKindMap,
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
  const kittyStateRef = useRef<Map<string, KittyKeyboardState>>(new Map());
  // Hard-flush fallback timers for the Claude-readiness gate. A non-Claude
  // provider (e.g. Codex) never matches the Claude ready patterns, so without
  // a fallback its output stays buffered and the terminal renders blank
  // forever. If no match arrives within READINESS_FLUSH_MS (or the buffer
  // exceeds READINESS_FLUSH_BYTES), we flush the raw buffer and mark ready.
  const readinessTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  // Latest sessionKindMap, read via ref so the onOutput/handleReady closures
  // (whose deps don't include the prop) never see a stale map for a session
  // created after they were memoized.
  const sessionKindMapRef = useRef(sessionKindMap);
  sessionKindMapRef.current = sessionKindMap;

  // Set up output listener
  useEffect(() => {
    const cleanup = onOutput((sessionId: string, data: string) => {
      // Kitty keyboard protocol: track flags + answer the capability query.
      let kitty = kittyStateRef.current.get(sessionId);
      if (!kitty) { kitty = new KittyKeyboardState(); kittyStateRef.current.set(sessionId, kitty); }
      const reply = kitty.processOutput(data);
      if (reply && !readOnlySessionIds.includes(sessionId)) {
        onInput(sessionId, reply);
      }

      const terminal = terminalsRef.current.get(sessionId);
      if (!terminal) {
        // Terminal not yet registered — buffer the output for later
        const pending = pendingOutputRef.current.get(sessionId) || [];
        pending.push(data);
        pendingOutputRef.current.set(sessionId, pending);
        return;
      }

      // Shell sessions bypass Claude-readiness gating; agent output stays
      // buffered until Claude's welcome box is detected (isOutputReady).
      const isReady = isOutputReady(isReadyRef.current.get(sessionId), sessionKindMapRef.current?.[sessionId]);

      if (isReady) {
        // Ready (or a shell) — write directly to terminal
        terminal.write(data);
      } else {
        // Buffer the output and check for Claude patterns
        const currentBuffer = outputBuffersRef.current.get(sessionId) || '';
        const newBuffer = currentBuffer + data;
        outputBuffersRef.current.set(sessionId, newBuffer);

        // Arm a one-shot fallback so a session whose banner never matches the
        // Claude patterns (e.g. Codex) can't stay blank indefinitely.
        if (!readinessTimersRef.current.has(sessionId)) {
          readinessTimersRef.current.set(sessionId, setTimeout(() => {
            readinessTimersRef.current.delete(sessionId);
            if (isReadyRef.current.get(sessionId)) return;
            const buffered = outputBuffersRef.current.get(sessionId);
            const term = terminalsRef.current.get(sessionId);
            if (buffered && term) {
              term.write(buffered);
              isReadyRef.current.set(sessionId, true);
              const cb = claudeReadyCallbacksRef.current.get(sessionId);
              if (cb) cb(buffered);
              outputBuffersRef.current.delete(sessionId);
            }
          }, READINESS_FLUSH_MS));
        }

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

          // Pattern matched — cancel the pending hard-flush fallback.
          const pending = readinessTimersRef.current.get(sessionId);
          if (pending) { clearTimeout(pending); readinessTimersRef.current.delete(sessionId); }

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
        } else if (newBuffer.length > READINESS_FLUSH_BYTES) {
          // Buffer grew past the cap without a match — flush raw so the
          // terminal shows content rather than staying blank.
          const pending = readinessTimersRef.current.get(sessionId);
          if (pending) { clearTimeout(pending); readinessTimersRef.current.delete(sessionId); }
          terminal.write(newBuffer);
          isReadyRef.current.set(sessionId, true);
          const checkCallback = claudeReadyCallbacksRef.current.get(sessionId);
          if (checkCallback) checkCallback(newBuffer);
          outputBuffersRef.current.delete(sessionId);
        }
      }
    });

    return () => {
      cleanup();
      // Clear any armed readiness fallback timers so they don't fire after unmount.
      for (const t of readinessTimersRef.current.values()) clearTimeout(t);
      readinessTimersRef.current.clear();
    };
  }, [onOutput, onInput, readOnlySessionIds]);

  const handleReady = useCallback((sessionId: string, terminal: XTerm, checkClaudeReady: (data: string) => void) => {
    terminalsRef.current.set(sessionId, terminal);
    claudeReadyCallbacksRef.current.set(sessionId, checkClaudeReady);

    // Remote (web) clients are cold attaches: they never witnessed earlier
    // output, so replay the server-side scrollback to reconstruct the terminal.
    // Desktop is skipped — it receives output live from session creation, so
    // replaying would double-write. Written before the pending flush so the
    // history precedes any bytes that arrived since this client connected.
    if ((window as unknown as { __OMNIDESK_REMOTE__?: boolean }).__OMNIDESK_REMOTE__) {
      window.electronAPI.getSessionScrollback(sessionId).then((backlog) => {
        if (backlog) {
          terminal.write(backlog);
        }
      }).catch(() => { /* best-effort replay */ });
    }

    // Flush any output that arrived before the terminal was registered
    const pending = pendingOutputRef.current.get(sessionId);
    if (pending && pending.length > 0) {
      pendingOutputRef.current.delete(sessionId);
      for (const data of pending) {
        // Re-process through the same output pipeline
        const isReady = isOutputReady(isReadyRef.current.get(sessionId), sessionKindMapRef.current?.[sessionId]);
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
        kittyStateRef.current.delete(id);
        const t = readinessTimersRef.current.get(id);
        if (t) { clearTimeout(t); readinessTimersRef.current.delete(id); }
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
          kind={sessionKindMap?.[sessionId]}
          readOnly={readOnlySessionIds.includes(sessionId)}
          onInput={onInput}
          onResize={onResize}
          onReady={handleReady}
          getKittyFlags={() => kittyStateRef.current.get(sessionId)?.flags ?? 0}
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
          color: var(--v2-text-secondary);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
        }

        .loading-spinner {
          width: 32px;
          height: 32px;
          border: 3px solid var(--v2-border-default);
          border-top-color: var(--v2-accent);
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

        .terminal.touch .xterm-viewport {
          touch-action: pan-y;
          overscroll-behavior: contain;
          -webkit-overflow-scrolling: touch;
        }

        .xterm-viewport::-webkit-scrollbar {
          width: 8px;
        }

        .xterm-viewport::-webkit-scrollbar-track {
          background: transparent;
        }

        .xterm-viewport::-webkit-scrollbar-thumb {
          background-color: var(--v2-border-strong);
          border-radius: 4px;
        }

        .xterm-viewport::-webkit-scrollbar-thumb:hover {
          background-color: var(--v2-text-tertiary);
        }
      `}</style>
    </div>
  );
}
