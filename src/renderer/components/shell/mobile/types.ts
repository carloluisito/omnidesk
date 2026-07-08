import type { Repo } from '../../../hooks/useRepos';
import type { TabData } from '../../ui/Tab';

export interface MobileShellProps {
  repos: Repo[];
  activeRepo: Repo | null;
  sessions: TabData[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  onCloseSession: (id: string) => void;
  onNewSession: () => void;
  onOpenRemote: () => void;
}
