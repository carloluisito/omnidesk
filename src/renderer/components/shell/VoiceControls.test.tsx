import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceControls } from './VoiceControls';

vi.mock('../../hooks/useSTT', () => {
  let handlers: any = {};
  return {
    useSTT: () => {
      const react = require('react');
      const [phase, setPhase] = react.useState('idle');
      handlers = {
        phase, transcript: 'run tests', error: null, status: { available: true, reason: 'ready' },
        beginRecording: vi.fn(async () => setPhase('recording')),
        endRecording: vi.fn(async () => setPhase('review')),
        cancel: vi.fn(() => setPhase('idle')),
        setTranscript: vi.fn(), downloadModel: vi.fn(), refreshStatus: vi.fn(),
      };
      return handlers;
    },
  };
});

describe('VoiceControls', () => {
  it('hold on the mic button starts recording; release transcribes; submit injects', async () => {
    const onInject = vi.fn();
    render(<VoiceControls sessionId="s1" enabled readOnly={false} hotkey="Ctrl+Shift+Space" onInject={onInject} />);
    const mic = screen.getByRole('button', { name: /dictate|microphone|voice/i });
    fireEvent.mouseDown(mic);
    await waitFor(() => expect(screen.getByText(/listening/i)).toBeInTheDocument());
    fireEvent.mouseUp(mic);
    const box = await screen.findByRole('textbox');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onInject).toHaveBeenCalledWith('run tests');
  });

  it('renders nothing when disabled', () => {
    const { container } = render(<VoiceControls sessionId="s1" enabled={false} readOnly={false} hotkey="x" onInject={vi.fn()} />);
    expect(container.firstChild).toBeNull();
  });
});
