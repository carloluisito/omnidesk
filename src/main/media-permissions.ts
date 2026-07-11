// @atlas-entrypoint: Session permission policy for the desktop window.
import type { Session } from 'electron';

/**
 * Permissions the trusted first-party desktop renderer is allowed to use.
 * Electron denies these by default unless a request handler approves them —
 * without this, `navigator.mediaDevices.getUserMedia({ audio: true })` (voice
 * capture for STT) throws `AbortError: "The user aborted a request."`.
 *
 * - media / audioCapture / microphone → getUserMedia for voice prompting.
 * - clipboard-read / clipboard-sanitized-write → the variable resolver and the
 *   mobile key bar read the clipboard; copy writes it.
 *
 * Everything else is denied (the renderer requests nothing else). Add a
 * permission here if a new first-party feature needs it.
 */
const ALLOWED_PERMISSIONS = new Set<string>([
  'media',
  'audioCapture',
  'microphone',
  'clipboard-read',
  'clipboard-sanitized-write',
]);

export function isAllowedPermission(permission: string): boolean {
  return ALLOWED_PERMISSIONS.has(permission);
}

/**
 * Install the request + check handlers on a session so mic + clipboard work.
 * Both are needed: getUserMedia consults the async request handler, while some
 * Chromium paths also consult the synchronous check handler.
 */
export function applyMediaPermissions(ses: Session): void {
  ses.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(isAllowedPermission(permission));
  });
  ses.setPermissionCheckHandler((_webContents, permission) => isAllowedPermission(permission));
}
