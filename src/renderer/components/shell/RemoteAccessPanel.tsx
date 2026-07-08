// @atlas-entrypoint: Remote Access panel — one-click managed tunnel. Enable
// starts the local server + a cloudflared tunnel; the panel shows the public
// link and a QR whose URL embeds the token (one scan → signed in on a phone).
import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { P4Icon } from './P4Icon';
import { useRemoteAccess } from '../../hooks/useRemoteAccess';

interface RemoteAccessPanelProps {
  onClose: () => void;
}

export function RemoteAccessPanel({ onClose }: RemoteAccessPanelProps) {
  const { status, loading, error, installing, enable, disable, regenerate, install } = useRemoteAccess();
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);

  const enabled = status?.enabled ?? false;
  const tunnel = status?.tunnel;
  const publicUrl = tunnel?.state === 'running' ? tunnel.url : undefined;

  // One-tap link: opening it sets the auth cookie and redirects to a clean URL.
  const shareLink =
    publicUrl && status ? `${publicUrl}/?token=${encodeURIComponent(status.token)}` : null;

  useEffect(() => {
    if (!shareLink) {
      setQr(null);
      return;
    }
    let alive = true;
    QRCode.toDataURL(shareLink, { width: 200, margin: 1 })
      .then((url) => { if (alive) setQr(url); })
      .catch(() => { if (alive) setQr(null); });
    return () => { alive = false; };
  }, [shareLink]);

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
            <div className="d">Reach this OmniDesk from any browser — no terminal needed.</div>
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
                      ? 'A private tunnel makes this OmniDesk reachable from your phone or another computer.'
                      : 'Turn on to start a secure tunnel. Nothing is exposed until you do.'}
                  </div>
                </div>
                <button className={enabled ? 'p4-btn' : 'p4-btn primary'} disabled={busy} onClick={toggle}>
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
                  {/* Tunnel status → public link + QR, or install/error handling. */}
                  {tunnel?.state === 'starting' && (
                    <div className="p4-form-row"><span className="d">Starting tunnel… this can take a few seconds.</span></div>
                  )}

                  {tunnel?.state === 'running' && shareLink && (
                    <>
                      <div className="p4-form-row">
                        <label className="d">Open on your phone — scan this (you'll be signed in automatically):</label>
                        <div style={{ display: 'flex', gap: 16, alignItems: 'center', marginTop: 8 }}>
                          {qr && <img src={qr} alt="Remote access QR code" width={160} height={160} style={{ borderRadius: 8, background: '#fff', padding: 6 }} />}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <code style={{ display: 'block', wordBreak: 'break-all' }}>{publicUrl}</code>
                            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                              <button className="p4-btn" onClick={() => copy('link', shareLink)}>
                                {copied === 'link' ? 'Copied' : 'Copy sign-in link'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                      <div className="p4-form-row">
                        <span className="d">
                          Tip: on your phone, open the link → browser menu → <strong>Add to Home Screen / Install</strong> to get an app icon that opens full-screen.
                        </span>
                      </div>
                    </>
                  )}

                  {tunnel?.state === 'error' && (
                    <div className="p4-form-row">
                      <span className="d" style={{ color: 'var(--danger, #F7678E)' }}>
                        Tunnel didn’t start{tunnel.error ? `: ${tunnel.error}` : '.'}
                      </span>
                      {!status.cloudflaredInstalled && (
                        <div style={{ marginTop: 8 }}>
                          <button className="p4-btn primary" disabled={installing} onClick={() => install()}>
                            {installing ? 'Downloading…' : 'Download cloudflared'}
                          </button>
                          <span className="d" style={{ marginLeft: 8 }}>
                            One-time ~30&nbsp;MB download of Cloudflare’s tunnel tool.
                          </span>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Local (same-network) access + token, always available when on. */}
                  <div className="p4-form-row">
                    <label className="d">Local address (same machine / LAN)</label>
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
                      <code style={{ flex: 1, wordBreak: 'break-all' }}>{status.token}</code>
                      <button className="p4-btn" onClick={() => copy('token', status.token)}>
                        {copied === 'token' ? 'Copied' : 'Copy'}
                      </button>
                    </div>
                  </div>

                  <div className="p4-form-row">
                    <button className="p4-btn" onClick={() => regenerate()}>Regenerate token</button>
                    <span className="d" style={{ marginLeft: 8 }}>
                      Invalidates the current token; connected devices must sign in again.
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
