/**
 * ActivityBar — 48px wide vertical strip, full height minus title bar.
 *
 * Top section (tool panels): Git, History, Teams, Atlas, Playbooks, Tunnels.
 * Bottom section (utility): Budget, Settings, About.
 *
 * Active state: accent color icon + 2px left accent border + muted accent bg.
 * Tooltips on hover (400ms delay), via inline Tooltip.
 * Badge dot for tunnel active.
 */
import { useState, useRef, useCallback } from 'react';
import {
  GitBranch,
  History,
  Users,
  BookOpen,
  Radio,
  Network,
  Share2,
  DollarSign,
  Settings,
  Info,
  LayoutGrid,
  type LucideIcon,
} from 'lucide-react';

export type ActivityPanelId = 'git' | 'history' | 'teams' | 'atlas' | 'playbooks' | 'tunnels' | 'sharing' | null;

interface ActivityBarProps {
  activePanel:         ActivityPanelId;
  onPanelChange:       (panel: ActivityPanelId) => void;
  onOpenSettings:      () => void;
  onOpenAbout:         () => void;
  onOpenBudget:        () => void;
  onOpenLayoutPicker?: () => void;
  tunnelActive?:       boolean;
  teamsEnabled?:       boolean;
  /** Number of active shares — shows badge dot when > 0 */
  activeShareCount?:   number;
}

interface NavItem {
  id:      Exclude<ActivityPanelId, null>;
  label:   string;
  Icon:    LucideIcon;
  badge?:  boolean;
}

function ActivityButton({
  item,
  isActive,
  hasBadge,
  onClick,
}: {
  item:     NavItem;
  isActive: boolean;
  hasBadge: boolean;
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
        style={{
          position:        'relative',
          width:           '36px',
          height:          '36px',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          background:      isActive ? 'var(--accent-primary-muted)' : 'transparent',
          border:          'none',
          borderLeft:      isActive ? '2px solid var(--accent-primary)' : '2px solid transparent',
          borderRadius:    '0 var(--radius-sm) var(--radius-sm) 0',
          cursor:          'pointer',
          color:           isActive ? 'var(--accent-primary)' : 'var(--text-tertiary)',
          transition:      [
            'color var(--duration-fast) var(--ease-inout)',
            'background-color var(--duration-fast) var(--ease-inout)',
            'border-color var(--duration-fast) var(--ease-inout)',
          ].join(', '),
          outline:         'none',
          flexShrink:      0,
        }}
        onFocus={() => setShowTooltip(true)}
        onBlur={() => setShowTooltip(false)}
        onMouseOver={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--state-hover)';
          }
        }}
        onMouseOut={(e) => {
          if (!isActive) {
            (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
            (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'transparent';
          }
        }}
      >
        <item.Icon size={18} strokeWidth={1.5} />

        {/* Badge dot */}
        {hasBadge && (
          <span
            aria-hidden="true"
            style={{
              position:        'absolute',
              top:             '5px',
              right:           '5px',
              width:           '7px',
              height:          '7px',
              borderRadius:    'var(--radius-full)',
              backgroundColor: 'var(--semantic-warning)',
              animation:       'dot-pulse 2s ease-in-out infinite',
            }}
          />
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
            backgroundColor: 'var(--surface-high)',
            color:           'var(--text-secondary)',
            fontSize:        'var(--text-sm)',
            fontFamily:      'var(--font-ui)',
            padding:         '4px 8px',
            borderRadius:    'var(--radius-sm)',
            boxShadow:       'var(--shadow-md)',
            border:          '1px solid var(--border-default)',
            whiteSpace:      'nowrap',
            pointerEvents:   'none',
            animation:       'fade-in var(--duration-fast) var(--ease-out) both',
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
        style={{
          width:           '36px',
          height:          '36px',
          display:         'flex',
          alignItems:      'center',
          justifyContent:  'center',
          background:      'transparent',
          border:          '2px solid transparent',
          borderRadius:    'var(--radius-sm)',
          cursor:          'pointer',
          color:           'var(--text-tertiary)',
          transition:      'color var(--duration-fast) var(--ease-inout), background-color var(--duration-fast) var(--ease-inout)',
          outline:         'none',
        }}
        onMouseOver={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-secondary)';
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = 'var(--state-hover)';
        }}
        onMouseOut={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-tertiary)';
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
            backgroundColor: 'var(--surface-high)',
            color:           'var(--text-secondary)',
            fontSize:        'var(--text-sm)',
            fontFamily:      'var(--font-ui)',
            padding:         '4px 8px',
            borderRadius:    'var(--radius-sm)',
            boxShadow:       'var(--shadow-md)',
            border:          '1px solid var(--border-default)',
            whiteSpace:      'nowrap',
            pointerEvents:   'none',
            animation:       'fade-in var(--duration-fast) var(--ease-out) both',
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
  tunnelActive = false,
  teamsEnabled = true,
  activeShareCount = 0,
}: ActivityBarProps) {
  const topItems: NavItem[] = [
    { id: 'git',       label: 'Git',         Icon: GitBranch },
    { id: 'history',   label: 'History',     Icon: History   },
    ...(teamsEnabled ? [{ id: 'teams' as const, label: 'Agent Teams', Icon: Users }] : []),
    { id: 'atlas',     label: 'Atlas',       Icon: BookOpen  },
    { id: 'playbooks', label: 'Playbooks',   Icon: Radio     },
    { id: 'tunnels',   label: 'Tunnels',     Icon: Network, badge: tunnelActive },
    { id: 'sharing',   label: 'Sharing',     Icon: Share2,  badge: activeShareCount > 0 },
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
        backgroundColor: 'var(--surface-base)',
        borderRight:     '1px solid var(--border-subtle)',
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
