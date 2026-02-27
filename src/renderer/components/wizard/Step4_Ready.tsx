/**
 * Step4Ready — Redesigned to match Obsidian spec §6.1 Step 3.
 *
 * Centered card. Large checkmark in --semantic-success.
 * "You're ready" heading + summary rows (provider, layout, config dir).
 * [Back] ghost + [Launch OmniDesk] accent primary button.
 * Step dots at bottom (all filled).
 */

import { ArrowLeft, CheckCircle } from 'lucide-react';

interface Step4ReadyProps {
  onFinish: () => void;
  onBack: () => void;
}

const summaryRows = [
  { label: 'Default provider', value: 'Claude Code' },
  { label: 'Layout', value: 'Single pane' },
  { label: 'Config directory', value: '~/.omnidesk/' },
];

export function Step4Ready({ onFinish, onBack }: Step4ReadyProps) {
  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--surface-base)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundImage:
          'radial-gradient(ellipse 600px 400px at center, rgba(61, 214, 140, 0.03) 0%, transparent 70%)',
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
          gap: 'var(--space-5)',
        }}
      >
        {/* Check icon */}
        <div
          style={{
            width: 64,
            height: 64,
            borderRadius: 'var(--radius-lg)',
            background: 'var(--semantic-success-muted)',
            border: '1px solid rgba(61, 214, 140, 0.3)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--semantic-success)',
          }}
        >
          <CheckCircle size={32} />
        </div>

        {/* Heading */}
        <div style={{ textAlign: 'center' }}>
          <h2
            style={{
              margin: '0 0 var(--space-2)',
              fontSize: 'var(--text-xl)',
              fontWeight: 'var(--weight-semibold)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            You're ready
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            OmniDesk is configured and ready to use.
          </p>
        </div>

        {/* Summary rows */}
        <div
          style={{
            width: '100%',
            border: '1px solid var(--border-default)',
            borderRadius: 'var(--radius-md)',
            overflow: 'hidden',
          }}
        >
          {summaryRows.map(({ label, value }, i) => (
            <div
              key={label}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 16px',
                borderTop: i > 0 ? '1px solid var(--border-subtle)' : 'none',
                background: i % 2 === 0 ? 'var(--surface-raised)' : 'transparent',
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
                  color: 'var(--text-secondary)',
                  fontFamily: 'var(--font-mono-ui)',
                }}
              >
                {value}
              </span>
            </div>
          ))}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            width: '100%',
            justifyContent: 'space-between',
          }}
        >
          <button
            onClick={onBack}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '10px 20px',
              background: 'transparent',
              border: '1px solid var(--border-default)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-secondary)',
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-ui)',
              cursor: 'pointer',
              transition: 'all var(--duration-fast)',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'var(--state-hover)';
              e.currentTarget.style.borderColor = 'var(--border-strong)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'transparent';
              e.currentTarget.style.borderColor = 'var(--border-default)';
            }}
          >
            <ArrowLeft size={14} />
            Back
          </button>
          <button
            onClick={onFinish}
            style={{
              flex: 1,
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
            }}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.9'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
          >
            Launch OmniDesk
          </button>
        </div>

        {/* Step dots — all filled on final step */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <StepDot done />
          <StepDot done />
          <StepDot active />
          <span
            style={{
              marginLeft: 6,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Step 3 of 3
          </span>
        </div>
      </div>

      <style>{`
        @keyframes step-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}

function StepDot({ active = false, done = false }: { active?: boolean; done?: boolean }) {
  return (
    <div
      style={{
        width: active ? 20 : 8,
        height: 8,
        borderRadius: 4,
        background: active
          ? 'var(--accent-primary)'
          : done
          ? 'var(--semantic-success)'
          : 'var(--border-strong)',
        transition: 'all var(--duration-normal) var(--ease-out)',
      }}
    />
  );
}
