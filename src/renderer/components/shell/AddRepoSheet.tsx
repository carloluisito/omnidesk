// @atlas-entrypoint: Add Repo sheet — Clone URL or Open existing folder.
// Closes over the existing workspace IPC: addWorkspace.
import { useEffect, useMemo, useRef, useState } from 'react';
import { P4Icon } from './P4Icon';
import type { PermissionMode } from '../../../shared/ipc-types';

interface AddRepoSheetProps {
  defaultPermissionMode?: PermissionMode;
  /** Which tab is selected when the sheet opens. Defaults to 'clone'. */
  initialTab?: 'clone' | 'open';
  onClose: () => void;
  onCreate: (req: {
    name: string;
    path: string;
    permissionMode: PermissionMode;
    /** When 'clone', the caller should perform the clone before persisting the workspace. */
    source: 'clone' | 'open';
    cloneUrl?: string;
  }) => Promise<void> | void;
  /** Optional native folder picker. If provided, the "Browse…" button calls this and we put the result in the field. */
  onPickFolder?: () => Promise<string | null>;
}

type Tab = 'clone' | 'open';

export function AddRepoSheet({
  defaultPermissionMode = 'standard',
  initialTab = 'clone',
  onClose,
  onCreate,
  onPickFolder,
}: AddRepoSheetProps) {
  const [tab, setTab] = useState<Tab>(initialTab);
  const [url, setUrl] = useState('');
  const [folder, setFolder] = useState('');
  const [baseDir, setBaseDir] = useState('~/code');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    firstInputRef.current?.focus();
  }, [tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const inferredName = useMemo(() => {
    if (tab === 'clone') {
      const m = url.match(/[/:]([^/:]+?)(?:\.git)?\/?$/);
      return m ? m[1] : '';
    }
    return folder.split(/[\\/]/).filter(Boolean).pop() ?? '';
  }, [tab, url, folder]);

  const targetPath = useMemo(() => {
    if (tab === 'open') return folder;
    const trimmed = baseDir.replace(/\/$/, '') || '~/code';
    return `${trimmed}/${inferredName || 'new-repo'}`;
  }, [tab, baseDir, inferredName, folder]);

  const disabled = (tab === 'clone' ? !url : !folder) || submitting;

  const submit = async () => {
    if (disabled) return;
    setSubmitting(true);
    setError(null);
    try {
      await onCreate({
        name: inferredName || 'repository',
        path: targetPath,
        permissionMode: defaultPermissionMode,
        source: tab,
        cloneUrl: tab === 'clone' ? url : undefined,
      });
      onClose();
    } catch (e: any) {
      setError(e?.message ?? 'Failed to add repository');
      setSubmitting(false);
    }
  };

  return (
    <div
      className="p4-overlay"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Add repository">
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="folder" size={16} /></div>
          <div>
            <div className="t">Add repository</div>
            <div className="d">Open a local folder or clone from a remote URL.</div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body">
          {/* Tab switcher */}
          <div
            style={{
              display: 'flex', gap: 4, background: 'var(--surface-mid)',
              padding: 3, borderRadius: 6, marginBottom: 14,
            }}
          >
            <button
              type="button"
              onClick={() => setTab('clone')}
              className="p4-btn"
              style={{
                flex: 1, justifyContent: 'center',
                background: tab === 'clone' ? 'var(--surface-high)' : 'transparent',
                border: 0,
                color: tab === 'clone' ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '6px 12px',
              }}
            >
              <P4Icon name="git" size={12} /> Clone from URL
            </button>
            <button
              type="button"
              onClick={() => setTab('open')}
              className="p4-btn"
              style={{
                flex: 1, justifyContent: 'center',
                background: tab === 'open' ? 'var(--surface-high)' : 'transparent',
                border: 0,
                color: tab === 'open' ? 'var(--text-primary)' : 'var(--text-secondary)',
                padding: '6px 12px',
              }}
            >
              <P4Icon name="folder" size={12} /> Open existing folder
            </button>
          </div>

          {tab === 'clone' ? (
            <>
              <div className="p4-form-row">
                <label>Repository URL</label>
                <input
                  ref={firstInputRef}
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  placeholder="git@github.com:user/repo.git"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
                <div className="help">SSH or HTTPS · GitHub, GitLab, Bitbucket, or any git server</div>
              </div>

              <div className="p4-form-row">
                <label>Parent directory</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={baseDir}
                    onChange={e => setBaseDir(e.target.value)}
                    placeholder="~/code"
                    style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                  />
                  {onPickFolder && (
                    <button
                      className="p4-btn"
                      type="button"
                      onClick={async () => {
                        const picked = await onPickFolder();
                        if (picked) setBaseDir(picked);
                      }}
                    >
                      <P4Icon name="folder" size={12} /> Pick…
                    </button>
                  )}
                </div>
                <div className="help">Where the new clone will live on disk.</div>
              </div>

              <div style={{
                padding: '10px 12px',
                background: 'var(--surface-mid)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
                marginTop: 8,
              }}>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--text-tertiary)', textTransform: 'uppercase',
                  letterSpacing: '.12em', marginBottom: 6,
                }}>
                  Will clone into
                </div>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  fontFamily: 'var(--font-mono)', fontSize: 12,
                  color: 'var(--text-primary)',
                }}>
                  <P4Icon name="folder" size={12} style={{ color: 'var(--accent)' }} />
                  <span style={{ color: 'var(--text-tertiary)' }}>{baseDir.replace(/\/$/, '') || '~/code'}/</span>
                  <span>{inferredName || <span style={{ color: 'var(--text-quaternary)' }}>«auto»</span>}</span>
                </div>
                <div style={{
                  fontFamily: 'var(--font-mono)', fontSize: 10,
                  color: 'var(--text-tertiary)', marginTop: 6,
                }}>
                  $ git clone {url || '<url>'} {targetPath}
                </div>
              </div>
            </>
          ) : (
            <div className="p4-form-row">
              <label>Folder path</label>
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  ref={firstInputRef}
                  value={folder}
                  onChange={e => setFolder(e.target.value)}
                  placeholder="/Users/you/code/my-repo"
                  style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}
                />
                {onPickFolder && (
                  <button
                    className="p4-btn"
                    type="button"
                    onClick={async () => {
                      const picked = await onPickFolder();
                      if (picked) setFolder(picked);
                    }}
                  >
                    <P4Icon name="folder" size={12} /> Browse…
                  </button>
                )}
              </div>
              <div className="help">Must contain a <code>.git</code> directory.</div>
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 8, padding: '8px 10px',
              background: 'rgba(247,103,142,.10)',
              border: '1px solid rgba(247,103,142,.30)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--error)', fontSize: 'var(--text-sm)',
            }}>{error}</div>
          )}
        </div>

        <div className="p4-sheet-foot">
          <button className="p4-btn ghost" onClick={onClose}>Cancel</button>
          <button
            className="p4-btn primary"
            disabled={disabled}
            onClick={submit}
          >
            <P4Icon name={tab === 'clone' ? 'git' : 'folder'} size={13} />
            {tab === 'clone' ? 'Clone repository' : 'Open folder'}
          </button>
        </div>
      </div>
    </div>
  );
}
