import { StepIndicator } from "./StepIndicator";
import { BigButton } from "../shared/BigButton";
import { AppIcon } from "../shared/AppIcon";

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
  nextLabel = "Next",
  backLabel = "Back",
  nextDisabled = false,
  showBack = true,
}: WizardLayoutProps) {
  return (
    <div className="h-screen text-white p-5 flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-center gap-3 mb-2 flex-shrink-0">
        <AppIcon size={36} />
        <h1 className="text-2xl font-bold text-amber-400">Vail Zoomer</h1>
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
        <h2 className="text-2xl font-bold text-white text-center mb-4 flex-shrink-0">{title}</h2>

        {/* Content area */}
        <div className="flex-1">{children}</div>

        {/* Navigation buttons */}
        <div className="flex gap-3 justify-center py-4 flex-shrink-0">
          {showBack && currentStep > 1 && onBack && (
            <BigButton variant="secondary" onClick={onBack} className="!min-h-[52px] !py-3 !text-lg">
              {backLabel}
            </BigButton>
          )}
          {onNext && (
            <BigButton onClick={onNext} disabled={nextDisabled} className="!min-h-[52px] !py-3 !text-lg">
              {nextLabel} →
            </BigButton>
          )}
        </div>
      </div>
    </div>
  );
}
