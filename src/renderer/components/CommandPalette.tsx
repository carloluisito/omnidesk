/**
 * CommandPalette — Redesigned to match Obsidian spec §6.11.
 *
 * Centered, top 20% of screen, 600px wide.
 * Backdrop: rgba(0,0,0,0.6). Search always focused.
 * Categories in text-tertiary uppercase headers.
 * Results: hover/selected with accent-primary-muted bg + accent left border.
 * Keyboard shortcuts in surface-float pills.
 * Arrow keys navigate, Enter activates, Esc closes.
 * Preserves all existing props/types.
 */

import { useEffect, useRef } from 'react';
import * as LucideIcons from 'lucide-react';
import { PromptTemplate } from '../../shared/types/prompt-templates';
import { FuzzySearchResult } from '../utils/fuzzy-search';
import { Search, Settings2 } from 'lucide-react';

interface CommandPaletteProps {
  isOpen: boolean;
  query: string;
  onQueryChange: (query: string) => void;
  results: FuzzySearchResult<PromptTemplate>[];
  selectedIndex: number;
  onSelectIndex: (index: number) => void;
  onSelectTemplate: (template: PromptTemplate) => void;
  onClose: () => void;
  onManageTemplates: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function getIcon(iconName?: string): React.ComponentType<{ size?: number }> | null {
  if (!iconName) return null;
  // @ts-ignore
  const Icon = LucideIcons[iconName];
  return Icon || null;
}

// Keyboard shortcut pill
function KbdPill({ children }: { children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1px 5px',
        background: 'var(--surface-float)',
        border: '1px solid var(--border-default)',
        borderRadius: 3,
        fontSize: 10,
        fontFamily: 'var(--font-mono-ui)',
        color: 'var(--text-tertiary)',
        lineHeight: 1.6,
      }}
    >
      {children}
    </span>
  );
}

// Section header (RECENT, ACTIONS, TEMPLATES)
function CategoryHeader({ label }: { label: string }) {
  return (
    <div
      style={{
        padding: '8px 12px 4px',
        fontSize: 'var(--text-2xs)',
        fontWeight: 'var(--weight-semibold)',
        color: 'var(--text-tertiary)',
        letterSpacing: 'var(--tracking-widest)',
        textTransform: 'uppercase',
        fontFamily: 'var(--font-ui)',
      }}
    >
      {label}
    </div>
  );
}

// ─── Main component ────────────────────────────────────────────────────────

export function CommandPalette({
  isOpen,
  query,
  onQueryChange,
  results,
  selectedIndex,
  onSelectIndex,
  onSelectTemplate,
  onClose,
  onManageTemplates,
}: CommandPaletteProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const resultsRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [isOpen]);

  useEffect(() => {
    if (selectedItemRef.current && resultsRef.current) {
      const itemRect = selectedItemRef.current.getBoundingClientRect();
      const containerRect = resultsRef.current.getBoundingClientRect();
      if (itemRect.bottom > containerRect.bottom) {
        selectedItemRef.current.scrollIntoView({ block: 'nearest' });
      } else if (itemRect.top < containerRect.top) {
        selectedItemRef.current.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  if (!isOpen) return null;

  // Group results
  const builtInResults = results.filter((r) => r.item.type === 'built-in');
  const userResults = results.filter((r) => r.item.type !== 'built-in');

  let globalIndex = 0;

  const renderResultItem = (result: FuzzySearchResult<PromptTemplate>) => {
    const template = result.item;
    const Icon = getIcon(template.icon);
    const idx = globalIndex++;
    const isSelected = idx === selectedIndex;

    return (
      <div
        key={template.id}
        ref={isSelected ? selectedItemRef : null}
        onClick={() => onSelectTemplate(template)}
        onMouseEnter={() => onSelectIndex(idx)}
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 10,
          padding: '7px 12px',
          cursor: 'pointer',
          background: isSelected ? 'var(--accent-primary-muted)' : 'transparent',
          borderLeft: `2px solid ${isSelected ? 'var(--border-accent)' : 'transparent'}`,
          transition: 'background var(--duration-instant), border-color var(--duration-instant)',
        }}
      >
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: 'var(--radius-sm)',
            background: 'var(--surface-high)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: isSelected ? 'var(--text-accent)' : 'var(--text-tertiary)',
            flexShrink: 0,
          }}
        >
          {Icon ? (
            <Icon size={14} />
          ) : (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 3a3 3 0 0 0-3 3v12a3 3 0 0 0 3 3 3 3 0 0 0 3-3 3 3 0 0 0-3-3H6a3 3 0 0 0-3 3 3 3 0 0 0 3 3 3 3 0 0 0 3-3V6a3 3 0 0 0-3-3 3 3 0 0 0-3 3 3 3 0 0 0 3 3h12a3 3 0 0 0 3-3 3 3 0 0 0-3-3z" />
            </svg>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            style={{
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-medium)',
              color: isSelected ? 'var(--text-accent)' : 'var(--text-primary)',
              fontFamily: 'var(--font-ui)',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            {template.name}
            {template.type === 'built-in' && (
              <span
                style={{
                  fontSize: 9,
                  padding: '1px 4px',
                  background: 'var(--surface-float)',
                  border: '1px solid var(--border-default)',
                  borderRadius: 2,
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-mono-ui)',
                  letterSpacing: 'var(--tracking-wide)',
                  textTransform: 'uppercase',
                }}
              >
                built-in
              </span>
            )}
          </div>
          {template.description && (
            <div
              style={{
                fontSize: 'var(--text-xs)',
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-ui)',
                marginTop: 2,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {template.description}
            </div>
          )}
        </div>
        {(template as any).shortcut && (
          <KbdPill>{(template as any).shortcut}</KbdPill>
        )}
      </div>
    );
  };

  return (
    <div
      onClick={handleOverlayClick}
      role="presentation"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '20vh',
        zIndex: 'var(--z-modal)' as any,
        animation: 'cp-fade-in var(--duration-fast) var(--ease-out)',
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette"
        style={{
          width: 600,
          maxWidth: 'calc(100vw - 48px)',
          maxHeight: 'calc(80vh - 120px)',
          background: 'var(--surface-overlay)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          animation: 'cp-enter var(--duration-fast) var(--ease-out)',
        }}
      >
        {/* Search input */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '12px 16px',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <Search size={15} style={{ color: 'var(--text-tertiary)', flexShrink: 0 }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            placeholder="Search templates and actions..."
            autoComplete="off"
            spellCheck={false}
            style={{
              flex: 1,
              background: 'none',
              border: 'none',
              outline: 'none',
              fontSize: 'var(--text-md)',
              fontFamily: 'var(--font-ui)',
              color: 'var(--text-primary)',
            }}
          />
          {/* Hints */}
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              flexShrink: 0,
            }}
          >
            <KbdPill>↑↓</KbdPill>
            <KbdPill>↵</KbdPill>
            <KbdPill>Esc</KbdPill>
          </div>
        </div>

        {/* Results */}
        <div
          ref={resultsRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            scrollbarWidth: 'thin',
            scrollbarColor: 'var(--border-strong) transparent',
          }}
        >
          {results.length === 0 && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 'var(--space-8)',
                gap: 'var(--space-2)',
              }}
            >
              <Search size={24} style={{ color: 'var(--text-tertiary)' }} />
              <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
                No commands found
              </span>
            </div>
          )}

          {results.length > 0 && (
            <>
              {userResults.length > 0 && (
                <>
                  <CategoryHeader label="Templates" />
                  {userResults.map(renderResultItem)}
                </>
              )}
              {builtInResults.length > 0 && (
                <>
                  <CategoryHeader label="Actions" />
                  {builtInResults.map(renderResultItem)}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'flex-end',
            padding: '8px 12px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'var(--surface-raised)',
          }}
        >
          <button
            onClick={onManageTemplates}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              background: 'none',
              border: 'none',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
              padding: '2px 4px',
              borderRadius: 'var(--radius-sm)',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
          >
            <Settings2 size={11} />
            Manage Templates
          </button>
        </div>
      </div>

      <style>{`
        @keyframes cp-fade-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes cp-enter {
          from { opacity: 0; transform: scale(0.97) translateY(-8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
