interface StepIndicatorProps {
  currentStep: number;
  totalSteps: number;
  stepLabels?: string[];
}

export function StepIndicator({
  currentStep,
  totalSteps,
  stepLabels = [],
}: StepIndicatorProps) {
  return (
    <div className="mb-4">
      {/* Progress dots with labels */}
      <div className="flex justify-center items-center gap-2">
        {Array.from({ length: totalSteps }, (_, i) => i + 1).map((step) => (
          <div key={step} className="flex items-center">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors ${
                  step < currentStep
                    ? "bg-green-500 text-white"
                    : step === currentStep
                      ? "bg-amber-500 text-gray-900"
                      : "bg-gray-700 text-gray-400"
                }`}
              >
                {step < currentStep ? (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  step
                )}
              </div>
              {stepLabels[step - 1] && (
                <span
                  className={`text-xs mt-1 ${
                    step === currentStep ? "text-amber-400 font-medium" : "text-gray-500"
                  }`}
                >
                  {stepLabels[step - 1]}
                </span>
              )}
            </div>
            {step < totalSteps && (
              <div
                className={`w-8 h-0.5 mx-1 ${
                  step < currentStep ? "bg-green-500" : "bg-gray-700"
                }`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
