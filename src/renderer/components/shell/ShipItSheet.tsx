// @atlas-entrypoint: Ship-it sheet — the session→PR handoff. Shows the
// branch's diff summary and commit list, lets the user edit title/body, and
// creates the PR via gh on an EXPLICIT click only (never automatic). One PR
// per branch: an existing PR replaces the create buttons with a view link.
import { useEffect, useState } from 'react';
import { P4Icon } from './P4Icon';
import type { ShipItPreview } from '../../../shared/integration-types';

interface ShipItSheetProps {
  sessionId: string;
  sessionName: string;
  onClose: () => void;
}

export function ShipItSheet({ sessionId, sessionName, onClose }: ShipItSheetProps) {
  const [preview, setPreview] = useState<ShipItPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [creating, setCreating] = useState(false);
  const [createdUrl, setCreatedUrl] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    window.electronAPI
      .getShipItPreview(sessionId)
      .then((p) => {
        if (!alive) return;
        setPreview(p);
        const firstSubject = p.commits[0]?.replace(/^\S+\s+/, '') ?? '';
        setTitle(firstSubject || `Changes from ${sessionName}`);
        setBody(
          [
            '## Summary',
            ...p.commits.map((c) => `- ${c.replace(/^\S+\s+/, '')}`),
            '',
            '🤖 Generated with [Claude Code](https://claude.com/claude-code)',
          ].join('\n')
        );
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : 'Failed to load the diff preview');
      });
    return () => { alive = false; };
  }, [sessionId, sessionName]);

  const create = async (draft: boolean) => {
    setCreating(true);
    setError(null);
    try {
      const res = await window.electronAPI.createGithubPR(sessionId, { title, body, draft });
      setCreatedUrl(res.url);
      try { await navigator.clipboard.writeText(res.url); } catch { /* clipboard unavailable */ }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'PR creation failed';
      const existing = msg.match(/pr-exists:(\S+)/);
      if (existing && preview) {
        setPreview({ ...preview, existingPrUrl: existing[1] });
      } else {
        setError(msg);
      }
    } finally {
      setCreating(false);
    }
  };

  const openUrl = (url: string) => { void window.electronAPI.openExternal(url); };

  return (
    <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Ship it">
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="branch" size={16} /></div>
          <div>
            <div className="t">Ship it</div>
            <div className="d">Turn this session&apos;s branch into a pull request.</div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body">
          {error && (
            <div className="p4-form-row">
              <span className="d" style={{ color: 'var(--danger, #F7678E)' }}>{error}</span>
            </div>
          )}

          {!preview && !error && (
            <div className="p4-form-row"><span className="d">Reading the branch…</span></div>
          )}

          {preview && (
            <>
              <div className="p4-form-row">
                <span className="d">
                  <code>{preview.branch}</code> → <code>{preview.baseBranch}</code> ·{' '}
                  {preview.filesChanged} file{preview.filesChanged === 1 ? '' : 's'} changed,{' '}
                  <span style={{ color: 'var(--accent, #00C9A7)' }}>+{preview.insertions}</span>{' '}
                  <span style={{ color: 'var(--danger, #F7678E)' }}>−{preview.deletions}</span>
                </span>
                {preview.commits.length > 0 && (
                  <ul className="d" style={{ marginTop: 6, paddingLeft: 18 }}>
                    {preview.commits.slice(0, 10).map((c) => <li key={c}><code>{c}</code></li>)}
                    {preview.commits.length > 10 && <li>…and {preview.commits.length - 10} more</li>}
                  </ul>
                )}
              </div>

              {createdUrl || preview.existingPrUrl ? (
                <div className="p4-form-row">
                  <span className="d" style={{ color: 'var(--accent, #00C9A7)' }}>
                    {createdUrl ? '✓ PR created (link copied)' : 'A PR is already open for this branch'}
                  </span>
                  <div style={{ marginTop: 6 }}>
                    <button className="p4-btn primary" onClick={() => openUrl((createdUrl ?? preview.existingPrUrl)!)}>
                      Open PR
                    </button>
                  </div>
                </div>
              ) : preview.commits.length === 0 ? (
                <div className="p4-form-row">
                  <span className="d">Nothing to ship — this branch has no commits beyond {preview.baseBranch}.</span>
                </div>
              ) : (
                <>
                  <div className="p4-form-row">
                    <label className="d">Title</label>
                    <input
                      className="p4-input"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      aria-label="PR title"
                      style={{ width: '100%' }}
                    />
                  </div>
                  <div className="p4-form-row">
                    <label className="d">Body</label>
                    <textarea
                      className="p4-input"
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      aria-label="PR body"
                      rows={6}
                      style={{ width: '100%', resize: 'vertical' }}
                    />
                  </div>
                  <div className="p4-form-row" style={{ display: 'flex', gap: 8 }}>
                    <button className="p4-btn primary" disabled={creating || !title.trim()} onClick={() => void create(false)}>
                      {creating ? 'Creating…' : 'Create PR'}
                    </button>
                    <button className="p4-btn" disabled={creating || !title.trim()} onClick={() => void create(true)}>
                      Create draft
                    </button>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
