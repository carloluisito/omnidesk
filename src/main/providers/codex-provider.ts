import { execFile } from 'child_process';
import { IProvider, ProviderCommandOptions } from './provider';
import { ProviderId, ProviderInfo } from '../../shared/types/provider-types';
import type { StateSignals } from '../../shared/session-state-types';

// Note: ProviderCommandOptions.permissionMode (see ./provider) is still a
// loose `string`, so this map stays keyed by string too — tightening it to
// PermissionMode breaks the `PERMISSION_MODE_MAP[options.permissionMode]`
// lookup in buildCommand() below. Narrowing that option's type is out of
// scope here; see capabilities.permissionModes for the domain-typed surface.
/** Map OmniDesk permission mode names to Codex approval modes */
const PERMISSION_MODE_MAP: Record<string, string> = {
  'standard': 'suggest',
  'skip-permissions': 'full-auto',
};

// PROVISIONAL state-classifier tables for Codex CLI. Unlike the Claude table
// these have NOT yet been validated against captured real Codex transcripts —
// the design flags that as a ship gate. Kept intentionally conservative: the
// classifier biases toward surfacing (an unmatched quiescent-after-output
// state degrades to 'done', which is still surfaced for review, never silently
// hidden as 'idle'), so imperfect tables under-fire rather than mislead.
// TODO(codex-signals): validate/replace against a live Codex session.
const CODEX_STATE_SIGNALS: StateSignals = {
  // Line-anchored status forms only — bare words 'working'/'thinking' would
  // match ordinary prose ("tests are working now") and pin the session.
  working: [
    /esc to interrupt/i,
    /^\s*(Thinking|Working)…?\s*$/im,
    /[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]/,
  ],
  // Codex's own approval framing (not a generic '[y/n]', which appears in
  // captured subprocess output the agent itself answers).
  approval: [
    /Allow command/i,
    /Run this command\?/i,
    /Allow Codex to run/i,
  ],
  awaitingInput: [
    /Press Enter to continue/i,
  ],
  // Banner-shaped only; dropped bare /quota/ and /unauthorized/, which match
  // normal code-writing about auth/HTTP status.
  fatalError: [
    /^\s*Error:/im,
    /You have exceeded your rate limit/i,
    /rate_limit_error/i,
  ],
};

export class CodexProvider implements IProvider {
  getId(): ProviderId {
    return 'codex';
  }

  getInfo(): ProviderInfo {
    return {
      id: 'codex',
      displayName: 'Codex CLI',
      cliCommand: 'codex',
      capabilities: {
        modelSwitching: true,
        agentTeams: false,
        quota: false,
        readinessDetection: true,
        // Domain names (see PermissionMode), not Codex's own CLI vocabulary —
        // buildCommand() below translates these into Codex approval modes.
        permissionModes: ['standard', 'skip-permissions'],
      },
      defaultModel: 'codex-mini',
    };
  }

  isAvailable(): Promise<boolean> {
    return new Promise((resolve) => {
      const checker = process.platform === 'win32' ? 'where' : 'which';
      execFile(checker, ['codex'], (err) => {
        resolve(!err);
      });
    });
  }

  buildCommand(options: ProviderCommandOptions): string {
    let command = 'codex';

    if (options.model) {
      command += ` --model ${options.model}`;
    }

    const approvalMode = PERMISSION_MODE_MAP[options.permissionMode] ?? options.permissionMode;
    command += ` --approval-mode ${approvalMode}`;

    return command;
  }

  getReadinessPatterns(): string[] {
    return ['Codex', 'codex>', 'What can I help'];
  }

  getModelDetectionPatterns(): { welcome: RegExp[]; switch: RegExp[] } {
    return {
      welcome: [
        /Using model[: ]+(\w[\w-]*)/i,
        /Model[: ]+(\w[\w-]*)/i,
      ],
      switch: [
        /Switched to (\w[\w-]*)/i,
        /Using model[: ]+(\w[\w-]*)/i,
      ],
    };
  }

  getStateSignals(): StateSignals {
    return {
      working: [...CODEX_STATE_SIGNALS.working],
      approval: [...CODEX_STATE_SIGNALS.approval],
      awaitingInput: [...CODEX_STATE_SIGNALS.awaitingInput],
      fatalError: [...CODEX_STATE_SIGNALS.fatalError],
    };
  }

  getEnvironmentVariables(_options?: { enableAgentTeams?: boolean }): Record<string, string> {
    return {};
  }

  normalizeModel(raw: string): string | null {
    if (!raw) return null;
    const lower = raw.toLowerCase();
    // Codex model names pass through as-is (they're already descriptive)
    const known = ['o3', 'o4-mini', 'codex-mini', 'gpt-4.1', 'gpt-4.1-mini', 'gpt-4.1-nano'];
    if (known.includes(lower)) return lower;
    // Also accept any string that looks like a model name
    if (/^[\w][\w.-]*$/.test(lower)) return lower;
    return null;
  }
}
