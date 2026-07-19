// @atlas-entrypoint: Work intake — pick a GitHub issue, get a session.
// Preflight-gated (gh installed + authed + origin remote); selecting an issue
// prefills NewSessionSheet: name "#<n> <title>", branch feat/<n>-<slug>, and
// the issue context as the session's initialPrompt (typed, never submitted).
import { useEffect, useMemo, useState } from 'react';
import { P4Icon } from './P4Icon';
import type { NewSessionPrefill } from './NewSessionSheet';
import type { GitHubIssue, GitHubPreflight } from '../../../shared/integration-types';

interface IssuePickerSheetProps {
  repoPath: string;
  repoName: string;
  onPick: (prefill: NewSessionPrefill) => void;
  onClose: () => void;
}

const slugify = (s: string): string =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');

export function issueToPrefill(issue: GitHubIssue): NewSessionPrefill {
  const name = `#${issue.number} ${issue.title}`.slice(0, 60);
  const branch = `feat/${issue.number}-${slugify(issue.title) || 'issue'}`;
  const initialPrompt = `GitHub issue #${issue.number}: ${issue.title}\n\n${issue.body}\n\n${issue.url}`;
  return { name, branch, initialPrompt };
}

export function IssuePickerSheet({ repoPath, repoName, onPick, onClose }: IssuePickerSheetProps) {
  const [preflight, setPreflight] = useState<GitHubPreflight | null>(null);
  const [issues, setIssues] = useState<GitHubIssue[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let alive = true;
    window.electronAPI
      .githubPreflight(repoPath)
      .then((p) => {
        if (!alive) return;
        setPreflight(p);
        if (p.installed && p.authenticated && p.hasRemote) {
          window.electronAPI
            .listGithubIssues(repoPath)
            .then((list) => { if (alive) setIssues(list); })
            .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'Failed to list issues'); });
        }
      })
      .catch((err) => { if (alive) setError(err instanceof Error ? err.message : 'GitHub check failed'); });
    return () => { alive = false; };
  }, [repoPath]);

  const filtered = useMemo(() => {
    if (!issues) return [];
    const q = query.trim().toLowerCase();
    if (!q) return issues;
    return issues.filter(
      (i) => String(i.number).includes(q) || i.title.toLowerCase().includes(q) || i.labels.some((l) => l.toLowerCase().includes(q))
    );
  }, [issues, query]);

  const ready = preflight?.installed && preflight?.authenticated && preflight?.hasRemote;

  return (
    <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Start from GitHub issue">
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="folder" size={16} /></div>
          <div>
            <div className="t">Start from a GitHub issue</div>
            <div className="d">{repoName} — pick an issue; a worktree session opens with its context typed in.</div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body">
          {error && (
            <div className="p4-form-row"><span className="d" style={{ color: 'var(--danger, #F7678E)' }}>{error}</span></div>
          )}

          {!error && preflight && !ready && (
            <div className="p4-form-row">
              <span className="d" style={{ color: 'var(--danger, #F7678E)' }}>
                {preflight.error ?? 'The GitHub CLI is not ready.'}
              </span>
            </div>
          )}

          {!error && !preflight && (
            <div className="p4-form-row"><span className="d">Checking the GitHub CLI…</span></div>
          )}

          {ready && issues === null && !error && (
            <div className="p4-form-row"><span className="d">Loading open issues…</span></div>
          )}

          {ready && issues !== null && (
            <>
              <div className="p4-form-row">
                <input
                  className="p4-input"
                  placeholder="Filter by number, title, or label…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  aria-label="Filter issues"
                  style={{ width: '100%' }}
                />
              </div>
              {issues.length === 0 ? (
                <div className="p4-form-row"><span className="d">No open issues in this repository.</span></div>
              ) : (
                <div className="p4-palette-list" style={{ maxHeight: 320, overflowY: 'auto' }}>
                  {filtered.map((issue) => (
                    <button
                      key={issue.number}
                      type="button"
                      className="p4-palette-row"
                      style={{ width: '100%', textAlign: 'left' }}
                      onClick={() => onPick(issueToPrefill(issue))}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="txt" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <span style={{ color: 'var(--text-tertiary)' }}>#{issue.number}</span> {issue.title}
                        </div>
                        {issue.labels.length > 0 && (
                          <div className="sub">{issue.labels.join(' · ')}</div>
                        )}
                      </div>
                    </button>
                  ))}
                  {filtered.length === 0 && (
                    <div style={{ padding: 16, color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>No issues match.</div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
