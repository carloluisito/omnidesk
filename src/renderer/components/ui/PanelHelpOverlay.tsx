import { useState, useEffect } from 'react';

interface Annotation {
  target: string; // CSS selector or description
  title: string;
  description: string;
  position: { x: number; y: number }; // Percentage-based positioning
}

interface PanelHelpOverlayProps {
  panelId: string; // Unique ID (e.g., "atlas-panel")
  title: string;
  annotations: Annotation[];
  onDismiss: () => void;
}

export function PanelHelpOverlay({
  panelId,
  title,
  annotations,
  onDismiss,
}: PanelHelpOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const dismissed = localStorage.getItem(`panelHelp:${panelId}`) === 'true';
    setIsVisible(!dismissed);
  }, [panelId]);

  const handleGotIt = () => {
    localStorage.setItem(`panelHelp:${panelId}`, 'true');
    setIsVisible(false);
    onDismiss();
  };

  if (!isVisible) return null;

  return (
    <div className="panel-help-overlay">
      <div className="panel-help-backdrop" />

      <div className="panel-help-content">
        <div className="panel-help-header">
          <h2 className="panel-help-title">{title}</h2>
          <p className="panel-help-subtitle">
            Here's a quick guide to help you get started
          </p>
        </div>

        <div className="panel-help-annotations">
          {annotations.map((annotation, index) => (
            <div
              key={index}
              className="panel-help-annotation"
              style={{
                left: `${annotation.position.x}%`,
                top: `${annotation.position.y}%`,
              }}
            >
              <div className="annotation-pulse" />
              <div className="annotation-content">
                <div className="annotation-number">{index + 1}</div>
                <div className="annotation-text">
                  <h4 className="annotation-title">{annotation.title}</h4>
                  <p className="annotation-description">{annotation.description}</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        <button className="panel-help-btn" onClick={handleGotIt}>
          Got it, let me try!
        </button>
      </div>

      <style>{`
        .panel-help-overlay {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          z-index: 9999;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          animation: overlay-fade-in 0.3s ease;
        }

        @keyframes overlay-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .panel-help-backdrop {
          position: absolute;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(13, 14, 20, 0.92);
          backdrop-filter: blur(4px);
        }

        .panel-help-content {
          position: relative;
          height: 100%;
          display: flex;
          flex-direction: column;
          padding: var(--space-8, 32px);
        }

        .panel-help-header {
          text-align: center;
          margin-bottom: var(--space-8, 32px);
          animation: header-slide-down 0.4s ease;
        }

        @keyframes header-slide-down {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .panel-help-title {
          font-size: var(--text-xl, 20px);
          font-weight: var(--weight-semibold, 600);
          color: var(--text-accent, #00C9A7);
          margin: 0 0 var(--space-2, 8px) 0;
        }

        .panel-help-subtitle {
          font-size: var(--text-sm, 12px);
          color: var(--text-secondary, #9DA3BE);
          margin: 0;
        }

        .panel-help-annotations {
          position: relative;
          flex: 1;
        }

        .panel-help-annotation {
          position: absolute;
          animation: annotation-fade-in 0.5s ease backwards;
        }

        .panel-help-annotation:nth-child(1) { animation-delay: 0.2s; }
        .panel-help-annotation:nth-child(2) { animation-delay: 0.3s; }
        .panel-help-annotation:nth-child(3) { animation-delay: 0.4s; }
        .panel-help-annotation:nth-child(4) { animation-delay: 0.5s; }

        @keyframes annotation-fade-in {
          from {
            opacity: 0;
            transform: scale(0.8);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .annotation-pulse {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: rgba(0, 201, 167, 0.2);
          animation: pulse 2s ease-in-out infinite;
        }

        @keyframes pulse {
          0%, 100% {
            transform: scale(1);
            opacity: 1;
          }
          50% {
            transform: scale(1.5);
            opacity: 0.5;
          }
        }

        .annotation-content {
          position: absolute;
          top: 50%;
          left: 50%;
          transform: translate(-50%, -50%);
          display: flex;
          align-items: flex-start;
          gap: var(--space-3, 12px);
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-accent, #00C9A7);
          border-radius: var(--radius-lg, 10px);
          padding: var(--space-4, 16px);
          min-width: 250px;
          max-width: 300px;
          box-shadow: 0 12px 48px rgba(0, 201, 167, 0.15);
        }

        .annotation-number {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: var(--accent-primary, #00C9A7);
          color: var(--text-inverse, #0D0E14);
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-bold, 700);
          flex-shrink: 0;
        }

        .annotation-text {
          flex: 1;
        }

        .annotation-title {
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-semibold, 600);
          color: var(--text-primary, #E2E4F0);
          margin: 0 0 6px 0;
        }

        .annotation-description {
          font-size: var(--text-xs, 11px);
          color: var(--text-secondary, #9DA3BE);
          margin: 0;
          line-height: var(--leading-normal, 1.5);
        }

        .panel-help-btn {
          align-self: center;
          padding: var(--space-3, 12px) var(--space-8, 32px);
          background: var(--accent-primary, #00C9A7);
          border: none;
          border-radius: var(--radius-lg, 10px);
          color: var(--text-inverse, #0D0E14);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-semibold, 600);
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          cursor: pointer;
          transition: background var(--duration-fast, 150ms) ease;
          animation: button-fade-in 0.6s ease;
        }

        @keyframes button-fade-in {
          from {
            opacity: 0;
            transform: translateY(20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .panel-help-btn:hover {
          background: var(--accent-primary-dim, #009E84);
        }

        .panel-help-btn:active {
          transform: scale(0.98);
        }
      `}</style>
    </div>
  );
}
