// @atlas-entrypoint: Integrations panel — outbound connectors (Telegram /
// Slack / Discord / generic webhook), notification + digest policy, per-repo
// mutes, and GitHub (gh) status. Paste a token → Test → enable; done.
import { useEffect, useState } from 'react';
import { P4Icon } from './P4Icon';
import { useIntegrations } from '../../hooks/useIntegrations';
import type {
  ConnectorId,
  ConnectorTestResult,
  GitHubPreflight,
  IntegrationsSettings,
} from '../../../shared/integration-types';

export interface IntegrationsPanelRepo {
  id: string;
  name: string;
  path: string;
}

interface IntegrationsPanelProps {
  onClose: () => void;
  repos: IntegrationsPanelRepo[];
  activeRepoPath?: string | null;
}

type FieldSpec = { key: string; label: string; placeholder: string; secret?: boolean };

const CONNECTOR_FIELDS: Record<ConnectorId, FieldSpec[]> = {
  telegram: [
    { key: 'botToken', label: 'Bot token', placeholder: '123456:ABC-…', secret: true },
    { key: 'chatId', label: 'Chat id', placeholder: 'e.g. 123456789' },
  ],
  slack: [{ key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://hooks.slack.com/services/…', secret: true }],
  discord: [{ key: 'webhookUrl', label: 'Webhook URL', placeholder: 'https://discord.com/api/webhooks/…', secret: true }],
  webhook: [
    { key: 'url', label: 'URL', placeholder: 'https://example.com/omnidesk-hook' },
    { key: 'secret', label: 'HMAC secret (optional)', placeholder: 'signs X-OmniDesk-Signature', secret: true },
  ],
};

const CONNECTOR_LABELS: Record<ConnectorId, string> = {
  telegram: 'Telegram',
  slack: 'Slack',
  discord: 'Discord',
  webhook: 'Webhook',
};

function ConnectorCard({
  id,
  settings,
  status,
  onSave,
  onTest,
}: {
  id: ConnectorId;
  settings: IntegrationsSettings;
  status?: { ok: boolean; error?: string };
  onSave: (cfg: Record<string, unknown>) => Promise<void>;
  onTest: (cfg: Record<string, unknown>) => Promise<ConnectorTestResult>;
}) {
  const saved = (settings.connectors[id] ?? {}) as Record<string, unknown>;
  const [fields, setFields] = useState<Record<string, string>>(() =>
    Object.fromEntries(CONNECTOR_FIELDS[id].map((f) => [f.key, String(saved[f.key] ?? '')]))
  );
  const [testResult, setTestResult] = useState<ConnectorTestResult | null>(null);
  const [testing, setTesting] = useState(false);
  const enabled = Boolean(saved.enabled);

  const candidate = () => ({ ...saved, ...fields, enabled });

  const runTest = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      setTestResult(await onTest(candidate()));
    } catch (err) {
      setTestResult({ ok: false, error: err instanceof Error ? err.message : 'test failed' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="p4-form-row" data-testid={`connector-${id}`}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div className="t" style={{ fontWeight: 600 }}>
          {CONNECTOR_LABELS[id]}
          {status && (
            <span
              className="d"
              style={{ marginLeft: 8, color: status.ok ? 'var(--accent, #00C9A7)' : 'var(--danger, #F7678E)' }}
              title={status.error}
            >
              {status.ok ? '● delivering' : `● ${status.error ?? 'failing'}`}
            </span>
          )}
        </div>
        <label className="d" style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => void onSave({ ...saved, ...fields, enabled: e.target.checked })}
            aria-label={`Enable ${CONNECTOR_LABELS[id]}`}
          />
          Enabled
        </label>
      </div>
      {CONNECTOR_FIELDS[id].map((f) => (
        <div key={f.key} style={{ marginTop: 6 }}>
          <label className="d">{f.label}</label>
          <input
            className="p4-input"
            type={f.secret ? 'password' : 'text'}
            placeholder={f.placeholder}
            value={fields[f.key]}
            onChange={(e) => setFields((prev) => ({ ...prev, [f.key]: e.target.value }))}
            onBlur={() => void onSave(candidate())}
            aria-label={`${CONNECTOR_LABELS[id]} ${f.label}`}
            style={{ width: '100%' }}
          />
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <button className="p4-btn" disabled={testing} onClick={() => void runTest()}>
          {testing ? 'Testing…' : 'Test'}
        </button>
        {testResult && (
          <span className="d" style={{ color: testResult.ok ? 'var(--accent, #00C9A7)' : 'var(--danger, #F7678E)' }}>
            {testResult.ok ? '✓ ping delivered' : testResult.error}
          </span>
        )}
      </div>
    </div>
  );
}

export function IntegrationsPanel({ onClose, repos, activeRepoPath }: IntegrationsPanelProps) {
  const { settings, saveSettings, testConnector, statuses, sendDigestNow, preflight } = useIntegrations();
  const [gh, setGh] = useState<GitHubPreflight | null>(null);
  const [digestSent, setDigestSent] = useState(false);

  const ghDir = activeRepoPath ?? repos[0]?.path ?? null;
  useEffect(() => {
    if (!ghDir) return;
    let alive = true;
    preflight(ghDir)
      .then((p) => { if (alive) setGh(p); })
      .catch(() => { if (alive) setGh(null); });
    return () => { alive = false; };
  }, [ghDir, preflight]);

  if (!settings) {
    return (
      <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Integrations">
          <div className="p4-sheet-body"><div className="p4-form-row"><span className="d">Loading…</span></div></div>
        </div>
      </div>
    );
  }

  return (
    <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Integrations">
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="bolt" size={16} /></div>
          <div>
            <div className="t">Integrations</div>
            <div className="d">Push agent attention, fleet status and PRs to the tools you already use.</div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body">
          {(['telegram', 'slack', 'discord', 'webhook'] as ConnectorId[]).map((id) => (
            <ConnectorCard
              key={id}
              id={id}
              settings={settings}
              status={statuses[id]}
              onSave={(cfg) => saveSettings({ connectors: { [id]: cfg } as never })}
              onTest={(cfg) => testConnector(id, cfg)}
            />
          ))}

          <div className="p4-form-row">
            <div className="t" style={{ fontWeight: 600 }}>Notifications</div>
            {([
              ['attention', 'Needs you (waiting for input / approval)'],
              ['done', 'Finished a task'],
              ['errored', 'Errored / crashed'],
            ] as const).map(([key, label]) => (
              <label key={key} className="d" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={settings.notify[key]}
                  onChange={(e) => void saveSettings({ notify: { ...settings.notify, [key]: e.target.checked } })}
                  aria-label={label}
                />
                {label}
              </label>
            ))}
            <span className="d" style={{ display: 'block', marginTop: 6 }}>
              Alerts fire once per state change, at most every {settings.notify.debounceSeconds}s per session.
            </span>
          </div>

          <div className="p4-form-row">
            <div className="t" style={{ fontWeight: 600 }}>Fleet digest</div>
            <label className="d" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.digest.enabled}
                onChange={(e) => void saveSettings({ digest: { ...settings.digest, enabled: e.target.checked } })}
                aria-label="Enable scheduled digest"
              />
              Post a status summary
              <select
                className="p4-input"
                value={settings.digest.intervalMinutes}
                onChange={(e) => void saveSettings({ digest: { ...settings.digest, intervalMinutes: Number(e.target.value) } })}
                aria-label="Digest interval"
              >
                <option value={30}>every 30 min</option>
                <option value={60}>every hour</option>
                <option value={1440}>daily</option>
              </select>
              (skipped when everything is idle)
            </label>
            <div style={{ marginTop: 6 }}>
              <button
                className="p4-btn"
                onClick={() => { void sendDigestNow().then(() => { setDigestSent(true); setTimeout(() => setDigestSent(false), 1500); }); }}
              >
                {digestSent ? 'Sent' : 'Send now'}
              </button>
            </div>
          </div>

          <div className="p4-form-row">
            <div className="t" style={{ fontWeight: 600 }}>GitHub (ship-it &amp; issue intake)</div>
            {gh === null ? (
              <span className="d">Checking the GitHub CLI…</span>
            ) : gh.installed && gh.authenticated && gh.hasRemote ? (
              <span className="d" style={{ color: 'var(--accent, #00C9A7)' }}>✓ gh is installed, signed in, and this repo has an origin remote.</span>
            ) : (
              <span className="d" style={{ color: 'var(--danger, #F7678E)' }}>{gh.error ?? 'GitHub CLI is not ready.'}</span>
            )}
          </div>

          {repos.length > 0 && (
            <div className="p4-form-row">
              <div className="t" style={{ fontWeight: 600 }}>Per-repository mute</div>
              {repos.map((r) => {
                const muted = Boolean(settings.perRepo[r.path]?.muted);
                return (
                  <label key={r.id} className="d" style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={muted}
                      onChange={(e) => void saveSettings({ perRepo: { ...settings.perRepo, [r.path]: { muted: e.target.checked } } })}
                      aria-label={`Mute ${r.name}`}
                    />
                    {r.name}
                  </label>
                );
              })}
            </div>
          )}

          <div className="p4-form-row">
            <span className="d">
              Tokens are stored in OmniDesk&apos;s local settings file in plain text (like the remote-access token). Keychain storage is planned.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
