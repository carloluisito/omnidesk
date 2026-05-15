import { Workspace, WorkspaceValidationResult, PermissionMode } from '../../../shared/ipc-types';
import { V2SettingsDialog } from './SettingsDialogV2';

export interface SettingsDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Jump to this sidebar category when opened from the command palette */
  initialCategory?: string;
  workspaces: Workspace[];
  onAddWorkspace: (name: string, path: string, permissionMode: PermissionMode) => Promise<void>;
  onUpdateWorkspace: (id: string, name?: string, path?: string, permissionMode?: PermissionMode) => Promise<void>;
  onDeleteWorkspace: (id: string) => Promise<void>;
  onValidatePath: (path: string, excludeId?: string) => Promise<WorkspaceValidationResult>;
  /** Active workspace/project directory — needed to load project-scoped commands. */
  projectDir?: string | null;
  /** Active session ID — needed to load session-scoped commands. */
  sessionId?: string | null;
}

// ── Public export ─────────────────────────────────────────────────────────────
// Pure pass-through to V2SettingsDialog.

export function SettingsDialog(props: SettingsDialogProps) {
  return (
    <V2SettingsDialog
      isOpen={props.isOpen}
      onClose={props.onClose}
      initialCategory={props.initialCategory as any}
    />
  );
}
