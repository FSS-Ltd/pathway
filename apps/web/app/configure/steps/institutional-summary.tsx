import type { FormEvent } from "react";
import type { InstitutionalMappedQuote } from "@pathway/pricing";
import type { InstitutionalConfiguration } from "../institutional-flow";

export type InstitutionalAccountDetails = {
  orgName: string;
  contactName: string;
  contactEmail: string;
  password: string;
};

export const EMPTY_ACCOUNT_DETAILS: InstitutionalAccountDetails = {
  orgName: "",
  contactName: "",
  contactEmail: "",
  password: "",
};

export function InstitutionalSummaryStep({
  configuration,
  quote,
  details,
  onDetailsChange,
  onCheckout,
  pending,
  error,
}: {
  configuration: InstitutionalConfiguration;
  quote: InstitutionalMappedQuote | null;
  details: InstitutionalAccountDetails;
  onDetailsChange: (details: InstitutionalAccountDetails) => void;
  onCheckout: () => Promise<void>;
  pending: boolean;
  error: string | null;
}) {
  const update = (field: keyof InstitutionalAccountDetails, value: string) =>
    onDetailsChange({ ...details, [field]: value });
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onCheckout();
  };
  return (
    <section aria-labelledby="configurator-step-title" className="space-y-5">
      <div>
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold"
        >
          Review and account details
        </h2>
        <p className="mt-2 text-text-muted">
          Your selected price is checked again before Stripe checkout. Your
          workspace activates only after payment is confirmed.
        </p>
      </div>
      <dl className="grid gap-3 rounded-xl border border-border-subtle bg-surface p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">Plan</dt>
          <dd className="mt-1 font-semibold capitalize">
            {configuration.planCode
              .replace("INSTITUTIONAL_", "")
              .replace("_", " · ")
              .toLowerCase()}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Setting</dt>
          <dd className="mt-1 font-semibold">
            {configuration.setting?.replaceAll("_", " ").toLowerCase() ??
              "Not selected"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Enrolled pupils</dt>
          <dd className="mt-1 font-semibold">{configuration.countInput}</dd>
        </div>
        <div>
          <dt className="text-text-muted">Extra storage</dt>
          <dd className="mt-1 font-semibold">
            {configuration.storageChoice === "none"
              ? "None"
              : `${configuration.storageChoice === "1000" ? "1TB" : `${configuration.storageChoice}GB`}`}
          </dd>
        </div>
      </dl>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5"
      >
        <h3 className="font-heading text-lg font-bold">
          Organisation and contact
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Organisation name"
            name="organization"
            value={details.orgName}
            onChange={(value) => update("orgName", value)}
            disabled={pending}
            minLength={2}
          />
          <Field
            label="Contact name"
            name="name"
            value={details.contactName}
            onChange={(value) => update("contactName", value)}
            disabled={pending}
            minLength={2}
          />
          <Field
            label="Work email"
            name="email"
            type="email"
            value={details.contactEmail}
            onChange={(value) => update("contactEmail", value)}
            disabled={pending}
          />
          <Field
            label="Password"
            name="new-password"
            type="password"
            value={details.password}
            onChange={(value) => update("password", value)}
            disabled={pending}
            minLength={8}
          />
        </div>
        <p className="text-xs text-text-muted">
          Your password is sent only to the secure checkout request and is never
          saved in this browser.
        </p>
        {error ? (
          <p
            role="alert"
            className="rounded-lg bg-status-danger/10 p-3 text-sm text-status-danger"
          >
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={pending || quote?.kind !== "priced"}
          aria-busy={pending}
          className="rounded-lg bg-accent-primary px-5 py-3 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? "Opening Stripe…" : "Continue to secure payment"}
        </button>
      </form>
    </section>
  );
}

function Field({
  label,
  name,
  type = "text",
  value,
  onChange,
  disabled,
  minLength,
}: {
  label: string;
  name: string;
  type?: "text" | "email" | "password";
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
  minLength?: number;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="font-semibold">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete={name}
        required
        minLength={minLength}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        disabled={disabled}
        className="rounded-lg border border-border-subtle bg-surface px-3 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
      />
    </label>
  );
}
