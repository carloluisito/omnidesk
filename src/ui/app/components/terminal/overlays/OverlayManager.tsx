/**
 * OverlayManager - Renders the active overlay based on terminalUIStore state
 *
 * This component consolidates all modal/overlay rendering in one place,
 * reducing the complexity of Terminal.tsx.
 */

import { type ReactNode } from 'react';
import { useTerminalUIStore, type ActiveOverlay } from '../../../store/terminalUIStore';

// Import overlay components (these already exist)
import { CommandPalette } from '../CommandPalette';
import { SettingsPanel } from '../SettingsPanel';
import { ExportModal } from '../ExportModal';
import { AgentsPanel } from '../../agents';
import { UsageDashboard } from '../UsageDashboard';
import { BudgetDashboard } from '../BudgetDashboard';
import { ToolApprovalModal } from '../ToolApprovalModal';
import { NewSessionModal } from '../NewSessionModal';
import { StartAppModal } from '../StartAppModal';
import { ExpandedInputModal } from '../ExpandedInputModal';
import { SessionSearch } from '../SessionSearch';
import {
  SplitSessionSelector,
  AddRepoModal,
  MergeSessionsModal,
} from '../SessionModals';

interface OverlayManagerProps {
  // Command palette
  onCommandSelect?: (command: string) => void;
  onSetMode?: (mode: 'plan' | 'direct') => void;

  // Session search
  onSearchSelectResult?: (sessionId: string, messageId: string) => void;

  // Split selector
  sessions?: Array<{
    id: string;
    repoId?: string;
    repoIds?: string[];
    isMultiRepo?: boolean;
  }>;
  currentSessionId?: string | null;
  onSplitSelect?: (sessionId: string) => void;

  // Add repo
  repos?: Array<{ id: string; path: string }>;
  currentRepoIds?: string[];
  onAddRepo?: (repoId: string) => void;

  // Merge sessions
  onMergeSessions?: (sessionIds: string[]) => void;

  // Settings - just needs onClose

  // Export
  messages?: Array<any>;
  sessionName?: string;

  // Usage dashboard
  quota?: any;
  onRefreshQuota?: () => void;

  // Agents
  onSelectAgent?: (agent: any) => void;
  activeRepoId?: string;

  // MCP Tool approval
  pendingMCPApproval?: {
    toolName: string;
    serverName: string;
    description?: string;
    inputParameters: Record<string, any>;
    approvalId: string;
  } | null;
  onApproveMCPTool?: (approvalId: string, autoApproveSession?: boolean) => void;
  onDenyMCPTool?: (approvalId: string) => void;

  // New session
  newSessionProps?: any; // Complex props passed through

  // Start app
  startAppProps?: {
    repoId: string;
    onStarted?: () => void;
  };

  // Expanded input
  expandedInputProps?: {
    initialValue: string;
    onSend: (content: string) => void;
  };
}

export function OverlayManager({
  onCommandSelect,
  onSetMode,
  onSearchSelectResult,
  sessions = [],
  currentSessionId,
  onSplitSelect,
  repos = [],
  currentRepoIds = [],
  onAddRepo,
  onMergeSessions,
  messages = [],
  sessionName = 'conversation',
  quota,
  onRefreshQuota,
  onSelectAgent,
  activeRepoId,
  pendingMCPApproval,
  onApproveMCPTool,
  onDenyMCPTool,
  newSessionProps,
  startAppProps,
  expandedInputProps,
}: OverlayManagerProps) {
  const { activeOverlay, closeOverlay } = useTerminalUIStore();

  // Render overlay based on current state
  const renderOverlay = () => {
    switch (activeOverlay) {
      case 'command-palette':
        return (
          <CommandPalette
            isOpen={true}
            onClose={closeOverlay}
            onSelect={(cmd) => {
              onCommandSelect?.(cmd);
              closeOverlay();
            }}
            setMode={onSetMode}
          />
        );

      case 'settings':
        return <SettingsPanel isOpen={true} onClose={closeOverlay} />;

      case 'export':
        return (
          <ExportModal
            isOpen={true}
            onClose={closeOverlay}
            messages={messages}
            sessionName={sessionName}
          />
        );

      case 'agents':
        return (
          <AgentsPanel
            isOpen={true}
            onClose={closeOverlay}
            onSelectAgent={onSelectAgent}
            repoId={activeRepoId}
          />
        );

      case 'usage-dashboard':
        return (
          <BudgetDashboard
            isOpen={true}
            onClose={closeOverlay}
            quota={quota}
            onRefresh={onRefreshQuota}
          />
        );

      case 'mcp-approval':
        if (!pendingMCPApproval) return null;
        return (
          <ToolApprovalModal
            isOpen={true}
            toolName={pendingMCPApproval.toolName}
            serverName={pendingMCPApproval.serverName}
            description={pendingMCPApproval.description}
            inputParameters={pendingMCPApproval.inputParameters}
            onApprove={async (autoApprove) => {
              await onApproveMCPTool?.(pendingMCPApproval.approvalId, autoApprove);
              closeOverlay();
            }}
            onDeny={async () => {
              await onDenyMCPTool?.(pendingMCPApproval.approvalId);
              closeOverlay();
            }}
          />
        );

      case 'session-search':
        return (
          <SessionSearch
            isOpen={true}
            onClose={closeOverlay}
            onSelectResult={(sessionId, messageId) => {
              onSearchSelectResult?.(sessionId, messageId);
              closeOverlay();
            }}
          />
        );

      case 'split-selector':
        return (
          <SplitSessionSelector
            isOpen={true}
            onClose={closeOverlay}
            sessions={sessions}
            currentSessionId={currentSessionId}
            onSelect={(sessionId) => {
              onSplitSelect?.(sessionId);
              closeOverlay();
            }}
          />
        );

      case 'add-repo':
        return (
          <AddRepoModal
            isOpen={true}
            onClose={closeOverlay}
            repos={repos}
            currentRepoIds={currentRepoIds}
            onAdd={(repoId) => {
              onAddRepo?.(repoId);
              closeOverlay();
            }}
          />
        );

      case 'merge-sessions':
        return (
          <MergeSessionsModal
            isOpen={true}
            onClose={closeOverlay}
            sessions={sessions}
            currentSessionId={currentSessionId}
            onMerge={(sessionIds) => {
              onMergeSessions?.(sessionIds);
              closeOverlay();
            }}
          />
        );

      case 'new-session':
        if (!newSessionProps) return null;
        return (
          <NewSessionModal
            isOpen={true}
            onClose={closeOverlay}
            {...newSessionProps}
          />
        );

      case 'start-app':
        if (!startAppProps) return null;
        return (
          <StartAppModal
            isOpen={true}
            onClose={closeOverlay}
            {...startAppProps}
          />
        );

      case 'expanded-input':
        if (!expandedInputProps) return null;
        return (
          <ExpandedInputModal
            isOpen={true}
            onClose={closeOverlay}
            {...expandedInputProps}
          />
        );

      default:
        return null;
    }
  };

  return <>{renderOverlay()}</>;
}

export type { OverlayManagerProps };
