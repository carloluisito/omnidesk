/**
 * FocusMode — ⌘. (Mac) / Ctrl+. (Win/Linux) workspace toggle.
 *
 * When toggled ON:
 *  - Adds CSS class `focus-mode` to `document.documentElement`
 *  - Activity bar and right side panel slide out + fade (≤160ms per spec)
 *  - Terminal pane area fills the vacated space via CSS flex
 *
 * When toggled OFF: reverse animation (same duration).
 *
 * Persistence: write `focusMode: true/false` to settings via setSettings IPC.
 * Rationale for persisting: reload should restore the user's intended mode.
 * This matches how split-view state and workspace state are persisted.
 * If the user wants ephemeral focus mode they can open Settings → uncheck it
 * or just toggle it off. Documented choice.
 *
 * No feature flag — FocusMode is a global UX feature, not part of the v2 toggle.
 */

import { useEffect, useState, useCallback, createContext, useContext } from 'react';
import type { ReactNode } from 'react';

// ─── Context ──────────────────────────────────────────────────────────────

interface FocusModeContextValue {
  isFocused: boolean;
  toggle: () => void;
}

const FocusModeContext = createContext<FocusModeContextValue>({
  isFocused: false,
  toggle: () => {},
});

export function useFocusMode(): FocusModeContextValue {
  return useContext(FocusModeContext);
}

// ─── CSS injection ────────────────────────────────────────────────────────
// These styles hide the activity bar and right panel when `.focus-mode` is on root.
// Duration: var(--v2-duration-160, 160ms) per Wave 05 spec gate.

const FOCUS_MODE_CSS = `
  :root.focus-mode [data-focus-hide="activity-bar"] {
    transform: translateX(-100%);
    opacity: 0;
    pointer-events: none;
    transition: transform var(--v2-duration-160, 160ms) var(--v2-ease-snap, cubic-bezier(.4,0,.2,1)),
                opacity   var(--v2-duration-160, 160ms) var(--v2-ease-snap, cubic-bezier(.4,0,.2,1));
  }

  [data-focus-hide="activity-bar"] {
    transition: transform var(--v2-duration-160, 160ms) var(--v2-ease-snap, cubic-bezier(.4,0,.2,1)),
                opacity   var(--v2-duration-160, 160ms) var(--v2-ease-snap, cubic-bezier(.4,0,.2,1));
  }

  :root.focus-mode [data-focus-hide="right-panel"] {
    transform: translateX(100%);
    opacity: 0;
    pointer-events: none;
    transition: transform var(--v2-duration-160, 160ms) var(--v2-ease-snap, cubic-bezier(.4,0,.2,1)),
                opacity   var(--v2-duration-160, 160ms) var(--v2-ease-snap, cubic-bezier(.4,0,.2,1));
  }

  [data-focus-hide="right-panel"] {
    transition: transform var(--v2-duration-160, 160ms) var(--v2-ease-snap, cubic-bezier(.4,0,.2,1)),
                opacity   var(--v2-duration-160, 160ms) var(--v2-ease-snap, cubic-bezier(.4,0,.2,1));
  }
`;

// ─── Provider ─────────────────────────────────────────────────────────────

interface FocusModeProviderProps {
  children: ReactNode;
}

export function FocusModeProvider({ children }: FocusModeProviderProps) {
  const [isFocused, setIsFocused] = useState(false);

  // Read initial state from settings on mount
  useEffect(() => {
    if (typeof window.electronAPI?.getSettings !== 'function') return;
    window.electronAPI.getSettings().then((settings) => {
      const raw = (settings as unknown as Record<string, unknown>)['focusMode'];
      if (raw === true) {
        setIsFocused(true);
        document.documentElement.classList.add('focus-mode');
      }
    }).catch(() => {});
  }, []);

  // Keyboard shortcut: Cmd+. (Mac) / Ctrl+. (Win/Linux)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const isMod = e.metaKey || e.ctrlKey;
      if (isMod && e.key === '.') {
        e.preventDefault();
        setIsFocused((prev) => {
          const next = !prev;
          applyFocusMode(next);
          persistFocusMode(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const toggle = useCallback(() => {
    setIsFocused((prev) => {
      const next = !prev;
      applyFocusMode(next);
      persistFocusMode(next);
      return next;
    });
  }, []);

  return (
    <FocusModeContext.Provider value={{ isFocused, toggle }}>
      <style>{FOCUS_MODE_CSS}</style>
      {children}
    </FocusModeContext.Provider>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function applyFocusMode(on: boolean) {
  if (on) {
    document.documentElement.classList.add('focus-mode');
  } else {
    document.documentElement.classList.remove('focus-mode');
  }
}

function persistFocusMode(on: boolean) {
  if (typeof window.electronAPI?.setSettings !== 'function') return;
  window.electronAPI.setSettings({ focusMode: on }).catch(() => {});
}
