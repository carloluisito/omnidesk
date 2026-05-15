/**
 * ActivityBar — 48px wide vertical strip, full height minus title bar.
 * V2 design, unconditional.
 *
 * Top section (tool panels): Git, History, Teams, Atlas, Playbooks, Commands, Tasks.
 * Bottom section (utility): Budget, Settings, About.
 *
 * Active state: accent color icon + 2px left accent border (inset shadow) + muted accent bg.
 * Tooltips on hover (400ms delay).
 */
import { useState, useRef, useCallback } from 'react';
import {
  GitBranch,
  History,
  Users,
  BookOpen,
  Radio,
  Terminal,
  ListChecks,
  // Network, // LaunchTunnel disabled
  // Share2,  // LaunchTunnel disabled
  DollarSign,
  Settings,
  Info,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

// NOTE: 'tunnels' and 'sharing' disabled until LaunchTunnel integration is fixed
export type ActivityPanelId = 'git' | 'history' | 'teams' | 'atlas' | 'playbooks' | 'commands' | 'tasks' | /* 'tunnels' | 'sharing' | */ null;

interface ActivityBarProps {
  activePanel:         ActivityPanelId;
  onPanelChange:       (panel: ActivityPanelId) => void;
  onOpenSettings:      () => void;
  onOpenAbout:         () => void;
  onOpenBudget:        () => void;
  onOpenLayoutPicker?: () => void;
  // tunnelActive?:       boolean;
  teamsEnabled?:       boolean;
  // activeShareCount?:   number;
}

interface NavItem {
  id:      Exclude<ActivityPanelId, null>;
  label:   string;
  Icon:    LucideIcon;
  badge?:  boolean;
  count?:  number;
}

function ActivityButton({
  item,
  isActive,
  hasBadge,
  count,
  onClick,
}: {
  item:     NavItem;
  isActive: boolean;
  hasBadge: boolean;
  count?:   number;
  onClick:  () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleMouseEnter = useCallback(() => {
    timerRef.current = setTimeout(() => setShowTooltip(true), 400);
  }, []);

  const handleMouseLeave = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setShowTooltip(false);
  }, []);

  return (
    <div style={{ position: 'relative' }}>
      <button
        aria-label={`${item.label} panel`}
        aria-pressed={isActive}
        onClick={onClick}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
        className="anim-lift"
        style={{
          position:        'relative',
          width:           '36px',
          height:          '36px',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          background:      isActive ? 'var(--v2-surface-low)' : 'transparent',
          border:          'none',
          borderRadius:    '0 var(--radius-sm) var(--radius-sm) 0',
          cursor:          'pointer',
          color:           isActive ? 'var(--v2-accent)' : 'var(--v2-text-tertiary)',
          outline:         'none',
          flexShrink:      0,
          boxShadow:       isActive ? `inset 2px 0 0 0 var(--v2-accent)` : 'none',
        }}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        onMouseOver={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.color           = 'var(--v2-text-primary)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--v2-surface-low)';
          }
        }}
        onMouseOut={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.color           = 'var(--v2-text-tertiary)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }
        }}
      >
        <item.Icon size={18} strokeWidth={1.5} />

        {/* Numeric badge */}
        {hasBadge && (count != null ? count > 0 : true) && (
          <span
            aria-hidden="true"
            style={{
              position:        'absolute',
              top:             '4px',
              right:           '3px',
              minWidth:        count != null ? '14px' : '7px',
              height:          count != null ? '14px' : '7px',
              borderRadius:    'var(--radius-full)',
              backgroundColor: 'var(--v2-accent-2)',
              color:           '#fff',
              fontSize:        '9px',
              fontFamily:      'var(--font-mono-ui)',
              fontWeight:      700,
              display:         'flex',
              alignItems:      'center',
              justifyContent:  'center',
              lineHeight:      1,
              padding:         count != null ? '0 3px' : '0',
            }}
          >
            {count != null ? count : null}
          </span>
        )}
      </button>

      {/* Tooltip */}
      {showTooltip && (
        <span
          role="tooltip"
          style={{
            position:        'absolute',
            left:            'calc(100% + 8px)',
            top:             '50%',
            transform:       'translateY(-50%)',
            zIndex:          'var(--z-tooltip)' as any,
            backgroundColor: 'var(--v2-surface-overlay)',
            color:           'var(--v2-text-secondary)',
            fontSize:        'var(--text-sm)',
            fontFamily:      'var(--font-ui)',
            padding:         '4px 8px',
            borderRadius:    'var(--radius-sm)',
            boxShadow:       'var(--shadow-md)',
            border:          `1px solid var(--v2-border-default)`,
            whiteSpace:      'nowrap',
            pointerEvents:   'none',
          }}
        >
          {item.label}
        </span>
      )}
    </div>
  );
}

function UtilityButton({
  label,
  Icon,
  onClick,
}: {
  label:   string;
  Icon:    LucideIcon;
  onClick: () => void;
}) {
  const [showTooltip, setShowTooltip] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  return (
    <div style={{ position: 'relative' }}>
      <button
        aria-label={label}
        onClick={onClick}
        onMouseEnter={() => { timerRef.current = setTimeout(() => setShowTooltip(true), 400); }}
        onMouseLeave={() => { if (timerRef.current) clearTimeout(timerRef.current); setShowTooltip(false); }}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        className="anim-lift"
        style={{
          width:          '36px',
          height:         '36px',
          display:        'flex',
          alignItems:     'center',
          justifyContent: 'center',
          background:     'transparent',
          border:         '2px solid transparent',
          borderRadius:   'var(--radius-sm)',
          cursor:         'pointer',
          color:          'var(--v2-text-tertiary)',
          transition:     `color var(--v2-duration-120) var(--v2-ease-out), background-color var(--v2-duration-120) var(--v2-ease-out)`,
          outline:        'none',
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color           = 'var(--v2-text-primary)';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--v2-surface-low)';
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color           = 'var(--v2-text-tertiary)';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
        }}
      >
        <Icon size={18} strokeWidth={1.5} />
      </button>

      {showTooltip && (
        <span
          role="tooltip"
          style={{
            position:        'absolute',
            left:            'calc(100% + 8px)',
            top:             '50%',
            transform:       'translateY(-50%)',
            zIndex:          'var(--z-tooltip)' as any,
            backgroundColor: 'var(--v2-surface-overlay)',
            color:           'var(--v2-text-secondary)',
            fontSize:        'var(--text-sm)',
            fontFamily:      'var(--font-ui)',
            padding:         '4px 8px',
            borderRadius:    'var(--radius-sm)',
            boxShadow:       'var(--shadow-md)',
            border:          `1px solid var(--v2-border-default)`,
            whiteSpace:      'nowrap',
            pointerEvents:   'none',
          }}
        >
          {label}
        </span>
      )}
    </div>
  );
}

export function ActivityBar({
  activePanel,
  onPanelChange,
  onOpenSettings,
  onOpenAbout,
  onOpenBudget,
  onOpenLayoutPicker,
  // tunnelActive = false,
  teamsEnabled = true,
  // activeShareCount = 0,
}: ActivityBarProps) {
  const topItems: NavItem[] = [
    { id: 'git',       label: 'Git',          Icon: GitBranch  },
    { id: 'history',   label: 'History',      Icon: History    },
    ...(teamsEnabled ? [{ id: 'teams' as const, label: 'Agent Teams', Icon: Users }] : []),
    { id: 'atlas',     label: 'Atlas',        Icon: BookOpen   },
    { id: 'playbooks', label: 'Playbooks',    Icon: Radio      },
    { id: 'commands',  label: 'Commands',     Icon: Terminal   },
    { id: 'tasks',     label: 'Tasks',        Icon: ListChecks },
    // NOTE: LaunchTunnel/sharing disabled
    // { id: 'tunnels',   label: 'Tunnels',     Icon: Network, badge: tunnelActive },
    // { id: 'sharing',   label: 'Sharing',     Icon: Share2,  badge: activeShareCount > 0 },
  ];

  const handleToggle = useCallback((panelId: Exclude<ActivityPanelId, null>) => {
    onPanelChange(activePanel === panelId ? null : panelId);
  }, [activePanel, onPanelChange]);

  return (
    <nav
      role="navigation"
      aria-label="Main navigation"
      style={{
        width:           'var(--activity-bar-width)',
        display:         'flex',
        flexDirection:   'column',
        alignItems:      'center',
        justifyContent:  'space-between',
        backgroundColor: 'var(--v2-surface-base)',
        borderRight:     `1px solid var(--v2-border-subtle)`,
        flexShrink:      0,
        paddingTop:      'var(--space-2)',
        paddingBottom:   'var(--space-2)',
        gap:             0,
      }}
    >
      {/* Top section: tool panels */}
      <div
        style={{
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          gap:           'var(--space-1)',
          width:         '100%',
        }}
      >
        {topItems.map(item => (
          <ActivityButton
            key={item.id}
            item={item}
            isActive={activePanel === item.id}
            hasBadge={!!item.badge}
            count={item.count}
            onClick={() => handleToggle(item.id)}
          />
        ))}
        {onOpenLayoutPicker && (
          <UtilityButton
            label="Layout Picker"
            Icon={LayoutGrid}
            onClick={onOpenLayoutPicker}
          />
        )}
      </div>

      {/* Bottom section: utility actions */}
      <div
        style={{
          display:       'flex',
          flexDirection: 'column',
          alignItems:    'center',
          gap:           'var(--space-1)',
          width:         '100%',
        }}
      >
        <UtilityButton label="Budget"   Icon={DollarSign} onClick={onOpenBudget}   />
        <UtilityButton label="Settings" Icon={Settings}   onClick={onOpenSettings} />
        <UtilityButton label="About"    Icon={Info}       onClick={onOpenAbout}    />
      </div>
    </nav>
  );
}
