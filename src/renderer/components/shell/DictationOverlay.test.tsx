import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DictationOverlay } from './DictationOverlay';

/** jsdom has no layout engine, so scrollHeight is always 0 — stub it. */
function stubScrollHeight(px: number) {
  Object.defineProperty(HTMLTextAreaElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => px,
  });
}

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
    // The live equalizer replaced the "● Recording…" text; the accessible
    // status label + the stop hint stand in for it.
    expect(screen.getByRole('status', { name: /recording/i })).toBeInTheDocument();
    expect(screen.getByText(/click the mic to stop/i)).toBeInTheDocument();
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

  describe('review: transcript auto-grow', () => {
    afterEach(() => {
      delete (HTMLTextAreaElement.prototype as Record<string, unknown>)['scrollHeight'];
    });

    it('grows the textarea to fit its content', () => {
      stubScrollHeight(120);
      render(<DictationOverlay phase="review" {...base} transcript={'line\n'.repeat(6)} />);
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.height).toBe('120px');
    });

    it('caps growth at 40% of the viewport and scrolls internally', () => {
      const cap = Math.round(window.innerHeight * 0.4);
      stubScrollHeight(cap + 500);
      render(<DictationOverlay phase="review" {...base} transcript={'line\n'.repeat(200)} />);
      const box = screen.getByRole('textbox') as HTMLTextAreaElement;
      expect(box.style.height).toBe(`${cap}px`);
      expect(box.style.overflowY).toBe('auto');
    });

    it('does not scroll when content fits under the cap', () => {
      stubScrollHeight(80);
      render(<DictationOverlay phase="review" {...base} transcript="short" />);
      expect((screen.getByRole('textbox') as HTMLTextAreaElement).style.overflowY).toBe('hidden');
    });

    it('widens the overlay into a fixed reading column in review phase', () => {
      stubScrollHeight(80);
      render(<DictationOverlay phase="review" {...base} transcript="hello" />);
      const dialog = screen.getByRole('dialog', { name: /voice dictation/i });
      expect((dialog as HTMLElement).style.width).toBe('720px');
    });

    it('keeps the compact shrink-to-fit overlay while recording', () => {
      render(<DictationOverlay phase="recording" {...base} />);
      const dialog = screen.getByRole('dialog', { name: /voice dictation/i });
      expect((dialog as HTMLElement).style.width).toBe('');
    });
  });
});
