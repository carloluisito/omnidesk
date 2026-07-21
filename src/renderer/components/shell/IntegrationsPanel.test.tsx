import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { getElectronAPI } from '../../../../test/helpers/electron-api-mock';
import { IntegrationsPanel } from './IntegrationsPanel';
import { defaultIntegrationsSettings } from '../../../shared/integration-types';

function setupApi(integrations = defaultIntegrationsSettings()) {
  const api = getElectronAPI();
  api.getSettings = vi.fn().mockResolvedValue({ version: 1, workspaces: [], integrations });
  api.setSettings = vi.fn().mockImplementation(async (p) => p);
  api.testIntegrationConnector = vi.fn().mockResolvedValue({ ok: true });
  api.githubPreflight = vi.fn().mockResolvedValue({ installed: true, authenticated: true, hasRemote: true });
  api.sendIntegrationDigestNow = vi.fn().mockResolvedValue(undefined);
  return api;
}

const repos = [{ id: 'r1', name: 'omnidesk', path: 'C:\\repos\\omnidesk' }];

describe('IntegrationsPanel', () => {
  it('renders the four connector cards', async () => {
    setupApi();
    render(<IntegrationsPanel onClose={() => {}} repos={repos} activeRepoPath={repos[0].path} />);
    await waitFor(() => expect(screen.getByTestId('connector-telegram')).toBeInTheDocument());
    for (const id of ['telegram', 'slack', 'discord', 'webhook']) {
      expect(screen.getByTestId(`connector-${id}`)).toBeInTheDocument();
    }
  });

  it('Test button sends the UNSAVED candidate config to testConnector', async () => {
    const api = setupApi();
    render(<IntegrationsPanel onClose={() => {}} repos={repos} />);
    await waitFor(() => screen.getByTestId('connector-telegram'));

    fireEvent.change(screen.getByLabelText('Telegram Bot token'), { target: { value: 'TOK' } });
    fireEvent.change(screen.getByLabelText('Telegram Chat id'), { target: { value: '42' } });
    const card = screen.getByTestId('connector-telegram');
    fireEvent.click(card.querySelector('button')!); // the Test button

    await waitFor(() =>
      expect(api.testIntegrationConnector).toHaveBeenCalledWith(
        'telegram',
        expect.objectContaining({ botToken: 'TOK', chatId: '42' })
      )
    );
    await waitFor(() => expect(screen.getByText('✓ ping delivered')).toBeInTheDocument());
  });

  it('enable toggle persists via setSettings', async () => {
    const api = setupApi();
    render(<IntegrationsPanel onClose={() => {}} repos={repos} />);
    await waitFor(() => screen.getByTestId('connector-slack'));

    fireEvent.click(screen.getByLabelText('Enable Slack'));
    await waitFor(() => expect(api.setSettings).toHaveBeenCalled());
    const sent = (api.setSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(sent.integrations.connectors.slack.enabled).toBe(true);
  });

  it('shows the GitHub preflight result', async () => {
    const api = setupApi();
    api.githubPreflight = vi.fn().mockResolvedValue({
      installed: true, authenticated: false, hasRemote: false, error: 'gh is not authenticated — run: gh auth login',
    });
    render(<IntegrationsPanel onClose={() => {}} repos={repos} activeRepoPath={repos[0].path} />);
    await waitFor(() => expect(screen.getByText(/gh auth login/)).toBeInTheDocument());
  });

  it('Send now triggers the digest IPC', async () => {
    const api = setupApi();
    render(<IntegrationsPanel onClose={() => {}} repos={repos} />);
    await waitFor(() => screen.getByText('Send now'));
    fireEvent.click(screen.getByText('Send now'));
    await waitFor(() => expect(api.sendIntegrationDigestNow).toHaveBeenCalled());
  });

  it('per-repo mute writes perRepo settings keyed by path', async () => {
    const api = setupApi();
    render(<IntegrationsPanel onClose={() => {}} repos={repos} />);
    await waitFor(() => screen.getByLabelText('Mute omnidesk'));
    fireEvent.click(screen.getByLabelText('Mute omnidesk'));
    await waitFor(() => expect(api.setSettings).toHaveBeenCalled());
    const sent = (api.setSettings as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0];
    expect(sent.integrations.perRepo['C:\\repos\\omnidesk']).toEqual({ muted: true });
  });

  it('checkbox rows use the p4-check-row layout class, not the old caption style (#159)', async () => {
    setupApi();
    render(<IntegrationsPanel onClose={() => {}} repos={repos} activeRepoPath={repos[0].path} />);
    await waitFor(() => screen.getByLabelText('Mute omnidesk'));

    expect(screen.getByLabelText('Enable Telegram').closest('label')).toHaveClass('p4-check-row');
    expect(screen.getByLabelText('Needs you (waiting for input / approval)').closest('label')).toHaveClass(
      'p4-check-row'
    );
    expect(screen.getByLabelText('Enable scheduled digest').closest('label')).toHaveClass('p4-check-row');
    expect(screen.getByLabelText('Mute omnidesk').closest('label')).toHaveClass('p4-check-row');

    // None of the checkbox-row labels should retain the old block/uppercase caption class.
    expect(screen.getByLabelText('Enable Telegram').closest('label')).not.toHaveClass('d');
  });
});
