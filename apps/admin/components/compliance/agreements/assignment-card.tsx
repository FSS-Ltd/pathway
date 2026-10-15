"use client";
import React from "react";
import type { AgreementAssignment } from "@pathway/types";
import {
  agreementsClient,
  downloadAgreement,
  readAgreementPdf,
} from "@/lib/agreements-client";
import { Action, Feedback, fieldClass, useAgreementRequest } from "./shared";
export function AssignmentCard({
  value,
  own,
  canManage,
  onChange,
}: {
  value: AgreementAssignment;
  own: boolean;
  canManage: boolean;
  onChange: (value: AgreementAssignment) => void;
}) {
  const request = useAgreementRequest();
  const [name, setName] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [signedOn, setSignedOn] = React.useState("");
  const [file, setFile] = React.useState<File | null>(null);
  const active = !value.supersededAt && !value.acceptance;
  return (
    <article className="space-y-4 rounded-xl border border-border-subtle bg-surface p-4 sm:p-5">
      <header>
        <h3 className="break-words font-semibold">
          {value.version.title} · Version {value.version.version}
        </h3>
        <p className="text-sm text-text-muted">
          {own ? "Assigned to you" : value.recipientName} · Assigned{" "}
          {new Date(value.assignedAt).toLocaleDateString()}
        </p>
      </header>
      <p className="text-sm font-medium">
        {value.supersededAt
          ? "Historical version"
          : value.acceptance
            ? "Accepted"
            : "Awaiting response"}
      </p>
      <details>
        <summary className="min-h-11 cursor-pointer py-3 font-medium">
          Read this version
        </summary>
        <div className="whitespace-pre-wrap break-words py-3">
          {value.version.contentText}
        </div>
      </details>
      {value.version.hasOriginalFile && (
        <Action
          variant="secondary"
          disabled={request.busy}
          onClick={() =>
            void request.run((signal) =>
              downloadAgreement(
                `/versions/${encodeURIComponent(value.version.id)}/file`,
                signal,
              ),
            )
          }
        >
          Download original PDF
        </Action>
      )}
      {value.acceptance && (
        <div className="space-y-2 text-sm">
          <p>
            {value.acceptance.method === "ACKNOWLEDGED"
              ? "Acknowledged in the portal"
              : "Signed copy recorded by an administrator"}{" "}
            as {value.acceptance.typedName} on{" "}
            {new Date(value.acceptance.recordedAt).toLocaleDateString()}.
          </p>
          {value.acceptance.signedOn && (
            <p>Signed on {value.acceptance.signedOn}.</p>
          )}
          {value.acceptance.hasSignedCopy && (
            <Action
              variant="secondary"
              disabled={request.busy}
              onClick={() =>
                void request.run((signal) =>
                  downloadAgreement(
                    `/assignments/${encodeURIComponent(value.id)}/signed-copy`,
                    signal,
                  ),
                )
              }
            >
              Download signed copy
            </Action>
          )}
        </div>
      )}
      {value.supersededAt && (
        <p className="text-sm text-text-muted">
          A newer version has been published. This record remains in your
          history.
        </p>
      )}
      {active && (own || canManage) && (
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            void request.run(
              async (signal) => {
                let next: AgreementAssignment;
                if (own) {
                  next = await agreementsClient.acknowledge(
                    value,
                    name.trim(),
                    signal,
                  );
                } else {
                  if (!file)
                    throw new Error("Choose the signed PDF before saving.");
                  next = await agreementsClient.signedCopy(
                    value,
                    name.trim(),
                    signedOn,
                    await readAgreementPdf(file),
                    signal,
                  );
                }
                if (!signal.aborted) onChange(next);
              },
              own ? "Acknowledgement recorded." : "Signed copy recorded.",
            );
          }}
        >
          <fieldset disabled={request.busy} className="min-w-0 space-y-4">
            <legend className="max-w-full whitespace-normal break-words font-medium">
              {own ? "Acknowledge this version" : "Record a signed copy"}
            </legend>
            <label className="block">
              {own ? "Your full name" : "Signatory’s full name"}
              <input
                required
                maxLength={200}
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
              />
            </label>
            {own ? (
              <label className="flex min-h-11 items-start gap-3 py-2">
                <input
                  className="mt-1 h-5 w-5 shrink-0"
                  type="checkbox"
                  required
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                <span>
                  I have read and acknowledge version {value.version.version} of
                  this agreement.
                </span>
              </label>
            ) : (
              <>
                <label className="block">
                  Signing date
                  <input
                    type="date"
                    required
                    value={signedOn}
                    onChange={(e) => setSignedOn(e.target.value)}
                    className={fieldClass}
                  />
                </label>
                <label className="block">
                  Signed PDF (maximum 2 MiB)
                  <input
                    type="file"
                    accept=".pdf,application/pdf"
                    required
                    onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                    className={fieldClass}
                  />
                </label>
                <p className="text-sm text-text-muted">
                  This records an existing signed copy; it is not a portal
                  acknowledgement by the recipient.
                </p>
              </>
            )}
            <Action
              type="submit"
              disabled={!name.trim() || (own ? !confirmed : !file || !signedOn)}
            >
              {own ? "Record acknowledgement" : "Record signed copy"}
            </Action>
          </fieldset>
        </form>
      )}
      <Feedback {...request} />
    </article>
  );
}
