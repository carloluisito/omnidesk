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
        repos={[{ id: 'r1', name: 'demo', path: '/demo' }] as any}
        activeRepo={{ id: 'r1', name: 'demo', path: '/demo' } as any}
        sessions={[
          { id: 's1', name: 'work', mainRepoPath: '/demo', workingDirectory: '/demo' },
          { id: 's2', name: 'build', mainRepoPath: '/demo', workingDirectory: '/demo' },
        ] as any}
        activeSessionId="s1"
        onSelectSession={onSelectSession}
        onSelectRepo={() => {}}
        onCloseSession={() => {}}
        onNewSession={() => {}}
        onAddRepo={() => {}}
        onOpenRemote={() => {}}
      />
    );
    fireEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    fireEvent.click(screen.getByText('build'));
    expect(onSelectSession).toHaveBeenCalledWith('s2');
  });
});
