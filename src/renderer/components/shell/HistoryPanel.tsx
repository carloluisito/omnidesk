// @atlas-entrypoint: Session History Explorer — read-only browser for recorded
// session transcripts (epic #214 child 2). Left pane lists recorded sessions
// newest-first; right pane shows the full transcript for the selected one.
// Search/export/delete/settings are deferred to later children of #214.
import { useCallback, useMemo, useState } from 'react';
import { P4Icon } from './P4Icon';
import { formatLastActive } from './shell-utils';
import { useHistory } from '../../hooks/useHistory';

interface HistoryPanelProps {
  onClose: () => void;
}

/** Humanize a byte count as e.g. "1.2 KB" / "3.4 MB". */
function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function HistoryPanel({ onClose }: HistoryPanelProps) {
  const { sessions, loading, error, getContent } = useHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentMissing, setContentMissing] = useState(false);

  const sorted = useMemo(
    () => [...sessions].sort((a, b) => b.lastUpdatedAt - a.lastUpdatedAt),
    [sessions]
  );

  const selectSession = useCallback(async (id: string) => {
    setSelectedId(id);
    setContentLoading(true);
    setContentMissing(false);
    setContent(null);
    try {
      const result = await getContent(id);
      if (result === null) {
        setContentMissing(true);
      } else {
        setContent(result);
      }
    } finally {
      setContentLoading(false);
    }
  }, [getContent]);

  return (
    <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Session History">
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="history" size={16} /></div>
          <div>
            <div className="t">Session History</div>
            <div className="d">Browse recorded sessions and their full transcripts.</div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body" style={{ display: 'flex', gap: 12, minHeight: 320 }}>
          <div style={{ flex: '0 0 45%', overflowY: 'auto', borderRight: '1px solid var(--border, #2a2a2a)', paddingRight: 8 }}>
            {loading ? (
              <div className="p4-form-row"><span className="d">Loading…</span></div>
            ) : error ? (
              <div className="p4-form-row">
                <span className="d" style={{ color: 'var(--danger, #F7678E)' }}>{error}</span>
              </div>
            ) : sorted.length === 0 ? (
              <div className="p4-form-row"><span className="d">No recorded sessions yet.</span></div>
            ) : (
              sorted.map((s) => (
                <div
                  key={s.id}
                  className="p4-form-row"
                  data-testid={`history-row-${s.id}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => void selectSession(s.id)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void selectSession(s.id); }}
                  style={{
                    cursor: 'pointer',
                    background: selectedId === s.id ? 'var(--surface-hover, rgba(255,255,255,0.06))' : undefined,
                  }}
                >
                  <div className="t" style={{ fontWeight: 600 }}>{s.name}</div>
                  <div className="d">{s.workingDirectory}</div>
                  <div className="d">
                    {formatLastActive(s.lastUpdatedAt)} · {formatSize(s.sizeBytes)}
                    {s.segmentCount > 0 ? ` · ${s.segmentCount + 1} segments` : ''}
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ flex: '1 1 55%', overflowY: 'auto', minWidth: 0 }}>
            {selectedId === null ? (
              <div className="p4-form-row"><span className="d">Select a session to view its transcript.</span></div>
            ) : contentLoading ? (
              <div className="p4-form-row"><span className="d">Loading transcript…</span></div>
            ) : contentMissing ? (
              <div className="p4-form-row">
                <span className="d">This session&apos;s transcript could not be loaded — it may have been deleted.</span>
              </div>
            ) : (
              <pre
                data-testid="history-content"
                style={{
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  fontFamily: 'var(--mono, monospace)',
                  fontSize: 12,
                  margin: 0,
                  padding: 8,
                }}
              >
                {content}
              </pre>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
