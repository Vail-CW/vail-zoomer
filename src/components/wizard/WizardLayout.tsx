import { StepIndicator } from "./StepIndicator";
import { BigButton } from "../shared/BigButton";

interface WizardLayoutProps {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
  title: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
}

export function WizardLayout({
  currentStep,
  totalSteps,
  stepLabels,
  title,
  children,
  onBack,
  onNext,
  nextLabel = "Next Step",
  backLabel = "Back",
  nextDisabled = false,
  showBack = true,
}: WizardLayoutProps) {
  return (
    <div className="h-screen bg-gray-900 text-white p-4 flex flex-col overflow-hidden">
      {/* Header */}
      <header className="text-center mb-3">
        <h1 className="text-2xl font-bold text-amber-400">Vail Zoomer</h1>
        <p className="text-gray-400 text-sm">Setup Guide</p>
      </header>

      {/* Step indicator */}
      <StepIndicator
        currentStep={currentStep}
        totalSteps={totalSteps}
        stepLabels={stepLabels}
      />

      {/* Step title */}
      <h2 className="text-xl font-bold text-white text-center mb-3">{title}</h2>

      {/* Content area */}
      <div className="flex-1 overflow-y-auto mb-4">{children}</div>

      {/* Navigation buttons */}
      <div className="flex gap-3 justify-center">
        {showBack && currentStep > 1 && onBack && (
          <BigButton variant="secondary" onClick={onBack} className="!min-h-[48px] !py-2 !text-base">
            {backLabel}
          </BigButton>
        )}
        {onNext && (
          <BigButton onClick={onNext} disabled={nextDisabled} className="!min-h-[48px] !py-2 !text-base">
            {nextLabel} →
          </BigButton>
        )}
      </div>
    </div>
  );
}
