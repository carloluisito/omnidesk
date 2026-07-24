import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { getElectronAPI } from '../../../../test/helpers/electron-api-mock';
import { HistoryPanel } from './HistoryPanel';
import type {
  HistorySessionEntry,
  HistorySearchResult,
  HistorySettings,
  HistoryStats,
} from '../../../shared/types/history-types';

function makeSettings(overrides: Partial<HistorySettings> = {}): HistorySettings {
  return {
    maxAgeDays: 30,
    maxSizeMB: 500,
    autoCleanup: false,
    ...overrides,
  };
}

function makeStats(overrides: Partial<HistoryStats> = {}): HistoryStats {
  return {
    totalSessions: 3,
    totalSizeBytes: 1024 * 1024 * 5, // 5 MB
    oldestSessionDate: Date.now() - 7 * 24 * 60 * 60 * 1000,
    newestSessionDate: Date.now() - 60_000,
    ...overrides,
  };
}

function makeSession(overrides: Partial<HistorySessionEntry> = {}): HistorySessionEntry {
  return {
    id: 's1',
    name: 'fix auth bug',
    workingDirectory: 'C:\\repos\\omnidesk',
    createdAt: Date.now() - 120_000,
    lastUpdatedAt: Date.now() - 60_000,
    sizeBytes: 2048,
    segmentCount: 0,
    ...overrides,
  };
}

function makeSearchResult(overrides: Partial<HistorySearchResult> = {}): HistorySearchResult {
  return {
    session: makeSession(),
    matchCount: 2,
    previews: [
      { lineNumber: 3, before: 'context before ', match: 'needle', after: ' context after' },
    ],
    ...overrides,
  };
}

function setupApi(sessions: HistorySessionEntry[] = [makeSession()]) {
  const api = getElectronAPI();
  api.listHistory = vi.fn().mockResolvedValue(sessions);
  api.getHistory = vi.fn().mockResolvedValue('transcript line 1\ntranscript line 2');
  api.searchHistory = vi.fn().mockResolvedValue([]);
  api.getHistorySettings = vi.fn().mockResolvedValue(makeSettings());
  api.getHistoryStats = vi.fn().mockResolvedValue(makeStats());
  api.showSaveDialog = vi.fn().mockResolvedValue('C:\\exports\\out.md');
  api.exportHistoryMarkdown = vi.fn().mockResolvedValue(true);
  api.exportHistoryJson = vi.fn().mockResolvedValue(true);
  api.deleteHistory = vi.fn().mockResolvedValue(true);
  api.deleteAllHistory = vi.fn().mockResolvedValue(true);
  api.updateHistorySettings = vi.fn().mockResolvedValue(true);
  return api;
}

describe('HistoryPanel', () => {
  it('lists recorded sessions newest-first with name and working directory', async () => {
    const older = makeSession({ id: 's-old', name: 'older session', lastUpdatedAt: Date.now() - 3_600_000 });
    const newer = makeSession({ id: 's-new', name: 'newer session', lastUpdatedAt: Date.now() - 1_000 });
    setupApi([older, newer]);

    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId('history-row-s-new')).toBeInTheDocument());
    expect(screen.getByTestId('history-row-s-old')).toBeInTheDocument();
    expect(screen.getByText('newer session')).toBeInTheDocument();
    expect(screen.getByText('older session')).toBeInTheDocument();
    expect(screen.getAllByText('C:\\repos\\omnidesk').length).toBe(2);

    // newest-first: s-new row should precede s-old row in the DOM
    const rows = screen.getAllByRole('button').filter((el) => el.dataset.testid?.startsWith('history-row-'));
    expect(rows[0]).toHaveAttribute('data-testid', 'history-row-s-new');
    expect(rows[1]).toHaveAttribute('data-testid', 'history-row-s-old');
  });

  it('selecting a session loads and displays its transcript', async () => {
    const api = setupApi([makeSession({ id: 's1' })]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.click(screen.getByTestId('history-row-s1'));

    await waitFor(() => expect(api.getHistory).toHaveBeenCalledWith('s1'));
    await waitFor(() =>
      expect(screen.getByTestId('history-content')).toHaveTextContent('transcript line 1')
    );
  });

  it('shows a graceful message when the transcript content is missing', async () => {
    const api = setupApi([makeSession({ id: 's1' })]);
    api.getHistory = vi.fn().mockResolvedValue(null);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.click(screen.getByTestId('history-row-s1'));

    await waitFor(() =>
      expect(screen.getByText(/could not be loaded/)).toBeInTheDocument()
    );
  });

  it('shows an empty state when there are no recorded sessions', async () => {
    setupApi([]);
    render(<HistoryPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('No recorded sessions yet.')).toBeInTheDocument());
  });

  it('shows an error state when listHistory fails', async () => {
    const api = getElectronAPI();
    api.listHistory = vi.fn().mockRejectedValue(new Error('disk read failed'));
    render(<HistoryPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('disk read failed')).toBeInTheDocument());
  });

  it('calls onClose when the close button is clicked', async () => {
    setupApi();
    const onClose = vi.fn();
    render(<HistoryPanel onClose={onClose} />);
    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('debounces search input and calls search with the query and case-sensitivity flag', async () => {
    const api = setupApi();
    api.searchHistory = vi.fn().mockResolvedValue([makeSearchResult()]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.change(screen.getByTestId('history-search-input'), { target: { value: 'needle' } });

    await waitFor(() => expect(api.searchHistory).toHaveBeenCalledWith('needle', false));
  });

  it('passes the match-case toggle through to the search call', async () => {
    const api = setupApi();
    api.searchHistory = vi.fn().mockResolvedValue([makeSearchResult()]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.click(screen.getByTestId('history-search-case'));
    fireEvent.change(screen.getByTestId('history-search-input'), { target: { value: 'needle' } });

    await waitFor(() => expect(api.searchHistory).toHaveBeenCalledWith('needle', true));
  });

  it('renders search results grouped by session with match counts and highlighted previews', async () => {
    const api = setupApi();
    api.searchHistory = vi.fn().mockResolvedValue([makeSearchResult()]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.change(screen.getByTestId('history-search-input'), { target: { value: 'needle' } });

    await waitFor(() => expect(screen.getByTestId('history-search-result-s1')).toBeInTheDocument());
    expect(screen.getByText('2 matches')).toBeInTheDocument();
    expect(screen.getByText('needle')).toBeInTheDocument();
  });

  it('shows a "no matches" state when the search returns no results', async () => {
    const api = setupApi();
    api.searchHistory = vi.fn().mockResolvedValue([]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.change(screen.getByTestId('history-search-input'), { target: { value: 'nothingmatches' } });

    await waitFor(() =>
      expect(screen.getByText('No matches for "nothingmatches".')).toBeInTheDocument()
    );
  });

  it('shows a "searching" state while a search is in flight', async () => {
    const api = setupApi();
    let resolveSearch: (value: HistorySearchResult[]) => void = () => {};
    api.searchHistory = vi.fn(() => new Promise((resolve) => { resolveSearch = resolve; }));
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.change(screen.getByTestId('history-search-input'), { target: { value: 'needle' } });

    await waitFor(() => expect(screen.getByText('Searching…')).toBeInTheDocument());
    await waitFor(() => expect(api.searchHistory).toHaveBeenCalled());
    resolveSearch([makeSearchResult()]);
    await waitFor(() => expect(screen.getByTestId('history-search-result-s1')).toBeInTheDocument());
  });

  it('falls back to the browse list when the search query is cleared', async () => {
    const api = setupApi();
    api.searchHistory = vi.fn().mockResolvedValue([makeSearchResult()]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    const input = screen.getByTestId('history-search-input');
    fireEvent.change(input, { target: { value: 'needle' } });
    await waitFor(() => expect(screen.getByTestId('history-search-result-s1')).toBeInTheDocument());

    fireEvent.change(input, { target: { value: '' } });
    await waitFor(() => expect(screen.getByTestId('history-row-s1')).toBeInTheDocument());
    expect(screen.queryByTestId('history-search-result-s1')).not.toBeInTheDocument();
  });

  it('clicking a search result loads and displays its transcript', async () => {
    const other = makeSession({ id: 's2', name: 'other session' });
    const api = setupApi([makeSession(), other]);
    api.searchHistory = vi.fn().mockResolvedValue([makeSearchResult({ session: other, matchCount: 1 })]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.change(screen.getByTestId('history-search-input'), { target: { value: 'needle' } });

    await waitFor(() => screen.getByTestId('history-search-result-s2'));
    fireEvent.click(screen.getByTestId('history-search-result-s2'));

    await waitFor(() => expect(api.getHistory).toHaveBeenCalledWith('s2'));
    await waitFor(() =>
      expect(screen.getByTestId('history-content')).toHaveTextContent('transcript line 1')
    );
  });

  it('exports the selected session as Markdown via the save dialog', async () => {
    const api = setupApi([makeSession({ id: 's1', name: 'fix auth bug' })]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.click(screen.getByTestId('history-row-s1'));
    await waitFor(() => screen.getByTestId('history-export-md'));
    fireEvent.click(screen.getByTestId('history-export-md'));

    await waitFor(() =>
      expect(api.showSaveDialog).toHaveBeenCalledWith({
        defaultPath: 'fix auth bug.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
    );
    await waitFor(() =>
      expect(api.exportHistoryMarkdown).toHaveBeenCalledWith('s1', 'C:\\exports\\out.md')
    );
  });

  it('exports the selected session as JSON via the save dialog', async () => {
    const api = setupApi([makeSession({ id: 's1', name: 'fix auth bug' })]);
    api.showSaveDialog = vi.fn().mockResolvedValue('C:\\exports\\out.json');
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.click(screen.getByTestId('history-row-s1'));
    await waitFor(() => screen.getByTestId('history-export-json'));
    fireEvent.click(screen.getByTestId('history-export-json'));

    await waitFor(() =>
      expect(api.showSaveDialog).toHaveBeenCalledWith({
        defaultPath: 'fix auth bug.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
    );
    await waitFor(() =>
      expect(api.exportHistoryJson).toHaveBeenCalledWith('s1', 'C:\\exports\\out.json')
    );
  });

  it('does not export when the save dialog is cancelled', async () => {
    const api = setupApi([makeSession({ id: 's1' })]);
    api.showSaveDialog = vi.fn().mockResolvedValue(null);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.click(screen.getByTestId('history-row-s1'));
    await waitFor(() => screen.getByTestId('history-export-md'));
    fireEvent.click(screen.getByTestId('history-export-md'));
    fireEvent.click(screen.getByTestId('history-export-json'));

    await waitFor(() => expect(api.showSaveDialog).toHaveBeenCalledTimes(2));
    expect(api.exportHistoryMarkdown).not.toHaveBeenCalled();
    expect(api.exportHistoryJson).not.toHaveBeenCalled();
  });

  it('deletes the selected session after confirming, and clears the transcript viewer', async () => {
    const api = setupApi([makeSession({ id: 's1' })]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-row-s1'));
    fireEvent.click(screen.getByTestId('history-row-s1'));
    await waitFor(() =>
      expect(screen.getByTestId('history-content')).toHaveTextContent('transcript line 1')
    );

    fireEvent.click(screen.getByTestId('history-delete'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete session')).toBeInTheDocument();
    fireEvent.mouseDown(within(dialog).getByRole('button', { name: /^Delete/ }));

    await waitFor(() => expect(api.deleteHistory).toHaveBeenCalledWith('s1'));
    await waitFor(() =>
      expect(screen.getByText('Select a session to view its transcript.')).toBeInTheDocument()
    );
  });

  it('deletes all sessions after confirming via the final-destructive dialog', async () => {
    const api = setupApi([makeSession({ id: 's1' })]);
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-delete-all'));
    fireEvent.click(screen.getByTestId('history-delete-all'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete all sessions')).toBeInTheDocument();
    fireEvent.mouseDown(within(dialog).getByRole('button', { name: /^Delete all/ }));

    await waitFor(() => expect(api.deleteAllHistory).toHaveBeenCalled());
  });

  it('renders history stats with session count and size', async () => {
    setupApi();
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-stats'));
    const stats = screen.getByTestId('history-stats');
    expect(within(stats).getByText(/3 sessions/)).toBeInTheDocument();
    expect(within(stats).getByText(/5(\.0)? MB/)).toBeInTheDocument();
  });

  it('loads history settings and persists changes to each field', async () => {
    const api = setupApi();
    render(<HistoryPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('history-settings'));
    expect(screen.getByTestId('history-setting-max-age')).toHaveValue(30);
    expect(screen.getByTestId('history-setting-max-size')).toHaveValue(500);
    expect(screen.getByTestId('history-setting-auto-cleanup')).not.toBeChecked();

    fireEvent.change(screen.getByTestId('history-setting-max-age'), { target: { value: '60' } });
    await waitFor(() => expect(api.updateHistorySettings).toHaveBeenCalledWith({ maxAgeDays: 60 }));

    fireEvent.change(screen.getByTestId('history-setting-max-size'), { target: { value: '1000' } });
    await waitFor(() => expect(api.updateHistorySettings).toHaveBeenCalledWith({ maxSizeMB: 1000 }));

    fireEvent.click(screen.getByTestId('history-setting-auto-cleanup'));
    await waitFor(() => expect(api.updateHistorySettings).toHaveBeenCalledWith({ autoCleanup: true }));
  });
});
