"use client";
import React from "react";
import type { TrackerProfile, TrackerJurisdiction } from "@pathway/types";
import { trackerClient } from "@/lib/tracker-client";
import { Action, Feedback, useAgreementRequest } from "../agreements/shared";
import { emptyProfile, ProfileFields, words } from "./profile-fields";
const profileLabels: Record<string, string> = {
  jurisdictionId: "Operating jurisdiction",
  localAuthority: "Local authority",
  providerCategory: "Actual provider category",
  fundingStatus: "Funding status",
  minimumAge: "Minimum age",
  maximumAge: "Maximum age",
  provisionPattern: "Provision pattern",
  ace: "ACE participation",
  icce: "Offers ICCE qualifications",
};
function profileValue(
  key: string,
  value: string | number | boolean | null,
  jurisdictions: TrackerJurisdiction[],
): string {
  if (value === null) return "Unknown";
  if (key === "jurisdictionId")
    return (
      jurisdictions.find((item) => item.id === value)?.name ??
      "Unavailable jurisdiction"
    );
  if (typeof value === "boolean") return value ? "Yes" : "No";
  return typeof value === "string" &&
    key !== "region" &&
    key !== "localAuthority"
    ? words(value)
    : String(value);
}
export function ProfileEditor({
  initial,
  jurisdictions,
  canManage,
  onSaved,
}: {
  initial: TrackerProfile | null;
  jurisdictions: TrackerJurisdiction[];
  canManage: boolean;
  onSaved: () => void;
}) {
  const [draft, setDraft] = React.useState(initial?.profile ?? emptyProfile);
  const [version, setVersion] = React.useState(initial?.version ?? 0);
  const [latest, setLatest] = React.useState<TrackerProfile | null>(null);
  const request = useAgreementRequest();
  React.useEffect(() => {
    if (!canManage) {
      setDraft(initial?.profile ?? emptyProfile);
      setVersion(initial?.version ?? 0);
    }
  }, [canManage, initial]);
  return (
    <details
      className="rounded-xl border border-border-subtle bg-surface p-4"
      open={!initial}
    >
      <summary className="cursor-pointer font-semibold">
        Site compliance profile{" "}
        {initial ? `· revision ${initial.version}` : "· not yet saved"}
      </summary>
      <form
        className="mt-4 space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void request.run(async (signal) => {
            if (
              draft.minimumAge !== null &&
              draft.maximumAge !== null &&
              draft.minimumAge > draft.maximumAge
            )
              throw new Error("Minimum age must not exceed maximum age.");
            const saved = await trackerClient.saveProfile(
              draft,
              version,
              signal,
            );
            if (!signal.aborted) {
              setVersion(saved.version);
              setLatest(null);
              onSaved();
            }
          }, "Profile saved. Changed details require renewed confirmations.");
        }}
      >
        <fieldset disabled={!canManage || request.busy} className="min-w-0">
          <legend className="mb-3 max-w-full whitespace-normal text-sm text-text-muted">
            Record actual provision. Leave unknown facts unset.
          </legend>
          <ProfileFields
            value={draft}
            setValue={setDraft}
            jurisdictions={jurisdictions}
          />
        </fieldset>
        <Feedback {...request} />
        {canManage && (
          <Action type="submit" disabled={request.busy}>
            Save profile
          </Action>
        )}
        {request.error && (
          <Action
            type="button"
            variant="secondary"
            disabled={request.busy}
            onClick={() =>
              void request.run(async (signal) => {
                const current = await trackerClient.profile(signal);
                if (!signal.aborted) setLatest(current);
              })
            }
          >
            Compare latest profile
          </Action>
        )}
        {latest && (
          <section className="space-y-3">
            <p>
              Latest saved revision: {latest.version}. Your draft is still
              above. Review these values before retrying.
            </p>
            <dl className="grid gap-2 sm:grid-cols-2">
              {Object.entries(latest.profile).map(([key, value]) => (
                <div key={key} className="min-w-0">
                  <dt className="font-medium">
                    {profileLabels[key] ?? words(key)}
                  </dt>
                  <dd className="break-words">
                    {profileValue(key, value, jurisdictions)}
                  </dd>
                </div>
              ))}
            </dl>
            <Action
              type="button"
              onClick={() => {
                setVersion(latest.version);
                setLatest(null);
              }}
            >
              Keep my draft against this revision
            </Action>
          </section>
        )}
        {!canManage && <p>You have read-only access to this profile.</p>}
      </form>
    </details>
  );
}
