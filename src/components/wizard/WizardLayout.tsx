import { StepIndicator } from "./StepIndicator";
import { Button } from "../shared/Button";
import { AppIcon } from "../shared/AppIcon";
import { Callout } from "../shared/Callout";
import { ArrowLeftIcon, ArrowRightIcon, HeadphonesIcon } from "../shared/icons";

interface WizardLayoutProps {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
  title: string;
  /** One short line under the title. */
  subtitle?: string;
  children: React.ReactNode;
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  nextDisabled?: boolean;
  showBack?: boolean;
  /** Hide the stepper (used when a step is reopened from the main screen). */
  hideStepper?: boolean;
}

export function WizardLayout({
  currentStep,
  totalSteps,
  stepLabels,
  title,
  subtitle,
  children,
  onBack,
  onNext,
  nextLabel = "Next",
  backLabel = "Back",
  nextDisabled = false,
  showBack = true,
  hideStepper = false,
}: WizardLayoutProps) {
  const canGoBack = showBack && onBack && (currentStep > 1 || hideStepper);
  return (
    <div className="flex min-h-0 flex-1 flex-col text-ink">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-line px-4">
        <div className="flex items-center gap-2">
          <AppIcon size={20} />
          <span className="text-lg font-semibold">Vail Zoomer</span>
        </div>
        {!hideStepper && (
          <StepIndicator currentStep={currentStep} totalSteps={totalSteps} stepLabels={stepLabels} />
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl space-y-4 px-4 py-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle && <p className="text-base text-muted">{subtitle}</p>}
          </div>
          <Callout tone="info" icon={<HeadphonesIcon />}>
            Wear headphones so your mic does not pick up the tone.
          </Callout>
          {children}
        </div>
      </main>

      <footer className="shrink-0 border-t border-line bg-surface">
        <div className="mx-auto flex h-14 w-full max-w-xl items-center justify-between px-4">
          {canGoBack ? (
            <Button variant="secondary" size="md" onClick={onBack} icon={<ArrowLeftIcon />}>
              {backLabel}
            </Button>
          ) : (
            <span />
          )}
          {onNext && (
            <Button variant="primary" size="md" onClick={onNext} disabled={nextDisabled} iconRight={<ArrowRightIcon />}>
              {nextLabel}
            </Button>
          )}
        </div>
      </footer>
    </div>
  );
}
