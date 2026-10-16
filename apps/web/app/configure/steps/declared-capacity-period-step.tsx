import type { DeclaredCapacityInterval } from "@pathway/pricing";

export function DeclaredCapacityPeriodStep({
  interval,
  onSelect,
}: {
  interval: DeclaredCapacityInterval;
  onSelect: (interval: DeclaredCapacityInterval) => void;
}) {
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div>
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold"
        >
          Choose a billing period
        </h2>
        <p className="mt-2 text-text-muted">
          The plan tier follows your declared capacity. Yearly billing is paid
          upfront at the displayed annual amount.
        </p>
      </div>
      <div
        role="group"
        aria-label="Billing period"
        className="grid gap-3 sm:grid-cols-2"
      >
        {(["month", "year"] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={interval === value}
            onClick={() => onSelect(value)}
            className={`rounded-xl border p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary ${interval === value ? "border-accent-strong bg-accent-subtle ring-1 ring-accent-strong" : "border-border-subtle bg-surface"}`}
          >
            <span className="block font-semibold">
              {value === "month" ? "Monthly" : "Yearly"}
            </span>
            <span className="mt-1 block text-sm text-text-muted">
              {value === "month"
                ? "£74 base per month + £1 per child per month."
                : "£740 base per year + £10 per child per year, paid upfront."}
            </span>
          </button>
        ))}
      </div>
      <p className="text-xs text-text-muted">
        Add-ons selected for payment are billed at their approved monthly or
        annual price. Trial selection never charges you.
      </p>
    </section>
  );
}
