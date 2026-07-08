import type { Repo } from '../../../hooks/useRepos';
import type { TabData } from '../../ui/Tab';

export interface MobileShellProps {
  repos: Repo[];
  activeRepo: Repo | null;
  sessions: TabData[];
  activeSessionId: string | null;
  /** Switch to a session and make its project active. */
  onSelectSession: (id: string) => void;
  /** Switch the active project (repo). */
  onSelectRepo: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNewSession: () => void;
  /** Open/clone a new project (the Add-Repo sheet). */
  onAddRepo: () => void;
  onOpenRemote: () => void;
}
