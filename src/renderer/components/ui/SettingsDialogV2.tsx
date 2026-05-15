// ─────────────────────────────────────────────────────────────────────────────
// V2 SettingsDialog
// Sidebar categories · search · grouped surfaces · inline hints · standardized controls.
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useRef, useCallback } from 'react';

type V2Category =
  | 'general'
  | 'sessions'
  | 'providers'
  | 'workspaces'
  | 'git'
  | 'tasks'
  | 'tunnels'
  | 'advanced'
  | 'about';

interface CategoryDef {
  id:    V2Category;
  label: string;
  group: 'workspace' | 'surfaces' | 'account';
}

const CATEGORIES: CategoryDef[] = [
  { id: 'general',    label: 'General',    group: 'workspace' },
  { id: 'sessions',   label: 'Sessions',   group: 'workspace' },
  { id: 'providers',  label: 'Providers',  group: 'workspace' },
  { id: 'workspaces', label: 'Workspaces', group: 'workspace' },
  { id: 'git',        label: 'Git',        group: 'surfaces'  },
  { id: 'tasks',      label: 'Tasks',      group: 'surfaces'  },
  { id: 'tunnels',    label: 'Tunnels',    group: 'surfaces'  },
  { id: 'advanced',   label: 'Advanced',   group: 'account'   },
  { id: 'about',      label: 'About',      group: 'account'   },
];

interface SettingsDef { id: string; category: V2Category; label: string; hint?: string; }

const SETTINGS_INDEX: SettingsDef[] = [
  { id: 'default-model', category: 'sessions', label: 'Default model',     hint: 'The model selected when a Claude tab opens.' },
  { id: 'pool-enabled',  category: 'sessions', label: 'Session pool',      hint: 'Pre-warm shells for faster session creation.' },
  { id: 'agent-teams',   category: 'general',  label: 'Agent teams',       hint: 'Enable multi-agent team support.' },
  { id: 'auto-layout',   category: 'general',  label: 'Auto-layout teams', hint: 'Arrange panes when a new team is detected.' },
];

// ── Category icon ─────────────────────────────────────────────────────────────

function CatIcon({ id }: { id: V2Category }) {
  const dMap: Record<string, string> = {
    general:    'M12 15a3 3 0 100-6 3 3 0 000 6z',
    sessions:   'M4 17l6-6-6-6m8 14h8',
    providers:  'M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m10-9H3',
    workspaces: 'M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z',
    git:        'M6 3v12m0 0a3 3 0 100 6 3 3 0 000-6zm12-9a3 3 0 100-6 3 3 0 000 6zm0 0v6a6 6 0 01-6 6H6',
    tasks:      'M9 11l3 3L22 4M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11',
    tunnels:    'M5 12h14M12 5l7 7-7 7',
    advanced:   'M13 2L3 14h9l-1 8 10-12h-9l1-8z',
    about:      'M12 22c5.52 0 10-4.48 10-10S17.52 2 12 2 2 6.48 2 12s4.48 10 10 10zm1-11h-2v6h2v-6zm0-4h-2v2h2V7z',
  };
  const d = dMap[id] ?? dMap['general'];
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.75"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

// ── Toggle ────────────────────────────────────────────────────────────────────

function Toggle({ on, onChange, label }: { on: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button
      role="switch" aria-checked={on} aria-label={label}
      onClick={() => onChange(!on)}
      style={{
        width: 32, height: 18, borderRadius: 999,
        background: on ? 'var(--v2-accent)' : 'var(--v2-surface-high)',
        border: 0, padding: 0, position: 'relative',
        cursor: 'pointer', flexShrink: 0, transition: 'background 0.12s ease',
      }}
    >
      <span style={{
        position: 'absolute', top: 2, left: on ? 16 : 2,
        width: 14, height: 14, borderRadius: '50%',
        background: on ? '#051A16' : 'var(--v2-text-secondary)',
        transition: 'left 0.12s ease',
      }} />
    </button>
  );
}

// ── SettingsRow ───────────────────────────────────────────────────────────────

function SRow({
  label, hint, control, divider = true, highlight,
}: {
  label: string; hint?: string; control: React.ReactNode;
  divider?: boolean; highlight?: string;
}) {
  const renderLabel = () => {
    if (!highlight) return <>{label}</>;
    const lo = label.toLowerCase();
    const hi = highlight.toLowerCase();
    const idx = lo.indexOf(hi);
    if (idx === -1) return <>{label}</>;
    return (
      <>
        {label.slice(0, idx)}
        <b style={{ color: 'var(--v2-accent)' }}>{label.slice(idx, idx + highlight.length)}</b>
        {label.slice(idx + highlight.length)}
      </>
    );
  };
  return (
    <div style={{
      display: 'grid', gridTemplateColumns: '1fr auto', gap: 16,
      alignItems: 'flex-start', padding: '14px 0',
      borderBottom: divider ? '1px solid var(--v2-border-subtle)' : 'none',
    }}>
      <div>
        <div style={{ color: 'var(--v2-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500 }}>
          {renderLabel()}
        </div>
        {hint && (
          <div style={{ color: 'var(--v2-text-tertiary)', fontSize: 'var(--text-xs)', marginTop: 4, lineHeight: 1.5, maxWidth: 480 }}>
            {hint}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>{control}</div>
    </div>
  );
}

// ── SettingsGroup ─────────────────────────────────────────────────────────────

function SGroup({ caption, children }: { caption: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--v2-surface-low)', borderRadius: 'var(--radius-lg)',
      padding: '4px 16px', marginBottom: 16,
    }}>
      <div style={{
        fontFamily: 'var(--font-mono)', fontSize: 10,
        textTransform: 'uppercase', letterSpacing: '.12em',
        color: 'var(--v2-text-tertiary)', padding: '12px 0 4px',
      }}>
        {caption}
      </div>
      {children}
    </div>
  );
}

// ── Category panes ────────────────────────────────────────────────────────────

function CategoryPane({
  category, settings, onSetFlag,
}: {
  category:  V2Category;
  settings:  import('../../../shared/ipc-types').AppSettings | null;
  onSetFlag: (key: string, value: boolean) => void;
}) {
  const label = CATEGORIES.find(c => c.id === category)?.label ?? category;

  if (category === 'general') {
    return (
      <div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--v2-accent)', marginBottom: 4 }}>General</div>
        <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--v2-text-primary)', margin: '0 0 18px' }}>General</h2>
        <SGroup caption="Application">
          <SRow
            label="Agent teams"
            hint="Enable multi-agent team support."
            control={
              <Toggle on={settings?.enableAgentTeams !== false} onChange={(v) => onSetFlag('enableAgentTeams', v)} />
            }
          />
          <SRow
            label="Auto-layout teams"
            hint="Arrange panes automatically when a new team is detected."
            divider={false}
            control={
              <Toggle on={settings?.autoLayoutTeams !== false} onChange={(v) => onSetFlag('autoLayoutTeams', v)} />
            }
          />
        </SGroup>
      </div>
    );
  }

  return (
    <div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.14em', color: 'var(--v2-accent)', marginBottom: 4 }}>{label}</div>
      <h2 style={{ fontSize: 'var(--text-xl)', fontWeight: 600, color: 'var(--v2-text-primary)', margin: '0 0 18px' }}>{label}</h2>
      <p style={{ color: 'var(--v2-text-secondary)', fontSize: 'var(--text-sm)' }}>
        Settings for this category are coming soon.
      </p>
    </div>
  );
}

// ── V2 SettingsDialog ─────────────────────────────────────────────────────────

export function V2SettingsDialog({
  isOpen,
  onClose,
  initialCategory,
}: {
  isOpen: boolean;
  onClose: () => void;
  initialCategory?: V2Category;
}) {
  const [activeCategory, setActiveCategory] = useState<V2Category>(initialCategory ?? 'general');
  const [searchQuery,    setSearchQuery]    = useState('');
  const [appSettings,    setAppSettings]    = useState<import('../../../shared/ipc-types').AppSettings | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  // When palette navigates to a specific category, jump to it
  useEffect(() => {
    if (initialCategory) setActiveCategory(initialCategory as V2Category);
  }, [initialCategory]);

  useEffect(() => {
    if (!isOpen) return;
    window.electronAPI?.getSettings().then((s) => {
      setAppSettings(s);
    }).catch(() => {});
  }, [isOpen]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (searchQuery) { setSearchQuery(''); return; }
        onClose();
      }
      if (e.key === 'f' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, [isOpen, searchQuery, onClose]);

  const handleSetFlag = useCallback(async (key: string, value: boolean) => {
    try {
      await window.electronAPI?.setSettings({ [key]: value } as any);
      const updated = await window.electronAPI?.getSettings();
      if (updated) setAppSettings(updated);
    } catch { /* ignore */ }
  }, []);

  if (!isOpen) return null;

  const groups: Array<{ label: string; key: 'workspace' | 'surfaces' | 'account' }> = [
    { label: 'Workspace', key: 'workspace' },
    { label: 'Surfaces',  key: 'surfaces'  },
    { label: 'Account',   key: 'account'   },
  ];

  const isSearching = searchQuery.trim().length > 1;
  const searchHits  = isSearching
    ? SETTINGS_INDEX.filter(
        (s) =>
          s.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (s.hint ?? '').toLowerCase().includes(searchQuery.toLowerCase())
      )
    : [];

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      role="presentation"
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 'var(--z-modal)' as any,
      }}
    >
      <div
        role="dialog" aria-modal="true" aria-label="Settings"
        className="anim-dialog-enter"
        style={{
          width: 920, height: 620,
          maxWidth: 'calc(100vw - 48px)', maxHeight: 'calc(100vh - 48px)',
          background: 'var(--v2-surface-overlay)', borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)', border: '1px solid var(--v2-border-strong)',
          overflow: 'hidden', display: 'grid',
          gridTemplateColumns: isSearching ? '1fr' : '240px 1fr',
          gridTemplateRows: '52px 1fr',
        }}
      >
        {/* Top bar */}
        <div style={{
          gridColumn: '1 / -1', gridRow: 1,
          display: 'flex', alignItems: 'center', gap: 12,
          padding: '0 14px', borderBottom: '1px solid var(--v2-border-subtle)',
          background: 'var(--v2-surface-overlay)',
        }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
            stroke="var(--v2-accent)" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
            <path d="M19.94 12a8 8 0 01-.09 1.05l2.11 1.65c.19.15.24.42.12.64l-2 3.46c-.12.22-.38.3-.61.22l-2.49-1c-.52.4-1.08.73-1.69.98l-.38 2.65c-.04.24-.25.42-.5.42h-4c-.25 0-.46-.18-.5-.42l-.38-2.65c-.61-.25-1.17-.59-1.69-.98l-2.49 1c-.23.09-.49 0-.61-.22l-2-3.46c-.12-.22-.07-.49.12-.64l2.11-1.65A8.003 8.003 0 014 12" />
          </svg>
          <span style={{ color: 'var(--v2-text-primary)', fontWeight: 600 }}>Settings</span>

          <div style={{ flex: 1, position: 'relative', maxWidth: 380, marginLeft: 16 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
              stroke={isSearching ? 'var(--v2-accent)' : 'var(--v2-text-tertiary)'}
              strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"
              style={{ position: 'absolute', left: 10, top: 8 }}>
              <circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" />
            </svg>
            <input
              ref={searchRef} type="search" placeholder="Filter settings…"
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              aria-label="Search settings"
              style={{
                width: '100%', height: 30, paddingLeft: 30, paddingRight: 32,
                background: 'var(--v2-surface-mid)',
                border: `1px solid ${isSearching ? 'var(--v2-accent)' : 'var(--v2-border-default)'}`,
                borderRadius: 'var(--radius-md)', color: 'var(--v2-text-primary)',
                fontSize: 'var(--text-sm)', fontFamily: 'inherit', outline: 'none',
              }}
            />
            <kbd style={{
              position: 'absolute', right: 8, top: 7, fontSize: 9,
              color: 'var(--v2-text-tertiary)', fontFamily: 'var(--font-mono)',
              background: 'var(--v2-surface-high)', border: '1px solid var(--v2-border-default)',
              borderRadius: 3, padding: '1px 4px',
            }}>
              ⌘F
            </kbd>
          </div>

          <button
            onClick={onClose} aria-label="Close settings"
            style={{
              marginLeft: 'auto', width: 28, height: 28,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'transparent', border: 'none', borderRadius: 'var(--radius-sm)',
              color: 'var(--v2-text-tertiary)', cursor: 'pointer',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
              stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Sidebar */}
        {!isSearching && (
          <div style={{
            gridRow: 2, background: 'var(--v2-surface-low)',
            borderRight: '1px solid var(--v2-border-subtle)',
            padding: '14px 8px', overflowY: 'auto',
          }}>
            {groups.map((group, gi) => (
              <div key={group.key}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  textTransform: 'uppercase', letterSpacing: '.12em',
                  color: 'var(--v2-text-tertiary)',
                  padding: gi === 0 ? '0 10px 6px' : '14px 10px 6px',
                }}>
                  {group.label}
                </div>
                {CATEGORIES.filter((c) => c.group === group.key).map((cat) => {
                  const isActive = activeCategory === cat.id;
                  return (
                    <button
                      key={cat.id}
                      onClick={() => setActiveCategory(cat.id)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        width: '100%', padding: '6px 10px',
                        background: isActive ? 'var(--v2-surface-mid)' : 'transparent',
                        borderLeft: `2px solid ${isActive ? 'var(--v2-accent)' : 'transparent'}`,
                        borderTop: 'none', borderRight: 'none', borderBottom: 'none',
                        borderRadius: '0 6px 6px 0',
                        fontSize: 'var(--text-sm)',
                        color: isActive ? 'var(--v2-text-primary)' : 'var(--v2-text-secondary)',
                        cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
                      }}
                    >
                      <span style={{ color: isActive ? 'var(--v2-accent)' : 'var(--v2-text-tertiary)', display: 'flex' }}>
                        <CatIcon id={cat.id} />
                      </span>
                      <span style={{ flex: 1 }}>{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        )}

        {/* Content */}
        <div style={{ gridRow: 2, overflowY: 'auto', padding: '24px 32px 32px' }}>
          {isSearching ? (
            <div>
              <div style={{
                fontFamily: 'var(--font-mono)', fontSize: 10,
                textTransform: 'uppercase', letterSpacing: '.12em',
                color: 'var(--v2-text-tertiary)', marginBottom: 8,
              }}>
                {searchHits.length} result{searchHits.length !== 1 ? 's' : ''} for &ldquo;{searchQuery}&rdquo;
              </div>
              {searchHits.length === 0 ? (
                <p style={{ color: 'var(--v2-text-secondary)', fontSize: 'var(--text-sm)' }}>
                  No settings match. Press Esc to clear.
                </p>
              ) : (
                searchHits.map((hit) => {
                  const catLabel = CATEGORIES.find((c) => c.id === hit.category)?.label ?? hit.category;
                  return (
                    <div
                      key={hit.id}
                      style={{
                        background: 'var(--v2-surface-low)', borderRadius: 'var(--radius-lg)',
                        padding: '12px 16px', marginBottom: 8,
                      }}
                    >
                      <div style={{
                        fontFamily: 'var(--font-mono)', fontSize: 10,
                        color: 'var(--v2-text-tertiary)',
                        textTransform: 'uppercase', letterSpacing: '.12em', marginBottom: 4,
                      }}>
                        {catLabel} &rsaquo; {hit.label}
                      </div>
                      <div style={{ color: 'var(--v2-text-primary)', fontSize: 'var(--text-sm)', fontWeight: 500, marginBottom: 4 }}>
                        <SRow
                          label={hit.label}
                          hint={hit.hint}
                          highlight={searchQuery}
                          divider={false}
                          control={null}
                        />
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <CategoryPane
              category={activeCategory}
              settings={appSettings}
              onSetFlag={handleSetFlag}
            />
          )}
        </div>
      </div>
    </div>
  );
}
