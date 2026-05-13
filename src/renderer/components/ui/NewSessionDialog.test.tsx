import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { NewSessionDialog } from './NewSessionDialog';
import { resetElectronAPI } from '../../../../test/helpers/electron-api-mock';
import type { LaunchMode } from '../../../shared/ipc-types';

// Mock the availability hook so tests control the returned state
vi.mock('../../hooks/useAgentViewAvailability', () => ({
  useAgentViewAvailability: vi.fn(),
}));

// Mock the useProvider hook to avoid IPC calls in tests.
// CRITICAL: return a single stable object reference across all calls. The dialog has
// a useEffect with `availableProviders` in its deps, and React's set* calls inside that
// effect (e.g. setSubdirectories([])) trigger re-renders when the array identity changes.
// A factory that returns a fresh `{ ...: [] }` per call causes infinite re-renders → hang.
// vi.mock is hoisted to the top of the file; vi.hoisted is needed to keep the stable
// reference defined at hoist-time.
const { stableProviderState } = vi.hoisted(() => ({
  stableProviderState: { providers: [], availableProviders: [] },
}));
vi.mock('../../hooks/useProvider', () => ({
  useProvider: () => stableProviderState,
}));

import { useAgentViewAvailability } from '../../hooks/useAgentViewAvailability';
const mockUseAgentViewAvailability = vi.mocked(useAgentViewAvailability);

describe('Launch mode picker', () => {
  beforeEach(() => {
    resetElectronAPI();
    // Default: availability loaded, agents available
    mockUseAgentViewAvailability.mockReturnValue({
      availability: { status: 'available', cliVersion: '2.2.0' },
      loading: false,
    });
  });

  function renderDialog(props: Partial<Parameters<typeof NewSessionDialog>[0]> = {}) {
    const defaults = {
      isOpen: true,
      onClose: vi.fn(),
      onSubmit: vi.fn(),
      sessionCount: 0,
      workspaces: [],
    };
    return render(<NewSessionDialog {...defaults} {...props} />);
  }

  it('renders three launch mode options: default, bypass-permissions, agents', () => {
    renderDialog();

    const select = screen.getByTestId('launch-mode-select');
    const options = Array.from(select.querySelectorAll('option'));
    const values = options.map(o => o.value);

    expect(values).toContain('default');
    expect(values).toContain('bypass-permissions');
    expect(values).toContain('agents');
    expect(options).toHaveLength(3);
  });

  it('defaults to "default" when no workspace provides skip-permissions', () => {
    renderDialog({ workspaces: [] });

    const select = screen.getByTestId('launch-mode-select') as HTMLSelectElement;
    expect(select.value).toBe('default');
  });

  it('defaults to "bypass-permissions" when workspace defaultPermissionMode is skip-permissions', async () => {
    const api = resetElectronAPI();
    api.listSubdirectories.mockResolvedValue([]);

    renderDialog({
      workspaces: [
        {
          id: 'ws1',
          name: 'My Workspace',
          path: '/projects',
          defaultPermissionMode: 'skip-permissions',
        },
      ],
    });

    // Wait for workspace loading to complete and the picker default to update
    await waitFor(() => {
      const select = screen.getByTestId('launch-mode-select') as HTMLSelectElement;
      expect(select.value).toBe('bypass-permissions');
    });
  });

  it('agents option is enabled when availability status is "available"', () => {
    mockUseAgentViewAvailability.mockReturnValue({
      availability: { status: 'available', cliVersion: '2.2.0' },
      loading: false,
    });

    renderDialog();

    const select = screen.getByTestId('launch-mode-select');
    const agentsOption = select.querySelector('option[value="agents"]') as HTMLOptionElement;
    expect(agentsOption.disabled).toBe(false);
  });

  it('agents option is disabled with tooltip when availability is unavailable', () => {
    const detail = 'claude 2.0.0 is below the minimum 2.1.139';
    mockUseAgentViewAvailability.mockReturnValue({
      availability: {
        status: 'unavailable',
        reason: 'cli-too-old' as const,
        detail,
      },
      loading: false,
    });

    renderDialog();

    const select = screen.getByTestId('launch-mode-select');
    const agentsOption = select.querySelector('option[value="agents"]') as HTMLOptionElement;
    expect(agentsOption.disabled).toBe(true);

    // Tooltip on the wrapper or select itself should contain the detail text
    const container = screen.getByTestId('launch-mode-select').closest('[title], [data-testid="launch-mode-container"]');
    const titleAttr = container?.getAttribute('title') ?? '';
    expect(titleAttr).toContain('Agent View unavailable:');
    expect(titleAttr).toContain(detail);
  });

  it('submitting with "default" selected calls onSubmit with launchMode: default', () => {
    const onSubmit = vi.fn();
    renderDialog({ onSubmit });

    const select = screen.getByTestId('launch-mode-select');
    fireEvent.change(select, { target: { value: 'default' } });

    // Fill in working directory (no-workspace path requires it)
    const input = screen.getByPlaceholderText('~/projects/my-app');
    fireEvent.change(input, { target: { value: '/tmp/test' } });

    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.any(String),   // name
      '/tmp/test',          // workingDirectory
      expect.any(String),   // permissionMode
      undefined,            // worktree
      'claude',             // providerId — defaults to 'claude'
      'default'             // launchMode
    );
  });

  it('submitting with "bypass-permissions" selected calls onSubmit with launchMode: bypass-permissions', () => {
    const onSubmit = vi.fn();
    renderDialog({ onSubmit });

    const select = screen.getByTestId('launch-mode-select');
    fireEvent.change(select, { target: { value: 'bypass-permissions' } });

    const input = screen.getByPlaceholderText('~/projects/my-app');
    fireEvent.change(input, { target: { value: '/tmp/test' } });

    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.any(String),
      '/tmp/test',
      expect.any(String),
      undefined,
      'claude',
      'bypass-permissions'
    );
  });

  it('submitting with "agents" selected calls onSubmit with launchMode: agents', () => {
    const onSubmit = vi.fn();
    renderDialog({ onSubmit });

    const select = screen.getByTestId('launch-mode-select');
    fireEvent.change(select, { target: { value: 'agents' } });

    const input = screen.getByPlaceholderText('~/projects/my-app');
    fireEvent.change(input, { target: { value: '/tmp/test' } });

    fireEvent.submit(screen.getByRole('button', { name: /create/i }).closest('form')!);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.any(String),
      '/tmp/test',
      expect.any(String),
      undefined,
      'claude',
      'agents'
    );
  });
});
