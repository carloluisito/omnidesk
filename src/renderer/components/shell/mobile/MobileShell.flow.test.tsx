import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileShell } from './MobileShell';

// TerminalHost context is absent here; useTerminalSlot no-ops without it (its
// ctx guard returns early), so MobileShell renders standalone for this test.
describe('MobileShell flow', () => {
  it('opens the drawer and switches sessions', () => {
    const onSelectSession = vi.fn();
    render(
      <MobileShell
        repos={[]} activeRepo={{ id: 'r1', name: 'demo' } as any}
        sessions={[{ id: 's1', name: 'work' }, { id: 's2', name: 'build' }] as any}
        activeSessionId="s1"
        onSelectSession={onSelectSession}
        onCloseSession={() => {}} onNewSession={() => {}} onOpenRemote={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    fireEvent.click(screen.getByText('build'));
    expect(onSelectSession).toHaveBeenCalledWith('s2');
  });
});
