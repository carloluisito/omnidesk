// @atlas-entrypoint: Remote Access panel — enable/disable the tunnel-served
// remote UI, show the local URL + access token, regenerate the token.
import { useState } from 'react';
import { P4Icon } from './P4Icon';
import { useRemoteAccess } from '../../hooks/useRemoteAccess';

interface RemoteAccessPanelProps {
  onClose: () => void;
}

export function RemoteAccessPanel({ onClose }: RemoteAccessPanelProps) {
  const { status, loading, error, enable, disable, regenerate } = useRemoteAccess();
  const [busy, setBusy] = useState(false);
  const [revealToken, setRevealToken] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const enabled = status?.enabled ?? false;
  const port = status?.port ?? 8420;

  const copy = async (label: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };

  const toggle = async () => {
    setBusy(true);
    try {
      if (enabled) await disable();
      else await enable();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p4-overlay" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="p4-sheet" role="dialog" aria-modal="true" aria-label="Remote access">
        <div className="p4-sheet-head">
          <div className="icon"><P4Icon name="tunnel" size={16} /></div>
          <div>
            <div className="t">Remote access</div>
            <div className="d">Reach this OmniDesk from any browser over a tunnel.</div>
          </div>
          <button className="x" onClick={onClose} aria-label="Close">
            <P4Icon name="x" size={14} />
          </button>
        </div>

        <div className="p4-sheet-body">
          {loading ? (
            <div className="p4-form-row"><span className="d">Loading…</span></div>
          ) : (
            <>
              <div className="p4-form-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <div>
                  <div className="t" style={{ fontWeight: 600 }}>
                    {enabled ? 'Remote access is ON' : 'Remote access is OFF'}
                  </div>
                  <div className="d">
                    {enabled
                      ? 'The local server is running. Expose it with a tunnel to reach it from elsewhere.'
                      : 'Turn on to start the local server. It binds 127.0.0.1 only — nothing is public until you run a tunnel.'}
                  </div>
                </div>
                <button
                  className={enabled ? 'p4-btn' : 'p4-btn primary'}
                  disabled={busy}
                  onClick={toggle}
                >
                  {busy ? '…' : enabled ? 'Turn off' : 'Turn on'}
                </button>
              </div>

              {error && (
                <div className="p4-form-row">
                  <span className="d" style={{ color: 'var(--danger, #F7678E)' }}>{error}</span>
                </div>
              )}

              {enabled && status && (
                <>
                  <div className="p4-form-row">
                    <label className="d">Local address</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <code style={{ flex: 1, wordBreak: 'break-all' }}>{status.url}</code>
                      <button className="p4-btn" onClick={() => copy('url', status.url)}>
                        {copied === 'url' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="p4-form-row">
                    <label className="d">Access token</label>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                      <code style={{ flex: 1, wordBreak: 'break-all' }}>
                        {revealToken ? status.token : '•'.repeat(Math.min(status.token.length, 24))}
                      </code>
                      <button className="p4-btn" onClick={() => setRevealToken((v) => !v)}>
                        {revealToken ? 'Hide' : 'Reveal'}
                      </button>
                      <button className="p4-btn" onClick={() => copy('token', status.token)}>
                        {copied === 'token' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="p4-form-row">
                    <span className="d">
                      Expose it with a tunnel, then open the tunnel URL and paste the token:
                    </span>
                    <code style={{ display: 'block', marginTop: 4, wordBreak: 'break-all' }}>
                      cloudflared tunnel --url http://localhost:{port}
                    </code>
                  </div>

                  <div className="p4-form-row">
                    <button className="p4-btn" onClick={() => regenerate()}>
                      Regenerate token
                    </button>
                    <span className="d" style={{ marginLeft: 8 }}>
                      Invalidates the current token; connected clients must re-authenticate.
                    </span>
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
