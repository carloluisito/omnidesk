/**
 * palette-settings.ts — Wave 04 #37
 *
 * Static manifest of settings entries for CommandPaletteV2's Settings source.
 * Entries mirror SETTINGS_INDEX in SettingsDialogV2.tsx — keep in sync when
 * adding new settings categories or toggles.
 *
 * `tab` values correspond to V2Category ids in SettingsDialogV2.tsx:
 *   general | sessions | providers | workspaces | git | tasks | tunnels |
 *   advanced | design-refresh | about
 */

export interface PaletteSettingsEntry {
  key:      string;
  label:    string;
  hint?:    string;
  tab:      string;
  keywords: string[];
}

export const PALETTE_SETTINGS: PaletteSettingsEntry[] = [
  {
    key:      'default-model',
    label:    'Default model',
    hint:     'The model selected when a Claude tab opens.',
    tab:      'sessions',
    keywords: ['model', 'claude', 'sonnet', 'opus', 'haiku', 'default'],
  },
  {
    key:      'pool-enabled',
    label:    'Session pool',
    hint:     'Pre-warm shells for faster session creation.',
    tab:      'sessions',
    keywords: ['pool', 'session', 'warm', 'fast', 'startup'],
  },
  {
    key:      'agent-teams',
    label:    'Agent teams',
    hint:     'Enable multi-agent team support.',
    tab:      'general',
    keywords: ['agent', 'team', 'multi', 'enable'],
  },
  {
    key:      'auto-layout',
    label:    'Auto-layout teams',
    hint:     'Arrange panes automatically when a new team is detected.',
    tab:      'general',
    keywords: ['auto', 'layout', 'panes', 'team', 'arrange'],
  },
  {
    key:      'v2-shell',
    label:    'Shell chrome',
    hint:     'Title bar, activity bar, tab bar, pane header, status bar.',
    tab:      'design-refresh',
    keywords: ['design', 'shell', 'titlebar', 'activitybar', 'tabbar', 'chrome', 'v2', 'refresh'],
  },
  {
    key:      'v2-panels',
    label:    'Panels',
    hint:     'Task panel and Git panel v2 layouts.',
    tab:      'design-refresh',
    keywords: ['design', 'panels', 'task', 'git', 'v2', 'refresh'],
  },
  {
    key:      'v2-palette',
    label:    'Command palette',
    hint:     'Multi-source palette with ranked grouping.',
    tab:      'design-refresh',
    keywords: ['design', 'palette', 'command', 'search', 'v2', 'refresh'],
  },
  {
    key:      'v2-welcome',
    label:    'Welcome & command center',
    hint:     'First-run welcome screen and returning-user command center.',
    tab:      'design-refresh',
    keywords: ['design', 'welcome', 'command', 'center', 'first', 'run', 'v2', 'refresh'],
  },
  {
    key:      'v2-dialogs',
    label:    'Dialogs & notifications',
    hint:     'ConfirmDialog, Toast, InlineBanner, FieldError, SettingsDialog.',
    tab:      'design-refresh',
    keywords: ['design', 'dialogs', 'toast', 'notifications', 'confirm', 'v2', 'refresh'],
  },
];
