"use client";

import * as React from "react";
import { Card, Button } from "@pathway/ui";
import {
  fetchChildRegistration,
  type AdminChildRegistration,
} from "../../lib/api-client";

function ReadField({
  label,
  value,
}: {
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-semibold uppercase tracking-wide text-text-muted">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm text-text-primary">
        {value || "Not provided"}
      </dd>
    </div>
  );
}

function ContactList({
  title,
  contacts,
}: {
  title: string;
  contacts: AdminChildRegistration["snapshot"]["emergencyContacts"];
}) {
  return (
    <section>
      <h3 className="text-sm font-semibold text-text-primary">{title}</h3>
      {contacts.length ? (
        <ul className="mt-2 grid gap-2 sm:grid-cols-2">
          {contacts.map((contact, index) => (
            <li
              key={`${contact.name}-${index}`}
              className="rounded-lg border border-border-subtle p-3 text-sm text-text-primary"
            >
              <strong className="block break-words">{contact.name}</strong>
              <span className="block break-words text-text-muted">
                {contact.relationship || "Relationship not provided"} ·{" "}
                {contact.phone}
              </span>
              {contact.secondaryPhone ? (
                <span className="block break-words text-text-muted">
                  Second phone: {contact.secondaryPhone}
                </span>
              ) : null}
              {contact.email ? (
                <span className="block break-words text-text-muted">
                  {contact.email}
                </span>
              ) : null}
              {contact.canPickUp ? (
                <span className="block text-text-muted">Authorised pickup</span>
              ) : null}
              {contact.identificationNote ? (
                <span className="block break-words text-text-muted">
                  Identification: {contact.identificationNote}
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-sm text-text-muted">None recorded.</p>
      )}
    </section>
  );
}

const careLabels: ReadonlyArray<
  [
    Exclude<keyof AdminChildRegistration["snapshot"]["care"], "photoConsent">,
    string,
  ]
> = [
  ["homeLanguage", "Home language"],
  ["medicalConditions", "Medical conditions"],
  ["medicationAtCentre", "Medication during sessions"],
  ["dietaryRestrictions", "Dietary restrictions"],
  ["learningSupport", "Learning support"],
  ["interestsStrengths", "Interests and strengths"],
  ["settlingComfortNotes", "Settling and comfort"],
  ["allergies", "Allergies"],
  ["additionalNeedsNotes", "Additional needs"],
  ["gpName", "GP"],
  ["gpPhone", "GP phone"],
  ["schoolName", "School or nursery"],
  ["yearGroup", "Year group"],
  ["specialNeedsType", "Special needs"],
  ["specialNeedsOther", "Special needs detail"],
  ["pickupPermissions", "Pickup instructions"],
];

export function ChildRegistrationSection({
  childId,
  isAceSchool,
}: {
  childId: string;
  isAceSchool: boolean;
}) {
  const [state, setState] = React.useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [record, setRecord] = React.useState<AdminChildRegistration | null>(
    null,
  );
  const [error, setError] = React.useState("");
  const load = React.useCallback(async () => {
    setState("loading");
    try {
      setRecord(await fetchChildRegistration(childId));
      setState("ready");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load registration.",
      );
      setState("error");
    }
  }, [childId]);
  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card id="registration" className="space-y-5 p-6">
      <div>
        <h2 className="text-lg font-bold text-text-primary">
          Submitted registration
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          The information supplied at registration. Current profile details may
          have changed since submission.
        </p>
      </div>
      {state === "loading" ? (
        <p role="status" className="text-sm text-text-muted">
          Loading registration…
        </p>
      ) : null}
      {state === "error" ? (
        <div>
          <p role="alert" className="text-sm text-status-danger">
            {error}
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={() => void load()}
          >
            Retry
          </Button>
        </div>
      ) : null}
      {state === "ready" && !record ? (
        <p className="rounded-lg border border-border-subtle bg-surface-alt p-4 text-sm text-text-muted">
          No submitted registration is on file for this child.
        </p>
      ) : null}
      {state === "ready" && record ? (
        <div className="space-y-6">
          <p className="text-xs text-text-muted">
            Submitted {new Date(record.submittedAt).toLocaleString()} · Form
            version {record.formVersion}
          </p>
          <dl className="grid gap-4 sm:grid-cols-2">
            <ReadField
              label="Home address"
              value={record.snapshot.household.homeAddress}
            />
            <ReadField label="Guardian" value={record.snapshot.guardian.name} />
            <ReadField
              label="Guardian email"
              value={record.snapshot.guardian.email}
            />
            <ReadField
              label="Guardian phone"
              value={record.snapshot.guardian.phone}
            />
            <ReadField
              label="Guardian relationship"
              value={record.snapshot.guardian.relationship}
            />
            {isAceSchool ? (
              <ReadField
                label="ACE registration level"
                value={record.snapshot.registrationLevel}
              />
            ) : null}
          </dl>
          <div className="grid gap-5 lg:grid-cols-2">
            <ContactList
              title="Emergency contacts"
              contacts={record.snapshot.emergencyContacts}
            />
            <ContactList
              title="Authorised pickup"
              contacts={record.snapshot.pickupContacts}
            />
          </div>
          <section>
            <h3 className="text-sm font-semibold text-text-primary">
              Care and support
            </h3>
            <dl className="mt-3 grid gap-4 sm:grid-cols-2">
              {careLabels.map(([key, label]) => (
                <ReadField
                  key={key}
                  label={label}
                  value={record.snapshot.care[key]}
                />
              ))}
              <ReadField
                label="Profile photo consent"
                value={record.snapshot.care.photoConsent ? "Yes" : "No"}
              />
            </dl>
          </section>
          <section>
            <h3 className="text-sm font-semibold text-text-primary">
              Consent decisions
            </h3>
            {Object.entries(record.snapshot.consents).length ? (
              <dl className="mt-3 space-y-3">
                {Object.entries(record.snapshot.consents).map(
                  ([key, decision]) => (
                    <div
                      key={key}
                      className="rounded-lg border border-border-subtle p-3"
                    >
                      <dt className="text-sm text-text-primary">
                        {decision.wording}
                      </dt>
                      <dd className="mt-1 text-xs text-text-muted">
                        {decision.granted ? "Agreed" : "Declined"} · Initials:{" "}
                        {decision.initials || "Not recorded"}
                      </dd>
                    </div>
                  ),
                )}
              </dl>
            ) : (
              <p className="mt-2 text-sm text-text-muted">
                No consent decisions recorded.
              </p>
            )}
          </section>
        </div>
      ) : null}
    </Card>
  );
}
