"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  fetchStaffSlip,
  fetchStaffSlipResponses,
  publishSlip,
  type SlipResponseSummary,
  type StaffSlipDetail,
} from "@/lib/ace-trip-slips-api";
import { requestFailure } from "@/lib/request-error";
import { ResponseSummary } from "./trip-slip-response-summary";

type Witness = { id: string; name: string };
type SlipVersion = StaffSlipDetail["versions"][number];

function changedFields(current: SlipVersion, previous: SlipVersion): string[] {
  const now = current.contentSnapshot;
  const before = previous.contentSnapshot;
  const fields: Array<[string, unknown, unknown]> = [
    ["Title", now.title, before.title],
    ["Description", now.description, before.description],
    ["Destination", now.destination, before.destination],
    ["Start date", now.startsAt, before.startsAt],
    ["End date", now.endsAt, before.endsAt],
    ["Consent wording", now.consentText, before.consentText],
    ["Response deadline", now.deadlineAt, before.deadlineAt],
    ["Questions", now.questions, before.questions],
    ["Audience", now.recipientChildIds, before.recipientChildIds],
  ];
  return fields
    .filter(
      ([, currentValue, previousValue]) =>
        JSON.stringify(currentValue) !== JSON.stringify(previousValue),
    )
    .map(([label]) => label);
}

export function TripSlipStaffDetail({
  siteId,
  slipId,
  canManage,
  publicationEnabled,
  witnesses,
  onClose,
}: {
  siteId: string;
  slipId: string;
  canManage: boolean;
  publicationEnabled: boolean;
  witnesses: Witness[];
  onClose: () => void;
}) {
  const [detail, setDetail] = React.useState<StaffSlipDetail | null>(null);
  const [summary, setSummary] = React.useState<SlipResponseSummary | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [confirmPublish, setConfirmPublish] = React.useState(false);
  const [pending, setPending] = React.useState(false);
  const [revision, setRevision] = React.useState(0);
  const heading = React.useRef<HTMLHeadingElement>(null);

  React.useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void fetchStaffSlip(siteId, slipId, controller.signal)
      .then(async (slip) => {
        if (controller.signal.aborted) return;
        setDetail(slip);
        const current = slip.versions[0];
        setSummary(
          current?.publishedAt
            ? await fetchStaffSlipResponses(siteId, slipId, controller.signal)
            : null,
        );
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted)
          setError(requestFailure(cause, "Unable to load this slip.").message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [siteId, slipId, revision]);

  async function publish() {
    const current = detail?.versions[0];
    if (!current || pending) return;
    setPending(true);
    setError(null);
    try {
      await publishSlip(siteId, slipId, current.id);
      setConfirmPublish(false);
      setSuccess("Permission slip published for its selected pupils.");
      setRevision((value) => value + 1);
      heading.current?.focus();
    } catch (cause) {
      setError(
        requestFailure(cause, "The slip could not be published.").message,
      );
    } finally {
      setPending(false);
    }
  }

  const current = detail?.versions[0];
  const previous = detail?.versions[1];
  return (
    <section
      className="min-w-0 space-y-4"
      aria-labelledby="trip-slip-detail-heading"
    >
      <Button
        type="button"
        variant="outline"
        onClick={onClose}
        className="min-h-11"
      >
        Back to trips
      </Button>
      <h2
        ref={heading}
        id="trip-slip-detail-heading"
        tabIndex={-1}
        className="font-heading text-2xl font-semibold text-text-primary focus:outline-none"
      >
        {current?.contentSnapshot.title ?? "Permission slip"}
      </h2>
      {loading ? (
        <Card>
          <p role="status">Loading permission slip…</p>
        </Card>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-text-primary">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="text-sm text-text-primary">
          {success}
        </p>
      ) : null}
      {!loading && current ? (
        <>
          <Card
            title={`Version ${current.version}`}
            description={current.publishedAt ? "Published" : "Private draft"}
          >
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-semibold">Destination</dt>
                <dd>{current.contentSnapshot.destination}</dd>
              </div>
              <div>
                <dt className="font-semibold">Response deadline</dt>
                <dd>
                  {new Date(
                    current.contentSnapshot.deadlineAt,
                  ).toLocaleString()}
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Audience</dt>
                <dd>{current.recipients.length} pupils</dd>
              </div>
              <div>
                <dt className="font-semibold">Consent status</dt>
                <dd>
                  {current.requiresReconsent
                    ? "Fresh consent required"
                    : "Prior consent carries forward"}
                </dd>
              </div>
            </dl>
            <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-7 text-text-primary">
              {current.contentSnapshot.description}
            </p>
            <h3 className="mt-5 font-semibold text-text-primary">
              Exact consent wording
            </h3>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-7 text-text-primary">
              {current.contentSnapshot.consentText}
            </p>
            {current.contentSnapshot.questions.length ? (
              <div className="mt-5">
                <h3 className="font-semibold text-text-primary">Questions</h3>
                <ul className="mt-2 list-disc pl-5 text-sm">
                  {current.contentSnapshot.questions.map((question) => (
                    <li key={question.id}>
                      {question.label}
                      {question.required ? " (required to accept)" : ""}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </Card>
          {previous ? (
            <Card title={`Compared with version ${previous.version}`}>
              <p className="text-sm text-text-muted">
                {current.changeClassification === "MATERIAL"
                  ? "Material change: recipients must respond again."
                  : "Display correction: existing consent remains valid."}
              </p>
              <p className="mt-3 text-sm font-semibold text-text-primary">
                Changed fields
              </p>
              <p className="text-sm text-text-muted">
                {changedFields(current, previous).join(", ") ||
                  "No wording or audience fields changed."}
              </p>
              <details className="mt-3 text-sm">
                <summary className="min-h-11 cursor-pointer font-semibold text-text-primary">
                  Read previous trip and consent details
                </summary>
                <p className="mt-2">
                  {previous.contentSnapshot.destination} ·{" "}
                  {new Date(previous.contentSnapshot.startsAt).toLocaleString()}{" "}
                  to{" "}
                  {new Date(previous.contentSnapshot.endsAt).toLocaleString()}
                </p>
                <p className="mt-2">
                  Response deadline:{" "}
                  {new Date(
                    previous.contentSnapshot.deadlineAt,
                  ).toLocaleString()}
                </p>
                <p className="mt-2">
                  Previous audience: {previous.recipients.length} pupils
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words leading-7">
                  {previous.contentSnapshot.consentText}
                </p>
              </details>
            </Card>
          ) : null}
          {!current.publishedAt && canManage && !publicationEnabled ? (
            <Card title="Publication is not available yet">
              <p className="text-sm text-text-muted">
                The school can prepare drafts while publication is being
                reviewed.
              </p>
            </Card>
          ) : null}
          {!current.publishedAt && canManage && publicationEnabled ? (
            <Card title="Publish this version">
              <p className="text-sm text-text-muted">
                Review the audience, deadline and exact wording above before
                publication.
              </p>
              {confirmPublish ? (
                <div className="mt-4 space-y-3 rounded-lg border border-accent-strong bg-accent-subtle p-4">
                  <p className="text-sm font-semibold text-text-primary">
                    Publish version {current.version} to{" "}
                    {current.recipients.length} pupils?
                  </p>
                  <div className="flex flex-wrap gap-3">
                    <Button
                      type="button"
                      disabled={pending}
                      onClick={() => void publish()}
                    >
                      {pending ? "Publishing…" : "Confirm publication"}
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={pending}
                      onClick={() => setConfirmPublish(false)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  type="button"
                  className="mt-4 min-h-11"
                  onClick={() => setConfirmPublish(true)}
                >
                  Review publication
                </Button>
              )}
            </Card>
          ) : null}
          {summary ? (
            <ResponseSummary
              siteId={siteId}
              slipId={slipId}
              summary={summary}
              canManage={canManage}
              witnesses={witnesses}
              onRecorded={() => setRevision((value) => value + 1)}
            />
          ) : null}
        </>
      ) : null}
    </section>
  );
}
