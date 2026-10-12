import {
  MODULE_CATALOG,
  type StorageChoice,
  type WebModule,
} from "../../../../lib/module-catalog";
import type { AdminModuleChangePreview } from "../../../../lib/api-client";

type SummaryStepProps = {
  planLabel: string;
  currentPlanLabel: string | null;
  frequency: "monthly" | "yearly";
  includedModules: WebModule[];
  selectedOptionalModules: WebModule[];
  includedModuleLimit: number;
  storageChoice: StorageChoice;
  onCheckout: () => void;
  isCheckoutPending: boolean;
  checkoutError: string | null;
  disabledReason: string | null;
  isExistingSubscription: boolean;
  moduleChangePreview: AdminModuleChangePreview | null;
  onPreviewChange: () => void;
  onAcceptChange: () => void;
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
  includedModuleLimit,
  storageChoice,
  onCheckout,
  isCheckoutPending,
  checkoutError,
  disabledReason,
  isExistingSubscription,
  moduleChangePreview,
  onPreviewChange,
  onAcceptChange,
}: SummaryStepProps) {
  const errorMessage = checkoutError;

  return (
    <section aria-labelledby="configurator-step-title" className="space-y-6">
      <div className="space-y-2">
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold text-text-primary"
        >
          Review your changes
        </h2>
        <p className="text-text-muted">
          {isExistingSubscription
            ? "Review the next renewal before you schedule these changes."
            : "Check your choices before secure checkout."}
        </p>
      </div>
      <p className="text-sm text-text-muted">
        Your plan includes up to {includedModuleLimit} chosen modules. Paid
        module add-ons are listed separately.
      </p>
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
        {!isExistingSubscription ? (
          <div>
            <dt className="text-text-muted">Storage</dt>
            <dd className="mt-1 font-semibold text-text-primary">
              {storageLabelFor(storageChoice)}
            </dd>
          </div>
        ) : null}
      </dl>
      <div className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5">
        <p className="text-sm text-text-muted">
          {isExistingSubscription
            ? "Changes take effect at your next renewal without a charge today. Existing unrelated subscription items remain in place."
            : "You'll review the amount due at secure checkout."}
        </p>
        {moduleChangePreview ? (
          <div
            className="rounded-lg border border-border-subtle bg-muted/30 p-4 text-sm"
            role="status"
          >
            <p className="font-semibold text-text-primary">
              {moduleChangePreview.status === "SCHEDULED"
                ? "Change scheduled"
                : "Renewal preview"}
            </p>
            <p className="mt-1 text-text-muted">
              Effective{" "}
              {new Date(moduleChangePreview.effectiveAt).toLocaleDateString(
                "en-GB",
                {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                },
              )}
              . Estimated recurring subtotal:{" "}
              {new Intl.NumberFormat("en-GB", {
                style: "currency",
                currency: "GBP",
              }).format(moduleChangePreview.subtotalPence / 100)}{" "}
              before discounts and tax.
            </p>
            {moduleChangePreview.status === "PREVIEW" ? (
              <p className="mt-1 text-text-muted">
                Confirm before{" "}
                {new Date(moduleChangePreview.expiresAt).toLocaleTimeString(
                  "en-GB",
                  {
                    hour: "2-digit",
                    minute: "2-digit",
                  },
                )}
                .
              </p>
            ) : null}
          </div>
        ) : null}
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
          onClick={
            isExistingSubscription
              ? moduleChangePreview
                ? onAcceptChange
                : onPreviewChange
              : onCheckout
          }
          disabled={
            isCheckoutPending ||
            Boolean(disabledReason) ||
            moduleChangePreview?.status === "SCHEDULED"
          }
          aria-busy={isCheckoutPending}
          className="rounded-md bg-accent-primary px-5 py-3 text-sm font-semibold text-accent-foreground transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCheckoutPending
            ? isExistingSubscription
              ? "Updating renewal…"
              : "Starting checkout…"
            : isExistingSubscription
              ? moduleChangePreview?.status === "SCHEDULED"
                ? "Scheduled for renewal"
                : moduleChangePreview
                  ? "Confirm renewal change"
                  : "Review renewal change"
              : "Continue to secure checkout"}
        </button>
      </div>
    </section>
  );
}
