/**
 * IPC Registry — Typed handler registration with automatic cleanup.
 *
 * Usage:
 *   const registry = new IPCRegistry();
 *   registry.handle('createSession', async (_e, request) => { ... });
 *   registry.on('sendSessionInput', (_e, input) => { ... });
 *   // On shutdown:
 *   registry.removeAll();
 */

import { ipcMain, IpcMainInvokeEvent, IpcMainEvent } from 'electron';
import type { IPCContractMap, InvokeContract, SendContract } from '../shared/ipc-contract';
import { channels as ch } from '../shared/ipc-contract';

type InvokeKeys = {
  [K in keyof IPCContractMap]: IPCContractMap[K] extends InvokeContract<string, unknown[], unknown> ? K : never;
}[keyof IPCContractMap];

type SendKeys = {
  [K in keyof IPCContractMap]: IPCContractMap[K] extends SendContract<string, unknown[]> ? K : never;
}[keyof IPCContractMap];

export class IPCRegistry {
  private handlers: string[] = [];
  private listeners: Array<{ channel: string; fn: (...args: unknown[]) => void }> = [];
  private invokeHandlers = new Map<string, (event: unknown, ...args: unknown[]) => unknown>();
  private sendHandlers = new Map<string, (event: unknown, ...args: unknown[]) => void>();

  /**
   * Register an ipcMain.handle() for an invoke-kind method.
   */
  handle<K extends InvokeKeys>(
    key: K,
    handler: (
      event: IpcMainInvokeEvent,
      ...args: IPCContractMap[K] extends InvokeContract<string, infer A, unknown> ? A : never
    ) => IPCContractMap[K] extends InvokeContract<string, unknown[], infer R> ? R | Promise<R> : never
  ): void {
    const channel = ch[key];
    ipcMain.handle(channel, handler as Parameters<typeof ipcMain.handle>[1]);
    this.handlers.push(channel);
    this.invokeHandlers.set(key as string, handler as (event: unknown, ...args: unknown[]) => unknown);
  }

  /**
   * Register an ipcMain.on() for a send-kind method.
   */
  on<K extends SendKeys>(
    key: K,
    handler: (
      event: IpcMainEvent,
      ...args: IPCContractMap[K] extends SendContract<string, infer A> ? A : never
    ) => void
  ): void {
    const channel = ch[key];
    const fn = handler as (...args: unknown[]) => void;
    ipcMain.on(channel, fn);
    this.listeners.push({ channel, fn });
    this.sendHandlers.set(key as string, handler as (event: unknown, ...args: unknown[]) => void);
  }

  /**
   * Invoke an 'invoke'-kind handler directly, bypassing ipcMain.
   *
   * Used by the remote WebSocket router so a browser client hits the exact
   * same handler an Electron renderer would. A synthetic event stands in for
   * IpcMainInvokeEvent — verified safe because no handler reads event.sender.
   */
  async invokeMethod(method: string, args: unknown[]): Promise<unknown> {
    const fn = this.invokeHandlers.get(method);
    if (!fn) throw new Error(`No invoke handler registered for '${method}'`);
    const syntheticEvent = { sender: null, __remote: true };
    return await fn(syntheticEvent, ...args);
  }

  /**
   * Dispatch a 'send'-kind handler directly, bypassing ipcMain.
   * Fire-and-forget; unknown methods are ignored.
   */
  sendMethod(method: string, args: unknown[]): void {
    const fn = this.sendHandlers.get(method);
    if (!fn) return;
    const syntheticEvent = { __remote: true };
    fn(syntheticEvent, ...args);
  }

  /**
   * Remove all registered handlers and listeners.
   */
  removeAll(): void {
    for (const channel of this.handlers) {
      ipcMain.removeHandler(channel);
    }
    for (const { channel, fn } of this.listeners) {
      ipcMain.removeListener(channel, fn);
    }
    this.handlers = [];
    this.listeners = [];
    this.invokeHandlers.clear();
    this.sendHandlers.clear();
  }
}
