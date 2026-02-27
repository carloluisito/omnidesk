/**
 * Command Registry Manager
 *
 * Provides a searchable registry of all app commands for the enhanced command palette.
 * Commands include UI actions, IPC methods, and built-in operations.
 */

import { Command, CommandSearchResult, CommandRegistryData } from '../shared/types/command-types';

export class CommandRegistry {
  private commands: Command[] = [];

  constructor() {
    this.initializeCommands();
  }

  private initializeCommands() {
    // Session commands
    this.registerCommand({
      id: 'session.new',
      category: 'sessions',
      title: 'New Session',
      description: 'Create a new Claude Code session',
      shortcut: 'Ctrl+T',
      keywords: ['create', 'start', 'terminal'],
      action: 'ui:newSession',
    });

    this.registerCommand({
      id: 'session.close',
      category: 'sessions',
      title: 'Close Current Session',
      description: 'Close the active session',
      shortcut: 'Ctrl+W',
      keywords: ['exit', 'quit', 'terminate'],
      action: 'ui:closeSession',
    });

    // View commands
    this.registerCommand({
      id: 'view.split',
      category: 'view',
      title: 'Toggle Split View',
      description: 'Split or collapse workspace panes',
      shortcut: 'Ctrl+\\',
      keywords: ['divide', 'panes', 'layout'],
      action: 'ui:toggleSplit',
    });

    this.registerCommand({
      id: 'view.layout',
      category: 'view',
      title: 'Open Layout Picker',
      description: 'Choose workspace layout preset',
      shortcut: 'Ctrl+Shift+L',
      keywords: ['grid', 'arrange', 'organize'],
      action: 'ui:openLayoutPicker',
    });

    // Panel commands
    this.registerCommand({
      id: 'panel.atlas',
      category: 'panels',
      title: 'Repository Atlas',
      description: 'Generate AI-powered codebase map',
      shortcut: 'Ctrl+Shift+A',
      keywords: ['map', 'navigate', 'structure'],
      action: 'ui:openAtlas',
    });

    this.registerCommand({
      id: 'panel.teams',
      category: 'panels',
      title: 'Agent Teams',
      description: 'View and manage AI agent teams',
      shortcut: 'Ctrl+Shift+T',
      keywords: ['agents', 'collaboration', 'multi'],
      action: 'ui:openTeams',
    });

    this.registerCommand({
      id: 'panel.history',
      category: 'panels',
      title: 'Session History',
      description: 'Search command history and outputs',
      shortcut: 'Ctrl+Shift+H',
      keywords: ['search', 'past', 'logs'],
      action: 'ui:openHistory',
    });

    this.registerCommand({
      id: 'panel.checkpoints',
      category: 'panels',
      title: 'Checkpoints',
      description: 'Save and restore conversation states',
      keywords: ['save', 'restore', 'snapshot'],
      action: 'ui:openCheckpoints',
    });

    this.registerCommand({
      id: 'panel.budget',
      category: 'panels',
      title: 'Usage Budget',
      description: 'Track API quota and spending',
      keywords: ['quota', 'usage', 'cost'],
      action: 'ui:openBudget',
    });

    // Settings commands
    this.registerCommand({
      id: 'settings.open',
      category: 'settings',
      title: 'Open Settings',
      description: 'Configure OmniDesk preferences',
      shortcut: 'Ctrl+,',
      keywords: ['preferences', 'config', 'options'],
      action: 'ui:openSettings',
    });

    // Help commands
    this.registerCommand({
      id: 'help.shortcuts',
      category: 'help',
      title: 'Keyboard Shortcuts',
      description: 'View all keyboard shortcuts',
      shortcut: 'Ctrl+/',
      keywords: ['keys', 'hotkeys', 'bindings'],
      action: 'ui:openShortcuts',
    });

    this.registerCommand({
      id: 'help.wizard',
      category: 'help',
      title: 'Welcome Wizard',
      description: 'Restart the welcome wizard',
      keywords: ['onboarding', 'tutorial', 'guide'],
      action: 'ui:openWizard',
    });
  }

  private registerCommand(command: Command) {
    this.commands.push(command);
  }

  /**
   * Search commands by query
   */
  search(query: string, maxResults: number = 10): CommandSearchResult[] {
    if (!query.trim()) {
      // Return all commands grouped by category
      return this.commands.slice(0, maxResults).map(cmd => ({
        ...cmd,
        score: 1,
      }));
    }

    const lowerQuery = query.toLowerCase();
    const results: CommandSearchResult[] = [];

    for (const command of this.commands) {
      let score = 0;

      // Title match (highest weight)
      if (command.title.toLowerCase().includes(lowerQuery)) {
        score += 10;
      }

      // Description match
      if (command.description?.toLowerCase().includes(lowerQuery)) {
        score += 5;
      }

      // Keywords match
      if (command.keywords) {
        for (const keyword of command.keywords) {
          if (keyword.toLowerCase().includes(lowerQuery)) {
            score += 3;
          }
        }
      }

      // Category match
      if (command.category.toLowerCase().includes(lowerQuery)) {
        score += 2;
      }

      if (score > 0) {
        results.push({ ...command, score });
      }
    }

    // Sort by score (descending)
    results.sort((a, b) => b.score - a.score);

    return results.slice(0, maxResults);
  }

  /**
   * Get all commands grouped by category
   */
  getAllCommands(): CommandRegistryData {
    return {
      commands: this.commands,
      categories: {
        sessions: { label: 'Sessions', icon: 'terminal' },
        view: { label: 'View', icon: 'layout' },
        templates: { label: 'Templates', icon: 'file-text' },
        panels: { label: 'Panels', icon: 'sidebar' },
        settings: { label: 'Settings', icon: 'settings' },
        help: { label: 'Help', icon: 'help-circle' },
      },
    };
  }

  /**
   * Get command by ID
   */
  getCommand(id: string): Command | undefined {
    return this.commands.find(cmd => cmd.id === id);
  }
}
