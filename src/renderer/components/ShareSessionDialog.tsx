/**
 * ShareSessionDialog — Modal shown to the host when initiating a session share.
 *
 * States:
 *   creating  — "Creating share link..." spinner while startSharing() resolves
 *   active    — shows share code, URL, password toggle, expire dropdown, Done button
 *   error     — shows error message with retry
 *
 * Props: isOpen, onClose, sessionId, sessionName
 * Uses: useSessionSharing hook (startSharing, stopSharing)
 * Accessibility: focus trap, Escape to close, all controls keyboard-accessible
 * data-testid: "share-session-dialog"
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSessionSharing }                          from '../hooks/useSessionSharing';
import type { ShareInfo }                              from '../../shared/types/sharing-types';
import { dispatchToast }                               from './ui/ToastContainer';

interface ShareSessionDialogProps {
  isOpen:      boolean;
  onClose:     () => void;
  sessionId:   string;
  sessionName: string;
}

type DialogState = 'creating' | 'active' | 'error' | 'ineligible';

const EXPIRE_OPTIONS: { label: string; value: number | undefined }[] = [
  { label: '1 hour',  value: 1   * 60 * 60 * 1000 },
  { label: '4 hours', value: 4   * 60 * 60 * 1000 },
  { label: '24 hours',value: 24  * 60 * 60 * 1000 },
  { label: 'Never',   value: undefined },
];

export function ShareSessionDialog({
  isOpen,
  onClose,
  sessionId,
  sessionName,
}: ShareSessionDialogProps) {
  const {
    activeShares,
    startSharing,
    stopSharing,
    checkEligibility,
  } = useSessionSharing();

  const [dialogState,       setDialogState]       = useState<DialogState>('creating');
  const [shareInfo,         setShareInfo]          = useState<ShareInfo | null>(null);
  const [errorMsg,          setErrorMsg]           = useState('');
  const [usePassword,       setUsePassword]        = useState(false);
  const [password,          setPassword]           = useState('');
  const [useExpire,         setUseExpire]          = useState(false);
  const [expireIndex,       setExpireIndex]        = useState(0);
  const [codeCopied,        setCodeCopied]         = useState(false);
  const [urlCopied,         setUrlCopied]          = useState(false);
  const [stoppingShare,     setStoppingShare]      = useState(false);

  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const dialogRef     = useRef<HTMLDivElement>(null);

  // ── On open: check eligibility, then start sharing ─────────────────
  useEffect(() => {
    if (!isOpen) return;

    // Reset
    setDialogState('creating');
    setShareInfo(null);
    setErrorMsg('');
    setUsePassword(false);
    setPassword('');
    setUseExpire(false);
    setExpireIndex(0);
    setCodeCopied(false);
    setUrlCopied(false);

    // If session is already being shared, show its info
    const existing = activeShares.get(sessionId);
    if (existing) {
      setShareInfo(existing);
      setDialogState('active');
      return;
    }

    const doStart = async () => {
      const eligibility = await checkEligibility();
      if (!eligibility.eligible) {
        setDialogState('ineligible');
        return;
      }

      const info = await startSharing(sessionId, {
        password:    usePassword && password ? password : undefined,
        expiresInMs: useExpire ? EXPIRE_OPTIONS[expireIndex].value : undefined,
      });

      if (info) {
        setShareInfo(info);
        setDialogState('active');
      } else {
        setErrorMsg('Failed to create share link. Please try again.');
        setDialogState('error');
      }
    };

    doStart();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, sessionId]);

  // Focus first focusable element when dialog opens / transitions to active
  useEffect(() => {
    if (isOpen && dialogState === 'active') {
      setTimeout(() => firstFocusRef.current?.focus(), 50);
    }
  }, [isOpen, dialogState]);

  // Focus trap + Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { handleClose(); return; }

      // Focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const first = focusable[0];
        const last  = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first) { e.preventDefault(); last?.focus(); }
        } else {
          if (document.activeElement === last)  { e.preventDefault(); first?.focus(); }
        }
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  // ── Handlers ──────────────────────────────────────────────────────
  const handleClose = useCallback(() => {
    // Keep share alive when closing — don't stop it automatically
    onClose();
  }, [onClose]);

  const handleStopSharing = useCallback(async () => {
    if (!sessionId) return;
    setStoppingShare(true);
    await stopSharing(sessionId);
    setStoppingShare(false);
    onClose();
  }, [sessionId, stopSharing, onClose]);

  const copyCode = useCallback(async () => {
    if (!shareInfo?.shareCode) return;
    await navigator.clipboard.writeText(shareInfo.shareCode);
    setCodeCopied(true);
    setTimeout(() => setCodeCopied(false), 2000);
  }, [shareInfo]);

  const copyUrl = useCallback(async () => {
    if (!shareInfo?.shareUrl) return;
    await navigator.clipboard.writeText(shareInfo.shareUrl);
    setUrlCopied(true);
    dispatchToast('Share URL copied to clipboard', 'success', 2500);
    setTimeout(() => setUrlCopied(false), 2000);
  }, [shareInfo]);

  const handleRetry = useCallback(async () => {
    setDialogState('creating');
    setErrorMsg('');
    const info = await startSharing(sessionId);
    if (info) {
      setShareInfo(info);
      setDialogState('active');
    } else {
      setErrorMsg('Failed to create share link. Please try again.');
      setDialogState('error');
    }
  }, [sessionId, startSharing]);

  if (!isOpen) return null;

  return (
    <div
      role="presentation"
      onClick={handleClose}
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(13, 14, 20, 0.75)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          'var(--z-modal)' as any,
        animation:       'ssd-backdrop-in 180ms var(--ease-out) both',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ssd-title"
        data-testid="share-session-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width:           '480px',
          maxWidth:        'calc(100vw - 32px)',
          background:      'var(--surface-overlay)',
          border:          '1px solid var(--border-default)',
          borderRadius:    'var(--radius-lg)',
          boxShadow:       '0 0 0 1px rgba(0,201,167,0.10), var(--shadow-xl)',
          overflow:        'hidden',
          animation:       'ssd-enter 180ms var(--ease-out) both',
        }}
      >
        {/* ── Title bar ─────────────────────────────────────────── */}
        <div
          style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'space-between',
            padding:         'var(--space-4) var(--space-5)',
            borderBottom:    '1px solid var(--border-subtle)',
            background:      'var(--surface-raised)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            {/* Share / broadcast icon */}
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <circle cx="13" cy="3"  r="1.75" stroke="#00C9A7" strokeWidth="1.5" fill="none" />
              <circle cx="13" cy="13" r="1.75" stroke="#00C9A7" strokeWidth="1.5" fill="none" />
              <circle cx="3"  cy="8"  r="1.75" stroke="#00C9A7" strokeWidth="1.5" fill="none" />
              <line x1="4.6"  y1="7.1"  x2="11.3" y2="3.9"  stroke="#00C9A7" strokeWidth="1.2" />
              <line x1="4.6"  y1="8.9"  x2="11.3" y2="12.1" stroke="#00C9A7" strokeWidth="1.2" />
            </svg>
            <h2
              id="ssd-title"
              style={{
                margin:      0,
                fontSize:    'var(--text-md)',
                fontWeight:  'var(--weight-semibold)' as any,
                color:       'var(--text-primary)',
                fontFamily:  'var(--font-ui)',
              }}
            >
              Share Session
            </h2>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close dialog"
            style={{
              width:        '28px',
              height:       '28px',
              display:      'flex',
              alignItems:   'center',
              justifyContent: 'center',
              background:   'transparent',
              border:       'none',
              borderRadius: 'var(--radius-sm)',
              cursor:       'pointer',
              color:        'var(--text-tertiary)',
              padding:      0,
              transition:   'color var(--duration-fast), background-color var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.backgroundColor = 'var(--state-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-tertiary)';
              e.currentTarget.style.backgroundColor = 'transparent';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* ── Body ──────────────────────────────────────────────── */}
        <div style={{ padding: 'var(--space-5)' }}>

          {/* Creating spinner */}
          {dialogState === 'creating' && (
            <div
              style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            'var(--space-3)',
                padding:        'var(--space-8) 0',
              }}
            >
              <div style={{
                width:  28,
                height: 28,
                border: '2.5px solid var(--border-default)',
                borderTopColor: '#00C9A7',
                borderRadius:   '50%',
                animation:      'ssd-spin 0.8s linear infinite',
              }} />
              <span style={{
                fontSize:   'var(--text-sm)',
                fontFamily: 'var(--font-ui)',
                color:      'var(--text-secondary)',
              }}>
                Creating share link...
              </span>
            </div>
          )}

          {/* Error state */}
          {dialogState === 'error' && (
            <div
              style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            'var(--space-3)',
                padding:        'var(--space-6) 0',
                textAlign:      'center',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <circle cx="16" cy="16" r="14" stroke="var(--semantic-error)" strokeWidth="2" fill="none" />
                <path d="M16 9v8M16 21v2" stroke="var(--semantic-error)" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p style={{ margin: 0, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontFamily: 'var(--font-ui)' }}>
                {errorMsg}
              </p>
              <button
                onClick={handleRetry}
                style={{
                  padding:      '7px var(--space-4)',
                  background:   'var(--accent-primary-muted)',
                  border:       '1px solid rgba(0,201,167,0.3)',
                  borderRadius: 'var(--radius-md)',
                  color:        '#00C9A7',
                  fontSize:     'var(--text-sm)',
                  fontFamily:   'var(--font-ui)',
                  cursor:       'pointer',
                }}
              >
                Retry
              </button>
            </div>
          )}

          {/* Ineligible state */}
          {dialogState === 'ineligible' && (
            <div
              style={{
                display:        'flex',
                flexDirection:  'column',
                alignItems:     'center',
                gap:            'var(--space-3)',
                padding:        'var(--space-6) 0',
                textAlign:      'center',
              }}
            >
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none" aria-hidden="true">
                <path d="M16 4l13.86 24H2.14L16 4z" stroke="var(--semantic-warning)" strokeWidth="2" fill="none" strokeLinejoin="round" />
                <path d="M16 13v7M16 23v1" stroke="var(--semantic-warning)" strokeWidth="2" strokeLinecap="round" />
              </svg>
              <p style={{
                margin:     0,
                fontSize:   'var(--text-sm)',
                color:      'var(--text-secondary)',
                fontFamily: 'var(--font-ui)',
                lineHeight: 'var(--leading-relaxed)',
              }}>
                Session sharing requires <strong style={{ color: 'var(--text-primary)' }}>LaunchTunnel Pro</strong>.
              </p>
              <a
                href="https://launchtunnel.dev/pricing"
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display:      'inline-flex',
                  alignItems:   'center',
                  gap:          '6px',
                  padding:      '7px var(--space-4)',
                  background:   '#00C9A7',
                  border:       'none',
                  borderRadius: 'var(--radius-md)',
                  color:        '#0D0E14',
                  fontSize:     'var(--text-sm)',
                  fontWeight:   600 as any,
                  fontFamily:   'var(--font-ui)',
                  textDecoration: 'none',
                  cursor:       'pointer',
                }}
              >
                Upgrade to Pro
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                  <path d="M2 6h8M7 3l3 3-3 3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </a>
            </div>
          )}

          {/* Active — share code + URL + options */}
          {dialogState === 'active' && shareInfo && (
            <>
              {/* Session label */}
              <p style={{
                margin:      '0 0 var(--space-4) 0',
                fontSize:    'var(--text-xs)',
                fontFamily:  'var(--font-ui)',
                color:       'var(--text-tertiary)',
              }}>
                Sharing <span style={{ color: 'var(--text-secondary)' }}>{sessionName}</span>
              </p>

              {/* Share Code */}
              <div style={{ marginBottom: 'var(--space-4)' }}>
                <label style={{
                  display:    'block',
                  fontSize:   'var(--text-xs)',
                  fontFamily: 'var(--font-ui)',
                  color:      'var(--text-tertiary)',
                  marginBottom: 'var(--space-1)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  Share Code
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <div
                    data-testid="share-code"
                    aria-label="Share code"
                    role="textbox"
                    aria-readonly="true"
                    style={{
                      flex:         1,
                      padding:      'var(--space-3)',
                      background:   'var(--surface-raised)',
                      border:       '1px solid rgba(0,201,167,0.25)',
                      borderRadius: 'var(--radius-md)',
                      fontFamily:   '"JetBrains Mono", monospace',
                      fontSize:     '24px',
                      fontWeight:   700,
                      color:        '#00C9A7',
                      letterSpacing: '0.18em',
                      textAlign:    'center',
                      userSelect:   'all',
                    }}
                  >
                    {shareInfo.shareCode}
                  </div>
                  <button
                    ref={firstFocusRef}
                    data-testid="copy-share-code"
                    onClick={copyCode}
                    aria-label="Copy share code"
                    style={{
                      padding:      '0 var(--space-3)',
                      height:       '44px',
                      background:   codeCopied ? 'rgba(0,201,167,0.15)' : 'var(--surface-float)',
                      border:       '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color:        codeCopied ? '#00C9A7' : 'var(--text-secondary)',
                      fontSize:     'var(--text-xs)',
                      fontFamily:   'var(--font-ui)',
                      cursor:       'pointer',
                      whiteSpace:   'nowrap',
                      transition:   'all var(--duration-fast)',
                      flexShrink:   0,
                    }}
                  >
                    {codeCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Share URL */}
              <div style={{ marginBottom: 'var(--space-5)' }}>
                <label style={{
                  display:    'block',
                  fontSize:   'var(--text-xs)',
                  fontFamily: 'var(--font-ui)',
                  color:      'var(--text-tertiary)',
                  marginBottom: 'var(--space-1)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}>
                  URL
                </label>
                <div style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}>
                  <div
                    data-testid="share-url"
                    aria-label="Share URL"
                    role="textbox"
                    aria-readonly="true"
                    style={{
                      flex:         1,
                      padding:      '8px var(--space-3)',
                      background:   'var(--surface-raised)',
                      border:       '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      fontFamily:   '"JetBrains Mono", monospace',
                      fontSize:     'var(--text-xs)',
                      color:        'var(--text-secondary)',
                      overflow:     'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace:   'nowrap',
                      userSelect:   'all',
                    }}
                  >
                    {shareInfo.shareUrl}
                  </div>
                  <button
                    data-testid="copy-share-url"
                    onClick={copyUrl}
                    aria-label="Copy share URL"
                    style={{
                      padding:      '0 var(--space-3)',
                      height:       '34px',
                      background:   urlCopied ? 'rgba(0,201,167,0.15)' : 'var(--surface-float)',
                      border:       '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color:        urlCopied ? '#00C9A7' : 'var(--text-secondary)',
                      fontSize:     'var(--text-xs)',
                      fontFamily:   'var(--font-ui)',
                      cursor:       'pointer',
                      whiteSpace:   'nowrap',
                      transition:   'all var(--duration-fast)',
                      flexShrink:   0,
                    }}
                  >
                    {urlCopied ? 'Copied!' : 'Copy'}
                  </button>
                </div>
              </div>

              {/* Divider */}
              <div style={{ height: '1px', background: 'var(--border-subtle)', marginBottom: 'var(--space-4)' }} />

              {/* Password toggle */}
              <div style={{ marginBottom: 'var(--space-3)' }}>
                <label
                  style={{
                    display:     'flex',
                    alignItems:  'center',
                    gap:         'var(--space-2)',
                    cursor:      'pointer',
                    userSelect:  'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={usePassword}
                    onChange={(e) => setUsePassword(e.target.checked)}
                    style={{ accentColor: '#00C9A7', width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}>
                    Password protect
                  </span>
                </label>
                {usePassword && (
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter password..."
                    aria-label="Share password"
                    style={{
                      marginTop:    'var(--space-2)',
                      marginLeft:   '22px',
                      display:      'block',
                      width:        'calc(100% - 22px)',
                      padding:      '7px var(--space-3)',
                      background:   'var(--surface-raised)',
                      border:       '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color:        'var(--text-primary)',
                      fontSize:     'var(--text-sm)',
                      fontFamily:   '"JetBrains Mono", monospace',
                      outline:      'none',
                      boxSizing:    'border-box',
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(0,201,167,0.5)'; }}
                    onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
                  />
                )}
              </div>

              {/* Auto-expire toggle */}
              <div>
                <label
                  style={{
                    display:    'flex',
                    alignItems: 'center',
                    gap:        'var(--space-2)',
                    cursor:     'pointer',
                    userSelect: 'none',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={useExpire}
                    onChange={(e) => setUseExpire(e.target.checked)}
                    style={{ accentColor: '#00C9A7', width: 14, height: 14 }}
                  />
                  <span style={{ fontSize: 'var(--text-sm)', fontFamily: 'var(--font-ui)', color: 'var(--text-secondary)' }}>
                    Auto-expire
                  </span>
                </label>
                {useExpire && (
                  <select
                    value={expireIndex}
                    onChange={(e) => setExpireIndex(Number(e.target.value))}
                    aria-label="Expiration duration"
                    style={{
                      marginTop:    'var(--space-2)',
                      marginLeft:   '22px',
                      display:      'block',
                      padding:      '7px var(--space-3)',
                      background:   'var(--surface-raised)',
                      border:       '1px solid var(--border-default)',
                      borderRadius: 'var(--radius-md)',
                      color:        'var(--text-primary)',
                      fontSize:     'var(--text-sm)',
                      fontFamily:   'var(--font-ui)',
                      outline:      'none',
                      cursor:       'pointer',
                    }}
                  >
                    {EXPIRE_OPTIONS.map((opt, i) => (
                      <option key={i} value={i}>{opt.label}</option>
                    ))}
                  </select>
                )}
              </div>
            </>
          )}
        </div>

        {/* ── Footer ────────────────────────────────────────────── */}
        {(dialogState === 'active' || dialogState === 'ineligible' || dialogState === 'error') && (
          <div
            style={{
              display:         'flex',
              alignItems:      'center',
              justifyContent:  dialogState === 'active' ? 'space-between' : 'flex-end',
              gap:             'var(--space-2)',
              padding:         'var(--space-3) var(--space-5)',
              borderTop:       '1px solid var(--border-subtle)',
              background:      'var(--surface-raised)',
            }}
          >
            {dialogState === 'active' && (
              <button
                onClick={handleStopSharing}
                disabled={stoppingShare}
                style={{
                  padding:      '7px var(--space-3)',
                  background:   'transparent',
                  border:       '1px solid rgba(247,103,142,0.35)',
                  borderRadius: 'var(--radius-md)',
                  color:        'var(--semantic-error)',
                  fontSize:     'var(--text-xs)',
                  fontFamily:   'var(--font-ui)',
                  cursor:       stoppingShare ? 'not-allowed' : 'pointer',
                  opacity:      stoppingShare ? 0.6 : 1,
                  transition:   'all var(--duration-fast)',
                }}
                onMouseEnter={(e) => { if (!stoppingShare) e.currentTarget.style.background = 'var(--semantic-error-muted)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
              >
                {stoppingShare ? 'Stopping...' : 'Stop Sharing'}
              </button>
            )}

            <button
              onClick={handleClose}
              style={{
                padding:      '7px var(--space-4)',
                background:   '#00C9A7',
                border:       'none',
                borderRadius: 'var(--radius-md)',
                color:        '#0D0E14',
                fontSize:     'var(--text-sm)',
                fontWeight:   600 as any,
                fontFamily:   'var(--font-ui)',
                cursor:       'pointer',
                transition:   'opacity var(--duration-fast)',
              }}
              onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.88'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
            >
              Done
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes ssd-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes ssd-enter {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        @keyframes ssd-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
