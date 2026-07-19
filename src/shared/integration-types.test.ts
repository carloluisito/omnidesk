import { describe, it, expect } from 'vitest';
import { defaultIntegrationsSettings, mergeIntegrationsSettings } from './integration-types';

describe('defaultIntegrationsSettings', () => {
  it('returns the documented defaults', () => {
    const d = defaultIntegrationsSettings();
    expect(d.connectors).toEqual({});
    expect(d.notify).toEqual({ attention: true, done: true, errored: true, debounceSeconds: 15 });
    expect(d.digest).toEqual({ enabled: false, intervalMinutes: 60 });
    expect(d.perRepo).toEqual({});
    expect(d.shipit).toEqual({ notifyOnPR: true });
  });

  it('returns a fresh object each call (no shared mutable state)', () => {
    const a = defaultIntegrationsSettings();
    const b = defaultIntegrationsSettings();
    a.notify.attention = false;
    expect(b.notify.attention).toBe(true);
  });
});

describe('mergeIntegrationsSettings', () => {
  it('returns defaults for undefined/null', () => {
    expect(mergeIntegrationsSettings(undefined)).toEqual(defaultIntegrationsSettings());
    expect(mergeIntegrationsSettings(null)).toEqual(defaultIntegrationsSettings());
  });

  it('overlays partial sections while keeping other defaults', () => {
    const merged = mergeIntegrationsSettings({ notify: { attention: false } });
    expect(merged.notify.attention).toBe(false);
    expect(merged.notify.done).toBe(true);
    expect(merged.notify.debounceSeconds).toBe(15);
    expect(merged.digest.enabled).toBe(false);
  });

  it('preserves connector configs and per-repo entries', () => {
    const merged = mergeIntegrationsSettings({
      connectors: { telegram: { enabled: true, botToken: 't', chatId: 'c' } },
      perRepo: { 'C:\\repos\\a': { muted: true } },
    });
    expect(merged.connectors.telegram).toEqual({ enabled: true, botToken: 't', chatId: 'c' });
    expect(merged.perRepo['C:\\repos\\a']).toEqual({ muted: true });
  });

  it('falls back to defaults on malformed input', () => {
    expect(mergeIntegrationsSettings('junk')).toEqual(defaultIntegrationsSettings());
    expect(mergeIntegrationsSettings(42)).toEqual(defaultIntegrationsSettings());
    const merged = mergeIntegrationsSettings({ notify: 3, digest: 'x' });
    expect(merged.notify).toEqual(defaultIntegrationsSettings().notify);
    expect(merged.digest).toEqual(defaultIntegrationsSettings().digest);
  });
});
