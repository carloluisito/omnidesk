/**
 * ToastContainer — fixed bottom-right stack of up to 4 toasts.
 * Newest at bottom, stacks upward with 8px gap.
 * Connected to the global toast event system.
 */
import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Toast, ToastData, ToastType } from './Toast';

const MAX_TOASTS = 4;

// Global event bus for imperative showToast() calls
const TOAST_EVENT = 'omni:toast:show';

export interface ShowToastEvent {
  message:   string;
  type:      ToastType;
  duration?: number;
}

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);

  const addToast = useCallback((event: Event) => {
    const { message, type, duration } = (event as CustomEvent<ShowToastEvent>).detail;

    setToasts(prev => {
      const next = [...prev, { id: generateId(), message, type, duration }];
      // If over max, trim the oldest
      return next.length > MAX_TOASTS ? next.slice(next.length - MAX_TOASTS) : next;
    });
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  useEffect(() => {
    window.addEventListener(TOAST_EVENT, addToast);
    return () => window.removeEventListener(TOAST_EVENT, addToast);
  }, [addToast]);

  if (toasts.length === 0) return null;

  return createPortal(
    <div
      aria-label="Notifications"
      style={{
        position:      'fixed',
        bottom:        '32px',
        right:         '16px',
        zIndex:        'var(--z-toast)' as any,
        display:       'flex',
        flexDirection: 'column',
        gap:           'var(--space-2)',
        alignItems:    'flex-end',
        pointerEvents: 'none',
      }}
    >
      {toasts.map(toast => (
        <div key={toast.id} style={{ pointerEvents: 'all' }}>
          <Toast toast={toast} onDismiss={removeToast} />
        </div>
      ))}
    </div>,
    document.body
  );
}

/**
 * Dispatch a toast event — safe to call from anywhere, including outside React.
 */
export function dispatchToast(message: string, type: ToastType = 'info', duration?: number): void {
  const event = new CustomEvent<ShowToastEvent>(TOAST_EVENT, {
    detail: { message, type, duration },
  });
  window.dispatchEvent(event);
}
