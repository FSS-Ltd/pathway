import type { ConfiguratorStep } from "../../app/configure/state";

export type ConfiguratorProgressStep = {
  id: ConfiguratorStep;
  label: string;
};

type ConfiguratorStepperProps = {
  steps: readonly ConfiguratorProgressStep[];
  currentStep: ConfiguratorStep;
  onBack: () => void;
  onContinue: () => void;
  isBackDisabled: boolean;
  isContinueDisabled: boolean;
};

export function ConfiguratorStepper({
  steps,
  currentStep,
  onBack,
  onContinue,
  isBackDisabled,
  isContinueDisabled,
}: ConfiguratorStepperProps) {
  const currentIndex =
    currentStep === "summary"
      ? steps.length
      : steps.findIndex(({ id }) => id === currentStep);

  return (
    <div className="space-y-6">
      <nav aria-label="Configuration progress">
        <ol className="flex flex-wrap gap-x-4 gap-y-3">
          {steps.map((step, index) => {
            const isCurrent = step.id === currentStep;
            const isComplete = index < currentIndex;

            return (
              <li
                key={step.id}
                aria-current={isCurrent ? "step" : undefined}
                className="flex items-center gap-2 text-sm"
              >
                <span
                  aria-hidden="true"
                  className={`flex h-6 w-6 items-center justify-center rounded-full border text-xs font-semibold ${
                    isComplete
                      ? "border-accent-primary bg-accent-primary text-accent-foreground"
                      : isCurrent
                        ? "border-accent-strong bg-accent-subtle text-text-primary"
                        : "border-border-strong bg-surface text-text-muted"
                  }`}
                >
                  {isComplete ? "✓" : index + 1}
                </span>
                <span
                  className={
                    isCurrent
                      ? "font-semibold text-text-primary"
                      : "text-text-muted"
                  }
                >
                  {step.label}
                </span>
                <span className="sr-only">
                  {isCurrent
                    ? "Current step"
                    : isComplete
                      ? "Complete"
                      : "Upcoming"}
                </span>
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="flex items-center justify-between gap-4 border-t border-border-subtle pt-6">
        <button
          type="button"
          onClick={onBack}
          disabled={isBackDisabled}
          className="rounded-md border border-border-subtle bg-surface px-4 py-2 text-sm font-medium text-text-primary hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={onContinue}
          disabled={isContinueDisabled}
          className="rounded-md bg-accent-primary px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-50"
        >
          Continue
        </button>
      </div>
    </div>
  );
}
