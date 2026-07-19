import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { getElectronAPI } from '../../../../test/helpers/electron-api-mock';
import { ShipItSheet } from './ShipItSheet';
import type { ShipItPreview } from '../../../shared/integration-types';

const basePreview: ShipItPreview = {
  branch: 'feat/x',
  baseBranch: 'main',
  filesChanged: 2,
  insertions: 10,
  deletions: 3,
  commits: ['abc123 feat: add thing', 'def456 fix: patch thing'],
};

function setup(preview: ShipItPreview = basePreview) {
  const api = getElectronAPI();
  api.getShipItPreview = vi.fn().mockResolvedValue(preview);
  api.createGithubPR = vi.fn().mockResolvedValue({ url: 'https://github.com/a/b/pull/12' });
  api.openExternal = vi.fn().mockResolvedValue(true);
  return api;
}

describe('ShipItSheet', () => {
  it('renders the diff preview and prefills title from the first commit subject', async () => {
    setup();
    render(<ShipItSheet sessionId="s1" sessionName="fix-bug" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByLabelText('PR title')).toHaveValue('feat: add thing'));
    expect(screen.getByText(/2 files changed/)).toBeInTheDocument();
  });

  it('creates the PR with the edited title/body on explicit click only', async () => {
    const api = setup();
    render(<ShipItSheet sessionId="s1" sessionName="fix-bug" onClose={() => {}} />);
    await waitFor(() => screen.getByLabelText('PR title'));
    expect(api.createGithubPR).not.toHaveBeenCalled(); // nothing automatic

    fireEvent.change(screen.getByLabelText('PR title'), { target: { value: 'My title' } });
    fireEvent.click(screen.getByText('Create PR'));

    await waitFor(() =>
      expect(api.createGithubPR).toHaveBeenCalledWith('s1', expect.objectContaining({ title: 'My title', draft: false }))
    );
    await waitFor(() => expect(screen.getByText(/PR created/)).toBeInTheDocument());
  });

  it('existing PR: replaces create buttons with an Open PR action', async () => {
    setup({ ...basePreview, existingPrUrl: 'https://github.com/a/b/pull/5' });
    render(<ShipItSheet sessionId="s1" sessionName="fix-bug" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/already open/)).toBeInTheDocument());
    expect(screen.queryByText('Create PR')).not.toBeInTheDocument();
  });

  it('no commits beyond base: offers nothing to ship', async () => {
    setup({ ...basePreview, commits: [], filesChanged: 0, insertions: 0, deletions: 0 });
    render(<ShipItSheet sessionId="s1" sessionName="fix-bug" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Nothing to ship/)).toBeInTheDocument());
    expect(screen.queryByText('Create PR')).not.toBeInTheDocument();
  });

  it('surfaces preview failures as an actionable error', async () => {
    const api = setup();
    api.getShipItPreview = vi.fn().mockRejectedValue(new Error('GitHub CLI (gh) not found'));
    render(<ShipItSheet sessionId="s1" sessionName="fix-bug" onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/gh\) not found/)).toBeInTheDocument());
  });
});
