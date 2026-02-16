import { ToolbarDropdown, DropdownItem } from './ToolbarDropdown';

interface ToolsDropdownProps {
  onOpenAtlas?: () => void;
  onOpenLayoutPicker?: () => void;
  onOpenTeams?: () => void;
  onOpenGit?: () => void;
  onOpenWorktrees?: () => void;
  onOpenHistory?: () => void;
  onOpenPlaybooks?: () => void;
  teamCount?: number;
  gitStagedCount?: number;
}

export function ToolsDropdown({
  onOpenAtlas,
  onOpenLayoutPicker,
  onOpenTeams,
  onOpenGit,
  onOpenWorktrees,
  onOpenHistory,
  onOpenPlaybooks,
  teamCount = 0,
  gitStagedCount = 0,
}: ToolsDropdownProps) {
  const items: DropdownItem[] = [];

  if (onOpenAtlas) {
    items.push({
      id: 'atlas',
      label: 'Repository Atlas',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
          <line x1="8" y1="2" x2="8" y2="18" />
          <line x1="16" y1="6" x2="16" y2="22" />
        </svg>
      ),
      onClick: onOpenAtlas,
    });
  }

  if (onOpenLayoutPicker) {
    items.push({
      id: 'layout',
      label: 'Workspace Layouts',
      shortcut: 'Ctrl+Shift+L',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
        </svg>
      ),
      onClick: onOpenLayoutPicker,
    });
  }

  if (onOpenPlaybooks) {
    items.push({
      id: 'playbooks',
      label: 'Session Playbooks',
      shortcut: 'Ctrl+Shift+B',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="16" y1="13" x2="8" y2="13" />
          <line x1="16" y1="17" x2="8" y2="17" />
          <polyline points="10 9 9 9 8 9" />
        </svg>
      ),
      onClick: onOpenPlaybooks,
    });
  }

  if (onOpenGit) {
    items.push({
      id: 'git',
      label: 'Git Integration',
      shortcut: 'Ctrl+Shift+G',
      badge: gitStagedCount > 0 ? gitStagedCount : undefined,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 01-9 9" />
        </svg>
      ),
      onClick: onOpenGit,
    });
  }

  if (onOpenWorktrees) {
    items.push({
      id: 'worktrees',
      label: 'Git Worktrees',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="6" y1="3" x2="6" y2="15" />
          <circle cx="18" cy="6" r="3" />
          <circle cx="6" cy="18" r="3" />
          <path d="M18 9a9 9 0 01-9 9" />
          <line x1="18" y1="12" x2="18" y2="21" strokeDasharray="3 2" />
        </svg>
      ),
      onClick: onOpenWorktrees,
    });
  }

  if (onOpenTeams) {
    items.push({
      id: 'teams',
      label: 'Agent Teams',
      badge: teamCount > 0 ? teamCount : undefined,
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </svg>
      ),
      onClick: onOpenTeams,
    });
  }

  if (onOpenHistory) {
    items.push({
      id: 'history',
      label: 'Session History',
      shortcut: 'Ctrl+Shift+H',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
        </svg>
      ),
      onClick: onOpenHistory,
    });
  }

  if (items.length === 0) return null;

  return (
    <ToolbarDropdown
      icon={
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" />
        </svg>
      }
      label="Tools"
      items={items}
      title="Tools - Quick access to workspace features"
    />
  );
}
