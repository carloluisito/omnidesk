/**
 * CommandCenter — Wave 03 #20. Returning-user startup surface.
 *
 * Trigger conditions (ALL must be true):
 *   - wizardCompleted === 'true' in localStorage (first-run done)
 *   - At least one recent session exists (from listHistory)
 *
 * Layout (per phase-2/05-welcome.jsx CommandCenter):
 *   - Greeting + greeting line
 *   - Resume hero card (last session, gradient-accent border)
 *   - 3-column row: Recent Sessions · Repo State · Start Fresh
 *
 * Data sources:
 *   - Recent sessions: listHistory() IPC
 *   - Repo state: git status from useGit hook (passed as prop)
 *   - Tasks: top 3 from tasks list (passed as prop; optional)
 *
 * Dismiss: "Resume" or "Start new" both call onDismiss().
 */

import { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Terminal, GitBranch, CheckSquare, Zap, ArrowRight, Play } from 'lucide-react';
import type { HistorySessionEntry } from '../../shared/types/history-types';
import type { GitStatus } from '../../shared/types/git-types';

interface CommandCenterProps {
  onDismiss:        () => void;
  onResumeSession?: (entry: { id: string; name: string; workingDirectory: string }) => void;
  onNewSession?:    () => void;
  onOpenPalette?:   () => void;
  onRunPlaybook?:   () => void;
  onLaunchTeam?:    () => void;
  gitStatus?:       GitStatus | null;
  /** Top 3 open tasks to show in the dashboard */
  openTaskTitles?:  string[];
}

// ─── DashCard shell ───────────────────────────────────────────────────────────

function DashCard({ title, icon, badge, children }: {
  title:    string;
  icon:     React.ReactNode;
  badge?:   string;
  children: React.ReactNode;
}) {
  return (
    <div style={{
      background:   'var(--v2-surface-low, var(--surface-float))',
      borderRadius: 'var(--radius-lg)',
      padding:      14,
      minHeight:    200,
      display:      'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
        <span style={{ color: 'var(--v2-accent, var(--accent-primary))' }}>{icon}</span>
        <span style={{ color: 'var(--v2-text-primary, var(--text-primary))', fontWeight: 600, fontSize: 'var(--text-sm)' }}>
          {title}
        </span>
        {badge && (
          <span style={{
            marginLeft: 'auto',
            fontFamily: 'var(--font-mono-ui, "JetBrains Mono", monospace)',
            fontSize:   10,
            color:      'var(--v2-text-tertiary, var(--text-tertiary))',
          }}>
            {badge}
          </span>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, flex: 1 }}>
        {children}
      </div>
    </div>
  );
}

// ─── DashRow ─────────────────────────────────────────────────────────────────

function DashRow({ icon, title, meta, live, warn }: {
  icon:   React.ReactNode;
  title:  string;
  meta?:  string;
  live?:  boolean;
  warn?:  boolean;
}) {
  return (
    <div style={{
      display:    'flex',
      alignItems: 'center',
      gap:        10,
      padding:    '6px 8px',
      borderRadius: 6,
      fontSize:   'var(--text-sm)',
    }}>
      <span style={{ flexShrink: 0, color: 'var(--v2-text-tertiary, var(--text-tertiary))', display: 'grid', placeItems: 'center' }}>
        {icon}
      </span>
      <span style={{
        color:        'var(--v2-text-primary, var(--text-primary))',
        flex:         1,
        overflow:     'hidden',
        textOverflow: 'ellipsis',
        whiteSpace:   'nowrap',
      }}>
        {title}
      </span>
      {live && (
        <span style={{
          width:     6,
          height:    6,
          borderRadius: '50%',
          background: 'var(--v2-success, #3DD68C)',
          flexShrink: 0,
          animation:  'anim-status-pulse 1.6s ease-in-out infinite',
        }} />
      )}
      {warn && (
        <span style={{
          width:     6,
          height:    6,
          borderRadius: '50%',
          background: 'var(--v2-warning, #F7A84A)',
          flexShrink: 0,
        }} />
      )}
      {meta && (
        <span style={{
          fontFamily: 'var(--font-mono-ui, "JetBrains Mono", monospace)',
          fontSize:   10,
          color:      'var(--v2-text-tertiary, var(--text-tertiary))',
          flexShrink: 0,
        }}>
          {meta}
        </span>
      )}
    </div>
  );
}

// ─── QuickAction ─────────────────────────────────────────────────────────────

function QuickAction({ icon, title, shortcut, onClick }: {
  icon:      React.ReactNode;
  title:     string;
  shortcut?: string;
  onClick?:  () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        display:    'flex',
        alignItems: 'center',
        gap:        10,
        padding:    '6px 8px',
        borderRadius: 6,
        fontSize:   'var(--text-sm)',
        color:      'var(--v2-text-secondary, var(--text-secondary))',
        background: 'none',
        border:     'none',
        cursor:     'pointer',
        width:      '100%',
        textAlign:  'left',
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'var(--v2-surface-mid, var(--surface-raised))'; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = 'none'; }}
    >
      <span style={{ color: 'var(--v2-text-tertiary, var(--text-tertiary))', flexShrink: 0, display: 'grid', placeItems: 'center' }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{title}</span>
      {shortcut && (
        <span style={{
          fontFamily: 'var(--font-mono-ui, "JetBrains Mono", monospace)',
          fontSize:   10,
          color:      'var(--v2-text-quaternary, var(--text-tertiary))',
          opacity:    0.6,
        }}>
          {shortcut}
        </span>
      )}
    </button>
  );
}

// ─── Provider mark ────────────────────────────────────────────────────────────

function ProviderMark({ name }: { name?: string }) {
  const letter = (name ?? 'C').charAt(0).toUpperCase();
  const isX    = letter === 'X';
  return (
    <span style={{
      width:        22,
      height:       22,
      borderRadius: 5,
      background:   isX ? 'rgba(124,143,255,.18)' : 'rgba(0,201,167,.18)',
      color:        isX ? 'var(--v2-accent-2, #7C8FFF)' : 'var(--v2-accent, var(--accent-primary))',
      display:      'grid',
      placeItems:   'center',
      fontFamily:   'var(--font-mono-ui, "JetBrains Mono", monospace)',
      fontSize:     11,
      fontWeight:   700,
      flexShrink:   0,
    }}>
      {letter}
    </span>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export function CommandCenter({
  onDismiss,
  onResumeSession,
  onNewSession,
  onOpenPalette,
  onRunPlaybook,
  onLaunchTeam,
  gitStatus,
  openTaskTitles = [],
}: CommandCenterProps) {
  const [history, setHistory] = useState<HistorySessionEntry[]>([]);

  useEffect(() => {
    if (typeof window.electronAPI?.listHistory === 'function') {
      window.electronAPI.listHistory()
        .then((entries) => setHistory(entries.slice(0, 5)))
        .catch(() => { /* leave empty */ });
    }
  }, []);

  const lastSession = history[0];

  const handleResume = useCallback(() => {
    if (lastSession) onResumeSession?.({
      id:               lastSession.id,
      name:             lastSession.name ?? 'Session',
      workingDirectory: lastSession.workingDirectory ?? '.',
    });
    onDismiss();
  }, [lastSession, onResumeSession, onDismiss]);

  const handleNewSession = useCallback(() => {
    onNewSession?.();
    onDismiss();
  }, [onNewSession, onDismiss]);

  function greeting(): string {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 18) return 'Good afternoon';
    return 'Good evening';
  }

  function relativeTime(ts?: number): string {
    if (!ts) return '';
    const diff = Date.now() - ts;
    const min  = Math.floor(diff / 60_000);
    const hr   = Math.floor(diff / 3_600_000);
    if (min < 2)  return 'just now';
    if (min < 60) return `${min} min ago`;
    if (hr  < 24) return `${hr}h ago`;
    return `${Math.floor(hr / 24)}d ago`;
  }

  const dayName = new Date().toLocaleDateString('en-US', { weekday: 'long' });

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
      {/* Title bar */}
      <div style={{
        gridColumn:   '1 / -1',
        gridRow:      1,
        background:   'var(--v2-surface-base, var(--surface-base))',
        borderBottom: '1px solid var(--v2-border-subtle, var(--border-subtle))',
        display:      'flex',
        alignItems:   'center',
        padding:      '0 16px',
        WebkitAppRegion: 'drag',
      } as React.CSSProperties}>
        <span style={{
          fontFamily: 'var(--font-ui)',
          fontSize:   'var(--text-xs)',
          color:      'var(--v2-text-tertiary, var(--text-tertiary))',
        }}>
          omnidesk
          {gitStatus?.branch && (
            <>
              <span style={{ opacity: 0.4, margin: '0 6px' }}>/</span>
              <span style={{ color: 'var(--v2-accent, var(--accent-primary))', fontFamily: 'var(--font-mono-ui)' }}>
                {gitStatus.branch}
              </span>
            </>
          )}
        </span>
      </div>

      {/* Activity bar — live icons */}
      <div style={{
        gridColumn:    1,
        gridRow:       '2 / 4',
        background:    'var(--v2-surface-base, var(--surface-base))',
        borderRight:   '1px solid var(--v2-border-subtle, var(--border-subtle))',
        display:       'flex',
        flexDirection: 'column',
        alignItems:    'center',
        paddingTop:    8,
        gap:           4,
      }}>
        {[Terminal, GitBranch, CheckSquare, Zap].map((Icon, i) => (
          <div key={i} style={{
            width:        36,
            height:       36,
            display:      'grid',
            placeItems:   'center',
            color:        i === 0 ? 'var(--v2-accent, var(--accent-primary))' : 'var(--v2-text-tertiary, var(--text-tertiary))',
            borderRadius: 'var(--radius-sm)',
            background:   i === 0 ? 'var(--v2-surface-mid, var(--surface-raised))' : 'transparent',
          }}>
            <Icon size={16} />
          </div>
        ))}
      </div>

      {/* Main body */}
      <div style={{
        gridColumn: 2,
        gridRow:  2,
        padding:  '36px 56px',
        overflow: 'auto',
      }}>
        {/* Greeting */}
        <div style={{ marginBottom: 32 }}>
          <div style={{
            fontFamily:    'var(--font-mono-ui, "JetBrains Mono", monospace)',
            fontSize:      11,
            color:         'var(--v2-text-tertiary, var(--text-tertiary))',
            letterSpacing: '.14em',
            textTransform: 'uppercase',
            marginBottom:  6,
          }}>
            {greeting()} · {dayName}
          </div>
          <div style={{
            fontSize:      28,
            fontWeight:    600,
            letterSpacing: '-.01em',
            color:         'var(--v2-text-primary, var(--text-primary))',
            lineHeight:    1.2,
          }}>
            {lastSession
              ? `Pick up ${lastSession.name ?? 'your last session'}, or start something new.`
              : 'Start something new.'}
          </div>
        </div>

        {/* Resume hero */}
        {lastSession && (
          <div style={{
            background:   'linear-gradient(135deg, rgba(0,201,167,.10), rgba(124,143,255,.06))',
            border:       '1px solid rgba(0,201,167,.18)',
            borderRadius: 'var(--radius-lg)',
            padding:      20,
            marginBottom: 24,
            display:      'grid',
            gridTemplateColumns: '1fr auto',
            gap:          24,
            alignItems:   'center',
          }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, flexWrap: 'wrap' }}>
                <ProviderMark name={undefined} />
                <span style={{ color: 'var(--v2-text-primary, var(--text-primary))', fontWeight: 600 }}>
                  {lastSession.name}
                </span>
                {gitStatus?.branch && (
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    fontFamily: 'var(--font-mono-ui, "JetBrains Mono", monospace)',
                    fontSize: 10, padding: '2px 7px', borderRadius: 'var(--radius-full, 999px)',
                    background: 'var(--v2-surface-low, rgba(255,255,255,.05))',
                    color: 'var(--v2-accent, var(--accent-primary))',
                  }}>
                    <GitBranch size={10} />{gitStatus.branch}
                  </span>
                )}
                {lastSession.segmentCount > 0 && (
                  <span style={{
                    fontFamily: 'var(--font-mono-ui, "JetBrains Mono", monospace)',
                    fontSize: 10, padding: '2px 7px', borderRadius: 'var(--radius-full, 999px)',
                    background: 'var(--v2-surface-low, rgba(255,255,255,.05))',
                    color: 'var(--v2-text-secondary, var(--text-secondary))',
                  }}>
                    {lastSession.segmentCount} exchange{lastSession.segmentCount !== 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <div style={{
                color:     'var(--v2-text-secondary, var(--text-secondary))',
                fontSize:  'var(--text-sm)',
                marginBottom: 4,
                overflow:  'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {lastSession.workingDirectory}
              </div>
              <div style={{
                color:      'var(--v2-text-tertiary, var(--text-tertiary))',
                fontFamily: 'var(--font-mono-ui, "JetBrains Mono", monospace)',
                fontSize:   11,
              }}>
                {relativeTime(lastSession.lastUpdatedAt)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button
                onClick={handleResume}
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          6,
                  padding:      '10px 16px',
                  background:   'var(--v2-accent, var(--accent-primary))',
                  color:        '#000',
                  border:       'none',
                  borderRadius: 'var(--radius-md)',
                  fontWeight:   600,
                  fontSize:     'var(--text-md)',
                  cursor:       'pointer',
                  fontFamily:   'var(--font-ui)',
                }}
              >
                <Play size={13} /> Resume <ArrowRight size={13} />
              </button>
              <button
                onClick={handleNewSession}
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          6,
                  padding:      '8px 16px',
                  background:   'transparent',
                  color:        'var(--v2-text-secondary, var(--text-secondary))',
                  border:       '1px solid var(--v2-border-default, var(--border-default))',
                  borderRadius: 'var(--radius-md)',
                  fontWeight:   400,
                  fontSize:     'var(--text-sm)',
                  cursor:       'pointer',
                  fontFamily:   'var(--font-ui)',
                }}
              >
                Start new
              </button>
            </div>
          </div>
        )}

        {/* 3-column dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          {/* Recent sessions */}
          <DashCard title="Recent sessions" icon={<Terminal size={14} />} badge={`${history.length}`}>
            {history.length === 0 && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--v2-text-tertiary, var(--text-tertiary))', padding: '6px 8px' }}>
                No history yet
              </span>
            )}
            {history.map((h) => {
              const ex = h.segmentCount > 0
                ? `${h.segmentCount} ex · ${relativeTime(h.lastUpdatedAt)}`
                : relativeTime(h.lastUpdatedAt);
              return (
                <DashRow
                  key={h.id}
                  icon={<ProviderMark name={undefined} />}
                  title={h.name}
                  meta={ex}
                />
              );
            })}
          </DashCard>

          {/* Repo state */}
          <DashCard
            title="Repo state"
            icon={<GitBranch size={14} />}
            badge={gitStatus ? ((gitStatus.unstagedCount + gitStatus.stagedCount) > 0 ? 'dirty' : 'clean') : undefined}
          >
            {!gitStatus && (
              <span style={{ fontSize: 'var(--text-xs)', color: 'var(--v2-text-tertiary, var(--text-tertiary))', padding: '6px 8px' }}>
                No repo open
              </span>
            )}
            {gitStatus?.branch && (
              <DashRow icon={<GitBranch size={14} />} title={gitStatus.branch} meta={
                [
                  gitStatus.ahead ? `↑${gitStatus.ahead}` : '',
                  gitStatus.behind ? `↓${gitStatus.behind}` : '',
                ].filter(Boolean).join(' ') || undefined
              } />
            )}
            {gitStatus && (gitStatus.unstagedCount + gitStatus.stagedCount) > 0 && (
              <DashRow
                icon={<CheckSquare size={14} />}
                title={`${gitStatus.unstagedCount + gitStatus.stagedCount} changed file${(gitStatus.unstagedCount + gitStatus.stagedCount) !== 1 ? 's' : ''}`}
                warn={gitStatus.conflictedCount > 0}
              />
            )}
            {gitStatus && gitStatus.conflictedCount > 0 && (
              <DashRow
                icon={<Zap size={14} />}
                title={`${gitStatus.conflictedCount} conflict${gitStatus.conflictedCount !== 1 ? 's' : ''}`}
                meta="needs resolve"
                warn
              />
            )}
            {openTaskTitles.length > 0 && (
              <DashRow
                icon={<CheckSquare size={14} />}
                title={`${openTaskTitles.length} task${openTaskTitles.length !== 1 ? 's' : ''} open`}
                meta={openTaskTitles[0]?.slice(0, 28)}
              />
            )}
          </DashCard>

          {/* Start fresh / quick actions */}
          <DashCard title="Start fresh" icon={<Zap size={14} />}>
            <QuickAction icon={<Terminal size={14} />} title="New Claude session" shortcut="⌘T" onClick={handleNewSession} />
            <QuickAction icon={<Terminal size={14} />} title="New Codex session" shortcut="⌘⇧T" onClick={handleNewSession} />
            {onRunPlaybook && (
              <QuickAction icon={<Play size={14} />} title="Run a playbook" shortcut="⌘P" onClick={() => { onRunPlaybook(); onDismiss(); }} />
            )}
            {onLaunchTeam && (
              <QuickAction icon={<CheckSquare size={14} />} title="Launch an agent team" onClick={() => { onLaunchTeam(); onDismiss(); }} />
            )}
            <QuickAction icon={<Zap size={14} />} title="Open command palette" shortcut="⌘K" onClick={() => { onOpenPalette?.(); onDismiss(); }} />
          </DashCard>
        </div>
      </div>

      {/* Status bar */}
      <div style={{
        gridColumn:   '1 / -1',
        gridRow:      3,
        background:   'var(--v2-surface-base, var(--surface-base))',
        borderTop:    '1px solid var(--v2-border-subtle, var(--border-subtle))',
        display:      'flex',
        alignItems:   'center',
        padding:      '0 12px',
        gap:          12,
        fontFamily:   'var(--font-mono-ui, "JetBrains Mono", monospace)',
        fontSize:     10,
        color:        'var(--v2-text-tertiary, var(--text-tertiary))',
      }}>
        {gitStatus?.branch && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <GitBranch size={10} />
            {gitStatus.branch}
          </span>
        )}
        <span style={{ marginLeft: 'auto' }}>⌘K</span>
      </div>
    </div>,
    document.body
  );
}
