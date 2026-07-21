import { type FormEvent, useState } from "react";
import { VERTICAL_LABELS, type Vertical } from "@pathway/types";
import { PLANS } from "@pathway/pricing";
import { isValidWorkEmail } from "../../../lib/configurator-checkout";
import {
  MODULE_CATALOG,
  type StorageChoice,
  type WebModule,
} from "../../../lib/module-catalog";
import type { PlanCode } from "../../../lib/buy-now-pricing";

export type AccountDetails = {
  organisationName: string;
  contactName: string;
  workEmail: string;
  password: string;
};

type SummaryStepProps = {
  vertical: Vertical;
  selectedModules: WebModule[];
  planCode: PlanCode;
  frequency: "monthly" | "yearly";
  storageChoice: StorageChoice;
  accountDetails: AccountDetails;
  onAccountDetailsChange: (details: AccountDetails) => void;
  onCheckout: () => Promise<void>;
  isCheckoutPending: boolean;
  checkoutError: string | null;
};

export function SummaryStep({
  vertical,
  selectedModules,
  planCode,
  frequency,
  storageChoice,
  accountDetails,
  onAccountDetailsChange,
  onCheckout,
  isCheckoutPending,
  checkoutError,
}: SummaryStepProps) {
  const [validationError, setValidationError] = useState<string | null>(null);
  const updateField = (field: keyof AccountDetails, value: string) =>
    onAccountDetailsChange({ ...accountDetails, [field]: value });
  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (
      !accountDetails.organisationName.trim() ||
      !accountDetails.contactName.trim() ||
      !accountDetails.workEmail.trim() ||
      !accountDetails.password
    ) {
      setValidationError(
        "Please complete all organisation and contact details, including password.",
      );
      return;
    }
    if (accountDetails.password.length < 8) {
      setValidationError("Password must be at least 8 characters long.");
      return;
    }
    if (!isValidWorkEmail(accountDetails.workEmail)) {
      setValidationError("Enter a valid work email address.");
      return;
    }

    setValidationError(null);
    await onCheckout();
  };
  const errorMessage = validationError ?? checkoutError;
  const storageLabel =
    storageChoice === "none"
      ? "No extra storage"
      : `${storageChoice === "1000" ? "1TB" : `${storageChoice}GB`} extra storage`;

  return (
    <section aria-labelledby="configurator-step-title" className="space-y-6">
      <div className="space-y-2">
        <h2
          id="configurator-step-title"
          className="font-heading text-2xl font-bold text-text-primary"
        >
          Review your configuration
        </h2>
        <p className="text-text-muted">
          Check your choices and add the details we need for your Pathway
          workspace.
        </p>
      </div>
      <dl className="grid gap-3 rounded-xl border border-border-subtle bg-surface p-5 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-text-muted">Setting</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {VERTICAL_LABELS[vertical]}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Plan</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {PLANS[planCode].displayName} · {frequency}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Modules</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {selectedModules.length
              ? selectedModules
                  .map((module) => MODULE_CATALOG[module].label)
                  .join(", ")
              : "None selected"}
          </dd>
        </div>
        <div>
          <dt className="text-text-muted">Storage</dt>
          <dd className="mt-1 font-semibold text-text-primary">
            {storageLabel}
          </dd>
        </div>
      </dl>
      <form
        onSubmit={handleSubmit}
        className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5"
      >
        <h3 className="font-heading text-lg font-bold text-text-primary">
          Organisation and contact
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Organisation name"
            value={accountDetails.organisationName}
            disabled={isCheckoutPending}
            onChange={(value) => updateField("organisationName", value)}
          />
          <Field
            label="Contact name"
            value={accountDetails.contactName}
            disabled={isCheckoutPending}
            onChange={(value) => updateField("contactName", value)}
          />
          <Field
            label="Work email"
            type="email"
            value={accountDetails.workEmail}
            disabled={isCheckoutPending}
            onChange={(value) => updateField("workEmail", value)}
          />
          <Field
            label="Password"
            type="password"
            value={accountDetails.password}
            helper="Minimum 8 characters. You'll use this to log into Nexsteps."
            disabled={isCheckoutPending}
            onChange={(value) => updateField("password", value)}
          />
        </div>
        {errorMessage ? (
          <p
            role="alert"
            className="rounded-md bg-status-danger/10 px-3 py-2 text-sm text-status-danger"
          >
            {errorMessage}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={isCheckoutPending}
          aria-busy={isCheckoutPending}
          className="rounded-md bg-accent-primary px-5 py-3 text-sm font-semibold text-white transition hover:bg-accent-strong disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isCheckoutPending ? "Starting checkout…" : "Continue to checkout"}
        </button>
      </form>
    </section>
  );
}

type FieldProps = {
  label: string;
  value: string;
  type?: "text" | "email" | "password";
  helper?: string;
  disabled: boolean;
  onChange: (value: string) => void;
};

function Field({
  label,
  value,
  type = "text",
  helper,
  disabled,
  onChange,
}: FieldProps) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-text-primary">{label}</span>
      <input
        id={id}
        type={type}
        required
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-border-subtle bg-surface px-3 py-2 text-text-primary"
      />
      {helper ? (
        <span className="text-xs text-text-muted">{helper}</span>
      ) : null}
    </label>
  );
}
