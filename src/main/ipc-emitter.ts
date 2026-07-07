/**
 * IPC Emitter — Type-safe main→renderer push events.
 *
 * Usage:
 *   const emitter = new IPCEmitter(mainWindow);
 *   emitter.emit('onSessionOutput', output);
 */

import { BrowserWindow } from 'electron';
import type { IPCContractMap, EventContract } from '../shared/ipc-contract';
import { channels } from '../shared/ipc-contract';

type EventKeys = {
  [K in keyof IPCContractMap]: IPCContractMap[K] extends EventContract<string, unknown> ? K : never;
}[keyof IPCContractMap];

type RemoteBroadcaster = (channel: string, payload: unknown) => void;

let remoteBroadcaster: RemoteBroadcaster | null = null;

/**
 * Register (or clear) a sink that receives every emitted event in addition to
 * the Electron window — used to fan events out to remote WebSocket clients.
 */
export function registerRemoteBroadcaster(fn: RemoteBroadcaster | null): void {
  remoteBroadcaster = fn;
}

export class IPCEmitter {
  constructor(private window: BrowserWindow) {}

  emit<K extends EventKeys>(
    key: K,
    payload: IPCContractMap[K] extends EventContract<string, infer P> ? P : never
  ): void {
    const channel = channels[key];
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channel, payload);
    }
    remoteBroadcaster?.(channel, payload);
  }
}
