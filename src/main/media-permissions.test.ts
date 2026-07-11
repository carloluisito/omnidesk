import { describe, it, expect, vi } from 'vitest';
import { isAllowedPermission, applyMediaPermissions } from './media-permissions';

describe('media-permissions', () => {
  it('allows mic + clipboard permissions, denies everything else', () => {
    expect(isAllowedPermission('media')).toBe(true);
    expect(isAllowedPermission('audioCapture')).toBe(true);
    expect(isAllowedPermission('microphone')).toBe(true);
    expect(isAllowedPermission('clipboard-read')).toBe(true);
    expect(isAllowedPermission('clipboard-sanitized-write')).toBe(true);
    expect(isAllowedPermission('geolocation')).toBe(false);
    expect(isAllowedPermission('notifications')).toBe(false);
    expect(isAllowedPermission('')).toBe(false);
  });

  it('registers request + check handlers that grant media and deny others', () => {
    let requestHandler: ((wc: unknown, p: string, cb: (granted: boolean) => void) => void) | undefined;
    let checkHandler: ((wc: unknown, p: string) => boolean) | undefined;
    const ses = {
      setPermissionRequestHandler: vi.fn((h) => { requestHandler = h; }),
      setPermissionCheckHandler: vi.fn((h) => { checkHandler = h; }),
    } as unknown as import('electron').Session;

    applyMediaPermissions(ses);

    const cb = vi.fn();
    requestHandler!({}, 'media', cb);
    expect(cb).toHaveBeenCalledWith(true);
    cb.mockClear();
    requestHandler!({}, 'geolocation', cb);
    expect(cb).toHaveBeenCalledWith(false);

    expect(checkHandler!({}, 'media')).toBe(true);
    expect(checkHandler!({}, 'geolocation')).toBe(false);
  });
});
