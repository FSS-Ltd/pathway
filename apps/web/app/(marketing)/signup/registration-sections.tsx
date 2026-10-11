import type {
  PublicSignupConfig,
  RegistrationConsentKey,
} from "../../../lib/public-signup-client";

export type ConsentDecision = { granted: boolean; initials: string };
export type ConsentDecisions = Record<RegistrationConsentKey, ConsentDecision>;
export const consentKeys: RegistrationConsentKey[] = [
  "contact",
  "emergencyMedical",
  "localActivities",
  "photoVideo",
  "accuracy",
  "dataProcessing",
  "firstAid",
];
export function emptyConsentDecisions(): ConsentDecisions {
  return {
    contact: { granted: false, initials: "" },
    emergencyMedical: { granted: false, initials: "" },
    localActivities: { granted: false, initials: "" },
    photoVideo: { granted: false, initials: "" },
    accuracy: { granted: false, initials: "" },
    dataProcessing: { granted: false, initials: "" },
    firstAid: { granted: false, initials: "" },
  };
}

const inputClass =
  "mt-1 w-full rounded-md border border-pw-border bg-white px-3 py-2 text-pw-text";

export type PickupEntry = {
  id: string;
  name: string;
  phone: string;
  relationship: string;
  identificationNote: string;
};

export function HouseholdSection({
  address,
  onAddressChange,
}: {
  address: string;
  onAddressChange: (value: string) => void;
}) {
  return (
    <section className="rounded-xl border border-pw-border bg-white p-6">
      <h2 className="text-lg font-semibold text-pw-text">Household</h2>
      <label
        htmlFor="registration-home-address"
        className="mt-4 block text-sm font-medium text-pw-text"
      >
        Home address *
      </label>
      <textarea
        id="registration-home-address"
        required
        maxLength={500}
        rows={3}
        value={address}
        onChange={(event) => onAddressChange(event.target.value)}
        className={inputClass}
      />
    </section>
  );
}

export function PickupSection({
  contacts,
  onAdd,
  onRemove,
  onChange,
}: {
  contacts: PickupEntry[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  onChange: (id: string, changes: Partial<PickupEntry>) => void;
}) {
  return (
    <section className="rounded-xl border border-pw-border bg-white p-6">
      <h2 className="text-lg font-semibold text-pw-text">Authorised pickup</h2>
      <p className="mt-1 text-sm text-pw-text-muted">
        Add people allowed to collect a child. Emergency contacts can also be
        marked for pickup.
      </p>
      <div className="mt-4 space-y-4">
        {contacts.map((contact, index) => (
          <fieldset
            key={contact.id}
            className="grid gap-4 rounded-lg border border-pw-border p-4 sm:grid-cols-2"
          >
            <legend className="px-1 text-sm font-semibold text-pw-text">
              Pickup contact {index + 1}
            </legend>
            {(
              [
                ["name", "Full name", "text"],
                ["phone", "Phone", "tel"],
                ["relationship", "Relationship", "text"],
                ["identificationNote", "Identification note", "text"],
              ] as const
            ).map(([field, label, type]) => (
              <label key={field} className="text-sm font-medium text-pw-text">
                {label}
                {field === "name" || field === "phone" ? " *" : ""}
                <input
                  type={type}
                  required={field === "name" || field === "phone"}
                  maxLength={
                    field === "identificationNote"
                      ? 200
                      : field === "phone"
                        ? 50
                        : 200
                  }
                  value={contact[field]}
                  onChange={(event) =>
                    onChange(contact.id, { [field]: event.target.value })
                  }
                  className={inputClass}
                />
              </label>
            ))}
            <button
              type="button"
              onClick={() => onRemove(contact.id)}
              className="rounded-md border border-pw-border px-3 py-2 text-sm text-pw-text-muted hover:bg-muted sm:col-span-2"
            >
              Remove pickup contact
            </button>
          </fieldset>
        ))}
      </div>
      <button
        type="button"
        onClick={onAdd}
        className="mt-4 rounded-md border border-pw-border bg-white px-4 py-2 text-sm text-pw-text hover:bg-muted"
      >
        Add pickup contact
      </button>
    </section>
  );
}

const careFields = [
  ["homeLanguage", "Home language", 100],
  ["medicalConditions", "Medical conditions", 500],
  ["medicationAtCentre", "Medication during sessions", 500],
  ["dietaryRestrictions", "Dietary restrictions", 500],
  ["learningSupport", "Learning support", 500],
  ["interestsStrengths", "Interests and strengths", 500],
  ["settlingComfortNotes", "Settling and comfort notes", 500],
] as const;
export type CareField = (typeof careFields)[number][0];

export function ChildCareFields({
  child,
  onChange,
  aceRegistrationLevels,
}: {
  child: Record<CareField | "registrationLevel", string>;
  onChange: (
    changes: Partial<Record<CareField | "registrationLevel", string>>,
  ) => void;
  aceRegistrationLevels?: readonly string[];
}) {
  return (
    <>
      {aceRegistrationLevels ? (
        <label className="text-sm font-medium text-pw-text">
          ACE registration level *
          <select
            required
            value={child.registrationLevel}
            onChange={(event) =>
              onChange({ registrationLevel: event.target.value })
            }
            className={inputClass}
          >
            <option value="">Select level</option>
            {aceRegistrationLevels.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {careFields.map(([field, label, maxLength]) => (
        <label
          key={field}
          className="text-sm font-medium text-pw-text sm:col-span-2"
        >
          {label}
          <textarea
            rows={field === "homeLanguage" ? 1 : 2}
            maxLength={maxLength}
            value={child[field]}
            onChange={(event) => onChange({ [field]: event.target.value })}
            className={inputClass}
          />
        </label>
      ))}
    </>
  );
}

export function RegistrationConsents({
  config,
  decisions,
  onChange,
}: {
  config: PublicSignupConfig;
  decisions: ConsentDecisions;
  onChange: (key: RegistrationConsentKey, decision: ConsentDecision) => void;
}) {
  return (
    <section className="rounded-xl border border-pw-border bg-white p-6">
      <h2 className="text-lg font-semibold text-pw-text">
        Permissions and consents
      </h2>
      <p className="mt-1 text-sm text-pw-text-muted">
        Record a choice and initials for each statement. Wording version{" "}
        {config.formVersion}.
      </p>
      <div className="mt-4 space-y-4">
        {consentKeys.map((key) => {
          const decision = decisions[key];
          const required = key === "accuracy" || key === "dataProcessing";
          return (
            <fieldset
              key={key}
              className="rounded-lg border border-pw-border p-4"
            >
              <legend className="px-1 text-sm font-semibold text-pw-text">
                {key === "dataProcessing"
                  ? "Data processing"
                  : key === "emergencyMedical"
                    ? "Emergency medical"
                    : key === "localActivities"
                      ? "Local activities"
                      : key === "photoVideo"
                        ? "Photos and video"
                        : key === "firstAid"
                          ? "First aid"
                          : key === "accuracy"
                            ? "Accuracy"
                            : "Contact"}
              </legend>
              <p className="text-sm text-pw-text">
                {config.consentWording[key]}
              </p>
              <label className="mt-3 flex items-center gap-2 text-sm text-pw-text">
                <input
                  type="checkbox"
                  required={required}
                  checked={decision.granted}
                  onChange={(event) =>
                    onChange(key, {
                      ...decision,
                      granted: event.target.checked,
                    })
                  }
                />
                I agree{required ? " *" : ""}
              </label>
              <label className="mt-3 block text-sm font-medium text-pw-text">
                Initials for this decision *
                <input
                  type="text"
                  required
                  maxLength={12}
                  value={decision.initials}
                  onChange={(event) =>
                    onChange(key, { ...decision, initials: event.target.value })
                  }
                  className={`${inputClass} max-w-40`}
                />
              </label>
            </fieldset>
          );
        })}
      </div>
    </section>
  );
}
