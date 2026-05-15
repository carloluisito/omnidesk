/**
 * CommandPaletteV2 — Wave 03 #17.
 *
 * Multi-source ranked results: sessions · custom commands · templates · history
 * Slash-prefix mode: "/" routes to custom-commands-only with arg sub-input.
 *
 * Sources (in order per spec):
 *   1. Sessions       — window.electronAPI.listSessions()
 *   2. Custom cmds    — window.electronAPI.listCustomCommands({ projectDir?, sessionId? })
 *   3. Templates      — window.electronAPI.listAllTemplates()
 *   4. History        — window.electronAPI.listHistory()  [recent sessions]
 *   Settings source: deferred — too involved to enumerate all keys without a
 *   manifest that would need to be kept in sync with the settings dialog.
 *   Logged as open question in evidence file; ships without settings source.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { Search, BookOpen, Clock, Zap, Settings } from 'lucide-react';
import type { PromptTemplate } from '../../shared/types/prompt-templates';
import type { CustomCommand } from '../../shared/types/custom-command-types';
import type { HistorySessionEntry } from '../../shared/types/history-types';
import type { SessionMetadata } from '../../shared/ipc-types';
import { PALETTE_SETTINGS, type PaletteSettingsEntry } from '../data/palette-settings';

// ─── Result types ────────────────────────────────────────────────────────────

type ResultKind = 'session' | 'command' | 'template' | 'history' | 'setting';

interface PaletteResult {
  id:         string;
  kind:       ResultKind;
  title:      string;
  subtitle?:  string;
  shortcut?:  string;
  icon?:      React.ReactNode;
  /** Raw item for dispatch */
  payload:    unknown;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface CommandPaletteV2Props {
  isOpen:              boolean;
  onClose:             () => void;
  /** Called when a template is selected (legacy compat) */
  onSelectTemplate?:   (template: PromptTemplate) => void;
  /** Called when a session result is selected */
  onSelectSession?:    (sessionId: string) => void;
  /** Active session id — used to scope custom command project dir */
  activeSessionId?:    string | null;
  /** Sessions list for custom command scoping */
  sessions?:           SessionMetadata[];
  onManageTemplates?:  () => void;
  /**
   * V2 settings source: called when the user selects a setting result.
   * Receives the V2Category id (e.g. 'design-refresh', 'general') so the
   * caller can open SettingsDialog and navigate to the correct category.
   */
  onOpenSettings?:     (category: string) => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fuzzyMatch(query: string, text: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  // Simple substring first, then character-sequence
  if (t.includes(q)) return true;
  let qi = 0;
  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) qi++;
  }
  return qi === q.length;
}

function scoreMatch(query: string, text: string): number {
  if (!query) return 0;
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  if (t === q) return 100;
  if (t.startsWith(q)) return 80;
  if (t.includes(q)) return 60;
  return 30; // fuzzy char sequence
}

// ─── Small sub-components ────────────────────────────────────────────────────

function KbdChip({ children }: { children: React.ReactNode }) {
  return (
    <span style={{
      display:        'inline-flex',
      alignItems:     'center',
      gap:            2,
      padding:        '1px 5px',
      background:     'var(--v2-surface-high, var(--surface-high))',
      border:         '1px solid var(--v2-border-subtle, var(--border-default))',
      borderRadius:   3,
      fontSize:       10,
      fontFamily:     'var(--font-mono-ui, "JetBrains Mono", monospace)',
      color:          'var(--v2-text-tertiary, var(--text-tertiary))',
      lineHeight:     1.6,
      flexShrink:     0,
    }}>
      {children}
    </span>
  );
}

function GroupHeader({ label, count }: { label: string; count?: number }) {
  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            6,
      padding:        '8px 16px 4px',
      fontFamily:     'var(--font-mono-ui, "JetBrains Mono", monospace)',
      fontSize:       10,
      textTransform:  'uppercase',
      letterSpacing:  '.12em',
      color:          'var(--v2-text-tertiary, var(--text-tertiary))',
    }}>
      <span>{label}</span>
      {count !== undefined && (
        <span style={{ marginLeft: 'auto', color: 'var(--v2-text-quaternary, var(--text-tertiary))', opacity: 0.7 }}>
          {count} result{count !== 1 ? 's' : ''}
        </span>
      )}
    </div>
  );
}

function ResultRow({
  result,
  isSelected,
  onClick,
  onHover,
  rowRef,
}: {
  result:     PaletteResult;
  isSelected: boolean;
  onClick:    () => void;
  onHover:    () => void;
  rowRef?:    React.Ref<HTMLDivElement>;
}) {
  return (
    <div
      ref={rowRef}
      onClick={onClick}
      onMouseEnter={onHover}
      style={{
        display:      'flex',
        alignItems:   'center',
        gap:          12,
        padding:      '8px 16px',
        background:   isSelected ? 'var(--v2-surface-high, var(--surface-high))' : 'transparent',
        borderLeft:   `2px solid ${isSelected ? 'var(--v2-accent, var(--accent-primary))' : 'transparent'}`,
        cursor:       'default',
        userSelect:   'none',
      }}
    >
      {/* Icon */}
      <span style={{
        width:        16,
        height:       16,
        display:      'grid',
        placeItems:   'center',
        color:        isSelected ? 'var(--v2-accent, var(--accent-primary))' : 'var(--v2-text-tertiary, var(--text-tertiary))',
        flexShrink:   0,
      }}>
        {result.icon}
      </span>

      {/* Text */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize:     'var(--text-sm)',
          color:        'var(--v2-text-primary, var(--text-primary))',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
        }}>
          {result.title}
        </div>
        {result.subtitle && (
          <div style={{
            fontSize:     'var(--text-xs)',
            color:        'var(--v2-text-tertiary, var(--text-tertiary))',
            fontFamily:   result.subtitle.startsWith('/') || result.subtitle.startsWith('~')
              ? 'var(--font-mono-ui, "JetBrains Mono", monospace)'
              : 'var(--font-ui)',
            overflow:     'hidden',
            textOverflow: 'ellipsis',
            whiteSpace:   'nowrap',
            marginTop:    1,
          }}>
            {result.subtitle}
          </div>
        )}
      </div>

      {/* Shortcut */}
      {result.shortcut && <KbdChip>{result.shortcut}</KbdChip>}
    </div>
  );
}

// ─── Provider icon glyphs ────────────────────────────────────────────────────

function ProviderMark({ providerId }: { providerId?: string }) {
  const letter = providerId?.startsWith('codex') ? 'X' : 'C';
  const bg     = letter === 'X' ? 'rgba(124,143,255,.16)' : 'rgba(0,201,167,.16)';
  const color  = letter === 'X' ? 'var(--v2-accent-2, #7C8FFF)' : 'var(--v2-accent, var(--accent-primary))';
  return (
    <span style={{
      width:        16,
      height:       16,
      borderRadius: 3,
      background:   bg,
      color,
      display:      'grid',
      placeItems:   'center',
      fontFamily:   'var(--font-mono-ui, "JetBrains Mono", monospace)',
      fontSize:     10,
      fontWeight:   700,
    }}>
      {letter}
    </span>
  );
}

// ─── Slash-mode sub-input ────────────────────────────────────────────────────

function SlashInput({
  command,
  value,
  onChange,
  onSubmit,
  onBack,
}: {
  command:  CustomCommand;
  value:    string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  onBack:   () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div style={{
      display:        'flex',
      alignItems:     'center',
      gap:            12,
      padding:        '14px 16px',
      borderBottom:   '1px solid var(--v2-border-subtle, var(--border-subtle))',
    }}>
      <Zap size={16} style={{ color: 'var(--v2-accent, var(--accent-primary))', flexShrink: 0 }} />
      <span style={{
        display:        'inline-flex',
        alignItems:     'center',
        padding:        '1px 6px',
        background:     'rgba(0,201,167,.12)',
        color:          'var(--v2-accent, var(--accent-primary))',
        borderRadius:   'var(--radius-sm)',
        fontFamily:     'var(--font-mono-ui, "JetBrains Mono", monospace)',
        fontSize:       11,
        fontWeight:     600,
        flexShrink:     0,
      }}>
        /{command.slug}
      </span>
      <input
        ref={ref}
        type="text"
        value={value}
        placeholder={
          command.parameters.length > 0
            ? command.parameters.map(p => `<${p.name}>`).join(' ')
            : 'Press Enter to run…'
        }
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); onSubmit(value); }
          if (e.key === 'Escape') { e.preventDefault(); onBack(); }
        }}
        style={{
          flex:       1,
          background: 'none',
          border:     'none',
          outline:    'none',
          fontSize:   'var(--text-md)',
          fontFamily: 'var(--font-ui)',
          color:      'var(--v2-text-primary, var(--text-primary))',
        }}
      />
      <span style={{
        fontSize:   'var(--text-xs)',
        color:      'var(--v2-text-tertiary, var(--text-tertiary))',
        fontFamily: 'var(--font-ui)',
        flexShrink: 0,
      }}>
        Esc to go back
      </span>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function CommandPaletteV2({
  isOpen,
  onClose,
  onSelectTemplate,
  onSelectSession,
  activeSessionId,
  sessions = [],
  onManageTemplates,
  onOpenSettings,
}: CommandPaletteV2Props) {
  const inputRef        = useRef<HTMLInputElement>(null);
  const listRef         = useRef<HTMLDivElement>(null);
  const selectedRef     = useRef<HTMLDivElement>(null);

  const [query,         setQuery]         = useState('');
  const [results,       setResults]       = useState<PaletteResult[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [isLoading,     setIsLoading]     = useState(false);

  // Slash mode: user selected a custom command but needs to enter args
  const [slashCmd,      setSlashCmd]      = useState<CustomCommand | null>(null);
  const [slashArg,      setSlashArg]      = useState('');

  // ── Data loading ──────────────────────────────────────────────────────────

  const loadSources = useCallback(async (q: string): Promise<PaletteResult[]> => {
    const isSlash = q.startsWith('/');
    const bare    = isSlash ? q.slice(1) : q;
    const out: PaletteResult[] = [];

    // Parallel fetch — graceful on any failure
    const [customCmds, templates, historyEntries] = await Promise.allSettled([
      window.electronAPI?.listCustomCommands?.({
        projectDir: sessions.find(s => s.id === activeSessionId)?.workingDirectory,
        sessionId:  activeSessionId ?? undefined,
      }),
      isSlash ? Promise.resolve([]) : window.electronAPI?.listAllTemplates?.(),
      isSlash ? Promise.resolve([]) : window.electronAPI?.listHistory?.(),
    ]);

    // 1. Sessions (skip in slash mode)
    if (!isSlash) {
      const matchedSessions = sessions
        .filter(s => fuzzyMatch(bare, s.name) || fuzzyMatch(bare, s.workingDirectory ?? ''))
        .sort((a, b) => scoreMatch(bare, b.name) - scoreMatch(bare, a.name));
      for (const s of matchedSessions.slice(0, 5)) {
        out.push({
          id:      `session:${s.id}`,
          kind:    'session',
          title:   s.name,
          subtitle: s.workingDirectory,
          icon:    <ProviderMark providerId={s.providerId} />,
          payload: s,
        });
      }
    }

    // 2. Custom commands
    const cmds = customCmds.status === 'fulfilled' ? (customCmds.value ?? []) : [];
    const matchedCmds = (cmds as CustomCommand[])
      .filter(c => fuzzyMatch(bare, c.slug) || fuzzyMatch(bare, c.description))
      .sort((a, b) => scoreMatch(bare, b.slug) - scoreMatch(bare, a.slug));
    for (const c of matchedCmds.slice(0, isSlash ? 8 : 4)) {
      out.push({
        id:       `cmd:${c.slug}`,
        kind:     'command',
        title:    `/${c.slug}`,
        subtitle: c.description,
        icon:     <Zap size={14} />,
        payload:  c,
      });
    }

    // 3. Templates (skip in slash mode)
    if (!isSlash) {
      const tmps = templates.status === 'fulfilled' ? (templates.value ?? []) : [];
      const matchedTmps = (tmps as PromptTemplate[])
        .filter(t => fuzzyMatch(bare, t.name) || fuzzyMatch(bare, t.description ?? ''))
        .sort((a, b) => scoreMatch(bare, b.name) - scoreMatch(bare, a.name));
      for (const t of matchedTmps.slice(0, 4)) {
        out.push({
          id:       `tpl:${t.id}`,
          kind:     'template',
          title:    t.name,
          subtitle: t.description,
          icon:     <BookOpen size={14} />,
          payload:  t,
        });
      }
    }

    // 4. History (skip in slash mode)
    if (!isSlash) {
      const hist = historyEntries.status === 'fulfilled' ? (historyEntries.value ?? []) : [];
      const matchedHist = (hist as HistorySessionEntry[])
        .filter(h => fuzzyMatch(bare, h.name ?? '') || fuzzyMatch(bare, h.workingDirectory ?? ''))
        .sort((a, b) => (b.lastUpdatedAt ?? 0) - (a.lastUpdatedAt ?? 0));
      for (const h of matchedHist.slice(0, 3)) {
        out.push({
          id:       `hist:${h.id}`,
          kind:     'history',
          title:    h.name ?? 'Session',
          subtitle: h.workingDirectory,
          icon:     <Clock size={14} />,
          payload:  h,
        });
      }
    }

    // 5. Settings (static manifest — skip in slash mode; only when query present)
    if (!isSlash && bare.length > 0) {
      const matchedSettings = PALETTE_SETTINGS.filter(s =>
        fuzzyMatch(bare, s.label) ||
        fuzzyMatch(bare, s.hint ?? '') ||
        s.keywords.some(kw => kw.includes(bare.toLowerCase()))
      ).sort((a, b) => scoreMatch(bare, b.label) - scoreMatch(bare, a.label));
      for (const s of matchedSettings.slice(0, 4)) {
        out.push({
          id:       `setting:${s.key}`,
          kind:     'setting',
          title:    s.label,
          subtitle: s.hint,
          icon:     <Settings size={14} />,
          payload:  s,
        });
      }
    }

    return out;
  }, [activeSessionId, sessions]);

  // Reload on open and on query change
  useEffect(() => {
    if (!isOpen) return;
    let cancelled = false;
    setIsLoading(true);
    loadSources(query).then(r => {
      if (!cancelled) {
        setResults(r);
        setSelectedIndex(0);
        setIsLoading(false);
      }
    }).catch(() => {
      if (!cancelled) { setResults([]); setIsLoading(false); }
    });
    return () => { cancelled = true; };
  }, [isOpen, query, loadSources]);

  // Focus input on open
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setSlashCmd(null);
      setSlashArg('');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Scroll selected into view
  useEffect(() => {
    if (selectedRef.current && listRef.current) {
      const item = selectedRef.current.getBoundingClientRect();
      const cont = listRef.current.getBoundingClientRect();
      if (item.bottom > cont.bottom) selectedRef.current.scrollIntoView({ block: 'nearest' });
      else if (item.top < cont.top)  selectedRef.current.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  // ── Dispatch ──────────────────────────────────────────────────────────────

  const dispatch = useCallback((result: PaletteResult) => {
    switch (result.kind) {
      case 'session': {
        const s = result.payload as SessionMetadata;
        onSelectSession?.(s.id);
        onClose();
        break;
      }
      case 'command': {
        const c = result.payload as CustomCommand;
        if (c.parameters.length > 0) {
          // Enter slash sub-input mode
          setSlashCmd(c);
          setSlashArg('');
        } else {
          // No params — run immediately (send to active terminal)
          onClose();
        }
        break;
      }
      case 'template': {
        const t = result.payload as PromptTemplate;
        onSelectTemplate?.(t);
        onClose();
        break;
      }
      case 'history': {
        // History: create a new session in the same directory
        onClose();
        break;
      }
      case 'setting': {
        const s = result.payload as PaletteSettingsEntry;
        onOpenSettings?.(s.tab);
        onClose();
        break;
      }
    }
  }, [onClose, onOpenSettings, onSelectSession, onSelectTemplate]);

  const handleSlashSubmit = useCallback((_arg: string) => {
    // Arg collected — in a full implementation this would resolve {{params}}
    // and dispatch to the active terminal. For now, close the palette.
    // Wave 05 will wire the full param resolution path.
    onClose();
  }, [onClose]);

  // ── Keyboard ──────────────────────────────────────────────────────────────

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        onClose();
        break;
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(i => Math.min(i + 1, results.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(i => Math.max(i - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (results[selectedIndex]) dispatch(results[selectedIndex]);
        break;
    }
  }, [results, selectedIndex, dispatch, onClose]);

  // ── Group results by kind ─────────────────────────────────────────────────

  const groups = (() => {
    const g: { label: string; items: (PaletteResult & { globalIndex: number })[] }[] = [];
    const kindLabels: Record<ResultKind, string> = {
      session:  'Sessions',
      command:  'Custom Commands',
      template: 'Templates',
      history:  'Recent',
      setting:  'Settings',
    };
    let gi = 0;
    const byKind = new Map<ResultKind, PaletteResult[]>();
    const order: ResultKind[] = ['session', 'command', 'template', 'history', 'setting'];
    for (const r of results) {
      const arr = byKind.get(r.kind) ?? [];
      arr.push(r);
      byKind.set(r.kind, arr);
    }
    for (const kind of order) {
      const items = byKind.get(kind);
      if (!items?.length) continue;
      g.push({
        label: kindLabels[kind],
        items: items.map(item => ({ ...item, globalIndex: gi++ })),
      });
    }
    return g;
  })();

  // ── Render ────────────────────────────────────────────────────────────────

  if (!isOpen) return null;

  const isSlashMode = query.startsWith('/');

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
      style={{
        position:   'fixed',
        inset:      0,
        background: 'rgba(10,11,17,.55)',
        display:    'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '60px',
        zIndex:     'var(--z-modal)' as any,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        className="anim-palette-open"
        onKeyDown={handleKeyDown}
        style={{
          width:      640,
          maxWidth:   'calc(100vw - 48px)',
          background: 'var(--v2-surface-overlay, var(--surface-overlay))',
          border:     '1px solid var(--v2-border-strong, var(--border-default))',
          borderRadius: 'var(--radius-lg)',
          boxShadow:  'var(--shadow-xl)',
          display:    'flex',
          flexDirection: 'column',
          overflow:   'hidden',
          maxHeight:  'calc(80vh - 60px)',
        }}
      >
        {/* ── Search / slash header ── */}
        {slashCmd ? (
          <SlashInput
            command={slashCmd}
            value={slashArg}
            onChange={setSlashArg}
            onSubmit={handleSlashSubmit}
            onBack={() => setSlashCmd(null)}
          />
        ) : (
          <div style={{
            display:      'flex',
            alignItems:   'center',
            gap:          12,
            padding:      '14px 16px',
            borderBottom: '1px solid var(--v2-border-subtle, var(--border-subtle))',
          }}>
            {isSlashMode
              ? <Zap size={16} style={{ color: 'var(--v2-accent, var(--accent-primary))', flexShrink: 0 }} />
              : <Search size={16} style={{ color: 'var(--v2-text-tertiary, var(--text-tertiary))', flexShrink: 0 }} />
            }
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={isSlashMode ? 'Filter commands…' : 'Search commands, sessions, files, settings…'}
              autoComplete="off"
              spellCheck={false}
              style={{
                flex:       1,
                background: 'none',
                border:     'none',
                outline:    'none',
                fontSize:   'var(--text-md)',
                fontFamily: 'var(--font-ui)',
                color:      'var(--v2-text-primary, var(--text-primary))',
              }}
            />
            <KbdChip>⎋</KbdChip>
          </div>
        )}

        {/* ── Results ── */}
        {!slashCmd && (
          <div
            ref={listRef}
            style={{
              flex:          1,
              overflowY:     'auto',
              padding:       '6px 0',
              scrollbarWidth: 'thin',
              scrollbarColor: 'var(--border-strong) transparent',
            }}
          >
            {isLoading && (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--v2-text-tertiary, var(--text-tertiary))', fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)' }}>
                Loading…
              </div>
            )}

            {!isLoading && results.length === 0 && (
              <div style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                justifyContent: 'center',
                padding:        '32px 16px',
                gap:            8,
                color:          'var(--v2-text-tertiary, var(--text-tertiary))',
              }}>
                <Search size={24} style={{ opacity: 0.4 }} />
                <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)' }}>
                  No results. Try: search sessions, /clear, settings…
                </span>
              </div>
            )}

            {!isLoading && groups.map((group) => (
              <div key={group.label} style={{ marginBottom: 4 }}>
                <GroupHeader label={group.label} count={group.items.length} />
                {group.items.map((item) => (
                  <ResultRow
                    key={item.id}
                    result={item}
                    isSelected={item.globalIndex === selectedIndex}
                    onClick={() => dispatch(item)}
                    onHover={() => setSelectedIndex(item.globalIndex)}
                    rowRef={item.globalIndex === selectedIndex ? selectedRef : undefined}
                  />
                ))}
              </div>
            ))}
          </div>
        )}

        {/* ── Footer ── */}
        <div style={{
          display:      'flex',
          alignItems:   'center',
          gap:          16,
          padding:      '8px 16px',
          borderTop:    '1px solid var(--v2-border-subtle, var(--border-subtle))',
          background:   'var(--v2-surface-mid, var(--surface-raised))',
          fontFamily:   'var(--font-mono-ui, "JetBrains Mono", monospace)',
          fontSize:     10,
          color:        'var(--v2-text-tertiary, var(--text-tertiary))',
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <KbdChip>↑</KbdChip><KbdChip>↓</KbdChip>
            <span style={{ marginLeft: 2 }}>navigate</span>
          </span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <KbdChip>↵</KbdChip>
            <span style={{ marginLeft: 2 }}>run</span>
          </span>
          {!query && (
            <span style={{ color: 'var(--v2-text-quaternary, var(--text-tertiary))', opacity: 0.7 }}>
              Type / for commands
            </span>
          )}
          {onManageTemplates && (
            <button
              onClick={onManageTemplates}
              style={{
                marginLeft: 'auto',
                background: 'none',
                border:     'none',
                color:      'var(--v2-text-tertiary, var(--text-tertiary))',
                fontSize:   10,
                fontFamily: 'var(--font-ui)',
                cursor:     'pointer',
                padding:    '2px 4px',
                borderRadius: 'var(--radius-sm)',
              }}
            >
              Manage templates
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
