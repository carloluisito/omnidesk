import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useDrag } from './useDrag';

/**
 * Build a minimal fake React.PointerEvent for onPointerDown.
 * Only the fields useDrag actually reads are populated.
 */
function makePointerDownEvent(
  el: HTMLElement,
  opts: { clientX?: number; clientY?: number; button?: number; target?: HTMLElement } = {}
): React.PointerEvent {
  return {
    button: opts.button ?? 0,
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
    pointerId: 1,
    currentTarget: el,
    target: opts.target ?? el,
  } as unknown as React.PointerEvent;
}

/**
 * Dispatch a synthetic pointer-ish event on `el`. Avoids depending on jsdom's
 * PointerEvent constructor support — useDrag's handlers only read
 * clientX/clientY off the event object, never its prototype, so a plain
 * Event with those properties assigned is equivalent for testing purposes.
 */
function firePointerEvent(el: HTMLElement, type: string, opts: { clientX?: number; clientY?: number } = {}) {
  const event = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
    clientX: opts.clientX ?? 0,
    clientY: opts.clientY ?? 0,
  });
  el.dispatchEvent(event);
}

/** Build a row container with N mocked-rect children, mimicking a flat list. */
function setup(itemCount = 3) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const rows: HTMLElement[] = [];
  for (let i = 0; i < itemCount; i++) {
    const row = document.createElement('div');
    vi.spyOn(row, 'getBoundingClientRect').mockReturnValue({
      top: i * 20,
      bottom: i * 20 + 20,
      height: 20,
      left: 0,
      right: 100,
      width: 100,
      x: 0,
      y: i * 20,
      toJSON: () => ({}),
    } as DOMRect);
    container.appendChild(row);
    rows.push(row);
  }
  return { container, rows };
}

describe('useDrag', () => {
  beforeEach(() => {
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
    document.body.innerHTML = '';
  });

  it('reorders on a completed drag past threshold and reverts body styles on pointerup', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useDrag({ items: ['a', 'b', 'c'], onReorder }));
    const { rows } = setup(3);

    act(() => {
      result.current.dragHandlers(0).onPointerDown(makePointerDownEvent(rows[0], { clientX: 0, clientY: 5 }));
    });

    // Move past the row-2 midpoint (y=50) to register overIndex=2.
    act(() => {
      firePointerEvent(rows[0], 'pointermove', { clientX: 0, clientY: 50 });
    });
    expect(result.current.dragState).toEqual({ activeIndex: 0, overIndex: 2 });
    expect(document.body.style.cursor).toBe('grabbing');
    expect(document.body.style.userSelect).toBe('none');

    act(() => {
      firePointerEvent(rows[0], 'pointerup');
    });

    expect(onReorder).toHaveBeenCalledWith(0, 2);
    expect(result.current.dragState).toEqual({ activeIndex: null, overIndex: null });
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('does not reorder or touch body styles on a below-threshold press-and-release (plain click)', () => {
    const onReorder = vi.fn();
    const { result } = renderHook(() => useDrag({ items: ['a', 'b', 'c'], onReorder }));
    const { rows } = setup(3);

    act(() => {
      result.current.dragHandlers(0).onPointerDown(makePointerDownEvent(rows[0], { clientX: 0, clientY: 5 }));
    });

    // Movement stays under the default 4px threshold — drag never "starts".
    act(() => {
      firePointerEvent(rows[0], 'pointermove', { clientX: 0, clientY: 6 });
    });
    act(() => {
      firePointerEvent(rows[0], 'pointerup');
    });

    expect(onReorder).not.toHaveBeenCalled();
    expect(result.current.dragState).toEqual({ activeIndex: null, overIndex: null });
    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
  });

  it('reverts document.body.style.cursor/userSelect if the hook unmounts mid-drag (regression)', () => {
    const onReorder = vi.fn();
    const { result, unmount } = renderHook(() => useDrag({ items: ['a', 'b', 'c'], onReorder }));
    const { rows } = setup(3);

    act(() => {
      result.current.dragHandlers(0).onPointerDown(makePointerDownEvent(rows[0], { clientX: 0, clientY: 5 }));
    });
    act(() => {
      firePointerEvent(rows[0], 'pointermove', { clientX: 0, clientY: 50 });
    });

    expect(document.body.style.cursor).toBe('grabbing');

    // Simulate the owning component (e.g. TabBar) unmounting mid-drag, without
    // ever firing pointerup/pointercancel/lostpointercapture on the row.
    act(() => {
      unmount();
    });

    expect(document.body.style.cursor).toBe('');
    expect(document.body.style.userSelect).toBe('');
    expect(onReorder).not.toHaveBeenCalled();
  });
});
