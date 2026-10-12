import { StepIndicator } from "./StepIndicator";
import { Button } from "../shared/Button";
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
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden text-ink">
      <header className="flex h-11 shrink-0 items-center justify-between border-b border-line bg-surface px-4">
        <span className="text-sm font-semibold uppercase tracking-wide text-muted">Setup</span>
        {!hideStepper && (
          <StepIndicator currentStep={currentStep} totalSteps={totalSteps} stepLabels={stepLabels} />
        )}
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl space-y-3 px-4 py-3">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle && <p className="text-base text-muted">{subtitle}</p>}
          </div>
          {children}
        </div>
      </main>

      <footer className="shrink-0 border-t border-line bg-surface">
        <div className="mx-auto flex h-12 w-full max-w-xl items-center justify-between gap-3 px-4">
          {canGoBack ? (
            <Button variant="secondary" size="md" onClick={onBack} icon={<ArrowLeftIcon />}>
              {backLabel}
            </Button>
          ) : (
            <span />
          )}
          <span className="flex min-w-0 flex-1 items-center justify-center gap-1.5 text-sm text-muted">
            <HeadphonesIcon className="shrink-0" />
            <span className="truncate">Wear headphones so your mic does not pick up the tone.</span>
          </span>
          {onNext ? (
            <Button variant="primary" size="md" onClick={onNext} disabled={nextDisabled} iconRight={<ArrowRightIcon />}>
              {nextLabel}
            </Button>
          ) : (
            <span />
          )}
        </div>
      </footer>
    </div>
  );
}
