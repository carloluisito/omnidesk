/**
 * Step1_Welcome — Redesigned to match Obsidian spec §6.1.
 *
 * Centered card (480px, surface-overlay, radius-xl, shadow-xl) on
 * surface-base bg with subtle radial gradient.
 * BrandMark (64px) + "OmniDesk" + tagline + provider detection rows
 * + "Get Started" accent button + step dots.
 */

import { useEffect, useState } from 'react';
import { BrandLogo } from '../ui/BrandLogo';
import { CheckCircle, XCircle, Loader } from 'lucide-react';

interface Step1WelcomeProps {
  onNext: () => void;
}

interface ProviderStatus {
  name: string;
  detected: boolean | null; // null = loading
}

export function Step1Welcome({ onNext }: Step1WelcomeProps) {
  const [providers, setProviders] = useState<ProviderStatus[]>([
    { name: 'Claude Code', detected: null },
    { name: 'Codex CLI', detected: null },
  ]);

  useEffect(() => {
    // Detect providers via IPC
    Promise.allSettled([
      window.electronAPI.listProviders(),
    ]).then(([listResult]) => {
      if (listResult.status === 'fulfilled') {
        const available = listResult.value;
        setProviders([
          {
            name: 'Claude Code',
            detected: available.some((p: any) => p.id === 'claude'),
          },
          {
            name: 'Codex CLI',
            detected: available.some((p: any) => p.id === 'codex'),
          },
        ]);
      } else {
        setProviders([
          { name: 'Claude Code', detected: false },
          { name: 'Codex CLI', detected: false },
        ]);
      }
    });
  }, []);

  const allUndetected = providers.every((p) => p.detected === false);
  const anyLoading = providers.some((p) => p.detected === null);

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surface-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage:
          'radial-gradient(ellipse 600px 400px at center, rgba(0, 201, 167, 0.03) 0%, transparent 70%)',
        animation: 'step-fade-in var(--duration-normal) var(--ease-out)',
      }}
    >
      <div
        style={{
          width: 480,
          maxWidth: 'calc(100vw - 48px)',
          background: 'var(--surface-overlay)',
          border: '1px solid var(--border-default)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          padding: 'var(--space-8)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--space-4)',
        }}
      >
        {/* Brand mark */}
        <BrandLogo size={64} />

        {/* Name */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 'var(--space-1)',
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 28,
              fontWeight: 'var(--weight-medium)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)',
              letterSpacing: '-0.3px',
            }}
          >
            OmniDesk
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-ui)',
              textAlign: 'center',
            }}
          >
            Multi-provider AI coding terminal
          </p>
        </div>

        {/* Provider detection rows */}
        <div
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-2)',
          }}
        >
          {providers.map((provider) => (
            <div
              key={provider.name}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: 'var(--surface-raised)',
                border: '1px solid var(--border-subtle)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span
                style={{
                  fontSize: 'var(--text-sm)',
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-ui)',
                }}
              >
                {provider.name}
              </span>
              {provider.detected === null ? (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  <Loader
                    size={12}
                    style={{
                      animation: 'spin-icon 1s linear infinite',
                      color: 'var(--accent-primary)',
                    }}
                  />
                  Detecting...
                </span>
              ) : provider.detected ? (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--semantic-success)',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  <CheckCircle size={12} />
                  detected
                </span>
              ) : (
                <span
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6,
                    fontSize: 'var(--text-xs)',
                    color: 'var(--text-tertiary)',
                    fontFamily: 'var(--font-ui)',
                  }}
                >
                  <XCircle size={12} />
                  not found
                </span>
              )}
            </div>
          ))}
        </div>

        {/* Warning banner if none detected */}
        {!anyLoading && allUndetected && (
          <div
            style={{
              width: '100%',
              padding: '10px 14px',
              background: 'var(--semantic-warning-muted)',
              border: '1px solid rgba(247, 168, 74, 0.3)',
              borderRadius: 'var(--radius-md)',
              fontSize: 'var(--text-xs)',
              color: 'var(--semantic-warning)',
              fontFamily: 'var(--font-ui)',
              textAlign: 'center',
            }}
          >
            No AI CLIs detected. You can still explore OmniDesk.
          </div>
        )}

        {/* CTA button */}
        <button
          onClick={onNext}
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--accent-primary)',
            border: 'none',
            borderRadius: 'var(--radius-md)',
            color: 'var(--text-inverse)',
            fontSize: 'var(--text-sm)',
            fontWeight: 'var(--weight-semibold)',
            fontFamily: 'var(--font-ui)',
            cursor: 'pointer',
            transition: 'opacity var(--duration-fast)',
            marginTop: 'var(--space-2)',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
        >
          Get Started
        </button>

        {/* Step dots */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            marginTop: 'var(--space-1)',
          }}
        >
          <StepDot active />
          <StepDot />
          <StepDot />
          <span
            style={{
              marginLeft: 6,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Step 1 of 3
          </span>
        </div>
      </div>

      <style>{`
        @keyframes step-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin-icon {
          to { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  );
}

function StepDot({ active = false }: { active?: boolean }) {
  return (
    <div
      style={{
        width: active ? 20 : 8,
        height: 8,
        borderRadius: 4,
        background: active ? 'var(--accent-primary)' : 'var(--border-strong)',
        transition: 'all var(--duration-normal) var(--ease-out)',
      }}
    />
  );
}
