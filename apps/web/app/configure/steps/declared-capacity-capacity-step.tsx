export function DeclaredCapacityCapacityStep({
  capacityInput,
  declarationAccepted,
  invalid,
  tierLabel,
  onCapacityChange,
  onDeclarationChange,
}: {
  capacityInput: string;
  declarationAccepted: boolean;
  invalid: boolean;
  tierLabel: string;
  onCapacityChange: (value: string) => void;
  onDeclarationChange: (value: boolean) => void;
}) {
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div>
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold"
        >
          How many children can be actively enrolled?
        </h2>
        <p id="capacity-help" className="mt-2 text-text-muted">
          Enter your maximum declared capacity. Each child counts once across
          your sites; staff, parents, guests and children who are no longer
          enrolled do not count.
        </p>
      </div>
      <div className="rounded-xl border border-border-subtle bg-surface p-5">
        <label
          htmlFor="declared-child-capacity"
          className="block text-sm font-semibold"
        >
          Declared child capacity
        </label>
        <input
          id="declared-child-capacity"
          type="number"
          inputMode="numeric"
          min="0"
          step="1"
          value={capacityInput}
          onChange={(event) => onCapacityChange(event.target.value)}
          aria-describedby={`capacity-help${invalid ? " capacity-error" : ""}`}
          aria-invalid={invalid}
          className="mt-3 w-full max-w-48 rounded-lg border border-border-subtle bg-surface px-3 py-2 text-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
        />
        {invalid ? (
          <p
            id="capacity-error"
            role="alert"
            className="mt-2 text-sm text-status-danger"
          >
            Enter a whole number, including zero.
          </p>
        ) : null}
        <p className="mt-3 text-sm font-semibold">{tierLabel}</p>
      </div>
      <label className="flex items-start gap-3 rounded-xl border border-border-subtle bg-surface p-4 text-sm">
        <input
          type="checkbox"
          checked={declarationAccepted}
          onChange={(event) => onDeclarationChange(event.target.checked)}
          className="mt-1 h-4 w-4 accent-accent-primary"
        />
        <span>
          I confirm this is the maximum number of distinct actively enrolled
          children our organisation requires.
        </span>
      </label>
      <p className="text-xs text-text-muted">
        Starter: 0–74 children and 1 site. Growth: 75–149 and 2 sites.
        Professional: 150–250 and 5 sites. 251+ children uses a custom
        Enterprise quote.
      </p>
    </section>
  );
}
