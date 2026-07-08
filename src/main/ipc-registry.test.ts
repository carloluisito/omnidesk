import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ipcMain } from 'electron';
import { IPCRegistry } from './ipc-registry';
import { channels } from '../shared/ipc-contract';

describe('IPCRegistry', () => {
  let registry: IPCRegistry;

  beforeEach(() => {
    vi.resetAllMocks();
    registry = new IPCRegistry();
  });

  it('handle() registers via ipcMain.handle with correct channel', () => {
    const handler = vi.fn();
    registry.handle('createSession', handler);

    expect(ipcMain.handle).toHaveBeenCalledWith(
      channels.createSession,
      handler
    );
  });

  it('on() registers via ipcMain.on with correct channel', () => {
    const handler = vi.fn();
    registry.on('sendSessionInput', handler);

    expect(ipcMain.on).toHaveBeenCalledWith(
      channels.sendSessionInput,
      handler
    );
  });

  it('removeAll() cleans up all registered handlers', () => {
    const invokeHandler = vi.fn();
    const sendHandler = vi.fn();

    registry.handle('createSession', invokeHandler);
    registry.on('sendSessionInput', sendHandler);

    registry.removeAll();

    expect(ipcMain.removeHandler).toHaveBeenCalledWith(channels.createSession);
    expect(ipcMain.removeListener).toHaveBeenCalledWith(
      channels.sendSessionInput,
      sendHandler
    );
  });

  it('removeAll() clears internal tracking arrays', () => {
    registry.handle('createSession', vi.fn());
    registry.on('sendSessionInput', vi.fn());

    registry.removeAll();

    // Calling removeAll again should not call ipcMain methods again
    vi.mocked(ipcMain.removeHandler).mockClear();
    vi.mocked(ipcMain.removeListener).mockClear();

    registry.removeAll();

    expect(ipcMain.removeHandler).not.toHaveBeenCalled();
    expect(ipcMain.removeListener).not.toHaveBeenCalled();
  });

  it('handles multiple registrations and removes them all', () => {
    registry.handle('createSession', vi.fn());
    registry.handle('closeSession', vi.fn());
    registry.handle('listSessions', vi.fn());

    registry.removeAll();

    expect(ipcMain.removeHandler).toHaveBeenCalledTimes(3);
  });
});

describe('IPCRegistry direct invocation', () => {
  it('invokeMethod calls the same handler and returns its value', async () => {
    const reg = new IPCRegistry();
    reg.handle('getActiveSession', async () => 'sess-1');
    await expect(reg.invokeMethod('getActiveSession', [])).resolves.toBe('sess-1');
  });

  it('invokeMethod forwards args in order', async () => {
    const reg = new IPCRegistry();
    reg.handle('switchSession', async (_e, id) => `switched:${id}` as unknown as boolean);
    await expect(reg.invokeMethod('switchSession', ['abc'])).resolves.toBe('switched:abc');
  });

  it('invokeMethod rejects for an unknown method', async () => {
    const reg = new IPCRegistry();
    await expect(reg.invokeMethod('nope', [])).rejects.toThrow();
  });

  it('sendMethod calls the same fire-and-forget handler', () => {
    const reg = new IPCRegistry();
    const spy = vi.fn();
    reg.on('sessionReady', (_e, id) => spy(id));
    reg.sendMethod('sessionReady', ['xyz']);
    expect(spy).toHaveBeenCalledWith('xyz');
  });

  it('sendMethod ignores an unknown method', () => {
    const reg = new IPCRegistry();
    expect(() => reg.sendMethod('unknown', [])).not.toThrow();
  });
});
