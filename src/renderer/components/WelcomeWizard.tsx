import { useState, useCallback } from 'react';
import { WizardStepper } from './WizardStepper';
import { Step1Welcome } from './wizard/Step1_Welcome';
import { Step2_LayoutPicker } from './wizard/Step2_LayoutPicker';
import { Step3Features } from './wizard/Step3_Features';
import { Step4Ready } from './wizard/Step4_Ready';

interface WelcomeWizardProps {
  isOpen: boolean;
  onComplete: () => void;
  onTryFeature: (featureId: string) => void;
}

export function WelcomeWizard({ isOpen, onComplete, onTryFeature }: WelcomeWizardProps) {
  const [currentStep, setCurrentStep] = useState(1);

  const stepLabels = ['Welcome', 'Layout', 'Features', 'Ready'];

  const handleNext = useCallback(() => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  }, [currentStep, onComplete]);

  const handleBack = useCallback(() => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  }, [currentStep]);

  const handleTryFeature = useCallback((featureId: string) => {
    // Complete wizard and open feature
    onTryFeature(featureId);
    onComplete();
  }, [onTryFeature, onComplete]);

  if (!isOpen) return null;

  return (
    <div className="wizard-overlay">
      <div className="wizard-dialog">
        <WizardStepper
          currentStep={currentStep}
          totalSteps={4}
          stepLabels={stepLabels}
        />

        <div className="wizard-content">
          {currentStep === 1 && <Step1Welcome onNext={handleNext} />}
          {currentStep === 2 && (
            <Step2_LayoutPicker onNext={handleNext} onBack={handleBack} />
          )}
          {currentStep === 3 && (
            <Step3Features
              onNext={handleNext}
              onBack={handleBack}
              onTryFeature={handleTryFeature}
            />
          )}
          {currentStep === 4 && (
            <Step4Ready onFinish={onComplete} onBack={handleBack} />
          )}
        </div>
      </div>

      <style>{`
        .wizard-overlay {
          position: fixed;
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: rgba(13, 14, 20, 0.95);
          backdrop-filter: blur(12px);
          display: flex;
          align-items: center;
          justify-content: center;
          z-index: 9999;
          font-family: var(--font-ui, 'Inter', system-ui, sans-serif);
          animation: overlay-fade-in 0.3s ease;
        }

        @keyframes overlay-fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }

        .wizard-dialog {
          width: 90%;
          max-width: 1000px;
          max-height: 90vh;
          background: var(--surface-overlay, #1A1B26);
          border: 1px solid var(--border-default, #292E44);
          border-radius: var(--radius-xl, 16px);
          padding: 48px;
          overflow-y: auto;
          box-shadow: var(--shadow-xl, 0 24px 64px #000000A0);
          animation: dialog-slide-up 0.4s cubic-bezier(0, 0, 0.2, 1);
        }

        @keyframes dialog-slide-up {
          from {
            opacity: 0;
            transform: translateY(40px) scale(0.96);
          }
          to {
            opacity: 1;
            transform: translateY(0) scale(1);
          }
        }

        .wizard-content {
          width: 100%;
        }

        /* Custom scrollbar for wizard dialog */
        .wizard-dialog::-webkit-scrollbar {
          width: 6px;
        }

        .wizard-dialog::-webkit-scrollbar-track {
          background: transparent;
        }

        .wizard-dialog::-webkit-scrollbar-thumb {
          background: var(--border-default, #292E44);
          border-radius: 3px;
        }

        .wizard-dialog::-webkit-scrollbar-thumb:hover {
          background: var(--border-strong, #3D4163);
        }
      `}</style>
    </div>
  );
}
