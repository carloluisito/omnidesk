import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';

/**
 * GitHub release asset name for cloudflared on this platform/arch, or null if
 * we don't ship an automatic download for it (e.g. macOS ships a .tgz that we
 * ask the user to install via Homebrew instead).
 */
export function cloudflaredAssetName(
  platform: NodeJS.Platform,
  arch: string,
): string | null {
  if (platform === 'win32') {
    return arch === 'ia32' ? 'cloudflared-windows-386.exe' : 'cloudflared-windows-amd64.exe';
  }
  if (platform === 'linux') {
    if (arch === 'arm64') return 'cloudflared-linux-arm64';
    if (arch === 'arm') return 'cloudflared-linux-arm';
    return 'cloudflared-linux-amd64';
  }
  // darwin releases are .tgz archives — handled via Homebrew guidance, not auto-download.
  return null;
}

const RELEASE_BASE = 'https://github.com/cloudflare/cloudflared/releases/latest/download/';

/** Human guidance when auto-download isn't available for the platform. */
export function manualInstallHint(platform: NodeJS.Platform): string {
  if (platform === 'darwin') return 'Install cloudflared with: brew install cloudflared';
  return 'Install cloudflared from https://developers.cloudflare.com/cloudflared/';
}

function download(url: string, dest: string, redirects = 5): Promise<void> {
  return new Promise((resolve, reject) => {
    if (redirects < 0) {
      reject(new Error('Too many redirects downloading cloudflared'));
      return;
    }
    https
      .get(url, (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400 && res.headers.location) {
          res.resume();
          download(res.headers.location, dest, redirects - 1).then(resolve, reject);
          return;
        }
        if (status !== 200) {
          res.resume();
          reject(new Error(`Download failed (HTTP ${status})`));
          return;
        }
        const tmp = `${dest}.download`;
        const file = fs.createWriteStream(tmp);
        res.pipe(file);
        file.on('finish', () => {
          file.close(() => {
            try {
              fs.renameSync(tmp, dest);
              if (process.platform !== 'win32') fs.chmodSync(dest, 0o755);
              resolve();
            } catch (e) {
              reject(e as Error);
            }
          });
        });
        file.on('error', (e) => {
          fs.rm(tmp, { force: true }, () => reject(e));
        });
      })
      .on('error', reject);
  });
}

/**
 * Download the cloudflared binary for this platform into `dest`. Throws with a
 * manual-install hint on unsupported platforms. The caller must ensure this is
 * user-initiated (it fetches and writes an executable).
 */
export async function downloadCloudflared(dest: string): Promise<void> {
  const asset = cloudflaredAssetName(process.platform, process.arch);
  if (!asset) {
    throw new Error(manualInstallHint(process.platform));
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await download(RELEASE_BASE + asset, dest);
}
