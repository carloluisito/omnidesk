// Guardrail regression test (final-review finding I1): the Electron desktop
// must never render the mobile shell. `useTouchMode.desktop.test.ts` already
// covers the touch-mode DETECTOR in isolation; this test protects the actual
// <App/> render branch (`{touchMode ? <MobileShell/> : <div className={shellClass}>…}`
// in App.tsx) from future drift, by rendering the real component tree.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor, fireEvent, screen } from '@testing-library/react';
import App from './App';
import { TouchModeProvider } from './hooks/useTouchMode';
import { getElectronAPI } from '../../test/helpers/electron-api-mock';
import type { Workspace, GitRepoEntry } from '../shared/ipc-types';

describe('App — desktop vs. mobile shell routing', () => {
  beforeEach(() => {
    // Touch mode is remote-only (see useTouchMode.detectTouchMode): it only
    // resolves true when window.__OMNIDESK_REMOTE__ === true. Make sure the
    // desktop (non-remote) path is exercised.
    delete (window as any).__OMNIDESK_REMOTE__;

    // Give useRepos() a repo to resolve to, so App takes its main render path
    // (TerminalHost + the touch-mode ternary) rather than the "no active
    // repo" empty-state early return — both branches must avoid MobileShell
    // when touch mode is off, but the main path is the one described by the
    // ternary this test is guarding.
    const api = getElectronAPI();
    const workspace: Workspace = {
      id: 'ws-1',
      name: 'workspace',
      path: 'C:/repos',
      defaultPermissionMode: 'standard',
      createdAt: 0,
      updatedAt: 0,
    };
    const repoEntry: GitRepoEntry = {
      name: 'demo-repo',
      path: 'C:/repos/demo-repo',
      workspacePath: 'C:/repos',
      branch: 'main',
    };
    api.listWorkspaces.mockResolvedValue([workspace]);
    api.listGitRepos.mockResolvedValue([repoEntry]);
  });

  it('renders the desktop shell (.p4-shell) and never MobileShell (.ms-shell) when touch mode is off', async () => {
    const { container } = render(
      <TouchModeProvider>
        <App />
      </TouchModeProvider>
    );

    // useRepos() resolves the workspace/repo scan asynchronously; wait for
    // the active repo to land so App takes its main render path.
    await waitFor(() => {
      expect(container.querySelector('.p4-shell')).toBeTruthy();
    });

    expect(container.querySelector('.p4-shell')).toBeTruthy();
    expect(container.querySelector('.ms-shell')).toBeNull();
  });
});

// Regression test for the Caps Lock branch-consistency bug (issue #86):
// KeyboardEvent.key reflects Caps Lock state, so with Caps Lock on, the "K"
// key yields e.key === 'K'. The Cmd/Ctrl+Shift+K branch already normalized
// via .toLowerCase(), but the plain Cmd/Ctrl+K/J/N branches compared against
// lowercase literals with no normalization, so those three shortcuts
// silently did nothing whenever Caps Lock was on. This guards that all
// branches normalize consistently and that early-return ordering (Shift+K
// before plain K) is preserved.
describe('App — keyboard shortcuts normalize case (Caps Lock safety)', () => {
  beforeEach(() => {
    delete (window as any).__OMNIDESK_REMOTE__;

    const api = getElectronAPI();
    const workspace: Workspace = {
      id: 'ws-1',
      name: 'workspace',
      path: 'C:/repos',
      defaultPermissionMode: 'standard',
      createdAt: 0,
      updatedAt: 0,
    };
    const repoEntry: GitRepoEntry = {
      name: 'demo-repo',
      path: 'C:/repos/demo-repo',
      workspacePath: 'C:/repos',
      branch: 'main',
    };
    api.listWorkspaces.mockResolvedValue([workspace]);
    api.listGitRepos.mockResolvedValue([repoEntry]);
  });

  async function renderReadyApp() {
    const { container } = render(
      <TouchModeProvider>
        <App />
      </TouchModeProvider>
    );
    await waitFor(() => {
      expect(container.querySelector('.p4-shell')).toBeTruthy();
    });
    return container;
  }

  it('opens the command palette on Cmd+K when e.key is lowercase (Caps Lock off)', async () => {
    await renderReadyApp();

    fireEvent.keyDown(window, { key: 'k', metaKey: true });

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy();
  });

  it('opens the command palette on Cmd+K when e.key is uppercase (Caps Lock on)', async () => {
    await renderReadyApp();

    fireEvent.keyDown(window, { key: 'K', metaKey: true });

    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeTruthy();
  });

  it('opens the Repo Switcher (not the palette) on Cmd+Shift+K, uppercase or lowercase key', async () => {
    await renderReadyApp();

    fireEvent.keyDown(window, { key: 'K', shiftKey: true, metaKey: true });
    expect(await screen.findByRole('dialog', { name: 'Switch repository' })).toBeTruthy();
    expect(screen.queryByRole('dialog', { name: 'Command palette' })).toBeNull();
  });
});
