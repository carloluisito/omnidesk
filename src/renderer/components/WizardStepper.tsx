interface WizardStepperProps {
  currentStep: number;
  totalSteps: number;
  stepLabels: string[];
}

export function WizardStepper({ currentStep, totalSteps, stepLabels }: WizardStepperProps) {
  return (
    <div className="wizard-stepper">
      <div className="stepper-progress">
        <div
          className="stepper-progress-fill"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
      </div>

      <div className="stepper-steps">
        {stepLabels.map((label, index) => {
          const stepNum = index + 1;
          const isActive = stepNum === currentStep;
          const isCompleted = stepNum < currentStep;

          return (
            <div
              key={stepNum}
              className={`stepper-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''}`}
            >
              <div className="step-indicator">
                {isCompleted ? (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  <span>{stepNum}</span>
                )}
              </div>
              <span className="step-label">{label}</span>
            </div>
          );
        })}
      </div>

      <style>{`
        .wizard-stepper {
          width: 100%;
          margin-bottom: 48px;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
        }

        .stepper-progress {
          width: 100%;
          height: 3px;
          background: var(--surface-float);
          border-radius: var(--radius-full, 9999px);
          overflow: hidden;
          margin-bottom: 24px;
        }

        .stepper-progress-fill {
          height: 100%;
          background: var(--accent-primary);
          transition: width 0.4s cubic-bezier(0.4, 0, 0.2, 1);
          box-shadow: 0 0 8px color-mix(in srgb, var(--accent-primary) 40%, transparent);
        }

        .stepper-steps {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
        }

        .stepper-step {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          flex: 1;
        }

        .step-indicator {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          background: var(--surface-float);
          border: 1px solid var(--border-default);
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--text-tertiary);
          font-size: var(--text-sm, 12px);
          font-weight: var(--weight-semibold, 600);
          transition: all 0.3s ease;
        }

        .stepper-step.active .step-indicator {
          background: var(--accent-primary);
          border-color: var(--accent-primary);
          color: var(--text-inverse);
          box-shadow: 0 0 16px color-mix(in srgb, var(--accent-primary) 40%, transparent);
          animation: pulse-indicator 2s ease-in-out infinite;
        }

        .stepper-step.completed .step-indicator {
          background: var(--semantic-success);
          border-color: var(--semantic-success);
          color: var(--text-inverse);
        }

        @keyframes pulse-indicator {
          0%, 100% { transform: scale(1); }
          50% { transform: scale(1.1); }
        }

        .step-label {
          font-size: var(--text-xs, 11px);
          color: var(--text-tertiary);
          text-align: center;
          transition: color 0.3s ease;
        }

        .stepper-step.active .step-label {
          color: var(--text-primary);
          font-weight: var(--weight-medium, 500);
        }

        .stepper-step.completed .step-label {
          color: var(--semantic-success);
        }
      `}</style>
    </div>
  );
}
