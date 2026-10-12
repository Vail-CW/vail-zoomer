import { Fragment } from "react";
import { CheckIcon } from "../shared/icons";

interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
}

export function StepIndicator({ currentStep, totalSteps, stepLabels = [] }: StepIndicatorProps) {
  const steps = Array.from({ length: totalSteps }, (_, i) => i + 1);
  return (
    <ol className="flex items-center gap-2" aria-label={`Step ${currentStep} of ${totalSteps}`}>
      {steps.map((step) => {
        const done = step < currentStep;
        const active = step === currentStep;
        return (
          <Fragment key={step}>
            <li className="flex items-center gap-2" aria-current={active ? "step" : undefined}>
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full border text-xs font-semibold tabular-nums ${
                  active
                    ? "border-transparent bg-accent text-accent-fg"
                    : done
                    ? "border-line-strong bg-surface3 text-ink"
                    : "border-line-strong text-muted"
                }`}
              >
                {done ? <CheckIcon size={12} strokeWidth={2.5} /> : step}
              </span>
              {stepLabels[step - 1] && (
                <span className={`hidden text-sm sm:inline ${active ? "font-medium text-ink" : "text-muted"}`}>
                  {stepLabels[step - 1]}
                </span>
              )}
            </li>
            {step < totalSteps && <span aria-hidden="true" className="h-px w-4 bg-line-strong" />}
          </Fragment>
        );
      })}
    </ol>
  );
}
