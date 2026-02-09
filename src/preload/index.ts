import { contextBridge, ipcRenderer } from 'electron';
import {
  channels,
  contractKinds,
  type DerivedElectronAPI,
  type IPCContractMap,
} from '../shared/ipc-contract';

/**
 * Auto-generates the preload bridge from the IPC contract.
 *
 * - invoke methods  → ipcRenderer.invoke(channel, ...args)
 * - send methods    → ipcRenderer.send(channel, ...args)
 * - event methods   → ipcRenderer.on(channel, handler), returns unsubscribe fn
 *
 * Special cases for multi-arg send methods that pack into objects:
 *   sendSessionInput(sessionId, data) → send(channel, { sessionId, data })
 *   resizeSession(sessionId, cols, rows) → send(channel, { sessionId, cols, rows })
 */
function buildBridge(): DerivedElectronAPI {
  const api: Record<string, unknown> = {};

  for (const key of Object.keys(contractKinds) as Array<keyof IPCContractMap>) {
    const kind = contractKinds[key];
    const channel = channels[key];

    if (kind === 'invoke') {
      api[key] = (...args: unknown[]) => ipcRenderer.invoke(channel, ...args);
    } else if (kind === 'send') {
      api[key] = (...args: unknown[]) => ipcRenderer.send(channel, ...args);
    } else if (kind === 'event') {
      api[key] = (callback: (...cbArgs: unknown[]) => void) => {
        const handler = (_event: Electron.IpcRendererEvent, ...data: unknown[]) => {
          callback(...data);
        };
        ipcRenderer.on(channel, handler);
        return () => ipcRenderer.removeListener(channel, handler);
      };
    }
  }

  // Override send methods that need multi-arg → object packing
  api.sendSessionInput = (sessionId: string, data: string) => {
    ipcRenderer.send(channels.sendSessionInput, { sessionId, data });
  };

  api.resizeSession = (sessionId: string, cols: number, rows: number) => {
    ipcRenderer.send(channels.resizeSession, { sessionId, cols, rows });
  };

  return api as DerivedElectronAPI;
}

contextBridge.exposeInMainWorld('electronAPI', buildBridge());
