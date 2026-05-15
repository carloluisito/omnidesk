/**
 * ToastContainer — fixed bottom-right stack of toasts.
 *
 * Max 5 visible at a time; extras queue in a ref until a slot opens.
 * Newest toasts appear at the bottom. Listens to the global TOAST_EVENT
 * so dispatchToast() works from anywhere outside React.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Toast, ToastData, ToastType, ToastAction, v2DefaultDuration } from './Toast';

const MAX_TOASTS = 5;

// ─── Global event bus ─────────────────────────────────────────────────────────

const TOAST_EVENT = 'omni:toast:show';

export interface ShowToastEvent {
  message:   string;
  type:      ToastType;
  duration?: number;
  /** V2 fields */
  title?:    string;
  body?:     string;
  actions?:  ToastAction[];
  mono?:     boolean;
}

function generateId(): string {
  return `toast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ─── Container ────────────────────────────────────────────────────────────────

export function ToastContainer() {
  const [toasts, setToasts] = useState<ToastData[]>([]);
  // Queue: toasts beyond MAX_TOASTS wait here until a slot opens.
  // Stored in a ref (not state) because it is never read for rendering —
  // only mutated when a slot opens and we pull the next item out.
  const queueRef = useRef<ToastData[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
    // Promote from queue when a slot opens
    if (queueRef.current.length > 0) {
      const [promoted, ...rest] = queueRef.current;
      queueRef.current = rest;
      setToasts(current => {
        if (current.length >= MAX_TOASTS) return current;
        return [...current, promoted];
      });
    }
  }, []);

  const addToast = useCallback((event: Event) => {
    const detail = (event as CustomEvent<ShowToastEvent>).detail;
    const duration = detail.duration ?? v2DefaultDuration(detail.type);

    const toast: ToastData = {
      id:       generateId(),
      message:  detail.message,
      type:     detail.type,
      duration,
      title:    detail.title,
      body:     detail.body,
      actions:  detail.actions,
      mono:     detail.mono,
    };

    setToasts(prev => {
      if (prev.length < MAX_TOASTS) {
        return [...prev, toast];
      }
      // Full — put in ref queue until a slot opens
      queueRef.current = [...queueRef.current, toast];
      return prev;
    });
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
        bottom:        'var(--space-4, 16px)',
        right:         'var(--space-4, 16px)',
        zIndex:        'var(--z-toast)' as any,
        display:       'flex',
        flexDirection: 'column',
        gap:           8,
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

// ─── Imperative API ───────────────────────────────────────────────────────────

/**
 * dispatchToast — safe to call from anywhere, including outside React.
 * Supports both legacy (message + type) and v2 (title/body/actions) fields.
 */
export function dispatchToast(
  message:  string,
  type:     ToastType = 'info',
  duration?: number,
  v2Extra?: Pick<ShowToastEvent, 'title' | 'body' | 'actions' | 'mono'>
): void {
  const event = new CustomEvent<ShowToastEvent>(TOAST_EVENT, {
    detail: { message, type, duration, ...v2Extra },
  });
  window.dispatchEvent(event);
}
