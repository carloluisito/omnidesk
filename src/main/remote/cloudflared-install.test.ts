import { describe, it, expect } from 'vitest';
import { cloudflaredAssetName, manualInstallHint } from './cloudflared-install';

describe('cloudflaredAssetName', () => {
  it('maps Windows to the amd64 exe', () => {
    expect(cloudflaredAssetName('win32', 'x64')).toBe('cloudflared-windows-amd64.exe');
    expect(cloudflaredAssetName('win32', 'ia32')).toBe('cloudflared-windows-386.exe');
  });

  it('maps Linux architectures', () => {
    expect(cloudflaredAssetName('linux', 'x64')).toBe('cloudflared-linux-amd64');
    expect(cloudflaredAssetName('linux', 'arm64')).toBe('cloudflared-linux-arm64');
  });

  it('returns null for macOS (handled via Homebrew)', () => {
    expect(cloudflaredAssetName('darwin', 'arm64')).toBeNull();
  });
});

describe('manualInstallHint', () => {
  it('suggests Homebrew on macOS', () => {
    expect(manualInstallHint('darwin')).toContain('brew');
  });
  it('points to docs elsewhere', () => {
    expect(manualInstallHint('win32')).toContain('cloudflare');
  });
});
