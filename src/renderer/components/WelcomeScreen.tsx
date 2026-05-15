/**
 * WelcomeScreen — Wave 03 #19. First-run experience.
 *
 * Trigger: wizardCompleted !== 'true' in localStorage.
 *
 * Layout (per phase-2/05-welcome.jsx):
 *   Two-column: left = pitch + CTAs + recent repos | right = 4 concept cards
 *
 * Persistence: on dismiss sets localStorage wizardCompleted='true'
 * (same key as WelcomeWizard — so both paths use one flag, no duplication).
 *
 * Recent repos: read from window.electronAPI.listHistory() — most recent 3 entries.
 * If history IPC is unavailable, falls back to empty list with a placeholder row.
 */

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Terminal, SplitSquareHorizontal, LayoutPanelLeft, Command, Folder } from 'lucide-react';
import { BrandMark } from './ui/BrandMark';
import type { HistorySessionEntry } from '../../shared/types/history-types';

interface WelcomeScreenProps {
  onDismiss:         () => void;
  onOpenRepository?: () => void;
  onStartSession?:   () => void;
  onStartTour?:      () => void;
}

// ─── Concept card (right column) ─────────────────────────────────────────────

interface ConceptCardProps {
  num:   string;
  icon:  React.ReactNode;
  title: string;
  body:  string;
  color: 'accent' | 'info' | 'success' | 'warning';
}

const colorMap = {
  accent:  { fg: 'var(--v2-accent, var(--accent-primary))',  bg: 'rgba(0,201,167,.10)' },
  info:    { fg: 'var(--v2-accent-2, #7C8FFF)',              bg: 'rgba(124,143,255,.10)' },
  success: { fg: 'var(--v2-success, #3DD68C)',               bg: 'rgba(61,214,140,.10)' },
  warning: { fg: 'var(--v2-warning, #F7A84A)',               bg: 'rgba(247,168,74,.10)' },
};

function ConceptCard({ num, icon, title, body, color }: ConceptCardProps) {
  const { fg, bg } = colorMap[color];
  return (
    <div style={{
      display:             'grid',
      gridTemplateColumns: '44px 1fr',
      gap:                 14,
      alignItems:          'center',
      background:          'var(--v2-surface-low, var(--surface-float))',
      borderRadius:        'var(--radius-lg)',
      padding:             14,
    }}>
      <div style={{
        width:        44,
        height:       44,
        borderRadius: 'var(--radius-md)',
        background:   bg,
        color:        fg,
        display:      'grid',
        placeItems:   'center',
        position:     'relative',
        flexShrink:   0,
      }}>
        {icon}
        <span style={{
          position:     'absolute',
          bottom:       -4,
          right:        -4,
          fontFamily:   'var(--font-mono-ui, "JetBrains Mono", monospace)',
          fontSize:     9,
          fontWeight:   700,
          background:   'var(--v2-surface-base, var(--surface-base))',
          color:        fg,
          padding:      '1px 5px',
          borderRadius: 'var(--radius-sm)',
          border:       `1px solid ${fg}`,
          lineHeight:   1.2,
        }}>
          {num}
        </span>
      </div>
      <div>
        <div style={{
          color:      'var(--v2-text-primary, var(--text-primary))',
          fontWeight: 600,
          fontSize:   'var(--text-md)',
        }}>
          {title}
        </div>
        <div style={{
          color:     'var(--v2-text-secondary, var(--text-secondary))',
          fontSize:  'var(--text-sm)',
          marginTop: 2,
          lineHeight: 1.5,
        }}>
          {body}
        </div>
      </div>
    </div>
  );
}

// ─── Action button ────────────────────────────────────────────────────────────

function ActionBtn({
  icon,
  label,
  shortcut,
  primary,
  ghost,
  onClick,
}: {
  icon?:     React.ReactNode;
  label:     string;
  shortcut?: string;
  primary?:  boolean;
  ghost?:    boolean;
  onClick?:  () => void;
}) {
  const bg     = primary ? 'var(--v2-accent, var(--accent-primary))' : ghost ? 'transparent' : 'var(--v2-surface-mid, var(--surface-float))';
  const color  = primary ? '#000' : 'var(--v2-text-secondary, var(--text-secondary))';
  const border = primary ? 'none' : `1px solid var(--v2-border-default, var(--border-default))`;
  return (
    <button
      onClick={onClick}
      style={{
        display:        'flex',
        alignItems:     'center',
        gap:            8,
        padding:        '10px 16px',
        background:     bg,
        color,
        border,
        borderRadius:   'var(--radius-md)',
        fontSize:       'var(--text-md)',
        fontFamily:     'var(--font-ui)',
        fontWeight:     primary ? 600 : 400,
        cursor:         'pointer',
        width:          '100%',
        textAlign:      'left',
        transition:     'opacity 120ms',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '0.85'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.opacity = '1'; }}
    >
      {icon}
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <span style={{
          display:    'flex',
          gap:        3,
          fontFamily: 'var(--font-mono-ui, "JetBrains Mono", monospace)',
          fontSize:   11,
          color:      primary ? 'rgba(0,0,0,.6)' : 'var(--v2-text-tertiary, var(--text-tertiary))',
        }}>
          {shortcut.split('').map((k, i) => (
            <kbd key={i} style={{
              padding:      '1px 4px',
              background:   primary ? 'rgba(0,0,0,.12)' : 'var(--v2-surface-high, var(--surface-high))',
              border:       `1px solid ${primary ? 'rgba(0,0,0,.2)' : 'var(--v2-border-subtle, var(--border-subtle))'}`,
              borderRadius: 3,
            }}>
              {k}
            </kbd>
          ))}
        </span>
      )}
    </button>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function WelcomeScreen({
  onDismiss,
  onOpenRepository,
  onStartSession,
  onStartTour,
}: WelcomeScreenProps) {
  const [recentRepos, setRecentRepos] = useState<HistorySessionEntry[]>([]);

  useEffect(() => {
    if (typeof window.electronAPI?.listHistory === 'function') {
      window.electronAPI.listHistory()
        .then((entries) => {
          // Deduplicate by workingDirectory, take the 3 most-recent unique dirs
          const seen = new Set<string>();
          const deduped: HistorySessionEntry[] = [];
          for (const e of entries) {
            const dir = e.workingDirectory ?? '';
            if (dir && !seen.has(dir)) {
              seen.add(dir);
              deduped.push(e);
            }
            if (deduped.length >= 3) break;
          }
          setRecentRepos(deduped);
        })
        .catch(() => { /* leave empty */ });
    }
  }, []);

  const handleOpenRepo = useCallback(() => {
    onDismiss();
    onOpenRepository?.();
  }, [onDismiss, onOpenRepository]);

  const handleStartSession = useCallback(() => {
    onDismiss();
    onStartSession?.();
  }, [onDismiss, onStartSession]);

  const handleStartTour = useCallback(() => {
    // Don't dismiss yet — tour will show over the main workspace
    onStartTour?.();
  }, [onStartTour]);

  function relativeTime(ts?: number): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const min  = Math.floor(diff / 60_000);
    const hr   = Math.floor(diff / 3_600_000);
    const day  = Math.floor(diff / 86_400_000);
    if (min < 2)  return 'just now';
    if (min < 60) return `${min} min ago`;
    if (hr  < 24) return `${hr}h ago`;
    if (day < 7)  return `${day}d ago`;
    return 'last week';
  }

  return createPortal(
    <div style={{
      position:   'fixed',
      inset:      0,
      background: 'var(--v2-surface-base, var(--surface-base))',
      display:    'grid',
      gridTemplateColumns: '48px 1fr',
      gridTemplateRows:    '36px 1fr 24px',
      zIndex:     'var(--z-modal)' as any,
      overflow:   'hidden',
    }}>
      {/* Minimal title bar row */}
      <div style={{
        gridColumn: '1 / -1',
        gridRow:    1,
        background: 'var(--v2-surface-base, var(--surface-base))',
        borderBottom: '1px solid var(--v2-border-subtle, var(--border-subtle))',
        display:    'flex',
        alignItems: 'center',
        padding:    '0 16px',
        gap:        8,
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}>
        <BrandMark size={14} color="var(--v2-accent, var(--accent-primary))" />
        <span style={{
          fontFamily:  'var(--font-ui)',
          fontSize:    'var(--text-xs)',
          color:       'var(--v2-text-tertiary, var(--text-tertiary))',
          fontWeight:  500,
        }}>
          omnidesk · welcome
        </span>
      </div>

      {/* Dimmed activity bar */}
      <div style={{
        gridColumn:   1,
        gridRow:      '2 / 4',
        background:   'var(--v2-surface-base, var(--surface-base))',
        borderRight:  '1px solid var(--v2-border-subtle, var(--border-subtle))',
        display:      'flex',
        flexDirection: 'column',
        alignItems:   'center',
        paddingTop:   8,
        gap:          4,
        opacity:      0.3,
      }}>
        {[Terminal, SplitSquareHorizontal, LayoutPanelLeft, Command].map((Icon, i) => (
          <div key={i} style={{
            width:        36,
            height:       36,
            display:      'grid',
            placeItems:   'center',
            color:        'var(--v2-text-tertiary, var(--text-tertiary))',
          }}>
            <Icon size={16} />
          </div>
        ))}
      </div>

      {/* Main content — two-column */}
      <div style={{
        gridColumn: 2,
        gridRow:  2,
        padding:  '60px 80px',
        overflow: 'auto',
        display:  'grid',
        gridTemplateColumns: '1fr 1fr',
        gap:      64,
        alignItems: 'center',
      }}>
        {/* Left — pitch + CTAs + recent repos */}
        <div>
          {/* Logo mark */}
          <div style={{
            width:        44,
            height:       44,
            borderRadius: 'var(--radius-lg)',
            background:   'rgba(0,201,167,.12)',
            color:        'var(--v2-accent, var(--accent-primary))',
            display:      'grid',
            placeItems:   'center',
            marginBottom: 24,
            boxShadow:    '0 0 0 8px rgba(0,201,167,.06)',
          }}>
            <Terminal size={22} />
          </div>

          <div style={{
            fontFamily:    'var(--font-mono-ui, "JetBrains Mono", monospace)',
            fontSize:      11,
            color:         'var(--v2-accent, var(--accent-primary))',
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            marginBottom:  12,
          }}>
            OmniDesk
          </div>

          <h1 style={{
            fontSize:      32,
            fontWeight:    700,
            letterSpacing: '-.02em',
            color:         'var(--v2-text-primary, var(--text-primary))',
            marginBottom:  16,
            lineHeight:    1.15,
            margin:        '0 0 16px',
          }}>
            A terminal workspace<br />for AI coding sessions.
          </h1>

          <p style={{
            color:        'var(--v2-text-secondary, var(--text-secondary))',
            fontSize:     'var(--text-md)',
            marginBottom: 32,
            maxWidth:     380,
            lineHeight:   1.6,
            margin:       '0 0 32px',
          }}>
            Run Claude Code, Codex CLI, and more side by side. Split, snapshot,
            orchestrate. Discoverable via <kbd style={{ padding: '1px 4px', background: 'var(--v2-surface-high, var(--surface-high))', borderRadius: 3, border: '1px solid var(--v2-border-default, var(--border-default))', fontFamily: 'var(--font-mono-ui)' }}>⌘</kbd><kbd style={{ padding: '1px 4px', background: 'var(--v2-surface-high, var(--surface-high))', borderRadius: 3, border: '1px solid var(--v2-border-default, var(--border-default))', fontFamily: 'var(--font-mono-ui)' }}>K</kbd>.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
            <ActionBtn
              primary
              icon={<Folder size={14} />}
              label="Open a repository"
              shortcut="⌘O"
              onClick={handleOpenRepo}
            />
            <ActionBtn
              icon={<Terminal size={14} />}
              label="Start a session without a repo"
              onClick={handleStartSession}
            />
            <ActionBtn
              ghost
              icon={<Command size={14} />}
              label="90-second tour"
              onClick={handleStartTour}
            />
          </div>

          {/* Recent repos */}
          <div style={{ marginTop: 36 }}>
            <div style={{
              fontFamily:   'var(--font-mono-ui, "JetBrains Mono", monospace)',
              fontSize:     11,
              color:        'var(--v2-text-tertiary, var(--text-tertiary))',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '.1em',
            }}>
              Recent repos
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {recentRepos.length === 0 && (
                <span style={{
                  fontFamily: 'var(--font-mono-ui, "JetBrains Mono", monospace)',
                  fontSize:   11,
                  color:      'var(--v2-text-quaternary, var(--text-tertiary))',
                  opacity:    0.5,
                }}>
                  No recent sessions yet
                </span>
              )}
              {recentRepos.map((h) => (
                <button
                  key={h.id}
                  onClick={handleOpenRepo}
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        8,
                    background: 'none',
                    border:     'none',
                    cursor:     'pointer',
                    padding:    '2px 0',
                    color:      'var(--v2-text-secondary, var(--text-secondary))',
                    fontFamily: 'var(--font-mono-ui, "JetBrains Mono", monospace)',
                    fontSize:   11,
                    textAlign:  'left',
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--v2-accent, var(--accent-primary))'; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--v2-text-secondary, var(--text-secondary))'; }}
                >
                  <Folder size={12} style={{ color: 'var(--v2-text-tertiary, var(--text-tertiary))', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {h.workingDirectory ?? h.name}
                  </span>
                  {h.lastUpdatedAt && (
                    <span style={{ color: 'var(--v2-text-quaternary, var(--text-tertiary))', opacity: 0.6, flexShrink: 0 }}>
                      · {relativeTime(h.lastUpdatedAt)}
                    </span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Right — 4 concept cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{
            fontFamily:    'var(--font-mono-ui, "JetBrains Mono", monospace)',
            fontSize:      10,
            textTransform: 'uppercase',
            letterSpacing: '.14em',
            color:         'var(--v2-text-tertiary, var(--text-tertiary))',
            marginBottom:  4,
          }}>
            The four ideas
          </div>
          <ConceptCard
            num="01"
            icon={<Terminal size={20} />}
            title="Sessions"
            body="Each tab is one AI coding session. Switch with ⌘1–9."
            color="accent"
          />
          <ConceptCard
            num="02"
            icon={<SplitSquareHorizontal size={20} />}
            title="Split view"
            body="Drag any tab to the edge — run up to 4 in parallel."
            color="info"
          />
          <ConceptCard
            num="03"
            icon={<LayoutPanelLeft size={20} />}
            title="Panels"
            body="The activity bar opens context: tasks, git, agents, more."
            color="success"
          />
          <ConceptCard
            num="04"
            icon={<Command size={20} />}
            title="The palette"
            body="⌘K is the answer to every other thing this app does."
            color="warning"
          />
        </div>
      </div>

      {/* Status bar row */}
      <div style={{
        gridColumn:   '1 / -1',
        gridRow:      3,
        background:   'var(--v2-surface-base, var(--surface-base))',
        borderTop:    '1px solid var(--v2-border-subtle, var(--border-subtle))',
        display:      'flex',
        alignItems:   'center',
        padding:      '0 12px',
        gap:          8,
        fontFamily:   'var(--font-mono-ui, "JetBrains Mono", monospace)',
        fontSize:     10,
        color:        'var(--v2-text-tertiary, var(--text-tertiary))',
      }}>
        <span>⌘K to explore</span>
      </div>
    </div>,
    document.body
  );
}
