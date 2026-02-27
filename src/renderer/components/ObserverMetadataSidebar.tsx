/**
 * ObserverMetadataSidebar — Collapsible right sidebar (280px) for observer tabs.
 *
 * Shows: active tool, file path, agent status, file change count, model.
 * Receives data from onShareMetadata events via the useSessionSharing hook.
 * Auto-collapses to 24px icon strip below 1200px viewport width.
 * Click collapsed strip to expand as overlay.
 *
 * data-testid: "observer-metadata-sidebar"
 */
import { useState, useEffect }        from 'react';
import type { SessionMetadataFrame }   from '../../shared/types/sharing-types';

interface ObserverMetadataSidebarProps {
  metadata:          SessionMetadataFrame | null;
  shareCode:         string;
  /** Force collapsed state (e.g. from parent viewport measurement) */
  forceCollapsed?:   boolean;
}

const TOOL_ICONS: Record<string, React.ReactNode> = {
  Edit: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M7.5 1.5L10.5 4.5M1.5 10.5L2.5 7.5L9 1.5L11 3.5L4.5 10L1.5 10.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  Bash: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M2 3l4 3-4 3" strokeLinecap="round" strokeLinejoin="round" />
      <line x1="7" y1="9" x2="10" y2="9" strokeLinecap="round" />
    </svg>
  ),
  Read: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <path d="M6 1.5C3.5 1.5 1.5 3.5 1.5 6s2 4.5 4.5 4.5 4.5-2 4.5-4.5-2-4.5-4.5-4.5z" />
      <circle cx="6" cy="6" r="1.5" fill="currentColor" />
    </svg>
  ),
  Write: (
    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
      <rect x="2" y="1.5" width="8" height="9" rx="1" />
      <line x1="4" y1="4.5" x2="8" y2="4.5" strokeLinecap="round" />
      <line x1="4" y1="6.5" x2="8" y2="6.5" strokeLinecap="round" />
      <line x1="4" y1="8.5" x2="6" y2="8.5" strokeLinecap="round" />
    </svg>
  ),
};

const STATUS_COLORS: Record<string, string> = {
  thinking: '#7aa2f7',
  writing:  '#00C9A7',
  reading:  'var(--semantic-warning)',
  idle:     'var(--text-tertiary)',
};

function truncatePath(path: string, maxLen: number = 32): string {
  if (!path || path.length <= maxLen) return path;
  const parts = path.replace(/\\/g, '/').split('/');
  if (parts.length <= 2) return '...' + path.slice(-maxLen);
  return '.../' + parts.slice(-2).join('/');
}

export function ObserverMetadataSidebar({
  metadata,
  shareCode,
  forceCollapsed = false,
}: ObserverMetadataSidebarProps) {
  const [isCollapsed, setIsCollapsed] = useState(forceCollapsed);

  // Sync with forceCollapsed (viewport changes)
  useEffect(() => {
    setIsCollapsed(forceCollapsed);
  }, [forceCollapsed]);

  const tool        = metadata?.tool ?? null;
  const filePath    = metadata?.filePath ?? null;
  const agentStatus = metadata?.agentStatus ?? null;
  const fileChanges = metadata?.fileChanges ?? null;
  const model       = metadata?.model ?? null;

  const toolIcon    = tool ? (TOOL_ICONS[tool] ?? TOOL_ICONS.Read) : null;
  const statusColor = agentStatus ? (STATUS_COLORS[agentStatus] ?? STATUS_COLORS.idle) : STATUS_COLORS.idle;
  const statusLabel = agentStatus
    ? agentStatus.charAt(0).toUpperCase() + agentStatus.slice(1)
    : 'Idle';

  // ── Collapsed strip (24px icon bar) ─────────────────────────────
  if (isCollapsed) {
    return (
      <div
        data-testid="observer-metadata-sidebar"
        data-collapsed="true"
        style={{
          width:           '24px',
          flexShrink:      0,
          backgroundColor: 'var(--surface-raised)',
          borderLeft:      '1px solid var(--border-subtle)',
          display:         'flex',
          flexDirection:   'column',
          alignItems:      'center',
          paddingTop:      'var(--space-2)',
          gap:             'var(--space-3)',
          cursor:          'pointer',
          transition:      'width var(--duration-normal) var(--ease-inout)',
        }}
        onClick={() => setIsCollapsed(false)}
        aria-label="Expand metadata sidebar"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setIsCollapsed(false); }}
        title="Expand metadata sidebar"
      >
        {/* Chevron right */}
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="var(--text-tertiary)" strokeWidth="1.5" aria-hidden="true">
          <path d="M4 2l4 4-4 4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>

        {/* Status dot */}
        {agentStatus && (
          <div
            style={{
              width:        6,
              height:       6,
              borderRadius: '50%',
              background:   statusColor,
              flexShrink:   0,
            }}
            title={statusLabel}
          />
        )}

        {/* Tool icon */}
        {toolIcon && (
          <span style={{ color: 'var(--text-tertiary)', display: 'flex' }} title={tool ?? ''}>
            {toolIcon}
          </span>
        )}

        {/* File changes badge */}
        {fileChanges != null && fileChanges > 0 && (
          <span
            title={`${fileChanges} file${fileChanges !== 1 ? 's' : ''} changed`}
            style={{
              fontSize:        '8px',
              fontFamily:      '"JetBrains Mono", monospace',
              fontWeight:      700,
              color:           '#00C9A7',
              backgroundColor: 'rgba(0,201,167,0.12)',
              borderRadius:    '3px',
              padding:         '1px 3px',
            }}
          >
            {fileChanges}
          </span>
        )}
      </div>
    );
  }

  // ── Expanded sidebar (280px) ─────────────────────────────────────
  return (
    <div
      data-testid="observer-metadata-sidebar"
      data-collapsed="false"
      style={{
        width:           '280px',
        flexShrink:      0,
        backgroundColor: 'var(--surface-raised)',
        borderLeft:      '1px solid var(--border-subtle)',
        display:         'flex',
        flexDirection:   'column',
        overflow:        'hidden',
        transition:      'width var(--duration-normal) var(--ease-inout)',
      }}
    >
      {/* Sidebar header */}
      <div
        style={{
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'space-between',
          padding:         '0 var(--space-3)',
          height:          '32px',
          borderBottom:    '1px solid var(--border-subtle)',
          flexShrink:      0,
        }}
      >
        <span style={{
          fontSize:      'var(--text-xs)',
          fontFamily:    'var(--font-ui)',
          color:         'var(--text-tertiary)',
          textTransform: 'uppercase',
          letterSpacing: '0.06em',
          userSelect:    'none',
        }}>
          Session Info
        </span>

        {/* Collapse button */}
        <button
          onClick={() => setIsCollapsed(true)}
          aria-label="Collapse metadata sidebar"
          style={{
            width:        '20px',
            height:       '20px',
            display:      'flex',
            alignItems:   'center',
            justifyContent: 'center',
            background:   'transparent',
            border:       'none',
            borderRadius: 'var(--radius-sm)',
            cursor:       'pointer',
            color:        'var(--text-tertiary)',
            padding:      0,
            transition:   'color var(--duration-fast)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
          onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
        >
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
            <path d="M7 2L3 5l4 3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Metadata rows */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3)' }}>

        {/* No metadata yet */}
        {!metadata && (
          <div style={{
            display:    'flex',
            alignItems: 'center',
            gap:        'var(--space-2)',
            padding:    'var(--space-2) 0',
            color:      'var(--text-tertiary)',
            fontSize:   'var(--text-xs)',
            fontFamily: 'var(--font-ui)',
            fontStyle:  'italic',
          }}>
            Waiting for session data...
          </div>
        )}

        {/* Active Tool */}
        {tool && (
          <MetaRow
            icon={toolIcon}
            label="Active Tool"
            value={tool}
            valueColor="#00C9A7"
          />
        )}

        {/* File path */}
        {filePath && (
          <MetaRow
            icon={
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M2 9.5V2.5a1 1 0 011-1h3.5l3 3V9.5a1 1 0 01-1 1H3a1 1 0 01-1-1z" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M5.5 1.5V5H9" strokeLinecap="round" />
              </svg>
            }
            label="File"
            value={truncatePath(filePath)}
            valueTitle={filePath}
            mono
          />
        )}

        {/* Agent status */}
        {agentStatus && (
          <MetaRow
            icon={
              <div style={{
                width:        6,
                height:       6,
                borderRadius: '50%',
                background:   statusColor,
                flexShrink:   0,
                animation:    agentStatus === 'thinking' ? 'meta-pulse 1.4s ease-in-out infinite' : 'none',
              }} />
            }
            label="Status"
            value={statusLabel}
            valueColor={statusColor}
          />
        )}

        {/* File changes */}
        {fileChanges != null && (
          <MetaRow
            icon={
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <path d="M1.5 6h9M7.5 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            }
            label="Changes"
            value={`${fileChanges} file${fileChanges !== 1 ? 's' : ''}`}
          />
        )}

        {/* Model */}
        {model && (
          <MetaRow
            icon={
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <circle cx="6" cy="6" r="4.5" />
                <circle cx="6" cy="6" r="1.5" fill="currentColor" />
              </svg>
            }
            label="Model"
            value={model}
          />
        )}
      </div>

      {/* Share code footer */}
      <div style={{
        padding:      'var(--space-2) var(--space-3)',
        borderTop:    '1px solid var(--border-subtle)',
        flexShrink:   0,
      }}>
        <span style={{
          fontSize:   'var(--text-xs)',
          fontFamily: '"JetBrains Mono", monospace',
          color:      'var(--text-tertiary)',
          userSelect: 'all',
        }}>
          {shareCode}
        </span>
      </div>

      <style>{`
        @keyframes meta-pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.3; }
        }
      `}</style>
    </div>
  );
}

// ── MetaRow ──────────────────────────────────────────────────────────

interface MetaRowProps {
  icon:        React.ReactNode;
  label:       string;
  value:       string;
  valueColor?: string;
  valueTitle?: string;
  mono?:       boolean;
}

function MetaRow({ icon, label, value, valueColor, valueTitle, mono = false }: MetaRowProps) {
  return (
    <div
      style={{
        display:       'flex',
        flexDirection: 'column',
        gap:           '2px',
        marginBottom:  'var(--space-3)',
      }}
    >
      <div style={{
        display:    'flex',
        alignItems: 'center',
        gap:        '5px',
        color:      'var(--text-tertiary)',
      }}>
        <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>
        <span style={{
          fontSize:      'var(--text-xs)',
          fontFamily:    'var(--font-ui)',
          textTransform: 'uppercase',
          letterSpacing: '0.05em',
        }}>
          {label}
        </span>
      </div>
      <div
        title={valueTitle}
        style={{
          paddingLeft:  '17px',
          fontSize:     'var(--text-sm)',
          fontFamily:   mono ? '"JetBrains Mono", monospace' : 'var(--font-ui)',
          color:        valueColor ?? 'var(--text-primary)',
          overflow:     'hidden',
          textOverflow: 'ellipsis',
          whiteSpace:   'nowrap',
        }}
      >
        {value}
      </div>
    </div>
  );
}
