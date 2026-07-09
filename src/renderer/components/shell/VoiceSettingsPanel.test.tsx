import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { VoiceSettingsPanel } from './VoiceSettingsPanel';

beforeEach(() => {
  (window as any).electronAPI = {
    getSettings: vi.fn().mockResolvedValue({ stt: { enabled: false, model: 'base.en', hotkey: 'Ctrl+Shift+Space', language: 'en' } }),
    setSettings: vi.fn().mockResolvedValue(undefined),
    getSTTStatus: vi.fn().mockResolvedValue({ available: false, reason: 'model-missing', model: 'base.en', modelPresent: false }),
    downloadSTTModel: vi.fn().mockResolvedValue({ available: false, reason: 'downloading', model: 'base.en', modelPresent: false }),
    onSTTStatusChanged: vi.fn().mockReturnValue(() => {}),
  };
});

describe('VoiceSettingsPanel', () => {
  it('toggling enable persists stt.enabled via setSettings', async () => {
    render(<VoiceSettingsPanel onClose={vi.fn()} />);
    const checkbox = await screen.findByLabelText(/enable voice/i);
    fireEvent.click(checkbox);
    await waitFor(() => expect(window.electronAPI.setSettings).toHaveBeenCalled());
    const arg = (window.electronAPI.setSettings as any).mock.calls[0][0];
    expect(arg.stt.enabled).toBe(true);
  });

  it('shows a download button when the model is missing', async () => {
    render(<VoiceSettingsPanel onClose={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /download model/i })).toBeInTheDocument();
  });
});
