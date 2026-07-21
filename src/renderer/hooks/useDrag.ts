/**
 * useDrag — tiny pointer-events drag-to-reorder abstraction.
 *
 * Decision: hand-rolled pointer events (not @dnd-kit/core).
 * Rationale: the spec says "start with hand-rolled pointer events, only escalate
 * to @dnd-kit/core if implementation gets ugly." Both use-sites (TabBar tabs,
 * TaskPanel rows) are flat lists — no nested DnD, no cross-list, no virtualized
 * rows. The hand-rolled approach is ~80 lines and covers the full interaction
 * model cleanly.
 *
 * API:
 *   const { dragHandlers, dragState } = useDrag({ items, onReorder })
 *   dragHandlers(index) → { onPointerDown }   — attach to each draggable element
 *   dragState.activeIndex — the item being dragged (null when idle)
 *   dragState.overIndex — the item being hovered during drag (null when idle)
 *
 * Visual contract (caller responsibility):
 *   - Dragged item: opacity 0.5 + cursor grabbing
 *   - Drop target gap: 2px accent line via --v2-accent between rows
 *
 * Persistence: caller receives onReorder(from, to) and writes to settings/IPC.
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface DragState {
  activeIndex: number | null;
  overIndex: number | null;
}

export interface UseDragOptions<T> {
  items: T[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  /** Minimum pixels to move before drag is considered started (default 4). */
  threshold?: number;
}

export interface UseDragReturn {
  dragState: DragState;
  dragHandlers: (index: number) => {
    onPointerDown: (e: React.PointerEvent) => void;
  };
}

export function useDrag<T>({ items, onReorder, threshold = 4 }: UseDragOptions<T>): UseDragReturn {
  const [dragState, setDragState] = useState<DragState>({ activeIndex: null, overIndex: null });

  // Use refs so event handlers don't capture stale state
  const activeRef = useRef<number | null>(null);
  const overRef = useRef<number | null>(null);
  const startYRef = useRef<number>(0);
  const startXRef = useRef<number>(0);
  const didStartRef = useRef(false);
  const itemsRef = useRef<T[]>(items);
  itemsRef.current = items;

  // Teardown for whichever drag is currently in progress, if any. Set at the
  // start of each pointerdown, cleared once the drag ends. Exists so the
  // unmount effect below can revert document.body.style.cursor/userSelect
  // even when the pointerup/pointercancel listener (attached to the dragged
  // element itself) never fires — e.g. the dragged tab/row is removed from
  // the DOM mid-drag (session closed, list item deleted) and the owning
  // component unmounts before the pointer is released.
  const activeCleanupRef = useRef<(() => void) | null>(null);

  const dragHandlers = useCallback((index: number) => ({
    onPointerDown: (e: React.PointerEvent) => {
      // Only primary button
      if (e.button !== 0) return;

      // Never start a drag from an interactive child (close button, rename
      // input, links). Capturing the pointer here would swallow that
      // element's click — this is what broke the tab close (X) button.
      if ((e.target as HTMLElement).closest('button, input, a, [role="button"], [contenteditable="true"]')) {
        return;
      }

      activeRef.current = index;
      overRef.current = index;
      startYRef.current = e.clientY;
      startXRef.current = e.clientX;
      didStartRef.current = false;

      const el = e.currentTarget as HTMLElement;
      const pointerId = e.pointerId;

      const onMove = (moveEvent: PointerEvent) => {
        const dy = Math.abs(moveEvent.clientY - startYRef.current);
        const dx = Math.abs(moveEvent.clientX - startXRef.current);

        if (!didStartRef.current) {
          if (dy < threshold && dx < threshold) return;
          didStartRef.current = true;
          // Capture only once the drag actually begins, so a plain click
          // (pointerdown→pointerup with no movement) still dispatches a
          // normal `click` to whatever was under the pointer.
          try { el.setPointerCapture(pointerId); } catch { /* already released */ }
          setDragState({ activeIndex: activeRef.current, overIndex: overRef.current });
          document.body.style.cursor = 'grabbing';
          document.body.style.userSelect = 'none';
        }

        // Determine over index from pointer position relative to siblings
        const parent = el.parentElement;
        if (!parent) return;

        const siblings = Array.from(parent.children) as HTMLElement[];
        let newOver = activeRef.current!;
        for (let i = 0; i < siblings.length; i++) {
          const rect = siblings[i].getBoundingClientRect();
          const mid = rect.top + rect.height / 2;
          if (moveEvent.clientY < mid) {
            newOver = i;
            break;
          }
          newOver = i;
        }

        if (newOver !== overRef.current) {
          overRef.current = newOver;
          setDragState({ activeIndex: activeRef.current, overIndex: newOver });
        }
      };

      const removeListeners = () => {
        el.removeEventListener('pointermove', onMove);
        el.removeEventListener('pointerup', onUp);
        el.removeEventListener('pointercancel', onUp);
        el.removeEventListener('lostpointercapture', onLostCapture);
      };

      // Shared cleanup: revert the global cursor/userSelect mutation (only if
      // a drag actually started — a plain click never touched them) and
      // reset drag bookkeeping. Used by pointerup, pointercancel,
      // lostpointercapture, and the component-unmount safety net.
      const endDrag = () => {
        removeListeners();

        if (didStartRef.current) {
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }

        activeRef.current = null;
        overRef.current = null;
        didStartRef.current = false;
        activeCleanupRef.current = null;
      };

      const onUp = () => {
        const wasStarted = didStartRef.current;
        const from = activeRef.current;
        const to = overRef.current;

        endDrag();
        setDragState({ activeIndex: null, overIndex: null });

        if (wasStarted && from !== null && to !== null && from !== to) {
          onReorder(from, to);
        }
      };

      // Fires when the browser implicitly releases pointer capture — notably
      // when the captured element (`el`) is removed from the DOM, which is
      // exactly the "dragged item unmounts mid-drag" scenario (e.g. closing a
      // tab while dragging it). Treat it like a cancel: no reorder, just
      // revert the global styles so the app doesn't get stuck with
      // cursor: grabbing / userSelect: none.
      const onLostCapture = () => {
        endDrag();
        setDragState({ activeIndex: null, overIndex: null });
      };

      activeCleanupRef.current = () => {
        endDrag();
        setDragState({ activeIndex: null, overIndex: null });
      };

      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('lostpointercapture', onLostCapture);
    },
  }), [onReorder, threshold]);

  // Safety net: if the component that owns this hook instance unmounts while
  // a drag is active, the pointerup/pointercancel/lostpointercapture
  // listeners (attached to the now-detached element) may never run. Without
  // this, document.body.style.cursor/userSelect would stay stuck for the
  // rest of the session.
  useEffect(() => {
    return () => {
      activeCleanupRef.current?.();
    };
  }, []);

  return { dragState, dragHandlers };
}
