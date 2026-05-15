/**
 * useToast — imperative toast API.
 *
 * Returns { toast } with methods: info / success / warning / error.
 * Each method accepts a message string + optional v2 options (title, body,
 * actions, duration, mono). Internally dispatches the global TOAST_EVENT
 * consumed by ToastContainer.
 *
 * Usage:
 *   const { toast } = useToast();
 *   toast.success('Commit pushed', { body: 'a3f1c9b · auth-refactor', mono: true });
 *   toast.error('Build failed', { actions: [{ label: 'View log', onClick: openLog }] });
 */
import { useCallback } from 'react';
import { ToastType, ToastAction } from '../components/ui/Toast';
import { dispatchToast } from '../components/ui/ToastContainer';

export interface ToastOptions {
  /** V2: displayed as the large title line (falls back to message if absent) */
  title?:    string;
  /** V2: secondary body text below the title */
  body?:     string;
  /** V2: action buttons rendered below the body */
  actions?:  ToastAction[];
  /** Override auto-dismiss duration in ms. Passing undefined uses the default
   *  (4 s for non-error in v2; error never auto-dismisses). */
  duration?: number;
  /** Render title/body in monospace font */
  mono?:     boolean;
}

export interface ToastAPI {
  info:    (message: string, opts?: ToastOptions) => void;
  success: (message: string, opts?: ToastOptions) => void;
  warning: (message: string, opts?: ToastOptions) => void;
  error:   (message: string, opts?: ToastOptions) => void;
}

function makeDispatcher(type: ToastType) {
  return (message: string, opts: ToastOptions = {}) => {
    const { duration, ...v2Extra } = opts;
    dispatchToast(message, type, duration, v2Extra);
  };
}

export function useToast(): { toast: ToastAPI } {
  const info    = useCallback(makeDispatcher('info'),    []);
  const success = useCallback(makeDispatcher('success'), []);
  const warning = useCallback(makeDispatcher('warning'), []);
  const error   = useCallback(makeDispatcher('error'),   []);

  return {
    toast: { info, success, warning, error },
  };
}
