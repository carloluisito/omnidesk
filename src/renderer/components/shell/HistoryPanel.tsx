// @atlas-entrypoint: Session History Explorer — read-only browser for recorded
// session transcripts (epic #214 child 2), with cross-session content search
// (epic #214 child 3), and export / delete / stats / retention actions (epic
// #214 child 4). Left pane lists recorded sessions newest-first, or search
// results grouped by session when a query is active; right pane shows the
// full transcript for the selected one plus its export/delete actions.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { P4Icon } from './P4Icon';
import { formatLastActive } from './shell-utils';
import { useHistory } from '../../hooks/useHistory';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import type { HistorySearchResult, HistorySettings, HistoryStats } from '../../../shared/types/history-types';

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
  const {
    sessions, loading, error, getContent, search,
    remove, removeAll, exportMarkdown, exportJson,
    getSettings, updateSettings, getStats,
  } = useHistory();
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

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [confirmDeleteAll, setConfirmDeleteAll] = useState(false);
  const [stats, setStats] = useState<HistoryStats | null>(null);
  const [settings, setSettings] = useState<HistorySettings | null>(null);

  useEffect(() => {
    void getStats().then(setStats);
    void getSettings().then(setSettings);
  }, [getStats, getSettings]);

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

  /** Display name of the currently selected session — looked up from either the
   *  browse list or the active search results, since a selection can come from
   *  either. Used as the default export filename. */
  const selectedName = useMemo(() => {
    if (selectedId === null) return null;
    const fromSorted = sorted.find((s) => s.id === selectedId);
    if (fromSorted) return fromSorted.name;
    const fromSearch = searchResults?.find((r) => r.session.id === selectedId);
    return fromSearch?.session.name ?? null;
  }, [selectedId, sorted, searchResults]);

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

  const clearSelection = useCallback(() => {
    setSelectedId(null);
    setContent(null);
    setContentMissing(false);
  }, []);

  const handleExportMarkdown = useCallback(async (id: string, name: string) => {
    const path = await window.electronAPI.showSaveDialog({
      defaultPath: `${name}.md`,
      filters: [{ name: 'Markdown', extensions: ['md'] }],
    });
    if (path === null) return; // user cancelled
    await exportMarkdown(id, path);
  }, [exportMarkdown]);

  const handleExportJson = useCallback(async (id: string, name: string) => {
    const path = await window.electronAPI.showSaveDialog({
      defaultPath: `${name}.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (path === null) return; // user cancelled
    await exportJson(id, path);
  }, [exportJson]);

  const handleConfirmDelete = useCallback(async () => {
    if (confirmDeleteId === null) return;
    const id = confirmDeleteId;
    setConfirmDeleteId(null);
    const ok = await remove(id);
    if (ok && selectedId === id) clearSelection();
    setStats(await getStats());
  }, [confirmDeleteId, remove, selectedId, clearSelection, getStats]);

  const handleConfirmDeleteAll = useCallback(async () => {
    setConfirmDeleteAll(false);
    const ok = await removeAll();
    if (ok) clearSelection();
    setStats(await getStats());
  }, [removeAll, clearSelection, getStats]);

  const handleSettingsChange = useCallback(async (patch: Partial<HistorySettings>) => {
    setSettings((prev) => (prev ? { ...prev, ...patch } : prev));
    await updateSettings(patch);
  }, [updateSettings]);

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

          <div style={{ flex: '1 1 55%', overflowY: 'auto', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {selectedId !== null && (
              <div className="p4-form-row" style={{ display: 'flex', gap: 6 }}>
                <button
                  data-testid="history-export-md"
                  onClick={() => void handleExportMarkdown(selectedId, selectedName ?? selectedId)}
                >
                  Export Markdown
                </button>
                <button
                  data-testid="history-export-json"
                  onClick={() => void handleExportJson(selectedId, selectedName ?? selectedId)}
                >
                  Export JSON
                </button>
                <button
                  data-testid="history-delete"
                  onClick={() => setConfirmDeleteId(selectedId)}
                >
                  Delete
                </button>
              </div>
            )}

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

        <div className="p4-sheet-foot" style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border, #2a2a2a)', padding: '8px 0' }}>
          {stats && (
            <div className="p4-form-row" data-testid="history-stats" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span className="d">
                {stats.totalSessions} session{stats.totalSessions === 1 ? '' : 's'} · {formatSize(stats.totalSizeBytes)}
                {stats.oldestSessionDate !== null && stats.newestSessionDate !== null
                  ? ` · ${formatLastActive(stats.oldestSessionDate)} – ${formatLastActive(stats.newestSessionDate)}`
                  : ''}
              </span>
              <button data-testid="history-delete-all" onClick={() => setConfirmDeleteAll(true)}>
                Delete all
              </button>
            </div>
          )}

          {settings && (
            <div className="p4-form-row" data-testid="history-settings" style={{ display: 'flex', gap: 12, alignItems: 'center', fontSize: 12 }}>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                Max age (days)
                <input
                  type="number"
                  min={0}
                  data-testid="history-setting-max-age"
                  value={settings.maxAgeDays}
                  onChange={(e) => void handleSettingsChange({ maxAgeDays: Number(e.target.value) })}
                  style={{ width: 64 }}
                />
              </label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                Max size (MB)
                <input
                  type="number"
                  min={0}
                  data-testid="history-setting-max-size"
                  value={settings.maxSizeMB}
                  onChange={(e) => void handleSettingsChange({ maxSizeMB: Number(e.target.value) })}
                  style={{ width: 64 }}
                />
              </label>
              <label style={{ display: 'flex', gap: 4, alignItems: 'center', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  data-testid="history-setting-auto-cleanup"
                  checked={settings.autoCleanup}
                  onChange={(e) => void handleSettingsChange({ autoCleanup: e.target.checked })}
                />
                Auto cleanup
              </label>
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={confirmDeleteId !== null}
        title="Delete session"
        body="This will permanently delete the recorded transcript for this session. This cannot be undone."
        severity="destructive"
        confirmLabel="Delete"
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmDeleteId(null)}
      />
      <ConfirmDialog
        isOpen={confirmDeleteAll}
        title="Delete all sessions"
        body="This will permanently delete every recorded session transcript. This cannot be undone."
        severity="final-destructive"
        confirmLabel="Delete all"
        onConfirm={() => void handleConfirmDeleteAll()}
        onCancel={() => setConfirmDeleteAll(false)}
      />
    </div>
  );
}
