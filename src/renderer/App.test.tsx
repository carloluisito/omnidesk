// Guardrail regression test (final-review finding I1): the Electron desktop
// must never render the mobile shell. `useTouchMode.desktop.test.ts` already
// covers the touch-mode DETECTOR in isolation; this test protects the actual
// <App/> render branch (`{touchMode ? <MobileShell/> : <div className={shellClass}>…}`
// in App.tsx) from future drift, by rendering the real component tree.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
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
