import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileDrawer } from './MobileDrawer';

const props = {
  open: true, onClose: vi.fn(),
  repos: [], activeRepo: { id: 'r1', name: 'demo' } as any,
  sessions: [{ id: 's1', name: 'work' }, { id: 's2', name: 'build' }] as any,
  activeSessionId: 's1',
  onSelectSession: vi.fn(), onCloseSession: vi.fn(), onNewSession: vi.fn(), onOpenRemote: vi.fn(),
};

describe('MobileDrawer', () => {
  it('lists sessions and selects one (closing the drawer)', () => {
    render(<MobileDrawer {...props} />);
    fireEvent.click(screen.getByText('build'));
    expect(props.onSelectSession).toHaveBeenCalledWith('s2');
    expect(props.onClose).toHaveBeenCalled();
  });
  it('does not render its panel when closed', () => {
    const { container } = render(<MobileDrawer {...props} open={false} />);
    expect(container.querySelector('.mdrawer-panel')).toBeNull();
  });
});
