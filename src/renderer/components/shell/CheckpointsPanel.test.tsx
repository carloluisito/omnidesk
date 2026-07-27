import { describe, it, expect, vi } from 'vitest';
import { act, render, screen, waitFor, fireEvent, within } from '@testing-library/react';
import { getElectronAPI } from '../../../../test/helpers/electron-api-mock';
import { CheckpointsPanel } from './CheckpointsPanel';
import type { Checkpoint } from '../../../shared/types/checkpoint-types';
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

function makeCheckpoint(overrides: Partial<Checkpoint> = {}): Checkpoint {
  return {
    id: 'cp1',
    sessionId: 's1',
    name: 'before refactor',
    description: 'stable point',
    createdAt: Date.now() - 60_000,
    historyPosition: 128,
    historySegment: 0,
    tags: ['stable'],
    isTemplate: false,
    ...overrides,
  };
}

function setupApi(
  checkpoints: Checkpoint[] = [makeCheckpoint()],
  sessions: HistorySessionEntry[] = [makeSession()],
) {
  const api = getElectronAPI();
  api.listCheckpoints = vi.fn().mockResolvedValue(checkpoints);
  api.listHistory = vi.fn().mockResolvedValue(sessions);
  api.createCheckpoint = vi.fn().mockResolvedValue(makeCheckpoint());
  api.getCheckpoint = vi.fn().mockResolvedValue(makeCheckpoint());
  api.deleteCheckpoint = vi.fn().mockResolvedValue(true);
  api.updateCheckpoint = vi.fn().mockResolvedValue(makeCheckpoint());
  api.exportCheckpoint = vi.fn().mockResolvedValue('checkpoint export content');
  api.getCheckpointCount = vi.fn().mockResolvedValue(checkpoints.length);
  api.showSaveDialog = vi.fn().mockResolvedValue('C:\\exports\\out.md');
  api.writeFile = vi.fn().mockResolvedValue(true);

  let createdPush: ((c: Checkpoint) => void) | null = null;
  api.onCheckpointCreated = vi.fn().mockImplementation((cb: (c: Checkpoint) => void) => {
    createdPush = cb;
    return () => { createdPush = null; };
  });
  let deletedPush: ((id: string) => void) | null = null;
  api.onCheckpointDeleted = vi.fn().mockImplementation((cb: (id: string) => void) => {
    deletedPush = cb;
    return () => { deletedPush = null; };
  });

  return {
    api,
    emitCreated: (c: Checkpoint) => act(() => { createdPush?.(c); }),
    emitDeleted: (id: string) => act(() => { deletedPush?.(id); }),
  };
}

describe('CheckpointsPanel', () => {
  it('lists checkpoints grouped by session', async () => {
    setupApi([makeCheckpoint({ id: 'cp1', name: 'before refactor' })]);
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => expect(screen.getByTestId('checkpoint-row-cp1')).toBeInTheDocument());
    expect(screen.getByTestId('checkpoint-group-s1')).toBeInTheDocument();
    expect(screen.getByText('before refactor')).toBeInTheDocument();
    expect(screen.getByText('fix auth bug')).toBeInTheDocument();
  });

  it('shows an empty state when there are no checkpoints', async () => {
    setupApi([]);
    render(<CheckpointsPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('No checkpoints yet.')).toBeInTheDocument());
  });

  it('shows an error state when listCheckpoints fails', async () => {
    const api = getElectronAPI();
    api.listCheckpoints = vi.fn().mockRejectedValue(new Error('disk read failed'));
    render(<CheckpointsPanel onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText('disk read failed')).toBeInTheDocument());
  });

  it('calls onClose when the close button is clicked', async () => {
    setupApi();
    const onClose = vi.fn();
    render(<CheckpointsPanel onClose={onClose} />);
    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));
    fireEvent.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalled();
  });

  it('selecting a checkpoint loads its details into the edit form', async () => {
    setupApi([makeCheckpoint({ id: 'cp1', name: 'before refactor', description: 'stable point', tags: ['a', 'b'] })]);
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));
    fireEvent.click(screen.getByTestId('checkpoint-row-cp1'));

    await waitFor(() => expect(screen.getByTestId('checkpoint-edit-name')).toHaveValue('before refactor'));
    expect(screen.getByTestId('checkpoint-edit-description')).toHaveValue('stable point');
    expect(screen.getByTestId('checkpoint-edit-tags')).toHaveValue('a, b');
    expect(screen.getByTestId('checkpoint-meta')).toHaveTextContent('history position 128');
  });

  it('shows a placeholder when no checkpoint is selected', async () => {
    setupApi();
    render(<CheckpointsPanel onClose={() => {}} />);
    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));
    expect(screen.getByText('Select a checkpoint to view its details.')).toBeInTheDocument();
  });

  it('creates a new checkpoint from the new-checkpoint form', async () => {
    const { api, emitCreated } = setupApi([], [makeSession({ id: 's1', name: 'fix auth bug' })]);
    const created = makeCheckpoint({ id: 'cp-new', name: 'my checkpoint' });
    api.createCheckpoint = vi.fn().mockResolvedValue(created);
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('No checkpoints yet.')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('checkpoint-new-toggle'));
    await waitFor(() => screen.getByTestId('checkpoint-new-form'));

    fireEvent.change(screen.getByTestId('checkpoint-new-name'), { target: { value: 'my checkpoint' } });
    fireEvent.change(screen.getByTestId('checkpoint-new-description'), { target: { value: 'notes here' } });
    fireEvent.click(screen.getByTestId('checkpoint-new-create'));

    await waitFor(() =>
      expect(api.createCheckpoint).toHaveBeenCalledWith({
        sessionId: 's1',
        name: 'my checkpoint',
        description: 'notes here',
      })
    );

    // Simulate the main process round-trip: useCheckpoints only updates local
    // state via the onCheckpointCreated event, not the create() return value.
    emitCreated(created);
    await waitFor(() => expect(screen.getByTestId('checkpoint-row-cp-new')).toBeInTheDocument());
    expect(screen.queryByTestId('checkpoint-new-form')).not.toBeInTheDocument();
  });

  it('disables create until a session and name are chosen', async () => {
    setupApi([], []);
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => expect(screen.getByText('No checkpoints yet.')).toBeInTheDocument());
    fireEvent.click(screen.getByTestId('checkpoint-new-toggle'));
    await waitFor(() => screen.getByTestId('checkpoint-new-form'));

    expect(screen.getByTestId('checkpoint-new-create')).toBeDisabled();
  });

  it('cancels the new-checkpoint form without creating', async () => {
    setupApi();
    render(<CheckpointsPanel onClose={() => {}} />);
    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));

    fireEvent.click(screen.getByTestId('checkpoint-new-toggle'));
    await waitFor(() => screen.getByTestId('checkpoint-new-form'));
    fireEvent.click(screen.getByTestId('checkpoint-new-cancel'));

    expect(screen.queryByTestId('checkpoint-new-form')).not.toBeInTheDocument();
  });

  it('saves edits to the selected checkpoint', async () => {
    const api = setupApi([makeCheckpoint({ id: 'cp1', name: 'before refactor' })]).api;
    const updated = makeCheckpoint({ id: 'cp1', name: 'renamed', tags: ['x'] });
    api.updateCheckpoint = vi.fn().mockResolvedValue(updated);
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));
    fireEvent.click(screen.getByTestId('checkpoint-row-cp1'));
    await waitFor(() => expect(screen.getByTestId('checkpoint-edit-name')).toHaveValue('before refactor'));

    fireEvent.change(screen.getByTestId('checkpoint-edit-name'), { target: { value: 'renamed' } });
    fireEvent.change(screen.getByTestId('checkpoint-edit-tags'), { target: { value: 'x' } });
    fireEvent.click(screen.getByTestId('checkpoint-edit-template'));
    fireEvent.click(screen.getByTestId('checkpoint-save'));

    await waitFor(() =>
      expect(api.updateCheckpoint).toHaveBeenCalledWith('cp1', {
        name: 'renamed',
        description: 'stable point',
        tags: ['x'],
        isTemplate: true,
      })
    );
    // update() optimistically patches local state, so the row label updates too.
    await waitFor(() => expect(screen.getByText('renamed')).toBeInTheDocument());
  });

  it('exports the selected checkpoint as Markdown via the save dialog', async () => {
    const { api } = setupApi([makeCheckpoint({ id: 'cp1', name: 'before refactor' })]);
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));
    fireEvent.click(screen.getByTestId('checkpoint-row-cp1'));
    await waitFor(() => screen.getByTestId('checkpoint-export-md'));
    fireEvent.click(screen.getByTestId('checkpoint-export-md'));

    await waitFor(() =>
      expect(api.showSaveDialog).toHaveBeenCalledWith({
        defaultPath: 'before refactor.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      })
    );
    await waitFor(() => expect(api.exportCheckpoint).toHaveBeenCalledWith('cp1', 'markdown'));
    await waitFor(() =>
      expect(api.writeFile).toHaveBeenCalledWith('C:\\exports\\out.md', 'checkpoint export content')
    );
  });

  it('exports the selected checkpoint as JSON via the save dialog', async () => {
    const { api } = setupApi([makeCheckpoint({ id: 'cp1', name: 'before refactor' })]);
    api.showSaveDialog = vi.fn().mockResolvedValue('C:\\exports\\out.json');
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));
    fireEvent.click(screen.getByTestId('checkpoint-row-cp1'));
    await waitFor(() => screen.getByTestId('checkpoint-export-json'));
    fireEvent.click(screen.getByTestId('checkpoint-export-json'));

    await waitFor(() =>
      expect(api.showSaveDialog).toHaveBeenCalledWith({
        defaultPath: 'before refactor.json',
        filters: [{ name: 'JSON', extensions: ['json'] }],
      })
    );
    await waitFor(() => expect(api.exportCheckpoint).toHaveBeenCalledWith('cp1', 'json'));
    await waitFor(() =>
      expect(api.writeFile).toHaveBeenCalledWith('C:\\exports\\out.json', 'checkpoint export content')
    );
  });

  it('does not export when the save dialog is cancelled', async () => {
    const { api } = setupApi([makeCheckpoint({ id: 'cp1' })]);
    api.showSaveDialog = vi.fn().mockResolvedValue(null);
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));
    fireEvent.click(screen.getByTestId('checkpoint-row-cp1'));
    await waitFor(() => screen.getByTestId('checkpoint-export-md'));
    fireEvent.click(screen.getByTestId('checkpoint-export-md'));
    fireEvent.click(screen.getByTestId('checkpoint-export-json'));

    await waitFor(() => expect(api.showSaveDialog).toHaveBeenCalledTimes(2));
    expect(api.exportCheckpoint).not.toHaveBeenCalled();
    expect(api.writeFile).not.toHaveBeenCalled();
  });

  it('deletes the selected checkpoint after confirming, and clears the detail view', async () => {
    const { api, emitDeleted } = setupApi([makeCheckpoint({ id: 'cp1', name: 'before refactor' })]);
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));
    fireEvent.click(screen.getByTestId('checkpoint-row-cp1'));
    await waitFor(() => screen.getByTestId('checkpoint-delete'));

    fireEvent.click(screen.getByTestId('checkpoint-delete'));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete checkpoint')).toBeInTheDocument();
    fireEvent.mouseDown(within(dialog).getByRole('button', { name: /^Delete/ }));

    await waitFor(() => expect(api.deleteCheckpoint).toHaveBeenCalledWith('cp1'));

    // Simulate the main process round-trip: useCheckpoints only removes the
    // item from local state via the onCheckpointDeleted event.
    emitDeleted('cp1');
    await waitFor(() =>
      expect(screen.getByText('Select a checkpoint to view its details.')).toBeInTheDocument()
    );
    expect(screen.queryByTestId('checkpoint-row-cp1')).not.toBeInTheDocument();
  });

  it('cancels checkpoint deletion without calling deleteCheckpoint', async () => {
    const { api } = setupApi([makeCheckpoint({ id: 'cp1' })]);
    render(<CheckpointsPanel onClose={() => {}} />);

    await waitFor(() => screen.getByTestId('checkpoint-row-cp1'));
    fireEvent.click(screen.getByTestId('checkpoint-row-cp1'));
    await waitFor(() => screen.getByTestId('checkpoint-delete'));
    fireEvent.click(screen.getByTestId('checkpoint-delete'));

    const dialog = await screen.findByRole('alertdialog');
    fireEvent.mouseDown(within(dialog).getByRole('button', { name: /^Cancel/ }));

    expect(api.deleteCheckpoint).not.toHaveBeenCalled();
  });
});
