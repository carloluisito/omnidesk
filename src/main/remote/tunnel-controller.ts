import { TunnelManager, findCloudflared, type TunnelStatus } from './tunnel-manager';
import { downloadCloudflared, manualInstallHint } from './cloudflared-install';

/**
 * Composes cloudflared detection, download, and a single TunnelManager into the
 * lifecycle the remote:* IPC handlers drive. One tunnel at a time.
 */
export class TunnelController {
  private mgr: TunnelManager | null = null;

  constructor(private managedPath: string) {}

  async isInstalled(): Promise<boolean> {
    return (await findCloudflared(this.managedPath)) !== null;
  }

  /** Start a tunnel to the given local port. Returns an error status (never
   *  throws) if cloudflared is missing or the tunnel fails to come up. */
  async start(port: number): Promise<TunnelStatus> {
    if (this.mgr?.isRunning()) return this.mgr.status();
    const bin = await findCloudflared(this.managedPath);
    if (!bin) {
      return { state: 'error', error: manualInstallHint(process.platform) };
    }
    this.mgr = new TunnelManager(bin);
    return this.mgr.start(port);
  }

  async stop(): Promise<void> {
    await this.mgr?.stop();
    this.mgr = null;
  }

  status(): TunnelStatus {
    return this.mgr?.status() ?? { state: 'off' };
  }

  /** Download cloudflared into the managed path. Caller must ensure this is
   *  user-initiated (fetches and writes an executable). */
  async install(): Promise<void> {
    await downloadCloudflared(this.managedPath);
  }
}
