"use client";
import React from "react";
import type {
  TrackerChecklistItem,
  TrackerAttestationStatus,
} from "@pathway/types";
import { trackerClient } from "@/lib/tracker-client";
import {
  Action,
  Feedback,
  fieldClass,
  useAgreementRequest,
} from "../agreements/shared";
import { words } from "./profile-fields";
export function Confirmation({
  item,
  profileVersion,
  onChange,
}: {
  item: TrackerChecklistItem;
  profileVersion: number;
  onChange: (status: TrackerAttestationStatus) => void;
}) {
  const [complete, setComplete] = React.useState(item.completed);
  const [na, setNa] = React.useState(
    item.attestation?.status === "NOT_APPLICABLE" && !item.stale,
  );
  const [notes, setNotes] = React.useState(item.attestation?.notes ?? "");
  const [reason, setReason] = React.useState(
    item.attestation?.notApplicableReason ?? "",
  );
  const [due, setDue] = React.useState(
    item.attestation?.reviewDueAt?.slice(0, 10) ?? "",
  );
  const [revision, setRevision] = React.useState(
    item.attestation?.revision ?? 0,
  );
  const [acceptedProfile, setAcceptedProfile] = React.useState(profileVersion);
  const [latestProfile, setLatestProfile] = React.useState(profileVersion);
  const [latest, setLatest] = React.useState<TrackerChecklistItem | null>(null);
  const request = useAgreementRequest();
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        void request.run(async (signal) => {
          const saved = await trackerClient.attest(
            {
              requirementId: item.requirement.id,
              requirementVersion: item.requirement.version,
              profileVersion: acceptedProfile,
              expectedRevision: revision,
              status: na
                ? "NOT_APPLICABLE"
                : complete
                  ? "COMPLETE"
                  : "NOT_STARTED",
              notes,
              notApplicableReason: na ? reason : null,
              reviewDueAt: due || null,
            },
            signal,
          );
          if (!signal.aborted) {
            setRevision(saved.revision);
            onChange(saved.status);
          }
        }, "Manual confirmation saved.");
      }}
    >
      <fieldset
        className="min-w-0 space-y-3"
        disabled={request.busy || item.applicability !== "APPLICABLE"}
      >
        <legend className="max-w-full whitespace-normal font-semibold">
          Manual confirmation
        </legend>
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 h-5 w-5 shrink-0"
            checked={complete}
            disabled={na}
            onChange={(e) => setComplete(e.target.checked)}
          />
          <span>I confirm this action is completed.</span>
        </label>
        {item.requirement.allowsNotApplicable && (
          <>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 h-5 w-5 shrink-0"
                checked={na}
                onChange={(e) => {
                  setNa(e.target.checked);
                  if (e.target.checked) setComplete(false);
                }}
              />
              <span>Record a permitted not applicable decision</span>
            </label>
            {na && (
              <>
                <p className="text-sm text-text-muted">
                  Explain which permitted exception applies. Check with your
                  local authority or relevant regulator before skipping this
                  action.
                </p>
                <label className="block">
                  Not applicable reason
                  <textarea
                    className={fieldClass}
                    required
                    maxLength={2000}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </label>
              </>
            )}
          </>
        )}
        <label className="block">
          Confirmation notes
          <textarea
            className={fieldClass}
            maxLength={5000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </label>
        <label className="block">
          Review due date (optional)
          <input
            type="date"
            className={fieldClass}
            value={due}
            onChange={(e) => setDue(e.target.value)}
          />
        </label>
        <Action type="submit">Save confirmation</Action>
      </fieldset>
      <Feedback {...request} />
      {request.error && (
        <Action
          type="button"
          variant="secondary"
          disabled={request.busy}
          onClick={() =>
            void request.run(async (signal) => {
              const current = await trackerClient.checklist(signal);
              const found = current.items.find(
                (row) => row.requirement.id === item.requirement.id,
              );
              if (!signal.aborted) {
                if (!found)
                  throw new Error(
                    "This requirement is no longer current. Your draft remains visible; refresh the tracker before continuing.",
                  );
                setLatest(found);
                setLatestProfile(current.profile?.version ?? 0);
              }
            })
          }
        >
          Compare latest confirmation
        </Action>
      )}
      {latest && (
        <section className="space-y-2">
          <p>
            Latest profile revision: {latestProfile}. Latest status:{" "}
            {words(latest.attestation?.status ?? "NOT_STARTED")}.{" "}
            {latest.requirement.version !== item.requirement.version
              ? "The requirement changed; refresh the tracker and review the new action before confirming."
              : "Review the saved notes below before retrying your draft."}
          </p>
          <p className="whitespace-pre-wrap break-words">
            {latest.attestation?.notes || "No notes"}
          </p>
          {latest.requirement.version === item.requirement.version && (
            <Action
              type="button"
              onClick={() => {
                setRevision(latest.attestation?.revision ?? 0);
                setAcceptedProfile(latestProfile);
                setLatest(null);
              }}
            >
              Keep my draft against this revision
            </Action>
          )}
        </section>
      )}
    </form>
  );
}
