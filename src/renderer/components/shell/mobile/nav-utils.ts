import type { Repo } from '../../../hooks/useRepos';
import type { TabData } from '../../ui/Tab';
import { sessionBelongsToRepo } from '../RepoActivityBar';

/**
 * The id of the repo a session belongs to, among `repos` (first match), or
 * undefined if the session is unknown or matches none of them. Used by the
 * mobile drawer so tapping a session can make its project active.
 */
export function repoIdForSession(
  repos: Repo[],
  sessions: TabData[],
  sessionId: string,
): string | undefined {
  const session = sessions.find(s => s.id === sessionId);
  if (!session) return undefined;
  return repos.find(r => sessionBelongsToRepo(r.path, session))?.id;
}
