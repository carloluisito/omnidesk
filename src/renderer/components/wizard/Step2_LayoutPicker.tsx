/**
 * Step2_LayoutPicker — Redesigned to match Obsidian spec §6.1 Step 2.
 *
 * 3 clickable layout cards (Single, Side by Side, Stacked Split).
 * Selected card: --border-accent 2px + --accent-primary-muted bg.
 * [Back] ghost + [Continue] accent buttons.
 * Step dots at bottom.
 */

import { useState } from 'react';
import { ArrowLeft, ArrowRight } from 'lucide-react';

interface Step2LayoutPickerProps {
  onNext: () => void;
  onBack: () => void;
}

const layouts = [
  {
    id: 'single',
    name: 'Single Pane',
    description: 'One focused terminal',
    preview: (
      <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
        <rect x="2" y="2" width="60" height="44" rx="4" fill="currentColor" opacity="0.25" />
        <rect x="2" y="2" width="60" height="44" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'horizontal',
    name: 'Side by Side',
    description: 'Two terminals horizontally',
    preview: (
      <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
        <rect x="2" y="2" width="27" height="44" rx="4" fill="currentColor" opacity="0.25" />
        <rect x="2" y="2" width="27" height="44" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <rect x="35" y="2" width="27" height="44" rx="4" fill="currentColor" opacity="0.25" />
        <rect x="35" y="2" width="27" height="44" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      </svg>
    ),
  },
  {
    id: 'vertical',
    name: 'Stacked Split',
    description: 'Two terminals vertically',
    preview: (
      <svg width="64" height="48" viewBox="0 0 64 48" fill="none">
        <rect x="2" y="2" width="60" height="20" rx="4" fill="currentColor" opacity="0.25" />
        <rect x="2" y="2" width="60" height="20" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
        <rect x="2" y="26" width="60" height="20" rx="4" fill="currentColor" opacity="0.25" />
        <rect x="2" y="26" width="60" height="20" rx="4" stroke="currentColor" strokeWidth="1.5" opacity="0.5" />
      </svg>
    ),
  },
];

export function Step2_LayoutPicker({ onNext, onBack }: Step2LayoutPickerProps) {
  const [selected, setSelected] = useState<string>('single');

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
          width: 520,
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
            Choose your layout
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--text-sm)',
              color: 'var(--text-secondary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            You can change this later in Settings
          </p>
        </div>

        {/* Layout cards */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 'var(--space-3)',
            width: '100%',
          }}
        >
          {layouts.map((layout, i) => {
            const isSelected = selected === layout.id;
            return (
              <button
                key={layout.id}
                onClick={() => setSelected(layout.id)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 'var(--space-3)',
                  padding: 'var(--space-4)',
                  background: isSelected ? 'var(--accent-primary-muted)' : 'var(--surface-raised)',
                  border: `2px solid ${isSelected ? 'var(--border-accent)' : 'var(--border-default)'}`,
                  borderRadius: 'var(--radius-lg)',
                  cursor: 'pointer',
                  transition: 'all var(--duration-fast)',
                  color: isSelected ? 'var(--accent-primary)' : 'var(--text-tertiary)',
                  animation: `card-in var(--duration-normal) var(--ease-out) ${i * 60}ms both`,
                }}
                onMouseEnter={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--border-strong)';
                    e.currentTarget.style.background = 'var(--surface-float)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isSelected) {
                    e.currentTarget.style.borderColor = 'var(--border-default)';
                    e.currentTarget.style.background = 'var(--surface-raised)';
                  }
                }}
              >
                {layout.preview}
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: 'var(--text-sm)',
                      fontWeight: 'var(--weight-medium)',
                      color: isSelected ? 'var(--text-accent)' : 'var(--text-primary)',
                      fontFamily: 'var(--font-ui)',
                      marginBottom: 2,
                    }}
                  >
                    {layout.name}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--text-xs)',
                      color: 'var(--text-tertiary)',
                      fontFamily: 'var(--font-ui)',
                    }}
                  >
                    {layout.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Action buttons */}
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            width: '100%',
            justifyContent: 'space-between',
            marginTop: 'var(--space-1)',
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
            onClick={onNext}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 'var(--space-2)',
              padding: '10px 24px',
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
            Continue
            <ArrowRight size={14} />
          </button>
        </div>

        {/* Step dots */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
          }}
        >
          <StepDot />
          <StepDot active />
          <StepDot />
          <span
            style={{
              marginLeft: 6,
              fontSize: 'var(--text-xs)',
              color: 'var(--text-tertiary)',
              fontFamily: 'var(--font-ui)',
            }}
          >
            Step 2 of 3
          </span>
        </div>
      </div>

      <style>{`
        @keyframes step-fade-in {
          from { opacity: 0; transform: translateY(12px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes card-in {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
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
