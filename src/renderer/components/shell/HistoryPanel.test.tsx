import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { getElectronAPI } from '../../../../test/helpers/electron-api-mock';
import { HistoryPanel } from './HistoryPanel';
import type { HistorySessionEntry, HistorySearchResult } from '../../../shared/types/history-types';

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
});
