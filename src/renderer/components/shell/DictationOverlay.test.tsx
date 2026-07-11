import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictationOverlay } from './DictationOverlay';

const base = {
  transcript: '', error: null,
  onChange: vi.fn(), onSubmit: vi.fn(), onDiscard: vi.fn(), onRetry: vi.fn(),
};

describe('DictationOverlay', () => {
  it('renders nothing when idle', () => {
    const { container } = render(<DictationOverlay phase="idle" {...base} />);
    expect(container.firstChild).toBeNull();
  });

  it('shows a recording indicator while recording', () => {
    render(<DictationOverlay phase="recording" {...base} />);
    expect(screen.getByText(/recording/i)).toBeInTheDocument();
  });

  it('review: Enter submits the edited transcript', () => {
    const onSubmit = vi.fn();
    render(<DictationOverlay phase="review" {...base} transcript="hello" onSubmit={onSubmit} />);
    const box = screen.getByRole('textbox');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onSubmit).toHaveBeenCalledWith('hello');
  });

  it('review: Escape discards', () => {
    const onDiscard = vi.fn();
    render(<DictationOverlay phase="review" {...base} transcript="hi" onDiscard={onDiscard} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Escape' });
    expect(onDiscard).toHaveBeenCalled();
  });

  it('review: Shift+Enter does NOT submit (allows newline)', () => {
    const onSubmit = vi.fn();
    render(<DictationOverlay phase="review" {...base} transcript="hello" onSubmit={onSubmit} />);
    fireEvent.keyDown(screen.getByRole('textbox'), { key: 'Enter', shiftKey: true });
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
