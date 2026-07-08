import type { IPCRegistry } from '../ipc-registry';

interface Sendable {
  send(data: string): void;
}

type Router = Pick<IPCRegistry, 'invokeMethod' | 'sendMethod'>;

/**
 * Handle one JSON frame from a remote WebSocket client.
 *   { t:'invoke', id, method, args } → run handler, reply { t:'result', id, ok, value|error }
 *   { t:'send',   method, args }     → fire-and-forget dispatch, no reply
 * Malformed frames and frames without a string method are ignored.
 */
export function handleWsMessage(raw: string, ws: Sendable, registry: Router): void {
  let msg: { t?: string; id?: number; method?: string; args?: unknown[] };
  try {
    msg = JSON.parse(raw);
  } catch {
    return;
  }
  if (!msg || typeof msg.method !== 'string') return;
  const method = msg.method;
  const args = Array.isArray(msg.args) ? msg.args : [];

  if (msg.t === 'invoke') {
    const id = msg.id;
    Promise.resolve()
      .then(() => registry.invokeMethod(method, args))
      .then((value) => ws.send(JSON.stringify({ t: 'result', id, ok: true, value })))
      .catch((err: unknown) =>
        ws.send(JSON.stringify({ t: 'result', id, ok: false, error: String((err as Error)?.message ?? err) }))
      );
  } else if (msg.t === 'send') {
    try {
      registry.sendMethod(method, args);
    } catch {
      /* fire-and-forget: swallow */
    }
  }
}
