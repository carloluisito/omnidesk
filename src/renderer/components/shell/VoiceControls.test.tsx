import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceControls } from './VoiceControls';
import { STT_OPEN_SETTINGS_EVENT } from '../../stt-ui';

// Controllable useSTT mock.
let mockState: any;
vi.mock('../../hooks/useSTT', () => ({
  useSTT: () => mockState,
}));

function baseState(over: any = {}) {
  const react = require('react');
  const [phase, setPhase] = react.useState('idle');
  return {
    phase, transcript: 'run tests', error: null, levelRef: { current: 0 },
    status: { available: false, reason: 'disabled', model: 'base.en', modelPresent: false },
    settings: { enabled: false, model: 'base.en', hotkey: 'Ctrl+Shift+Space', language: 'en', showButton: true },
    beginRecording: vi.fn(async () => setPhase('recording')),
    endRecording: vi.fn(async () => setPhase('review')),
    cancel: vi.fn(() => setPhase('idle')),
    setTranscript: vi.fn(), downloadModel: vi.fn(), refreshStatus: vi.fn(), hideButton: vi.fn(),
    ...over,
  };
}

afterEach(() => { delete (window as any).__OMNIDESK_REMOTE__; });

describe('VoiceControls', () => {
  it('is hidden when showButton is false', () => {
    function W() { mockState = baseState({ settings: { showButton: false, enabled: false, model: 'base.en', hotkey: 'x', language: 'en' } }); return <VoiceControls readOnly={false} onInject={vi.fn()} />; }
    const { container } = render(<W />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('is hidden in read-only sessions', () => {
    function W() { mockState = baseState(); return <VoiceControls readOnly={true} onInject={vi.fn()} />; }
    const { container } = render(<W />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('is hidden on the remote bridge', () => {
    (window as any).__OMNIDESK_REMOTE__ = true;
    function W() { mockState = baseState(); return <VoiceControls readOnly={false} onInject={vi.fn()} />; }
    const { container } = render(<W />);
    expect(container.querySelector('button')).toBeNull();
  });

  it('when NOT ready, clicking the mic dispatches the open-settings event (does not record)', () => {
    const beginRecording = vi.fn();
    const openHandler = vi.fn();
    window.addEventListener(STT_OPEN_SETTINGS_EVENT, openHandler);
    function W() { mockState = baseState({ beginRecording }); return <VoiceControls readOnly={false} onInject={vi.fn()} />; }
    render(<W />);
    fireEvent.click(screen.getByRole('button', { name: /voice|dictate|microphone/i }));
    expect(openHandler).toHaveBeenCalled();
    expect(beginRecording).not.toHaveBeenCalled();
    window.removeEventListener(STT_OPEN_SETTINGS_EVENT, openHandler);
  });

  it('when ready, click toggles record → click again → review → Enter injects', async () => {
    const onInject = vi.fn();
    function W() {
      mockState = baseState({ status: { available: true, reason: 'ready', model: 'base.en', modelPresent: true } });
      return <VoiceControls readOnly={false} onInject={onInject} />;
    }
    render(<W />);
    const mic = screen.getByRole('button', { name: /voice|dictate|microphone/i });
    fireEvent.click(mic); // start
    await waitFor(() => expect(screen.getByRole('status', { name: /recording/i })).toBeInTheDocument());
    fireEvent.click(mic); // stop → review
    const box = await screen.findByRole('textbox');
    fireEvent.keyDown(box, { key: 'Enter' });
    expect(onInject).toHaveBeenCalledWith('run tests');
  });

  it('right-click hides the button', () => {
    const hideButton = vi.fn();
    function W() { mockState = baseState({ hideButton }); return <VoiceControls readOnly={false} onInject={vi.fn()} />; }
    render(<W />);
    fireEvent.contextMenu(screen.getByRole('button', { name: /voice|dictate|microphone/i }));
    expect(hideButton).toHaveBeenCalled();
  });
});
