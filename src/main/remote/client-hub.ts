/** Minimal socket surface satisfied by `ws` WebSocket instances. */
export interface BroadcastSocket {
  readyState: number;
  OPEN: number;
  send(data: string): void;
}

/** Tracks connected remote clients and fans events out to all of them. */
export class ClientHub {
  private clients = new Set<BroadcastSocket>();

  add(ws: BroadcastSocket): void {
    this.clients.add(ws);
  }

  remove(ws: BroadcastSocket): void {
    this.clients.delete(ws);
  }

  size(): number {
    return this.clients.size;
  }

  broadcast(channel: string, payload: unknown): void {
    const frame = JSON.stringify({ t: 'event', channel, payload });
    for (const ws of [...this.clients]) {
      if (ws.readyState !== ws.OPEN) continue;
      try {
        ws.send(frame);
      } catch {
        this.clients.delete(ws);
      }
    }
  }
}
