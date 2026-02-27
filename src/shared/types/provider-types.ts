export type ProviderId = 'claude' | 'codex';

export interface ProviderCapabilities {
  modelSwitching: boolean;     // Can switch models at runtime
  agentTeams: boolean;         // Supports agent team workflows
  quota: boolean;              // Has usage quota/billing tracking
  readinessDetection: boolean; // Has CLI ready-state detection
  permissionModes: string[];   // Available permission modes
}

export interface ProviderInfo {
  id: ProviderId;
  displayName: string;
  cliCommand: string;          // e.g., 'claude', 'codex'
  capabilities: ProviderCapabilities;
  defaultModel?: string;
}
