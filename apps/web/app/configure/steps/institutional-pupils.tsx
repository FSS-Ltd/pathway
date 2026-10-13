import { enrolledCount } from "../institutional-flow";

export function InstitutionalPupilsStep({
  countInput,
  declarationAccepted,
  onCountChange,
  onDeclarationChange,
}: {
  countInput: string;
  declarationAccepted: boolean;
  onCountChange: (value: string) => void;
  onDeclarationChange: (value: boolean) => void;
}) {
  const invalid = countInput !== "" && enrolledCount(countInput) === null;
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div>
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold"
        >
          How many pupils are enrolled?
        </h2>
        <p id="pupil-help" className="mt-2 text-text-muted">
          Count each pupil once across your permitted sites. Include pupils on
          your continuing roll, whether or not they attended today. Staff,
          parents and volunteers are not counted.
        </p>
      </div>
      <div className="rounded-xl border border-border-subtle bg-surface p-5">
        <label
          htmlFor="enrolled-pupils"
          className="block text-sm font-semibold"
        >
          Enrolled pupils
        </label>
        <input
          id="enrolled-pupils"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={countInput}
          onChange={(event) => onCountChange(event.target.value)}
          aria-describedby={`pupil-help${invalid ? " pupil-error" : ""}`}
          aria-invalid={invalid}
          className="mt-3 w-full max-w-48 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        />
        {invalid ? (
          <p
            id="pupil-error"
            role="alert"
            className="mt-2 text-sm text-status-danger"
          >
            Enter a whole number, including zero.
          </p>
        ) : null}
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface p-4 text-sm">
        <input
          type="checkbox"
          checked={declarationAccepted}
          onChange={(event) => onDeclarationChange(event.target.checked)}
          className="mt-1 h-4 w-4 accent-accent-primary"
        />
        <span>
          I confirm this is the number of distinct enrolled pupils on our
          continuing roll.
        </span>
      </label>
      <p className="text-xs text-text-muted">
        More than 250 pupils needs a tailored quote. The count used for renewal
        follows the confirmed roll and census cutoff.
      </p>
    </section>
  );
}
