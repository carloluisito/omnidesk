/**
 * AboutDialog — Redesigned to match Obsidian spec §6.15.
 *
 * 360px wide centered dialog. BrandMark (48px) + name + version + tagline.
 * Divider then info rows: Providers, Runtime, License.
 * [Check for Updates] + [View on GitHub] buttons.
 * All existing version fetching logic preserved.
 */

import { useEffect, useRef, useState } from 'react';
import { BrandLogo } from './ui/BrandLogo';
import type { AppVersionInfo } from '../../shared/ipc-types';
import { RefreshCw, Github } from 'lucide-react';

interface AboutDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AboutDialog({ isOpen, onClose }: AboutDialogProps) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [versionInfo, setVersionInfo] = useState<AppVersionInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (isOpen) {
      setIsLoading(true);
      window.electronAPI
        .getVersionInfo()
        .then(setVersionInfo)
        .catch(() => setVersionInfo(null))
        .finally(() => setIsLoading(false));
    }
  }, [isOpen]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (isOpen && e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const infoRows: Array<{ label: string; value: string | null }> = [
    {
      label: 'Providers',
      value: versionInfo ? 'Claude Code · Codex CLI' : null,
    },
    {
      label: 'Runtime',
      value: versionInfo
        ? `Electron ${versionInfo.electronVersion} · Node ${versionInfo.nodeVersion}`
        : null,
    },
    {
      label: 'License',
      value: 'MIT',
    },
  ];

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 'var(--z-modal)' as any,
        animation: 'dialog-backdrop-in var(--duration-fast) var(--ease-out)',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="about-title"
        style={{
          width: 'var(--dialog-width-sm)',
          maxWidth: 'calc(100vw - 48px)',
          background: 'var(--surface-overlay)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-lg)',
          boxShadow: 'var(--shadow-xl)',
          overflow: 'hidden',
          animation: 'dialog-enter var(--duration-fast) var(--ease-out)',
        }}
      >
        {/* Centered brand section */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            padding: 'var(--space-6) var(--space-5) var(--space-4)',
            gap: 'var(--space-2)',
          }}
        >
          <BrandLogo size={48} />
          <h2
            id="about-title"
            style={{
              margin: 0,
              fontSize: 'var(--text-xl)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            OmniDesk
          </h2>
          <span
            style={{
              fontSize: 'var(--text-sm)',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-mono-ui)',
            }}
          >
            {isLoading ? '...' : versionInfo?.appVersion ? `v${versionInfo.appVersion}` : 'v5.0.0'}
          </span>
          <span
            style={{
              fontSize: 'var(--text-xs)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-ui)',
              textAlign: 'center',
            }}
          >
            Multi-provider AI coding terminal
          </span>
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'var(--border-subtle)', margin: '0 var(--space-4)' }} />

        {/* Info rows */}
        <div style={{ padding: 'var(--space-3) var(--space-5)' }}>
          {infoRows.map(({ label, value }) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '6px 0',
                borderBottom: '1px solid var(--border-subtle)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-tertiary)',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                {label}
              </span>
              <span
                style={{
                  fontSize: 'var(--text-xs)',
                  fontFamily: 'var(--font-mono-ui)',
                  color: 'var(--text-secondary)',
                  textAlign: 'right',
                  maxWidth: '60%',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {isLoading && value === null ? '...' : (value || '—')}
              </span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            padding: 'var(--space-3) var(--space-5) var(--space-5)',
          }}
        >
          <button
            onClick={() => (window.electronAPI as any).checkForUpdates?.()}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-2)',
              padding: '8px',
              background: 'var(--surface-float)',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--border-accent)'; e.currentTarget.style.color = 'var(--text-accent)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--border-default)'; e.currentTarget.style.color = 'var(--text-secondary)'; }}
          >
            <RefreshCw size={13} />
            Check for Updates
          </button>

          <a
            href="https://github.com/omnidesk/omnidesk"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 'var(--space-2)',
              padding: '8px',
              background: 'none',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-tertiary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
              textDecoration: 'none',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--text-secondary)'; }}
            onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--text-tertiary)'; }}
          >
            <Github size={13} />
            View on GitHub
          </a>
        </div>

        {/* Close footer */}
        <div
          style={{
            borderTop: '1px solid var(--border-subtle)',
            padding: 'var(--space-3) var(--space-5)',
            display: 'flex',
            justifyContent: 'center',
            background: 'var(--surface-raised)',
          }}
        >
          <button
            ref={closeRef}
            onClick={onClose}
            style={{
              padding: '6px 24px',
              background: 'var(--accent-primary)',
              border: 'none',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-inverse)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-semibold)',
              fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      </div>

      <style>{`
        @keyframes dialog-backdrop-in { from { opacity: 0; } to { opacity: 1; } }
        @keyframes dialog-enter {
          from { opacity: 0; transform: scale(0.96) translateY(8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
