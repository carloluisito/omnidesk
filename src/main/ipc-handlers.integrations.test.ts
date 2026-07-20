/**
 * Boundary tests for the integrations:* IPC handlers — verifies the REAL
 * setupIPCHandlers registration (not a re-implementation), because IPC
 * parameter drops are silent in JS and unit tests on the managers alone
 * can't catch them.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const handleSpy = vi.fn();
const onSpy = vi.fn();

vi.mock('./ipc-registry', () => ({
  IPCRegistry: class {
    handle = handleSpy;
    on = onSpy;
  },
}));

import { setupIPCHandlers } from './ipc-handlers';

type Handler = (...args: unknown[]) => Promise<unknown>;

function getHandler(name: string): Handler {
  const call = handleSpy.mock.calls.find((c) => c[0] === name);
  if (!call) throw new Error(`handler not registered: ${name}`);
  return call[1] as Handler;
}

describe('integrations IPC handlers', () => {
  const sessionMeta = {
    id: 'sess-1',
    name: 'fix-bug',
    workingDirectory: 'C:\\repos\\omnidesk',
    permissionMode: 'standard',
    status: 'running',
    createdAt: 0,
  };

  const sessionManager = {
    setMainWindow: vi.fn(),
    getSession: vi.fn((id: string) => (id === 'sess-1' ? sessionMeta : null)),
  };
  const settingsManager = { mergeSettings: vi.fn((p: unknown) => p) };
  const checkpointManager = { setMainWindow: vi.fn() };
  const integrationManager = {
    testConnector: vi.fn(async () => ({ ok: true })),
    getDeliveryStatuses: vi.fn(() => []),
    sendDigestNow: vi.fn(async () => {}),
    notifyPRCreated: vi.fn(),
    settingsChanged: vi.fn(),
  };
  const githubService = {
    preflight: vi.fn(async () => ({ installed: true, authenticated: true, hasRemote: true })),
    listIssues: vi.fn(async () => []),
    getShipItPreview: vi.fn(async () => ({ branch: 'b', baseBranch: 'main', filesChanged: 0, insertions: 0, deletions: 0, commits: [] })),
    createPR: vi.fn(async () => ({ url: 'https://github.com/a/b/pull/9' })),
  };

  beforeEach(() => {
    handleSpy.mockClear();
    setupIPCHandlers(
      {} as never, // mainWindow
      sessionManager as never,
      settingsManager as never,
      {} as never, // historyManager
      checkpointManager as never,
      {} as never, // sessionPool
      { setMainWindow: vi.fn() } as never, // gitManager (registration-time no-ops)
      {} as never, // providerRegistry
      { getToken: vi.fn(() => 't') } as never, // remoteAuth
      {} as never, // sttManager
      integrationManager as never,
      githubService as never,
    );
  });

  it('registers every integrations:* handler', () => {
    for (const name of [
      'testIntegrationConnector',
      'getIntegrationDeliveryStatuses',
      'sendIntegrationDigestNow',
      'githubPreflight',
      'listGithubIssues',
      'getShipItPreview',
      'createGithubPR',
    ]) {
      expect(handleSpy.mock.calls.some((c) => c[0] === name), name).toBe(true);
    }
  });

  it('testIntegrationConnector forwards connector id and candidate config', async () => {
    await getHandler('testIntegrationConnector')({}, 'slack', { enabled: true, webhookUrl: 'https://x' });
    expect(integrationManager.testConnector).toHaveBeenCalledWith('slack', { enabled: true, webhookUrl: 'https://x' });
  });

  it('getShipItPreview resolves the session working directory', async () => {
    await getHandler('getShipItPreview')({}, 'sess-1');
    expect(githubService.getShipItPreview).toHaveBeenCalledWith('C:\\repos\\omnidesk');
  });

  it('getShipItPreview throws for an unknown session', async () => {
    await expect(getHandler('getShipItPreview')({}, 'nope')).rejects.toThrow('Unknown session');
  });

  it('createGithubPR creates then notifies with the session metadata', async () => {
    const result = await getHandler('createGithubPR')({}, 'sess-1', { title: 't', body: 'b', draft: false });
    expect(githubService.createPR).toHaveBeenCalledWith('C:\\repos\\omnidesk', { title: 't', body: 'b', draft: false });
    expect(integrationManager.notifyPRCreated).toHaveBeenCalledWith(sessionMeta, 'https://github.com/a/b/pull/9');
    expect(result).toEqual({ url: 'https://github.com/a/b/pull/9' });
  });

  it('setSettings pokes integrationManager.settingsChanged', async () => {
    await getHandler('setSettings')({}, { integrations: {} });
    expect(integrationManager.settingsChanged).toHaveBeenCalled();
  });
});
