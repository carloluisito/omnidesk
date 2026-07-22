import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CockpitPanel } from './CockpitPanel';
import type { AttentionItem } from '../../hooks/useAttentionQueue';
import type { TabData } from '../ui/Tab';

function makeItem(overrides: Partial<TabData> & { id: string; name: string }): AttentionItem {
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
});
