// @atlas-entrypoint: TerminalHost — persistent home for every session's xterm.
//
// Why not React portals? Re-targeting `createPortal` re-mounts its children,
// which would dispose xterm and lose the buffer on every mode switch. Instead,
// we render every session's xterm inside a top-level overlay container at a
// FIXED DOM location, and reposition each one via CSS `transform` / size so
// it overlays whatever slot a viewport registered. The xterm DOM never moves,
// so the instance + scrollback survive Focus ↔ Grid switches.
//
// Slot registration: a viewport calls `useTerminalSlot(sessionId)` and attaches
// the returned ref to its container. A `ResizeObserver` tracks that container's
// bounding rect and the host paints the matching terminal to those coords.
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type ReactNode,
} from 'react';
import { MultiTerminal } from '../Terminal';
import type { ProviderId } from '../../../shared/types/provider-types';

interface SlotState {
  el: HTMLElement;
  rect: { left: number; top: number; width: number; height: number };
}

interface TerminalHostContextValue {
  setSlot: (sessionId: string, el: HTMLElement | null) => void;
}

const TerminalHostContext = createContext<TerminalHostContextValue | null>(null);

export function useTerminalSlot(sessionId: string) {
  const ctx = useContext(TerminalHostContext);
  const lastElRef = useRef<HTMLElement | null>(null);
  return useCallback(
    (el: HTMLElement | null) => {
      if (!ctx) return;
      if (el === null && lastElRef.current) {
        ctx.setSlot(sessionId, null);
        lastElRef.current = null;
        return;
      }
      if (el && el !== lastElRef.current) {
        ctx.setSlot(sessionId, el);
        lastElRef.current = el;
      }
    },
    [ctx, sessionId],
  );
}

interface TerminalHostProps {
  sessionIds: string[];
  focusedSessionId: string | null;
  sessionProviderMap: Record<string, ProviderId>;
  sessionKindMap?: Record<string, 'agent' | 'shell'>;
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onOutput: (callback: (sessionId: string, data: string) => void) => () => void;
  /** Fired when a session's terminal gains DOM focus — lets the app mark it
   *  active without changing the view mode (e.g. clicking a tile in Grid). */
  onFocusSession?: (sessionId: string) => void;
  children: ReactNode;
}

export function TerminalHost({
  sessionIds,
  focusedSessionId,
  sessionProviderMap,
  sessionKindMap,
  onInput,
  onResize,
  onOutput,
  onFocusSession,
  children,
}: TerminalHostProps) {
  // Map sessionId → { slot DOM element, last-observed bounding rect }.
  const [slotStates, setSlotStates] = useState<Record<string, SlotState>>({});
  // ResizeObservers, keyed by sessionId, that watch each slot element.
  const observersRef = useRef<Map<string, ResizeObserver>>(new Map());

  const measure = useCallback((el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return { left: r.left, top: r.top, width: r.width, height: r.height };
  }, []);

  const setSlot = useCallback(
    (sessionId: string, el: HTMLElement | null) => {
      // Tear down any prior observer for this session.
      const prev = observersRef.current.get(sessionId);
      if (prev) {
        prev.disconnect();
        observersRef.current.delete(sessionId);
      }

      if (el === null) {
        setSlotStates(prevMap => {
          if (!(sessionId in prevMap)) return prevMap;
          const { [sessionId]: _, ...rest } = prevMap;
          return rest;
        });
        return;
      }

      // Initial measurement, then re-measure on container resize.
      const update = () => {
        const rect = measure(el);
        setSlotStates(prev => {
          const cur = prev[sessionId];
          if (cur && cur.el === el && rectsEqual(cur.rect, rect)) return prev;
          return { ...prev, [sessionId]: { el, rect } };
        });
      };
      update();
      const ro = new ResizeObserver(update);
      ro.observe(el);
      observersRef.current.set(sessionId, ro);
    },
    [measure],
  );

  // Also reposition on window scroll/resize since rects are viewport-relative
  // (ResizeObserver only fires on element-size changes, not scroll position).
  useEffect(() => {
    const reread = () => {
      setSlotStates(prev => {
        let changed = false;
        const next: Record<string, SlotState> = {};
        for (const sid of Object.keys(prev)) {
          const slot = prev[sid];
          const r = slot.el.getBoundingClientRect();
          const rect = { left: r.left, top: r.top, width: r.width, height: r.height };
          if (rectsEqual(slot.rect, rect)) {
            next[sid] = slot;
          } else {
            next[sid] = { el: slot.el, rect };
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };
    window.addEventListener('resize', reread);
    window.addEventListener('scroll', reread, true);
    return () => {
      window.removeEventListener('resize', reread);
      window.removeEventListener('scroll', reread, true);
    };
  }, []);

  // Clean up observers on unmount.
  useEffect(() => () => {
    observersRef.current.forEach(ro => ro.disconnect());
    observersRef.current.clear();
  }, []);

  const ctxValue = useMemo(() => ({ setSlot }), [setSlot]);

  return (
    <TerminalHostContext.Provider value={ctxValue}>
      {children}

      {/* Overlay layer — fixed to the viewport. Each session's terminal is a
          fixed-position child whose left/top/width/height match the rect of
          its registered slot. No DOM movement → no xterm re-mount. */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          pointerEvents: 'none',
          zIndex: 1,
        }}
      >
        {sessionIds.map(sid => {
          const slot = slotStates[sid];
          // Visible session: place over its slot rect. Otherwise park offscreen
          // but with sane dimensions so xterm's FitAddon still has something
          // to measure.
          const style: React.CSSProperties = slot
            ? {
                position: 'absolute',
                left: slot.rect.left,
                top: slot.rect.top,
                width: slot.rect.width,
                height: slot.rect.height,
                pointerEvents: 'auto',
                overflow: 'hidden',
              }
            : {
                position: 'absolute',
                left: -99999,
                top: -99999,
                width: 800,
                height: 600,
                pointerEvents: 'none',
                opacity: 0,
              };
          return (
            <div
              key={sid}
              style={style}
              // Clicking/focusing into this terminal marks the session active
              // (only when it's actually slotted/visible — parked terminals
              // shouldn't steal focus).
              onFocusCapture={() => { if (slot) onFocusSession?.(sid); }}
              onMouseDown={() => { if (slot) onFocusSession?.(sid); }}
            >
              <SingleTerminalSlot
                sessionId={sid}
                isFocused={sid === focusedSessionId && !!slot}
                providerId={sessionProviderMap[sid]}
                kind={sessionKindMap?.[sid]}
                onInput={onInput}
                onResize={onResize}
                onOutput={onOutput}
              />
            </div>
          );
        })}
      </div>
    </TerminalHostContext.Provider>
  );
}

// ─── A single-session wrapper that re-uses MultiTerminal's plumbing ───
// We render a 1-session MultiTerminal because it already owns onOutput
// subscription, Claude readiness detection, and xterm lifecycle. The container
// div around it is what gets repositioned — the xterm DOM inside is stable.
interface SingleTerminalSlotProps {
  sessionId: string;
  isFocused: boolean;
  providerId?: ProviderId;
  kind?: 'agent' | 'shell';
  onInput: (sessionId: string, data: string) => void;
  onResize: (sessionId: string, cols: number, rows: number) => void;
  onOutput: (callback: (sessionId: string, data: string) => void) => () => void;
}

function SingleTerminalSlot({
  sessionId,
  isFocused,
  providerId,
  kind,
  onInput,
  onResize,
  onOutput,
}: SingleTerminalSlotProps) {
  const sessionIds = useMemo(() => [sessionId], [sessionId]);
  const visible = sessionIds;
  const providerMap = useMemo(
    () => providerId ? { [sessionId]: providerId } : {},
    [sessionId, providerId],
  );
  const kindMap = useMemo(
    () => kind ? { [sessionId]: kind } : {},
    [sessionId, kind],
  );
  return (
    <MultiTerminal
      sessionIds={sessionIds}
      visibleSessionIds={visible}
      focusedSessionId={isFocused ? sessionId : null}
      sessionProviderMap={providerMap}
      sessionKindMap={kindMap}
      onInput={onInput}
      onResize={onResize}
      onOutput={onOutput}
    />
  );
}

function rectsEqual(
  a: { left: number; top: number; width: number; height: number },
  b: { left: number; top: number; width: number; height: number },
) {
  return a.left === b.left && a.top === b.top && a.width === b.width && a.height === b.height;
}
