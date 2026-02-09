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

export class IPCEmitter {
  constructor(private window: BrowserWindow) {}

  emit<K extends EventKeys>(
    key: K,
    payload: IPCContractMap[K] extends EventContract<string, infer P> ? P : never
  ): void {
    if (!this.window.isDestroyed()) {
      this.window.webContents.send(channels[key], payload);
    }
  }
}
