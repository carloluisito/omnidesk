import type { STTSettings } from '../shared/ipc-types';

/** Dispatched by VoiceControls when the mic is clicked while voice isn't ready,
 *  so App can open the Voice settings panel. Renderer-only window event. */
export const STT_OPEN_SETTINGS_EVENT = 'omnidesk:open-voice-settings';

/** Dispatched whenever an STT setting changes (settings panel or hideButton),
 *  so every useSTT instance refetches settings + status and stays in sync. */
export const STT_SETTINGS_CHANGED_EVENT = 'omnidesk:stt-settings-changed';

/** Renderer-side fallback defaults for display before the first fetch resolves. */
export const DEFAULT_STT_SETTINGS: STTSettings = {
  enabled: false,
  model: 'base.en',
  hotkey: 'Ctrl+Shift+Space',
  language: 'en',
  showButton: true,
};
