import { execFile } from 'child_process';
import { IProvider, ProviderCommandOptions } from './provider';
import { ProviderId, ProviderInfo } from '../../shared/types/provider-types';
import { CLAUDE_READY_PATTERNS } from '../../shared/claude-detector';
import { WELCOME_PATTERNS, SWITCH_PATTERNS } from '../../shared/model-detector';
import type { AgentViewAvailability } from '../../shared/types/agent-view-types';
import type { LaunchMode } from '../../shared/ipc-types';
import type { StateSignals } from '../../shared/session-state-types';

// State-classifier marker tables for Claude Code's TUI. Matched against the
// line-reduced, ANSI-stripped tail of the session's output.
const CLAUDE_STATE_SIGNALS: StateSignals = {
  // Shown while a turn/tool call is in flight — a strong "still busy" signal
  // that survives in-place repaints, so it also vetoes premature done/idle.
  working: [
    /esc to interrupt/i,
    /\besc\b\s+to\s+interrupt/i,
    // Braille + star spinner glyphs Claude animates while thinking.
    /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/,
    /[✻✽✳✢·]/,
  ],
  // Permission / trust prompts. Anchored to the tail end by the detector, so
  // these fire only when the prompt is the current bottom-of-screen state.
  approval: [
    /Do you want to (proceed|make this edit|create|run|apply|continue)/i,
    /Do you trust the files in this folder/i,
    // The interactive selector sitting on the "Yes" option.
    /❯\s*1\.\s*Yes/,
    // The numbered Yes / Yes-and triad that only the approval box renders.
    /\b1\.\s*Yes\b[\s\S]{0,120}\b2\.\s*Yes,/i,
  ],
  // Explicit "your turn to type" prompts distinct from a bare idle prompt box.
  awaitingInput: [
    /Press Enter to continue/i,
    /\bwaiting for your (input|response)\b/i,
  ],
  // Fatal banners — narrow on purpose so an agent merely printing "error"
  // while debugging does not trip this (also gated on quiescence by the detector).
  fatalError: [
    /API Error/i,
    /Credit balance is too low/i,
    /\brate limit(?:ed|s)?\b/i,
    /overloaded_error/i,
    /Invalid API key/i,
  ],
};

export class ClaudeProvider implements IProvider {
  /**
   * Getter that returns the current AgentView availability at command-build
   * time. Using a getter (thunk) rather than a frozen snapshot means the
   * defense-in-depth check in buildCommand always reads the live cached value
   * — including updates that arrive after construction (e.g. the delayed-init
   * probe completing ~2 s after app start).
   *
   * Default getter returns an unavailable shape so that a `new ClaudeProvider()`
   * with no args and `launchMode: 'agents'` falls back to 'claude' with a
   * warning — same behavior as a real unavailable runtime state. This is the
   * defense-in-depth safe default.
   */
  private readonly getAvailability: () => AgentViewAvailability;

  constructor(availabilityGetter?: () => AgentViewAvailability) {
    this.getAvailability = availabilityGetter ?? (() => ({
      status: 'unavailable' as const,
      reason: 'detection-failed' as const,
      detail: 'no availability getter injected',
    }));
  }

  getId(): ProviderId {
    return 'claude';
  }

  getInfo(): ProviderInfo {
    return {
      id: 'claude',
      displayName: 'Claude Code',
      cliCommand: 'claude',
      capabilities: {
        modelSwitching: true,
        agentTeams: true,
        quota: true,
        readinessDetection: true,
        permissionModes: ['standard', 'skip-permissions'],
      },
    };
  }

  isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      execFile(checker, ['claude'], (err) => {
        resolve(!err);
      });
    });
  }

  buildCommand(options: ProviderCommandOptions): string {
    // Resolve the effective launch mode: explicit launchMode wins; fall back to
    // the legacy permissionMode field so callers that predate launchMode still work.
    const effectiveLaunchMode: LaunchMode = options.launchMode
      ?? (options.permissionMode === 'skip-permissions' ? 'bypass-permissions' : 'default');

    let command: string;
    switch (effectiveLaunchMode) {
      case 'default':
        command = 'claude';
        break;
      case 'bypass-permissions':
        command = 'claude --dangerously-skip-permissions';
        break;
      case 'continue':
        // Resume the most recent conversation in the session cwd.
        // Claude Code starts a fresh conversation if none exists.
        command = 'claude --continue';
        break;
      case 'agents': {
        // Defense-in-depth: verify availability at command-build time.
        // The getter reads the live cached value so this check is always current.
        if (this.getAvailability().status !== 'available') {
          console.warn('[ClaudeProvider] launchMode=agents requested while unavailable; falling back to default');
          command = 'claude';
        } else {
          command = 'claude agents';
        }
        break;
      }
      default: {
        // Exhaustive check: TypeScript will error here if a new LaunchMode variant
        // is added without a corresponding case above.
        const exhaustive: never = effectiveLaunchMode;
        void exhaustive;
        command = 'claude';
      }
    }

    // Append model flag only for modes that support it (not 'agents' — the TUI manages its own model)
    if (effectiveLaunchMode !== 'agents' && options.model && options.model !== 'auto') {
      command += ` --model ${options.model}`;
    }

    return command;
  }

  getReadinessPatterns(): string[] {
    return [...CLAUDE_READY_PATTERNS];
  }

  getModelDetectionPatterns(): { welcome: RegExp[]; switch: RegExp[] } {
    return {
      welcome: [...WELCOME_PATTERNS],
      switch: [...SWITCH_PATTERNS],
    };
  }

  getStateSignals(): StateSignals {
    return {
      working: [...CLAUDE_STATE_SIGNALS.working],
      approval: [...CLAUDE_STATE_SIGNALS.approval],
      awaitingInput: [...CLAUDE_STATE_SIGNALS.awaitingInput],
      fatalError: [...CLAUDE_STATE_SIGNALS.fatalError],
    };
  }

  getEnvironmentVariables(options?: { enableAgentTeams?: boolean }): Record<string, string> {
    if (options?.enableAgentTeams) {
      return { CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS: '1' };
    }
    return {};
  }

  normalizeModel(raw: string): string | null {
    const map: Record<string, string> = {
      'sonnet': 'sonnet',
      '3.5-sonnet': 'sonnet',
      '4-sonnet': 'sonnet',
      'opus': 'opus',
      '3-opus': 'opus',
      '4-opus': 'opus',
      'haiku': 'haiku',
      '3-haiku': 'haiku',
      '4-haiku': 'haiku',
      'auto': 'auto',
    };
    return map[raw.toLowerCase()] ?? null;
  }
}
