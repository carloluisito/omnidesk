import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CockpitPanel } from './CockpitPanel';
import type { AttentionItem } from '../../hooks/useAttentionQueue';
import type { TabData } from '../ui/Tab';

function makeItem(
  overrides: Partial<TabData> & { id: string; name: string },
  itemOverrides: Partial<AttentionItem> = {},
): AttentionItem {
  const session: TabData = {
    id: overrides.id,
    name: overrides.name,
    workingDirectory: '/tmp/repo',
    permissionMode: 'standard',
    status: overrides.status ?? 'running',
    activityState: overrides.activityState,
    providerId: overrides.providerId ?? 'claude',
    kind: 'agent',
  };
  return {
    session,
    repoId: 'repo-1',
    repoName: 'omnidesk',
    state: (overrides.activityState as any) ?? 'awaiting-input',
    preview: '',
    lastActivityAt: Date.now(),
    acknowledged: false,
    ...itemOverrides,
  };
}

describe('CockpitPanel keyboard shortcuts', () => {
  it('ArrowDown then Enter jumps to the selected session and closes', () => {
    const items = [
      makeItem({ id: 's1', name: 'Session One', activityState: 'awaiting-input' }),
      makeItem({ id: 's2', name: 'Session Two', activityState: 'awaiting-input' }),
    ];
    const onJump = vi.fn();
    const onClose = vi.fn();
    render(
      <CockpitPanel items={items} onJump={onJump} onAcknowledge={vi.fn()} onClose={onClose} />
    );

    const dialog = screen.getByRole('dialog', { name: 'Attention cockpit' });
    fireEvent.keyDown(dialog, { key: 'ArrowDown' });
    fireEvent.keyDown(dialog, { key: 'Enter' });

    expect(onJump).toHaveBeenCalledWith('s2');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Escape closes the panel without jumping or acknowledging', () => {
    const items = [makeItem({ id: 's1', name: 'Session One', activityState: 'awaiting-input' })];
    const onJump = vi.fn();
    const onAcknowledge = vi.fn();
    const onClose = vi.fn();
    render(
      <CockpitPanel items={items} onJump={onJump} onAcknowledge={onAcknowledge} onClose={onClose} />
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

    expect(onClose).toHaveBeenCalledTimes(1);
    expect(onJump).not.toHaveBeenCalled();
    expect(onAcknowledge).not.toHaveBeenCalled();
  });

  (['d', 'Backspace', 'Delete'] as const).forEach((key) => {
    it(`'${key}' dismisses the selected item without closing the panel`, () => {
      const items = [makeItem({ id: 's1', name: 'Session One', activityState: 'errored' })];
      const onAcknowledge = vi.fn();
      const onClose = vi.fn();
      render(
        <CockpitPanel items={items} onJump={vi.fn()} onAcknowledge={onAcknowledge} onClose={onClose} />
      );

      fireEvent.keyDown(screen.getByRole('dialog'), { key });

      expect(onAcknowledge).toHaveBeenCalledWith('s1');
      expect(onClose).not.toHaveBeenCalled();
    });
  });

  it("'s' triggers Ship-it and closes when the selected item is done", () => {
    const items = [makeItem({ id: 's1', name: 'Session One', status: 'running', activityState: 'done' })];
    const onShipIt = vi.fn();
    const onClose = vi.fn();
    render(
      <CockpitPanel items={items} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={onClose} onShipIt={onShipIt} />
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 's' });

    expect(onShipIt).toHaveBeenCalledWith('s1', 'Session One');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("'s' is a no-op when the selected item is not done", () => {
    const items = [makeItem({ id: 's1', name: 'Session One', activityState: 'awaiting-input' })];
    const onShipIt = vi.fn();
    const onClose = vi.fn();
    render(
      <CockpitPanel items={items} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={onClose} onShipIt={onShipIt} />
    );

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 's' });

    expect(onShipIt).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("'s' is a no-op on a done item when onShipIt is not provided", () => {
    const items = [makeItem({ id: 's1', name: 'Session One', activityState: 'done' })];
    const onClose = vi.fn();
    render(
      <CockpitPanel items={items} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={onClose} />
    );

    expect(() => fireEvent.keyDown(screen.getByRole('dialog'), { key: 's' })).not.toThrow();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('renders the empty state when there are no items', () => {
    render(<CockpitPanel items={[]} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('Nothing needs you')).toBeInTheDocument();
  });

  it('renders the Jump (↵) and Dismiss (d) key hints on every row', () => {
    const items = [makeItem({ id: 's1', name: 'Session One', activityState: 'awaiting-input' })];
    render(<CockpitPanel items={items} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={vi.fn()} />);

    const jumpButton = screen.getByRole('button', { name: /Jump/ });
    expect(jumpButton.querySelector('kbd.p4-kbd')).toHaveTextContent('↵');

    const dismissButton = screen.getByRole('button', { name: /Dismiss/ });
    expect(dismissButton.querySelector('kbd.p4-kbd')).toHaveTextContent('d');
  });

  it('renders the Ship-it (s) hint only when the row is done and onShipIt is provided', () => {
    const doneItem = makeItem({ id: 's1', name: 'Session One', activityState: 'done' });
    const { rerender } = render(
      <CockpitPanel items={[doneItem]} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={vi.fn()} onShipIt={vi.fn()} />
    );
    const shipButton = screen.getByRole('button', { name: /Ship it/ });
    expect(shipButton.querySelector('kbd.p4-kbd')).toHaveTextContent('s');

    // Without onShipIt, the button (and its hint) shouldn't render even for a done item.
    rerender(<CockpitPanel items={[doneItem]} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Ship it/ })).not.toBeInTheDocument();

    // Not-done items never show the Ship-it hint even when onShipIt is provided.
    const runningItem = makeItem({ id: 's2', name: 'Session Two', activityState: 'awaiting-input' });
    rerender(<CockpitPanel items={[runningItem]} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={vi.fn()} onShipIt={vi.fn()} />);
    expect(screen.queryByRole('button', { name: /Ship it/ })).not.toBeInTheDocument();
  });
});

describe('CockpitPanel waiting duration (#212)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows a "waiting {duration}" fragment for a row with a known lastActivityAt', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const items = [
      makeItem(
        { id: 's1', name: 'Session One', activityState: 'awaiting-input' },
        { lastActivityAt: now - 90 * 1000 },
      ),
    ];
    render(<CockpitPanel items={items} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText(/waiting 1m/)).toBeInTheDocument();
  });

  it('renders no waiting fragment when lastActivityAt is 0 (unknown)', () => {
    const items = [
      makeItem(
        { id: 's1', name: 'Session One', activityState: 'awaiting-input' },
        { lastActivityAt: 0 },
      ),
    ];
    render(<CockpitPanel items={items} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={vi.fn()} />);

    // Word-boundary regex: "awaiting input" (the status chip) legitimately
    // contains the substring "waiting" and must not cause a false positive.
    expect(screen.queryByText(/\bwaiting\b/)).not.toBeInTheDocument();
  });

  it('refreshes the displayed duration every 15s while the panel stays open', () => {
    const now = Date.now();
    vi.setSystemTime(now);
    const items = [
      makeItem(
        { id: 's1', name: 'Session One', activityState: 'awaiting-input' },
        { lastActivityAt: now - 50 * 1000 },
      ),
    ];
    render(<CockpitPanel items={items} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText(/waiting 50s/)).toBeInTheDocument();

    // Advance real elapsed time (via lastActivityAt staying fixed while "now" moves)
    // past the next minute boundary and past the 15s refresh tick.
    act(() => {
      vi.setSystemTime(now + 20 * 1000);
      vi.advanceTimersByTime(15000);
    });

    expect(screen.getByText(/waiting 1m/)).toBeInTheDocument();
    expect(screen.queryByText(/waiting 50s/)).not.toBeInTheDocument();
  });

  it('clears the refresh interval on unmount (no leak, no post-unmount state update)', () => {
    const clearSpy = vi.spyOn(global, 'clearInterval');
    const items = [
      makeItem(
        { id: 's1', name: 'Session One', activityState: 'awaiting-input' },
        { lastActivityAt: Date.now() - 1000 },
      ),
    ];
    const { unmount } = render(
      <CockpitPanel items={items} onJump={vi.fn()} onAcknowledge={vi.fn()} onClose={vi.fn()} />
    );

    unmount();

    expect(clearSpy).toHaveBeenCalled();

    // Advancing timers after unmount must not throw or warn about updates on
    // an unmounted component — the interval callback should never fire again.
    expect(() => {
      act(() => {
        vi.advanceTimersByTime(60000);
      });
    }).not.toThrow();

    clearSpy.mockRestore();
  });
});
