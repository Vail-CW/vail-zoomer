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
    <div className="h-screen bg-gray-900 text-white p-4 flex flex-col">
      {/* Header - stays fixed at top */}
      <header className="text-center mb-3 flex-shrink-0">
        <h1 className="text-2xl font-bold text-amber-400">Vail Zoomer</h1>
        <p className="text-gray-400 text-sm">Setup Guide</p>
      </header>

      {/* Scrollable area for all content including navigation */}
      <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
        {/* Step indicator */}
        <div className="flex-shrink-0">
          <StepIndicator
            currentStep={currentStep}
            totalSteps={totalSteps}
            stepLabels={stepLabels}
          />
        </div>

        {/* Step title */}
        <h2 className="text-xl font-bold text-white text-center mb-3 flex-shrink-0">{title}</h2>

        {/* Content area */}
        <div className="flex-1">{children}</div>

        {/* Navigation buttons - now inside scroll area */}
        <div className="flex gap-3 justify-center py-4 flex-shrink-0">
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
    </div>
  );
}
