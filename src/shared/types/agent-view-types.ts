/**
 * Agent View Types
 *
 * Shared types for the Agent View availability detector.
 *
 * The detector gates whether the `claude agents` TUI launch option is offered
 * in OmniDesk's session-creation flow. It checks:
 *   - `claude --version` >= 2.1.139
 *   - the `disableAgentView` setting in ~/.claude/settings.json
 *   - the `CLAUDE_CODE_DISABLE_AGENT_VIEW` env var
 */

/**
 * Agent View is available: the CLI version meets the minimum and no kill-switch
 * is active.
 */
export interface AgentViewAvailable {
  status: 'available';
  /** The raw version string as returned by `claude --version`. */
  cliVersion: string;
}

/**
 * Agent View is unavailable. The `reason` field identifies the cause; `detail`
 * carries human-readable context (e.g. detected version when too old, env var
 * name and value when env-disabled).
 *
 * Detail strings follow a sentence-fragment convention so the UI can render
 * them after a fixed prefix like "Agent View unavailable: ". Keep new
 * reasons consistent with this convention.
 */
export interface AgentViewUnavailable {
  status: 'unavailable';
  reason:
    | 'cli-too-old'
    | 'cli-not-found'
    | 'disabled-by-setting'
    | 'disabled-by-env'
    | 'version-unparseable'
    | 'probing'
    | 'detection-failed';
  /** Human-readable context; e.g. detected version when too old; env var name when env-disabled. */
  detail: string;
}

/**
 * Discriminated union representing whether the Agent View feature can be
 * activated. Callers narrow on `status` to branch between the available and
 * unavailable paths.
 */
export type AgentViewAvailability = AgentViewAvailable | AgentViewUnavailable;
