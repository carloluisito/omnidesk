import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserWindow } from 'electron';
import { IPCEmitter, registerRemoteBroadcaster } from './ipc-emitter';
import { channels } from '../shared/ipc-contract';

function createMockWindow() {
  return {
    isDestroyed: vi.fn(() => false),
    webContents: {
      send: vi.fn(),
    },
  } as unknown as BrowserWindow;
}

describe('IPCEmitter', () => {
  let mockWindow: BrowserWindow;
  let emitter: IPCEmitter;

  beforeEach(() => {
    mockWindow = createMockWindow();
    emitter = new IPCEmitter(mockWindow);
  });

  it('emit() sends payload to webContents with correct channel', () => {
    const payload = { sessionId: 's1', data: 'hello' };

    emitter.emit('onSessionOutput', payload);

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      channels.onSessionOutput,
      payload
    );
  });

  it('emit() is a no-op when window is destroyed', () => {
    vi.mocked(mockWindow.isDestroyed).mockReturnValue(true);

    emitter.emit('onSessionOutput', { sessionId: 's1', data: 'hello' });

    expect(mockWindow.webContents.send).not.toHaveBeenCalled();
  });

  it('emit() sends different event types correctly', () => {
    const payload = {
      id: 's1',
      name: 'Test',
      workingDirectory: '/test',
      permissionMode: 'standard' as const,
      status: 'running' as const,
      createdAt: Date.now(),
    };

    emitter.emit('onSessionCreated', payload);

    expect(mockWindow.webContents.send).toHaveBeenCalledWith(
      channels.onSessionCreated,
      payload
    );
  });
});

describe('IPCEmitter remote broadcaster', () => {
  it('forwards emitted events to the registered broadcaster', () => {
    const send = vi.fn();
    const fakeWindow = { isDestroyed: () => false, webContents: { send } } as unknown as BrowserWindow;
    const received: Array<[string, unknown]> = [];
    registerRemoteBroadcaster((channel, payload) => received.push([channel, payload]));

    const emitter = new IPCEmitter(fakeWindow);
    emitter.emit('onSessionClosed', 'sess-42');

    expect(send).toHaveBeenCalledWith('session:closed', 'sess-42');
    expect(received).toContainEqual(['session:closed', 'sess-42']);

    registerRemoteBroadcaster(null); // reset for other tests
  });
});
