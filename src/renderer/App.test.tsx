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
import type { Workspace, GitRepoEntry, SessionMetadata } from '../shared/ipc-types';

// jsdom doesn't implement ResizeObserver or window.matchMedia, both of which
// TerminalHost/xterm.js need once a session actually mounts (see the
// "next/previous session shortcuts" describe block below, which is the first
// test in this file to render <App/> with an active session rather than the
// empty-state path). Without these stubs the xterm mount throws inside a
// React layout effect, which React treats as fatal and unmounts the whole
// tree — turning every assertion after render() into "expected null".
if (typeof (globalThis as any).ResizeObserver === 'undefined') {
  (globalThis as any).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}
if (typeof window.matchMedia !== 'function') {
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: () => {},
    removeListener: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

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

// Issue #101: Cmd/Ctrl+Shift+]/[ cycles the active session within the active
// repo, wrapping around at the ends. This exercises the real onKey handler in
// App.tsx (matched on e.code so Shift doesn't turn the check into '{'/'}').
describe('App — next/previous session shortcuts', () => {
  function activeSessionName(container: HTMLElement): string | null {
    return container.querySelector('.p4-sess-row.active .sess-name-text')?.textContent ?? null;
  }

  function fireCycleShortcut(direction: 'next' | 'prev') {
    window.dispatchEvent(
      new KeyboardEvent('keydown', {
        ctrlKey: true,
        shiftKey: true,
        code: direction === 'next' ? 'BracketRight' : 'BracketLeft',
        bubbles: true,
      })
    );
  }

  function setUpSessions(sessions: SessionMetadata[], activeSessionId: string | null) {
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
    api.listSessions.mockResolvedValue({ sessions, activeSessionId });

    // useSessionManager only updates activeSessionId in response to the
    // session:switched IPC event — switchSession() itself just calls the
    // main-process IPC method. Wire the mock so calling switchSession fires
    // the same callback the hook registered via onSessionSwitched, matching
    // how the real preload bridge round-trips this in the app.
    let switchedCallback: ((sessionId: string) => void) | null = null;
    api.onSessionSwitched.mockImplementation((cb: (sessionId: string) => void) => {
      switchedCallback = cb;
      return () => {};
    });
    api.switchSession.mockImplementation(async (sessionId: string) => {
      switchedCallback?.(sessionId);
    });
  }

  function makeSession(id: string, name: string, createdAt: number): SessionMetadata {
    return {
      id,
      name,
      workingDirectory: 'C:/repos/demo-repo',
      permissionMode: 'standard',
      status: 'running',
      createdAt,
    };
  }

  beforeEach(() => {
    delete (window as any).__OMNIDESK_REMOTE__;
  });

  it('advances to the next session and wraps from the last back to the first', async () => {
    const sessions = [
      makeSession('s1', 'session-one', 0),
      makeSession('s2', 'session-two', 1),
      makeSession('s3', 'session-three', 2),
    ];
    setUpSessions(sessions, 's1');

    const { container } = render(
      <TouchModeProvider>
        <App />
      </TouchModeProvider>
    );
    await waitFor(() => expect(activeSessionName(container)).toBe('session-one'));

    fireCycleShortcut('next');
    await waitFor(() => expect(activeSessionName(container)).toBe('session-two'));

    fireCycleShortcut('next');
    await waitFor(() => expect(activeSessionName(container)).toBe('session-three'));

    // Wrap around: next from the last session goes back to the first.
    fireCycleShortcut('next');
    await waitFor(() => expect(activeSessionName(container)).toBe('session-one'));
  });

  it('moves to the previous session and wraps from the first back to the last', async () => {
    const sessions = [
      makeSession('s1', 'session-one', 0),
      makeSession('s2', 'session-two', 1),
      makeSession('s3', 'session-three', 2),
    ];
    setUpSessions(sessions, 's1');

    const { container } = render(
      <TouchModeProvider>
        <App />
      </TouchModeProvider>
    );
    await waitFor(() => expect(activeSessionName(container)).toBe('session-one'));

    // Wrap around: previous from the first session goes to the last.
    fireCycleShortcut('prev');
    await waitFor(() => expect(activeSessionName(container)).toBe('session-three'));

    fireCycleShortcut('prev');
    await waitFor(() => expect(activeSessionName(container)).toBe('session-two'));
  });

  it('is a no-op when the active repo has only one session', async () => {
    const sessions = [makeSession('s1', 'only-session', 0)];
    setUpSessions(sessions, 's1');

    const { container } = render(
      <TouchModeProvider>
        <App />
      </TouchModeProvider>
    );
    await waitFor(() => expect(activeSessionName(container)).toBe('only-session'));

    fireCycleShortcut('next');
    fireCycleShortcut('prev');

    // Give any (incorrect) async switch a chance to land before asserting
    // nothing changed.
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(activeSessionName(container)).toBe('only-session');
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
