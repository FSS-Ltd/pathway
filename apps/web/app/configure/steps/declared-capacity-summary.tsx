import type { FormEvent } from "react";
import Link from "next/link";
import type { DeclaredCapacityInterval } from "@pathway/pricing";
import type { InstitutionalVertical } from "@pathway/types";
import type { DeclaredCapacityEstimate } from "../../../lib/institutional-estimate-client";

type AccountDetails = {
  orgName: string;
  contactName: string;
  contactEmail: string;
  password: string;
};

function money(pence: number): string {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(pence / 100);
}

export function DeclaredCapacitySummaryStep({
  capacity,
  interval,
  setting,
  estimate,
  priceError,
  details,
  onDetailsChange,
  onCheckout,
  pending,
  error,
}: {
  capacity: number | null;
  interval: DeclaredCapacityInterval;
  setting: InstitutionalVertical | null;
  estimate: DeclaredCapacityEstimate | null;
  priceError: string | null;
  details: AccountDetails;
  onDetailsChange: (details: AccountDetails) => void;
  onCheckout: () => Promise<void>;
  pending: boolean;
  error: string | null;
}) {
  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void onCheckout();
  };
  const update = (field: keyof AccountDetails, value: string) =>
    onDetailsChange({ ...details, [field]: value });

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
          Your server-calculated total is checked again before secure payment.
          Trial selections remain pending until a billing admin activates them
          in the app.
        </p>
      </div>
      <dl className="grid gap-3 rounded-xl border border-border-subtle bg-surface p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">Declared capacity</dt>
          <dd className="mt-1 font-semibold">
            {capacity ?? "Not entered"} children
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Billing period</dt>
          <dd className="mt-1 font-semibold">
            {interval === "year" ? "Yearly, paid upfront" : "Monthly"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Setting</dt>
          <dd className="mt-1 font-semibold">
            {setting?.replaceAll("_", " ").toLowerCase() ?? "Not selected"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Selected free trials</dt>
          <dd className="mt-1 font-semibold">
            {estimate?.kind === "priced" && estimate.trialModules.length > 0
              ? estimate.trialModules.join(", ")
              : "None"}
          </dd>
        </div>
      </dl>
      {estimate?.kind === "contact_sales" ? (
        <div className="rounded-xl border border-accent-primary bg-accent-primary/5 p-5">
          <p className="font-semibold">
            251+ children needs a custom Enterprise quote.
          </p>
          <Link
            href={estimate.contactPath}
            className="mt-2 inline-block font-semibold text-accent-strong underline"
          >
            Contact Nexsteps about Enterprise
          </Link>
        </div>
      ) : (
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
            Password is sent only to secure checkout and is not saved in this
            browser. Free add-on trials do not start until activation and do not
            convert into paid access automatically.
          </p>
          {priceError ? (
            <p
              role="alert"
              className="rounded-lg bg-status-danger/10 p-3 text-sm text-status-danger"
            >
              {priceError}
            </p>
          ) : null}
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
            disabled={pending || estimate?.kind !== "priced"}
            aria-busy={pending}
            className="rounded-lg bg-accent-primary px-5 py-3 text-sm font-semibold text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {pending ? "Opening Stripe…" : "Continue to secure payment"}
          </button>
          {estimate?.kind === "priced" ? (
            <p className="text-sm font-semibold">
              {money(estimate.subtotalPence)}{" "}
              {interval === "year" ? "per year" : "per month"}
            </p>
          ) : null}
        </form>
      )}
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
