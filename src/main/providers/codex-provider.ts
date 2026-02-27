import { execFile } from 'child_process';
import { IProvider, ProviderCommandOptions } from './provider';
import { ProviderId, ProviderInfo } from '../../shared/types/provider-types';

/** Map OmniDesk permission mode names to Codex approval modes */
const PERMISSION_MODE_MAP: Record<string, string> = {
  'standard': 'suggest',
  'skip-permissions': 'full-auto',
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
        permissionModes: ['suggest', 'auto-edit', 'full-auto'],
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
