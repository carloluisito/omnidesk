import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileTopBar } from './MobileTopBar';

describe('MobileTopBar', () => {
  it('renders the title and fires callbacks', () => {
    const onMenu = vi.fn(); const onNewSession = vi.fn();
    render(<MobileTopBar title="work" onMenu={onMenu} onNewSession={onNewSession} />);
    expect(screen.getByText('work')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /open navigation/i }));
    fireEvent.click(screen.getByRole('button', { name: /new session/i }));
    expect(onMenu).toHaveBeenCalledOnce();
    expect(onNewSession).toHaveBeenCalledOnce();
  });
});
