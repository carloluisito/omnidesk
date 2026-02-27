interface Step3FeaturesProps {
  onNext: () => void;
  onBack: () => void;
  onTryFeature: (feature: string) => void;
}

const features = [
  {
    id: 'atlas',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
        <line x1="8" y1="2" x2="8" y2="18" />
        <line x1="16" y1="6" x2="16" y2="22" />
      </svg>
    ),
    title: 'Repository Atlas',
    description: 'Generate an AI-powered map of your codebase. Automatically discovers file structure, analyzes imports, infers domains, and creates navigation guides for Claude.',
    action: 'Try Atlas'
  },
  {
    id: 'teams',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
        <circle cx="9" cy="7" r="4" />
        <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
      </svg>
    ),
    title: 'Agent Teams',
    description: 'Coordinate multiple AI agents working together. Visualize agent relationships, monitor task progress, and see real-time message streams between team members.',
    action: 'Try Teams'
  },
  {
    id: 'checkpoints',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M19 21H5a2 2 0 01-2-2V5a2 2 0 012-2h11l5 5v11a2 2 0 01-2 2z" />
        <polyline points="17 21 17 13 7 13 7 21" />
        <polyline points="7 3 7 8 15 8" />
      </svg>
    ),
    title: 'Checkpoints',
    description: 'Save conversation states at any point. Restore previous contexts, experiment with different approaches, or create branching conversation threads.',
    action: 'Try Checkpoints'
  },
  {
    id: 'templates',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="12" y1="18" x2="12" y2="12" />
        <line x1="9" y1="15" x2="15" y2="15" />
      </svg>
    ),
    title: 'Prompt Templates',
    description: 'Create reusable prompt templates for common tasks. Use variables, clipboard integration, and file references to speed up repetitive workflows.',
    action: 'Try Templates'
  }
];

export function Step3Features({ onNext, onBack, onTryFeature }: Step3FeaturesProps) {
  return (
    <div className="wizard-step-content">
      <h2 className="step-title">Explore Powerful Features</h2>
      <p className="step-subtitle">
        Click "Try" to test any feature right now, or continue to see keyboard shortcuts.
      </p>

      <div className="features-grid">
        {features.map((feature, index) => (
          <div
            key={feature.id}
            className="feature-card"
            style={{ animationDelay: `${index * 0.1}s` }}
          >
            <div className="feature-icon">{feature.icon}</div>
            <h3 className="feature-title">{feature.title}</h3>
            <p className="feature-description">{feature.description}</p>
            <button
              className="feature-try-btn"
              onClick={() => onTryFeature(feature.id)}
            >
              {feature.action}
            </button>
          </div>
        ))}
      </div>

      <div className="wizard-actions">
        <button className="wizard-back-btn" onClick={onBack}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="15 18 9 12 15 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Back
        </button>
        <button className="wizard-next-btn" onClick={onNext}>
          Continue
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="9 18 15 12 9 6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      <style>{`
        .wizard-step-content {
          display: flex;
          flex-direction: column;
          align-items: center;
          width: 100%;
          animation: step-fade-in 0.4s ease;
        }

        @keyframes step-fade-in {
          from {
            opacity: 0;
            transform: translateY(10px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .step-title {
          font-size: 24px;
          font-weight: 600;
          color: var(--text-primary, #E2E4F0);
          margin: 0 0 12px 0;
          letter-spacing: -0.3px;
        }

        .step-subtitle {
          font-size: 14px;
          color: var(--text-secondary, #9DA3BE);
          margin: 0 0 32px 0;
          text-align: center;
          max-width: 600px;
          line-height: 1.6;
        }

        .features-grid {
          display: grid;
          grid-template-columns: repeat(2, 1fr);
          gap: 20px;
          width: 100%;
          max-width: 900px;
          margin-bottom: 32px;
        }

        .feature-card {
          padding: 24px;
          background: var(--surface-overlay, #1A1B26);
          border: 2px solid var(--border-default, #292E44);
          border-radius: 12px;
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          transition: all 0.2s cubic-bezier(0, 0, 0.2, 1);
          animation: card-fade-in 0.5s ease backwards;
        }

        @keyframes card-fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .feature-card:hover {
          transform: translateY(-4px);
          border-color: var(--accent-primary, #00C9A7);
          box-shadow: 0 12px 32px rgba(0, 201, 167, 0.2);
        }

        .feature-icon {
          width: 56px;
          height: 56px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 201, 167, 0.1);
          border-radius: 14px;
          color: var(--accent-primary, #00C9A7);
          margin-bottom: 16px;
        }

        .feature-title {
          font-size: 16px;
          font-weight: 600;
          color: var(--text-primary, #E2E4F0);
          margin: 0 0 8px 0;
        }

        .feature-description {
          font-size: 12px;
          color: var(--text-secondary, #9DA3BE);
          margin: 0 0 16px 0;
          line-height: 1.6;
          flex: 1;
        }

        .feature-try-btn {
          padding: 8px 16px;
          background: var(--surface-float, #222435);
          border: 1px solid var(--accent-primary, #00C9A7);
          border-radius: 6px;
          color: var(--accent-primary, #00C9A7);
          font-size: 12px;
          font-weight: 500;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .feature-try-btn:hover {
          background: var(--accent-primary, #00C9A7);
          color: var(--surface-overlay, #1A1B26);
        }

        .wizard-actions {
          display: flex;
          gap: 16px;
          align-items: center;
        }

        .wizard-back-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 20px;
          background: var(--surface-float, #222435);
          border: 1px solid var(--border-default, #292E44);
          border-radius: 8px;
          color: var(--text-secondary, #9DA3BE);
          font-size: 13px;
          font-weight: 500;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          cursor: pointer;
          transition: all 0.2s ease;
        }

        .wizard-back-btn:hover {
          background: var(--border-default, #292E44);
          border-color: var(--accent-primary, #00C9A7);
          color: var(--accent-primary, #00C9A7);
        }

        .wizard-next-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 24px;
          background: linear-gradient(135deg, var(--accent-primary, #00C9A7), var(--accent-primary, #00C9A7));
          border: none;
          border-radius: 8px;
          color: var(--surface-overlay, #1A1B26);
          font-size: 13px;
          font-weight: 600;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0, 0, 0.2, 1);
          box-shadow: 0 4px 16px rgba(0, 201, 167, 0.3);
        }

        .wizard-next-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(0, 201, 167, 0.4);
        }
      `}</style>
    </div>
  );
}
