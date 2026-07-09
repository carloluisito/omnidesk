// @atlas-entrypoint: Voice / Speech-to-Text settings panel. Lets the user
// opt in to voice prompting, pick a Whisper model size, see the push-to-talk
// hotkey, and download the model when it isn't present yet.
import { useCallback, useEffect, useState } from 'react';
import { P4Icon } from './P4Icon';
import type { STTSettings, STTStatus, STTModel } from '../../../shared/ipc-types';

const DEFAULTS: STTSettings = { enabled: false, model: 'base.en', hotkey: 'Ctrl+Shift+Space', language: 'en' };

interface VoiceSettingsPanelProps {
  onClose: () => void;
}

export function VoiceSettingsPanel({ onClose }: VoiceSettingsPanelProps) {
  const [stt, setStt] = useState<STTSettings | null>(null);
  const [status, setStatus] = useState<STTStatus | null>(null);
  const [downloading, setDownloading] = useState(false);

  const refresh = useCallback(async () => {
    const s = await window.electronAPI.getSettings();
    setStt(s.stt ?? DEFAULTS);
    try {
      setStatus(await window.electronAPI.getSTTStatus());
    } catch {
      /* noop */
    }
  }, []);

  useEffect(() => {
    void refresh();
    const off = window.electronAPI.onSTTStatusChanged((s) => setStatus(s));
    return off;
  }, [refresh]);

  const update = useCallback((partial: Partial<STTSettings>) => {
    setStt((prev) => {
      const next = { ...(prev ?? DEFAULTS), ...partial };
      void window.electronAPI.setSettings({ stt: next })
        .then(() => window.electronAPI.getSTTStatus())
        .then((s) => setStatus(s))
        .catch(() => { /* noop */ });
      return next;
    });
  }, []);

  const download = useCallback(async () => {
    setDownloading(true);
    try {
      setStatus(await window.electronAPI.downloadSTTModel());
    } catch {
      /* noop */
    } finally {
      setDownloading(false);
    }
  }, []);

  if (!stt) return null;

  return (
    <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Voice / speech-to-text settings">
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="settings" size={16} /></div>
          <div>
            <div className="t">Voice / Speech-to-Text</div>
            <div className="d">Speak prompts instead of typing them.</div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body">
          <div className="p4-form-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div>
              <div className="t" style={{ fontWeight: 600 }}>
                {stt.enabled ? 'Voice prompting is ON' : 'Voice prompting is OFF'}
              </div>
              <div className="d">Hold the hotkey to dictate a prompt instead of typing it.</div>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                aria-label="Enable voice prompting"
                checked={stt.enabled}
                onChange={(e) => update({ enabled: e.target.checked })}
              />
            </label>
          </div>

          <div className="p4-form-row">
            <label className="d" htmlFor="voice-model-select">Model</label>
            <select
              id="voice-model-select"
              className="p4-btn"
              value={stt.model}
              onChange={(e) => update({ model: e.target.value as STTModel })}
            >
              <option value="tiny.en">tiny.en — fastest</option>
              <option value="base.en">base.en — recommended</option>
              <option value="small.en">small.en — most accurate</option>
            </select>
          </div>

          <div className="p4-form-row">
            <label className="d">Push-to-talk hotkey</label>
            <code>{stt.hotkey}</code>
          </div>

          <div className="p4-form-row">
            {status?.reason === 'downloading' ? (
              <span className="d">Downloading… {Math.round((status.downloadProgress ?? 0) * 100)}%</span>
            ) : status && !status.modelPresent ? (
              <button className="p4-btn primary" disabled={downloading} onClick={() => void download()}>
                {downloading ? 'Downloading…' : 'Download model'}
              </button>
            ) : status?.modelPresent ? (
              <span className="d">Model ready</span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
