import { execFile } from 'child_process';
import { IProvider, ProviderCommandOptions } from './provider';
import { ProviderId, ProviderInfo } from '../../shared/types/provider-types';
import { CLAUDE_READY_PATTERNS } from '../../shared/claude-detector';
import { WELCOME_PATTERNS, SWITCH_PATTERNS } from '../../shared/model-detector';

export class ClaudeProvider implements IProvider {
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
    let command = options.permissionMode === 'skip-permissions'
      ? 'claude --dangerously-skip-permissions'
      : 'claude';

    if (options.model && options.model !== 'auto') {
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
