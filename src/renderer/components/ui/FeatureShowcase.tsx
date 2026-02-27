import { Columns2, Users, Map, Bookmark, FileText, BookOpen } from 'lucide-react';

interface Feature {
  icon: React.ReactNode;
  title: string;
  description: string;
}

const features: Feature[] = [
  {
    icon: <Columns2 size={20} />,
    title: 'Split View',
    description: 'Work with up to 4 terminal panes simultaneously'
  },
  {
    icon: <Users size={20} />,
    title: 'Agent Teams',
    description: 'Visualize and coordinate multiple AI agents'
  },
  {
    icon: <Map size={20} />,
    title: 'Repository Atlas',
    description: 'AI-powered codebase mapping and navigation'
  },
  {
    icon: <Bookmark size={20} />,
    title: 'Checkpoints',
    description: 'Save and restore conversation states'
  },
  {
    icon: <FileText size={20} />,
    title: 'Templates',
    description: 'Reusable prompt templates for common tasks'
  },
  {
    icon: <BookOpen size={20} />,
    title: 'Playbooks',
    description: 'Step-by-step automated session workflows'
  },
];

export function FeatureShowcase() {
  return (
    <div className="feature-showcase-container" aria-hidden="true">
      <h2 className="showcase-title">Powerful Features</h2>
      <div className="feature-showcase">
        {features.map((feature, index) => (
          <div
            key={index}
            className="feature-card"
            style={{ animationDelay: `${0.5 + index * 0.1}s` }}
          >
            <div className="feature-icon-wrap">
              <div className="feature-icon">{feature.icon}</div>
            </div>
            <h3 className="feature-title">{feature.title}</h3>
            <p className="feature-description">{feature.description}</p>
          </div>
        ))}
      </div>

      <style>{`
        .feature-showcase-container {
          margin-top: var(--space-16, 64px);
          width: 100%;
          max-width: 1000px;
        }

        .showcase-title {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-md, 14px);
          font-weight: var(--weight-medium, 500);
          color: var(--text-secondary, #9DA3BE);
          margin: 0 0 var(--space-4, 16px) 0;
          text-align: center;
        }

        .feature-showcase {
          display: flex;
          gap: var(--space-4, 16px);
          overflow-x: auto;
          padding: var(--space-2, 8px) 0;
          scrollbar-width: thin;
          scrollbar-color: var(--border-strong, #3D4163) var(--surface-float, #222435);
        }

        .feature-showcase::-webkit-scrollbar {
          height: 6px;
        }

        .feature-showcase::-webkit-scrollbar-track {
          background: var(--surface-float, #222435);
          border-radius: var(--radius-full, 9999px);
        }

        .feature-showcase::-webkit-scrollbar-thumb {
          background: var(--border-strong, #3D4163);
          border-radius: var(--radius-full, 9999px);
        }

        .feature-showcase::-webkit-scrollbar-thumb:hover {
          background: var(--text-tertiary, #5C6080);
        }

        .feature-card {
          min-width: 170px;
          padding: var(--space-4, 16px);
          background: var(--surface-raised, #13141C);
          border: 1px solid var(--border-subtle, #1E2030);
          border-radius: var(--radius-md, 6px);
          animation: feature-fade-in 0.5s var(--ease-out, ease) backwards;
          flex-shrink: 0;
        }

        @keyframes feature-fade-in {
          from {
            opacity: 0;
            transform: translateX(20px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }

        .feature-icon-wrap {
          margin-bottom: var(--space-2, 8px);
        }

        .feature-icon {
          width: 32px;
          height: 32px;
          display: flex;
          align-items: center;
          justify-content: center;
          background: var(--accent-primary-muted, #00C9A714);
          border-radius: var(--radius-sm, 3px);
          color: var(--accent-primary, #00C9A7);
        }

        .feature-title {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-semibold, 600);
          color: var(--text-primary, #E2E4F0);
          margin: 0 0 var(--space-1, 4px) 0;
        }

        .feature-description {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-xs, 11px);
          font-weight: var(--weight-regular, 400);
          color: var(--text-secondary, #9DA3BE);
          margin: 0;
          line-height: var(--leading-normal, 1.5);
        }

        @media (prefers-reduced-motion: reduce) {
          .feature-card {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
