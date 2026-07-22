import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, within, act } from '@testing-library/react';
import { ToastContainer, dispatchToast } from './ToastContainer';

/** All test toasts use type 'info' so every toast root renders role="status". */
function titlesOf(elements: HTMLElement[]): string[] {
  return elements.map(el => within(el).getByText(/^Toast \d+$/).textContent ?? '');
}

/** Locate a specific toast's dismiss button by its visible title text. */
function dismissButtonFor(title: string): HTMLElement {
  const root = screen.getByText(title).closest('[role]') as HTMLElement;
  return within(root).getByRole('button', { name: 'Dismiss notification' });
}

describe('ToastContainer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('caps visible toasts at MAX_TOASTS (5) and queues the rest', () => {
    render(<ToastContainer />);

    act(() => {
      for (let i = 1; i <= 6; i++) dispatchToast(`Toast ${i}`, 'info');
    });

    const visible = screen.getAllByRole('status');
    expect(visible).toHaveLength(5);
    expect(titlesOf(visible)).toEqual(['Toast 1', 'Toast 2', 'Toast 3', 'Toast 4', 'Toast 5']);
    expect(screen.queryByText('Toast 6')).not.toBeInTheDocument();
  });

  it('promotes exactly one queued toast, appended at the bottom, when a visible toast is removed', () => {
    render(<ToastContainer />);

    act(() => {
      for (let i = 1; i <= 6; i++) dispatchToast(`Toast ${i}`, 'info');
    });

    fireEvent.click(dismissButtonFor('Toast 1'));
    act(() => {
      vi.advanceTimersByTime(240);
    });

    const visible = screen.getAllByRole('status');
    expect(titlesOf(visible)).toEqual(['Toast 2', 'Toast 3', 'Toast 4', 'Toast 5', 'Toast 6']);
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
  });

  it('does not drop a still-queued toast when removeToast fires twice for the same id (regression #193)', () => {
    render(<ToastContainer />);

    act(() => {
      for (let i = 1; i <= 7; i++) dispatchToast(`Toast ${i}`, 'info');
    });

    const dismissToast1 = dismissButtonFor('Toast 1');
    // Double-click before the 240ms confirm-dismiss delay elapses: two
    // independent onDismiss('Toast 1') calls get scheduled, mirroring the
    // reachability path described in the issue (no disabled state on the
    // dismiss button, no guard in Toast.tsx's dismiss()).
    fireEvent.click(dismissToast1);
    fireEvent.click(dismissToast1);

    act(() => {
      vi.advanceTimersByTime(240);
    });

    // Toast 1 is gone and exactly one queued toast (Toast 6) was promoted.
    // The second, no-op removeToast('Toast 1') call must NOT have silently
    // discarded Toast 7 from the queue.
    let visible = screen.getAllByRole('status');
    expect(titlesOf(visible)).toEqual(['Toast 2', 'Toast 3', 'Toast 4', 'Toast 5', 'Toast 6']);
    expect(screen.queryByText('Toast 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Toast 7')).not.toBeInTheDocument();

    // A genuine subsequent removal proves Toast 7 survived in the queue
    // rather than having been dropped.
    fireEvent.click(dismissButtonFor('Toast 2'));
    act(() => {
      vi.advanceTimersByTime(240);
    });

    visible = screen.getAllByRole('status');
    expect(titlesOf(visible)).toEqual(['Toast 3', 'Toast 4', 'Toast 5', 'Toast 6', 'Toast 7']);
  });

  it('removing a toast with an empty queue and <= MAX_TOASTS visible just removes it, promoting nothing', () => {
    render(<ToastContainer />);

    act(() => {
      dispatchToast('Toast 1', 'info');
      dispatchToast('Toast 2', 'info');
      dispatchToast('Toast 3', 'info');
    });

    fireEvent.click(dismissButtonFor('Toast 2'));
    act(() => {
      vi.advanceTimersByTime(240);
    });

    const visible = screen.getAllByRole('status');
    expect(titlesOf(visible)).toEqual(['Toast 1', 'Toast 3']);
    expect(screen.queryByText('Toast 2')).not.toBeInTheDocument();
  });
});
