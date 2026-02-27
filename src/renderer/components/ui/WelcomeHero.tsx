import { BrandMark } from './BrandMark';

interface WelcomeHeroProps {
  version: string;
}

export function WelcomeHero({ version }: WelcomeHeroProps) {
  return (
    <div className="welcome-hero">
      <div className="hero-brandmark">
        <BrandMark size={64} color="var(--accent-primary)" />
      </div>

      <h1 className="hero-title">
        <span className="hero-title-omni">Omni</span>
        <span className="hero-title-desk">Desk</span>
      </h1>

      <p className="hero-tagline">
        Multi-provider AI coding terminal
      </p>

      <div className="hero-version">v{version}</div>

      <style>{`
        .welcome-hero {
          display: flex;
          flex-direction: column;
          align-items: center;
          margin-bottom: var(--space-12, 48px);
          animation: hero-fade-in var(--duration-slow, 300ms) var(--ease-out, ease) both;
        }

        @keyframes hero-fade-in {
          from {
            opacity: 0;
            transform: translateY(-8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .hero-brandmark {
          margin-bottom: var(--space-5, 20px);
          filter: drop-shadow(0 0 24px #00C9A728);
        }

        .hero-title {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-2xl, 28px);
          color: var(--text-primary, #E2E4F0);
          margin: 0 0 var(--space-2, 8px) 0;
          letter-spacing: var(--tracking-tight, -0.01em);
          line-height: var(--leading-tight, 1.2);
        }

        .hero-title-omni {
          font-weight: var(--weight-medium, 500);
        }

        .hero-title-desk {
          font-weight: var(--weight-light, 300);
        }

        .hero-tagline {
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-regular, 400);
          color: var(--text-secondary, #9DA3BE);
          margin: 0 0 var(--space-3, 12px) 0;
          text-align: center;
          max-width: 360px;
          line-height: var(--leading-normal, 1.5);
        }

        .hero-version {
          display: inline-flex;
          align-items: center;
          padding: 2px var(--space-3, 12px);
          background: var(--surface-float, #222435);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-full, 9999px);
          font-family: var(--font-mono-ui, 'JetBrains Mono', monospace);
          font-size: var(--text-2xs, 10px);
          color: var(--text-tertiary, #5C6080);
        }

        @media (prefers-reduced-motion: reduce) {
          .welcome-hero {
            animation: none;
          }
        }
      `}</style>
    </div>
  );
}
