import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { getElectronAPI } from '../../../test/helpers/electron-api-mock';
import { useSessionManager } from './useSessionManager';

describe('useSessionManager', () => {
  let api: ReturnType<typeof getElectronAPI>;

  beforeEach(() => {
    api = getElectronAPI();
  });

  it('loads initial sessions on mount', async () => {
    const mockSessions = [
      { id: 's1', name: 'Session 1', workingDirectory: '/test', permissionMode: 'standard' as const, status: 'running' as const, createdAt: Date.now() },
    ];
    api.listSessions.mockResolvedValue({
      sessions: mockSessions,
      activeSessionId: 's1',
    });

    const { result } = renderHook(() => useSessionManager());

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.sessions[0].id).toBe('s1');
    expect(result.current.activeSessionId).toBe('s1');
  });

  it('createSession calls electronAPI.createSession', async () => {
    api.listSessions.mockResolvedValue({ sessions: [], activeSessionId: null });
    api.createSession.mockResolvedValue({ id: 's-new', name: 'New', workingDirectory: '/test', permissionMode: 'standard', status: 'running', createdAt: Date.now() });
    api.getSettings.mockResolvedValue({ version: 1, workspaces: [], defaultModel: 'sonnet' });

    const { result } = renderHook(() => useSessionManager());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createSession('New', '/test', 'standard');
    });

    expect(api.createSession).toHaveBeenCalledWith({
      name: 'New',
      workingDirectory: '/test',
      permissionMode: 'standard',
      model: 'sonnet',
    });
  });

  it('createSession forwards launchMode to electronAPI.createSession', async () => {
    // Regression test for the renderer wiring of launchMode. The
    // NewSessionDialog → onSubmit → onCreateSession → handleCreateSession →
    // useSessionManager.createSession → IPC body chain has historically dropped
    // `launchMode` at the renderer boundary even after SessionManager (main)
    // was patched to read it. This test asserts the IPC body actually carries
    // the field, locking the full chain in place.
    api.listSessions.mockResolvedValue({ sessions: [], activeSessionId: null });
    api.createSession.mockResolvedValue({ id: 's-new', name: 'New', workingDirectory: '/test', permissionMode: 'standard', status: 'running', createdAt: Date.now() });
    api.getSettings.mockResolvedValue({ version: 1, workspaces: [], defaultModel: 'sonnet' });

    const { result } = renderHook(() => useSessionManager());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.createSession('Agents Session', '/test', 'standard', undefined, undefined, 'agents');
    });

    expect(api.createSession).toHaveBeenCalledWith(expect.objectContaining({
      name: 'Agents Session',
      workingDirectory: '/test',
      permissionMode: 'standard',
      model: 'sonnet',
      launchMode: 'agents',
    }));
  });

  it('closeSession calls electronAPI.closeSession', async () => {
    api.listSessions.mockResolvedValue({
      sessions: [{ id: 's1', name: 'S1', workingDirectory: '/', permissionMode: 'standard', status: 'running', createdAt: Date.now() }],
      activeSessionId: 's1',
    });
    api.closeSession.mockResolvedValue(true);

    const { result } = renderHook(() => useSessionManager());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.closeSession('s1');
    });

    expect(api.closeSession).toHaveBeenCalledWith('s1');
  });

  it('switchSession calls electronAPI.switchSession', async () => {
    api.listSessions.mockResolvedValue({
      sessions: [
        { id: 's1', name: 'S1', workingDirectory: '/', permissionMode: 'standard', status: 'running', createdAt: Date.now() },
        { id: 's2', name: 'S2', workingDirectory: '/', permissionMode: 'standard', status: 'running', createdAt: Date.now() },
      ],
      activeSessionId: 's1',
    });
    api.switchSession.mockResolvedValue(true);

    const { result } = renderHook(() => useSessionManager());
    await waitFor(() => expect(result.current.isLoading).toBe(false));

    await act(async () => {
      await result.current.switchSession('s2');
    });

    expect(api.switchSession).toHaveBeenCalledWith('s2');
  });

  it('subscribes to session events and cleans up on unmount', () => {
    api.listSessions.mockResolvedValue({ sessions: [], activeSessionId: null });

    const unsubCreated = vi.fn();
    const unsubClosed = vi.fn();
    const unsubSwitched = vi.fn();
    const unsubUpdated = vi.fn();
    const unsubOutput = vi.fn();
    const unsubExited = vi.fn();

    api.onSessionCreated.mockReturnValue(unsubCreated);
    api.onSessionClosed.mockReturnValue(unsubClosed);
    api.onSessionSwitched.mockReturnValue(unsubSwitched);
    api.onSessionUpdated.mockReturnValue(unsubUpdated);
    api.onSessionOutput.mockReturnValue(unsubOutput);
    api.onSessionExited.mockReturnValue(unsubExited);

    const { unmount } = renderHook(() => useSessionManager());

    expect(api.onSessionCreated).toHaveBeenCalled();
    expect(api.onSessionClosed).toHaveBeenCalled();
    expect(api.onSessionOutput).toHaveBeenCalled();

    unmount();
    expect(unsubCreated).toHaveBeenCalled();
    expect(unsubClosed).toHaveBeenCalled();
    expect(unsubOutput).toHaveBeenCalled();
  });

  it('output callback supports multiple subscribers', async () => {
    api.listSessions.mockResolvedValue({ sessions: [], activeSessionId: null });

    let outputListener: Function;
    api.onSessionOutput.mockImplementation((cb: Function) => {
      outputListener = cb;
      return vi.fn();
    });

    const { result } = renderHook(() => useSessionManager());

    const cb1 = vi.fn();
    const cb2 = vi.fn();

    act(() => {
      result.current.onOutput(cb1);
      result.current.onOutput(cb2);
    });

    // Simulate output event
    act(() => {
      outputListener({ sessionId: 's1', data: 'hello' });
    });

    expect(cb1).toHaveBeenCalledWith('s1', 'hello');
    expect(cb2).toHaveBeenCalledWith('s1', 'hello');
  });
});
