import { useState, useEffect, useRef } from 'react';

interface TooltipCoachProps {
  id: string; // Unique ID for this tooltip (e.g., "atlas-button")
  children: React.ReactNode; // The element to wrap
  title: string;
  description: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
  disabled?: boolean;
}

export function TooltipCoach({
  id,
  children,
  title,
  description,
  position = 'bottom',
  disabled = false,
}: TooltipCoachProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [hasShownInSession, setHasShownInSession] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  // Check if this tooltip has been dismissed
  useEffect(() => {
    const dismissed = localStorage.getItem(`tooltipCoach:${id}`) === 'true';
    setIsDismissed(dismissed);
  }, [id]);

  // Handle showing tooltip on hover (only if not dismissed and not shown in this session)
  const handleMouseEnter = () => {
    if (disabled || isDismissed || hasShownInSession) return;
    setIsVisible(true);
    setHasShownInSession(true); // Only show once per session
  };

  const handleMouseLeave = () => {
    // Don't auto-hide - user must click "Got it"
  };

  const handleGotIt = (e: React.MouseEvent) => {
    e.stopPropagation();
    localStorage.setItem(`tooltipCoach:${id}`, 'true');
    setIsDismissed(true);
    setIsVisible(false);
  };

  if (isDismissed || disabled) {
    return <>{children}</>;
  }

  return (
    <div
      ref={wrapperRef}
      className="tooltip-coach-wrapper"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}

      {isVisible && (
        <div ref={tooltipRef} className={`tooltip-coach tooltip-coach-${position}`}>
          <div className="tooltip-coach-content">
            <h4 className="tooltip-coach-title">{title}</h4>
            <p className="tooltip-coach-description">{description}</p>
            <button className="tooltip-coach-btn" onClick={handleGotIt}>
              Got it!
            </button>
          </div>
          <div className={`tooltip-coach-arrow tooltip-coach-arrow-${position}`} />

          <style>{`
            .tooltip-coach-wrapper {
              position: relative;
              display: inline-block;
            }

            .tooltip-coach {
              position: absolute;
              z-index: 10000;
              background: var(--surface-overlay, #1A1B26);
              border: 1px solid var(--border-accent, #00C9A7);
              border-radius: var(--radius-lg, 10px);
              padding: var(--space-4, 16px);
              min-width: 280px;
              max-width: 320px;
              box-shadow: 0 12px 48px rgba(0, 201, 167, 0.2);
              font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
              animation: tooltip-coach-fade-in 0.3s ease;
            }

            @keyframes tooltip-coach-fade-in {
              from {
                opacity: 0;
                transform: translateY(-8px) scale(0.95);
              }
              to {
                opacity: 1;
                transform: translateY(0) scale(1);
              }
            }

            .tooltip-coach-bottom {
              top: calc(100% + 12px);
              left: 50%;
              transform: translateX(-50%);
            }

            .tooltip-coach-top {
              bottom: calc(100% + 12px);
              left: 50%;
              transform: translateX(-50%);
            }

            .tooltip-coach-left {
              right: calc(100% + 12px);
              top: 50%;
              transform: translateY(-50%);
            }

            .tooltip-coach-right {
              left: calc(100% + 12px);
              top: 50%;
              transform: translateY(-50%);
            }

            .tooltip-coach-content {
              display: flex;
              flex-direction: column;
              gap: var(--space-3, 12px);
            }

            .tooltip-coach-title {
              font-size: var(--text-sm, 12px);
              font-weight: var(--weight-semibold, 600);
              color: var(--text-accent, #00C9A7);
              margin: 0;
            }

            .tooltip-coach-description {
              font-size: var(--text-xs, 11px);
              color: var(--text-secondary, #9DA3BE);
              margin: 0;
              line-height: var(--leading-normal, 1.5);
            }

            .tooltip-coach-btn {
              padding: var(--space-2, 8px) var(--space-4, 16px);
              background: var(--accent-primary, #00C9A7);
              border: none;
              border-radius: var(--radius-md, 6px);
              color: var(--text-inverse, #0D0E14);
              font-size: var(--text-xs, 11px);
              font-weight: var(--weight-semibold, 600);
              font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
              cursor: pointer;
              transition: background var(--duration-fast, 150ms) ease;
              align-self: flex-start;
            }

            .tooltip-coach-btn:hover {
              background: var(--accent-primary-dim, #009E84);
            }

            .tooltip-coach-btn:active {
              transform: scale(0.98);
            }

            .tooltip-coach-arrow {
              position: absolute;
              width: 12px;
              height: 12px;
              background: var(--surface-overlay, #1A1B26);
              border: 1px solid var(--border-accent, #00C9A7);
              transform: rotate(45deg);
            }

            .tooltip-coach-arrow-bottom {
              top: -7px;
              left: 50%;
              margin-left: -6px;
              border-bottom: none;
              border-right: none;
            }

            .tooltip-coach-arrow-top {
              bottom: -7px;
              left: 50%;
              margin-left: -6px;
              border-top: none;
              border-left: none;
            }

            .tooltip-coach-arrow-left {
              right: -7px;
              top: 50%;
              margin-top: -6px;
              border-left: none;
              border-bottom: none;
            }

            .tooltip-coach-arrow-right {
              left: -7px;
              top: 50%;
              margin-top: -6px;
              border-right: none;
              border-top: none;
            }
          `}</style>
        </div>
      )}
    </div>
  );
}
