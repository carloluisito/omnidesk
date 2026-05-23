// @atlas-entrypoint: Status bar (Phase 4).
// Live count · repo · branch · session/worktree counts · burn rate.
import { P4Icon } from './P4Icon';
import { liveCount, sessionsForRepo } from './SessionRail';
import type { Repo } from '../../hooks/useRepos';
import type { TabData } from '../ui/Tab';

interface StatusBarProps {
  repo: Repo | null;
  repos: Repo[];
  sessions: TabData[];
  /** Burn rate, USD per hour, displayed as N.NN /hr. Provide null if not yet known. */
  burnRatePerHour?: number | null;
  onOpenOtherReposLive: () => void;
}

export function StatusBar({
  repo,
  repos,
  sessions,
  burnRatePerHour,
  onOpenOtherReposLive,
}: StatusBarProps) {
  if (!repo) {
    return (
      <footer className="p4-statusbar">
        <span>no repository</span>
      </footer>
    );
  }

  const repoSessions = sessionsForRepo(repo, sessions);
  const live = liveCount(repoSessions);
  const worktreeCount =
    new Set(repoSessions.map(s => s.worktreeBranch).filter(Boolean) as string[]).size ||
    (repoSessions.length > 0 ? 1 : 0);

  // Total live across all other repos (for cross-repo nudge).
  const otherLive = repos
    .filter(r => r.id !== repo.id)
    .reduce((acc, r) => acc + liveCount(sessionsForRepo(r, sessions)), 0);

  return (
    <footer className="p4-statusbar">
      <span className="pill">
        <span style={{
          width: 6, height: 6, borderRadius: '50%',
          background: 'var(--accent)',
          animation: live > 0 ? 'p4-pulse 1.6s var(--ease-in-out) infinite' : undefined,
        }} />
        {live} live
      </span>

      <span className="sep">|</span>
      <span>
        <P4Icon name="folder" size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
        {repo.name}
      </span>

      {repo.branch && (
        <>
          <span className="sep">|</span>
          <span>
            <P4Icon name="branch" size={10} style={{ verticalAlign: -1, marginRight: 3 }} />
            {repo.branch}
          </span>
        </>
      )}

      <span className="sep">|</span>
      <span>
        {repoSessions.length} session{repoSessions.length === 1 ? '' : 's'} · {worktreeCount} worktree{worktreeCount === 1 ? '' : 's'}
      </span>

      {otherLive > 0 && (
        <>
          <span className="sep">|</span>
          <button
            type="button"
            className="pill"
            onClick={onOpenOtherReposLive}
            title="Live sessions in other repos"
            style={{ color: 'var(--warning)' }}
          >
            +{otherLive} live in other repos
          </button>
        </>
      )}

      <div className="right">
        {typeof burnRatePerHour === 'number' && (
          <span className="pill">
            <P4Icon name="flame" size={10} style={{ color: 'var(--warning)' }} />
            {burnRatePerHour.toFixed(2)} /hr
          </span>
        )}
      </div>
    </footer>
  );
}
