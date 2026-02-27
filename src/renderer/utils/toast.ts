/**
 * Toast notification utility — bridges imperative calls to the React ToastContainer.
 *
 * Dispatches a CustomEvent that ToastContainer listens for.
 * Backward-compatible: same showToast(message, type, duration) signature.
 */

export type ToastType = 'success' | 'error' | 'info' | 'warning';

const TOAST_EVENT = 'omni:toast:show';

export function showToast(message: string, type: ToastType = 'info', duration = 3000): void {
  const event = new CustomEvent(TOAST_EVENT, {
    detail: { message, type, duration },
  });
  window.dispatchEvent(event);
}
