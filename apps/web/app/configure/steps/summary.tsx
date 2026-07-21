import { VERTICAL_LABELS, type Vertical } from "@pathway/types";
import { PLANS } from "@pathway/pricing";
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
};

export function SummaryStep({
  vertical,
  selectedModules,
  planCode,
  frequency,
  storageChoice,
  accountDetails,
  onAccountDetailsChange,
}: SummaryStepProps) {
  const updateField = (field: keyof AccountDetails, value: string) =>
    onAccountDetailsChange({ ...accountDetails, [field]: value });
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
      <div className="space-y-4 rounded-xl border border-border-subtle bg-surface p-5">
        <h3 className="font-heading text-lg font-bold text-text-primary">
          Organisation and contact
        </h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Organisation name"
            value={accountDetails.organisationName}
            onChange={(value) => updateField("organisationName", value)}
          />
          <Field
            label="Contact name"
            value={accountDetails.contactName}
            onChange={(value) => updateField("contactName", value)}
          />
          <Field
            label="Work email"
            type="email"
            value={accountDetails.workEmail}
            onChange={(value) => updateField("workEmail", value)}
          />
          <Field
            label="Password"
            type="password"
            value={accountDetails.password}
            helper="Minimum 8 characters. You'll use this to log into Nexsteps."
            onChange={(value) => updateField("password", value)}
          />
        </div>
      </div>
    </section>
  );
}

type FieldProps = {
  label: string;
  value: string;
  type?: "text" | "email" | "password";
  helper?: string;
  onChange: (value: string) => void;
};

function Field({ label, value, type = "text", helper, onChange }: FieldProps) {
  const id = label.toLowerCase().replaceAll(" ", "-");
  return (
    <label htmlFor={id} className="flex flex-col gap-1 text-sm">
      <span className="font-medium text-text-primary">{label}</span>
      <input
        id={id}
        type={type}
        required
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-md border border-border-subtle bg-surface px-3 py-2 text-text-primary"
      />
      {helper ? (
        <span className="text-xs text-text-muted">{helper}</span>
      ) : null}
    </label>
  );
}
