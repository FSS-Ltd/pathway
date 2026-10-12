import {
  MODULE_CATALOG,
  type StorageChoice,
  type WebModule,
} from "../../../../lib/module-catalog";

type SummaryStepProps = {
  planLabel: string;
  currentPlanLabel: string | null;
  frequency: "monthly" | "yearly";
  includedModules: WebModule[];
  selectedOptionalModules: WebModule[];
  storageChoice: StorageChoice;
  onCheckout: () => void;
  isCheckoutPending: boolean;
  checkoutError: string | null;
  disabledReason: string | null;
};

function storageLabelFor(storageChoice: StorageChoice): string {
  if (storageChoice === "none") return "No extra storage";
  return `${storageChoice === "1000" ? "1TB" : `${storageChoice}GB`} extra storage`;
}

export function SummaryStep({
  planLabel,
  currentPlanLabel,
  frequency,
  includedModules,
  selectedOptionalModules,
  storageChoice,
  onCheckout,
  isCheckoutPending,
  checkoutError,
  disabledReason,
}: SummaryStepProps) {
  const errorMessage = checkoutError;

  return (
    <section aria-labelledby="configurator-step-title" className="space-y-6">
      <div className="space-y-2">
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold text-text-primary"
        >
          Review your upgrade
        </h2>
        <p className="text-text-muted">
          Check your changes. You'll confirm the exact amount due today at secure
          checkout.
        </p>
      </div>
      <dl className="grid gap-3 rounded-xl border border-border-subtle bg-surface p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">Current plan</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {currentPlanLabel ?? "No active plan"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">New plan</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {planLabel} · {frequency}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Included modules</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {includedModules.length
              ? includedModules
                  .map((module) => MODULE_CATALOG[module].label)
                  .join(", ")
              : "None"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Paid add-ons</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {selectedOptionalModules.length
              ? selectedOptionalModules
                  .map((module) => MODULE_CATALOG[module].label)
                  .join(", ")
              : "None selected"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Storage</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {storageLabelFor(storageChoice)}
          </dd>
        </div>
      </dl>
      <div className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5">
        <p className="text-sm text-text-muted">
          Plan changes are handled securely via Stripe. You'll review the exact
          amount due today, including any proration, before confirming payment.
        </p>
        {disabledReason ? (
          <p className="rounded-md bg-status-warning/10 px-3 py-2 text-sm text-text-primary">
            {disabledReason}
          </p>
        ) : null}
        {errorMessage ? (
          <p
            role="alert"
            className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger"
          >
            {errorMessage}
          </p>
        ) : null}
        <button
          type="button"
          onClick={onCheckout}
          disabled={isCheckoutPending || Boolean(disabledReason)}
          aria-busy={isCheckoutPending}
          className="rounded-md bg-accent-primary px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCheckoutPending
            ? "Starting checkout…"
            : "Confirm & continue to secure checkout"}
        </button>
      </div>
    </section>
  );
}
