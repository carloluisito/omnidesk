/**
 * JoinSessionDialog — Modal for an observer to enter a share code or paste a URL.
 *
 * States:
 *   idle          — text input for code/URL
 *   needs-password — code validated; password input shown
 *   connecting    — spinner while joinSession() resolves
 *   error         — error message with role="alert"
 *
 * Props: isOpen, onClose, initialCode?, onJoined (called with shareCode on success)
 * Uses: useSessionSharing hook (joinSession)
 * Accessibility: auto-focus on code input, Enter submits, errors use role="alert"
 * data-testid: "join-session-dialog", "join-code-input", "join-password-input", "join-submit"
 */
import { useEffect, useRef, useState, useCallback } from 'react';
import { useSessionSharing }                          from '../hooks/useSessionSharing';

interface JoinSessionDialogProps {
  isOpen:       boolean;
  onClose:      () => void;
  initialCode?: string;
  onJoined?:    (shareCode: string) => void;
}

type JoinState = 'idle' | 'needs-password' | 'connecting' | 'error';

function extractShareCode(input: string): string {
  const trimmed = input.trim();
  // Extract code from full URL: https://share.launchtunnel.dev/ABC123
  const urlMatch = trimmed.match(/\/([A-Za-z0-9]{4,12})\s*$/);
  if (urlMatch) return urlMatch[1].toUpperCase();
  return trimmed.toUpperCase();
}

export function JoinSessionDialog({
  isOpen,
  onClose,
  initialCode = '',
  onJoined,
}: JoinSessionDialogProps) {
  const { joinSession } = useSessionSharing();

  const [codeValue,    setCodeValue]    = useState(initialCode);
  const [password,     setPassword]     = useState('');
  const [joinState,    setJoinState]    = useState<JoinState>('idle');
  const [errorMessage, setErrorMessage] = useState('');

  const codeInputRef     = useRef<HTMLInputElement>(null);
  const passwordInputRef = useRef<HTMLInputElement>(null);
  const dialogRef        = useRef<HTMLDivElement>(null);

  // Reset + auto-focus on open
  useEffect(() => {
    if (isOpen) {
      setCodeValue(initialCode);
      setPassword('');
      setJoinState('idle');
      setErrorMessage('');
      setTimeout(() => codeInputRef.current?.focus(), 50);
    }
  }, [isOpen, initialCode]);

  // Auto-focus password when state changes to needs-password
  useEffect(() => {
    if (joinState === 'needs-password') {
      setTimeout(() => passwordInputRef.current?.focus(), 50);
    }
  }, [joinState]);

  // Escape + focus trap
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }

      // Focus trap
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = dialogRef.current.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
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
  }, [isOpen, onClose]);

  const handleSubmit = useCallback(async () => {
    const code = codeValue.trim();
    if (!code) return;

    setJoinState('connecting');
    setErrorMessage('');

    const result = await joinSession(
      code,
      joinState === 'needs-password' ? password : undefined,
      'Observer'
    );

    if (!result) {
      setErrorMessage('Could not connect. Please check your connection and try again.');
      setJoinState('error');
      return;
    }

    if (!result.success) {
      // Handle specific error codes
      if (result.errorCode === 'PASSWORD_REQUIRED') {
        setJoinState('needs-password');
        return;
      }
      if (result.errorCode === 'PASSWORD_INCORRECT') {
        setErrorMessage('Incorrect password. Please try again.');
        setJoinState('needs-password');
        return;
      }
      if (result.errorCode === 'INVALID_CODE') {
        setErrorMessage('Invalid code. Check for typos and try again.');
        setJoinState('error');
        return;
      }
      if (result.errorCode === 'SESSION_EXPIRED') {
        setErrorMessage('This session is no longer being shared.');
        setJoinState('error');
        return;
      }
      setErrorMessage(result.message || 'Failed to join session.');
      setJoinState('error');
      return;
    }

    // Success — derive shareCode from input
    const shareCode = extractShareCode(code);
    onJoined?.(shareCode);
    onClose();
  }, [codeValue, password, joinState, joinSession, onJoined, onClose]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit();
  }, [handleSubmit]);

  if (!isOpen) return null;

  const isConnecting = joinState === 'connecting';

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position:        'fixed',
        inset:           0,
        background:      'rgba(13, 14, 20, 0.75)',
        display:         'flex',
        alignItems:      'center',
        justifyContent:  'center',
        zIndex:          'var(--z-modal)' as any,
        animation:       'jsd-backdrop-in 180ms var(--ease-out) both',
      }}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="jsd-title"
        data-testid="join-session-dialog"
        onClick={(e) => e.stopPropagation()}
        style={{
          width:        '400px',
          maxWidth:     'calc(100vw - 32px)',
          background:   'var(--surface-overlay)',
          border:       '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow:    'var(--shadow-xl)',
          overflow:     'hidden',
          animation:    'jsd-enter 180ms var(--ease-out) both',
        }}
      >
        {/* Title bar */}
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
            {/* Chain link icon */}
            <svg width="15" height="15" viewBox="0 0 15 15" fill="none" aria-hidden="true">
              <path d="M6.5 10.5l-2 2a2.828 2.828 0 01-4-4l2-2" stroke="#7aa2f7" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M8.5 4.5l2-2a2.828 2.828 0 014 4l-2 2"   stroke="#7aa2f7" strokeWidth="1.5" strokeLinecap="round" />
              <line x1="5.5" y1="9.5" x2="9.5" y2="5.5" stroke="#7aa2f7" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
            <h2
              id="jsd-title"
              style={{
                margin:     0,
                fontSize:   'var(--text-md)',
                fontWeight: 'var(--weight-semibold)' as any,
                color:      'var(--text-primary)',
                fontFamily: 'var(--font-ui)',
              }}
            >
              Join Shared Session
            </h2>
          </div>
          <button
            onClick={onClose}
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
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = 'var(--text-secondary)';
              e.currentTarget.style.background = 'var(--state-hover)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = 'var(--text-tertiary)';
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
              <path d="M2 2l10 10M12 2L2 12" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 'var(--space-5)' }}>

          {/* Code / URL input */}
          <div style={{ marginBottom: joinState === 'needs-password' ? 'var(--space-4)' : 0 }}>
            <label
              htmlFor="join-code-input-el"
              style={{
                display:       'block',
                fontSize:      'var(--text-xs)',
                fontFamily:    'var(--font-ui)',
                color:         'var(--text-tertiary)',
                marginBottom:  'var(--space-1)',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
              }}
            >
              Enter share code or paste URL
            </label>
            <input
              id="join-code-input-el"
              ref={codeInputRef}
              data-testid="join-code-input"
              type="text"
              value={codeValue}
              onChange={(e) => {
                setCodeValue(e.target.value);
                if (joinState === 'error') setJoinState('idle');
              }}
              onKeyDown={handleKeyDown}
              disabled={isConnecting}
              placeholder="ABC123 or https://share.launchtunnel.dev/..."
              aria-label="Share code or URL"
              spellCheck={false}
              autoComplete="off"
              style={{
                display:      'block',
                width:        '100%',
                padding:      '9px var(--space-3)',
                background:   'var(--surface-raised)',
                border:       '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                color:        'var(--text-primary)',
                fontSize:     'var(--text-sm)',
                fontFamily:   '"JetBrains Mono", monospace',
                outline:      'none',
                boxSizing:    'border-box',
                transition:   'border-color var(--duration-fast)',
                opacity:      isConnecting ? 0.6 : 1,
              }}
              onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(122,162,247,0.5)'; }}
              onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
            />
          </div>

          {/* Password input — shown after code validated if password required */}
          {joinState === 'needs-password' && (
            <div>
              <label
                htmlFor="join-password-input-el"
                style={{
                  display:       'block',
                  fontSize:      'var(--text-xs)',
                  fontFamily:    'var(--font-ui)',
                  color:         'var(--text-tertiary)',
                  marginBottom:  'var(--space-1)',
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                }}
              >
                Password
              </label>
              <input
                id="join-password-input-el"
                ref={passwordInputRef}
                data-testid="join-password-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isConnecting}
                placeholder="Enter session password..."
                aria-label="Session password"
                style={{
                  display:      'block',
                  width:        '100%',
                  padding:      '9px var(--space-3)',
                  background:   'var(--surface-raised)',
                  border:       '1px solid var(--border-default)',
                  borderRadius: 'var(--radius-md)',
                  color:        'var(--text-primary)',
                  fontSize:     'var(--text-sm)',
                  fontFamily:   '"JetBrains Mono", monospace',
                  outline:      'none',
                  boxSizing:    'border-box',
                  transition:   'border-color var(--duration-fast)',
                  opacity:      isConnecting ? 0.6 : 1,
                }}
                onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(122,162,247,0.5)'; }}
                onBlur={(e)  => { e.currentTarget.style.borderColor = 'var(--border-default)'; }}
              />
            </div>
          )}

          {/* Error message */}
          {(joinState === 'error' || (joinState === 'needs-password' && errorMessage)) && errorMessage && (
            <div
              role="alert"
              aria-live="assertive"
              style={{
                marginTop:    'var(--space-3)',
                padding:      'var(--space-2) var(--space-3)',
                background:   'var(--semantic-error-muted)',
                border:       '1px solid rgba(247,103,142,0.25)',
                borderRadius: 'var(--radius-md)',
                fontSize:     'var(--text-xs)',
                fontFamily:   'var(--font-ui)',
                color:        'var(--semantic-error)',
              }}
            >
              {errorMessage}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display:         'flex',
            alignItems:      'center',
            justifyContent:  'flex-end',
            gap:             'var(--space-2)',
            padding:         'var(--space-3) var(--space-5)',
            borderTop:       '1px solid var(--border-subtle)',
            background:      'var(--surface-raised)',
          }}
        >
          <button
            onClick={onClose}
            disabled={isConnecting}
            style={{
              padding:      '7px var(--space-4)',
              background:   'none',
              border:       '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color:        'var(--text-secondary)',
              fontSize:     'var(--text-sm)',
              fontFamily:   'var(--font-ui)',
              cursor:       isConnecting ? 'not-allowed' : 'pointer',
              opacity:      isConnecting ? 0.5 : 1,
              transition:   'all var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              if (!isConnecting) {
                e.currentTarget.style.background = 'var(--state-hover)';
                e.currentTarget.style.borderColor = 'var(--border-strong)';
              }
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'none';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
          >
            Cancel
          </button>

          <button
            data-testid="join-submit"
            onClick={handleSubmit}
            disabled={isConnecting || !codeValue.trim()}
            style={{
              display:      'inline-flex',
              alignItems:   'center',
              gap:          'var(--space-2)',
              padding:      '7px var(--space-4)',
              background:   '#7aa2f7',
              border:       'none',
              borderRadius: 'var(--radius-md)',
              color:        '#0D0E14',
              fontSize:     'var(--text-sm)',
              fontWeight:   600 as any,
              fontFamily:   'var(--font-ui)',
              cursor:       (isConnecting || !codeValue.trim()) ? 'not-allowed' : 'pointer',
              opacity:      (isConnecting || !codeValue.trim()) ? 0.6 : 1,
              transition:   'opacity var(--duration-fast)',
            }}
            onMouseEnter={(e) => { if (!isConnecting && codeValue.trim()) e.currentTarget.style.opacity = '0.88'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = (isConnecting || !codeValue.trim()) ? '0.6' : '1'; }}
          >
            {isConnecting && (
              <span style={{
                width:  12,
                height: 12,
                border: '1.5px solid rgba(13,14,20,0.4)',
                borderTopColor: '#0D0E14',
                borderRadius: '50%',
                animation: 'jsd-spin 0.8s linear infinite',
                display: 'block',
                flexShrink: 0,
              }} />
            )}
            {isConnecting
              ? 'Connecting...'
              : joinState === 'needs-password'
                ? 'Join'
                : 'Join'}
          </button>
        </div>
      </div>

      <style>{`
        @keyframes jsd-backdrop-in {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes jsd-enter {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);   }
        }
        @keyframes jsd-spin {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}
