import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileKeyBar } from './MobileKeyBar';

describe('MobileKeyBar', () => {
  afterEach(() => {
    localStorage.clear(); // don't let the collapsed choice leak between tests
  });

  it('emits the correct bytes for special keys', () => {
    const onKey = vi.fn();
    render(<MobileKeyBar onKey={onKey} />);
    fireEvent.click(screen.getByRole('button', { name: 'Escape' }));
    fireEvent.click(screen.getByRole('button', { name: 'Tab' }));
    fireEvent.click(screen.getByRole('button', { name: 'Newline' }));
    expect(onKey).toHaveBeenNthCalledWith(1, '\x1b');
    expect(onKey).toHaveBeenNthCalledWith(2, '\x09');
    expect(onKey).toHaveBeenNthCalledWith(3, '\n');
  });

  it('sends a ctrl-combined byte when Ctrl is armed, then disarms', () => {
    const onKey = vi.fn();
    render(<MobileKeyBar onKey={onKey} />);
    fireEvent.click(screen.getByRole('button', { name: 'More keys' })); // reveal ctrl letters
    fireEvent.click(screen.getByRole('button', { name: 'Control' }));    // arm
    fireEvent.click(screen.getByRole('button', { name: 'c' }));          // consume
    expect(onKey).toHaveBeenCalledWith('\x03');
    // disarmed: a second 'c' now sends a literal 'c'
    fireEvent.click(screen.getByRole('button', { name: 'c' }));
    expect(onKey).toHaveBeenLastCalledWith('c');
  });

  it('collapses to hide the keys and expands again, remembering the choice', () => {
    const { unmount } = render(<MobileKeyBar onKey={() => {}} />);
    // Expanded by default: keys visible.
    expect(screen.getByRole('button', { name: 'Escape' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide keys' }));
    expect(screen.queryByRole('button', { name: 'Escape' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Show keys' }));
    expect(screen.getByRole('button', { name: 'Escape' })).toBeInTheDocument();

    // Collapse, then remount: the collapsed choice persists.
    fireEvent.click(screen.getByRole('button', { name: 'Hide keys' }));
    unmount();
    render(<MobileKeyBar onKey={() => {}} />);
    expect(screen.queryByRole('button', { name: 'Escape' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Show keys' })).toBeInTheDocument();
  });

  describe('Paste key', () => {
    afterEach(() => {
      // Restore whatever the environment had (jsdom default: no clipboard).
      Reflect.deleteProperty(navigator as unknown as Record<string, unknown>, 'clipboard');
    });

    it('is disabled when the clipboard API is unavailable (non-secure context)', () => {
      Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true });
      render(<MobileKeyBar onKey={() => {}} />);
      expect(screen.getByRole('button', { name: 'Paste' })).toBeDisabled();
    });

    it('reads the clipboard and emits its text when available', async () => {
      const readText = vi.fn().mockResolvedValue('hello');
      Object.defineProperty(navigator, 'clipboard', { value: { readText }, configurable: true });
      const onKey = vi.fn();
      render(<MobileKeyBar onKey={onKey} />);
      const paste = screen.getByRole('button', { name: 'Paste' });
      expect(paste).not.toBeDisabled();
      fireEvent.click(paste);
      await vi.waitFor(() => expect(onKey).toHaveBeenCalledWith('hello'));
    });
  });
});
