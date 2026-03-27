/**
 * Command types for enhanced command palette
 */

export type CommandCategory = 'sessions' | 'view' | 'templates' | 'panels' | 'settings' | 'help' | 'custom-commands';

export interface Command {
  id: string;
  category: CommandCategory;
  title: string;
  description?: string;
  keywords?: string[]; // For better search
  shortcut?: string; // Display keyboard shortcut
  icon?: string; // Icon name or SVG
  action?: string; // IPC method name or special action
  args?: any[]; // Arguments for the action
}

export interface CommandSearchResult extends Command {
  score: number; // Relevance score for sorting
}

export interface CommandRegistryData {
  commands: Command[];
  categories: Record<CommandCategory, { label: string; icon: string }>;
}
