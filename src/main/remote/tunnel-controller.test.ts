import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./tunnel-manager', () => {
  const TunnelManager = vi.fn();
  TunnelManager.prototype.isRunning = vi.fn(() => false);
  TunnelManager.prototype.start = vi.fn();
  TunnelManager.prototype.stop = vi.fn();
  TunnelManager.prototype.status = vi.fn();
  return { TunnelManager, findCloudflared: vi.fn() };
});

vi.mock('./cloudflared-install', () => ({
  downloadCloudflared: vi.fn(),
  manualInstallHint: vi.fn(),
}));

import { TunnelController } from './tunnel-controller';
import { TunnelManager, findCloudflared } from './tunnel-manager';
import { downloadCloudflared, manualInstallHint } from './cloudflared-install';

describe('TunnelController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('start', () => {
    it('returns the existing status and does not probe for cloudflared again when already running', async () => {
      // First start() to construct the (mocked) TunnelManager and mark it running.
      vi.mocked(findCloudflared).mockResolvedValue('cloudflared');
      const initialStatus = { state: 'starting' as const };
      vi.mocked(TunnelManager.prototype.start).mockResolvedValue(initialStatus);
      const controller = new TunnelController('/managed');
      await controller.start(8420);
      expect(findCloudflared).toHaveBeenCalledTimes(1);
      expect(TunnelManager).toHaveBeenCalledTimes(1);

      // Now report the manager as running and call start() again.
      vi.mocked(TunnelManager.prototype.isRunning).mockReturnValue(true);
      const runningStatus = { state: 'running' as const, url: 'https://already-up.trycloudflare.com' };
      vi.mocked(TunnelManager.prototype.status).mockReturnValue(runningStatus);

      const status = await controller.start(8420);

      expect(status).toEqual(runningStatus);
      // Still only the one call from the first start() — no re-probe, no second manager.
      expect(findCloudflared).toHaveBeenCalledTimes(1);
      expect(TunnelManager).toHaveBeenCalledTimes(1);
    });

    it('returns an error status and constructs no TunnelManager when cloudflared is missing', async () => {
      vi.mocked(findCloudflared).mockResolvedValue(null);
      vi.mocked(manualInstallHint).mockReturnValue('install cloudflared manually');
      const controller = new TunnelController('/managed');

      const status = await controller.start(8420);

      expect(status).toEqual({ state: 'error', error: 'install cloudflared manually' });
      expect(manualInstallHint).toHaveBeenCalledWith(process.platform);
      expect(TunnelManager).not.toHaveBeenCalled();
    });

    it('constructs a TunnelManager with the found binary and returns its start() status on the happy path', async () => {
      vi.mocked(findCloudflared).mockResolvedValue('/usr/local/bin/cloudflared');
      const happyStatus = { state: 'running' as const, url: 'https://happy-path.trycloudflare.com' };
      vi.mocked(TunnelManager.prototype.start).mockResolvedValue(happyStatus);
      const controller = new TunnelController('/managed');

      const status = await controller.start(8420);

      expect(TunnelManager).toHaveBeenCalledWith('/usr/local/bin/cloudflared');
      expect(TunnelManager.prototype.start).toHaveBeenCalledWith(8420);
      expect(status).toEqual(happyStatus);
    });
  });

  describe('stop', () => {
    it('stops the manager and resets state so status() reports off', async () => {
      vi.mocked(findCloudflared).mockResolvedValue('cloudflared');
      vi.mocked(TunnelManager.prototype.start).mockResolvedValue({ state: 'running' as const });
      const controller = new TunnelController('/managed');
      await controller.start(8420);

      await controller.stop();

      expect(TunnelManager.prototype.stop).toHaveBeenCalledTimes(1);
      expect(controller.status()).toEqual({ state: 'off' });
    });

    it('is a no-op when no manager has been started', async () => {
      const controller = new TunnelController('/managed');

      await expect(controller.stop()).resolves.toBeUndefined();
      expect(TunnelManager.prototype.stop).not.toHaveBeenCalled();
      expect(controller.status()).toEqual({ state: 'off' });
    });
  });

  describe('status', () => {
    it('returns off when no manager has been started', () => {
      const controller = new TunnelController('/managed');
      expect(controller.status()).toEqual({ state: 'off' });
    });

    it("returns the manager's status when running", async () => {
      vi.mocked(findCloudflared).mockResolvedValue('cloudflared');
      vi.mocked(TunnelManager.prototype.start).mockResolvedValue({ state: 'starting' as const });
      const runningStatus = { state: 'running' as const, url: 'https://status-check.trycloudflare.com' };
      vi.mocked(TunnelManager.prototype.status).mockReturnValue(runningStatus);
      const controller = new TunnelController('/managed');
      await controller.start(8420);

      expect(controller.status()).toEqual(runningStatus);
    });
  });

  describe('isInstalled', () => {
    it('returns true when findCloudflared resolves a binary', async () => {
      vi.mocked(findCloudflared).mockResolvedValue('cloudflared');
      const controller = new TunnelController('/managed');
      expect(await controller.isInstalled()).toBe(true);
    });

    it('returns false when findCloudflared resolves null', async () => {
      vi.mocked(findCloudflared).mockResolvedValue(null);
      const controller = new TunnelController('/managed');
      expect(await controller.isInstalled()).toBe(false);
    });
  });

  describe('install', () => {
    it('delegates to downloadCloudflared with the managed path', async () => {
      vi.mocked(downloadCloudflared).mockResolvedValue(undefined);
      const controller = new TunnelController('/managed');

      await controller.install();

      expect(downloadCloudflared).toHaveBeenCalledWith('/managed');
    });
  });
});
