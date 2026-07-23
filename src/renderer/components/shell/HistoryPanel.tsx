// @atlas-entrypoint: Session History Explorer — read-only browser for recorded
// session transcripts (epic #214 child 2), now with cross-session content
// search (epic #214 child 3). Left pane lists recorded sessions newest-first,
// or search results grouped by session when a query is active; right pane
// shows the full transcript for the selected one.
// Export/delete/settings are deferred to later children of #214.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { P4Icon } from './P4Icon';
import { formatLastActive } from './shell-utils';
import { useHistory } from '../../hooks/useHistory';
import type { HistorySearchResult } from '../../../shared/types/history-types';

/** Debounce delay (ms) between the last keystroke and firing a search. */
const SEARCH_DEBOUNCE_MS = 200;

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
  const { sessions, loading, error, getContent, search } = useHistory();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<string | null>(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentMissing, setContentMissing] = useState(false);

  const [query, setQuery] = useState('');
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [searchResults, setSearchResults] = useState<HistorySearchResult[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimerRef = useRef<number | null>(null);
  const searchSeqRef = useRef(0);

  const trimmedQuery = query.trim();

  useEffect(() => {
    if (searchTimerRef.current !== null) {
      window.clearTimeout(searchTimerRef.current);
      searchTimerRef.current = null;
    }
    if (trimmedQuery === '') {
      setSearchResults(null);
      setSearching(false);
      return;
    }
    setSearching(true);
    const seq = ++searchSeqRef.current;
    searchTimerRef.current = window.setTimeout(() => {
      searchTimerRef.current = null;
      void search(trimmedQuery, caseSensitive).then((results) => {
        if (seq !== searchSeqRef.current) return; // superseded by a newer query
        setSearchResults(results);
        setSearching(false);
      });
    }, SEARCH_DEBOUNCE_MS);
    return () => {
      if (searchTimerRef.current !== null) {
        window.clearTimeout(searchTimerRef.current);
        searchTimerRef.current = null;
      }
    };
  }, [trimmedQuery, caseSensitive, search]);

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
            <div className="p4-form-row" style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <P4Icon name="search" size={14} />
              <input
                type="text"
                placeholder="Search transcripts…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                data-testid="history-search-input"
                style={{ flex: 1 }}
              />
            </div>
            <label
              className="p4-form-row"
              style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 12, cursor: 'pointer' }}
            >
              <input
                type="checkbox"
                checked={caseSensitive}
                onChange={(e) => setCaseSensitive(e.target.checked)}
                data-testid="history-search-case"
              />
              Match case
            </label>

            {trimmedQuery !== '' ? (
              searching ? (
                <div className="p4-form-row"><span className="d">Searching…</span></div>
              ) : !searchResults || searchResults.length === 0 ? (
                <div className="p4-form-row">
                  <span className="d">No matches for &quot;{trimmedQuery}&quot;.</span>
                </div>
              ) : (
                searchResults.map((r) => (
                  <div
                    key={r.session.id}
                    className="p4-form-row"
                    data-testid={`history-search-result-${r.session.id}`}
                    role="button"
                    tabIndex={0}
                    onClick={() => void selectSession(r.session.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') void selectSession(r.session.id); }}
                    style={{
                      cursor: 'pointer',
                      background: selectedId === r.session.id ? 'var(--surface-hover, rgba(255,255,255,0.06))' : undefined,
                    }}
                  >
                    <div className="t" style={{ fontWeight: 600 }}>{r.session.name}</div>
                    <div className="d">
                      {r.matchCount} match{r.matchCount === 1 ? '' : 'es'}
                    </div>
                    {r.previews.slice(0, 3).map((p, i) => (
                      <div
                        key={i}
                        className="d"
                        style={{ fontFamily: 'var(--mono, monospace)', fontSize: 11, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}
                      >
                        {p.before}
                        <mark>{p.match}</mark>
                        {p.after}
                      </div>
                    ))}
                  </div>
                ))
              )
            ) : loading ? (
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
