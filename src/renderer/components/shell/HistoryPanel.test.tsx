import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { getElectronAPI } from '../../../../test/helpers/electron-api-mock';
import { HistoryPanel } from './HistoryPanel';
import type { HistorySessionEntry } from '../../../shared/types/history-types';

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

function setupApi(sessions: HistorySessionEntry[] = [makeSession()]) {
  const api = getElectronAPI();
  api.listHistory = vi.fn().mockResolvedValue(sessions);
  api.getHistory = vi.fn().mockResolvedValue('transcript line 1\ntranscript line 2');
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
});
