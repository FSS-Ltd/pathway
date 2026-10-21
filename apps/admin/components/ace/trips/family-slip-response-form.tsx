"use client";

import React from "react";
import { Button, Card } from "@pathway/ui";
import {
  respondToFamilySlip,
  TripSlipRequestError,
  type FamilySlipDetail,
} from "@/lib/ace-trip-slips-api";

type Decision = "ACCEPTED" | "DECLINED";

function responseError(cause: unknown): string {
  if (cause instanceof TripSlipRequestError) {
    if (cause.status === 409)
      return "This slip changed or was already answered. Reload it before continuing.";
    if (cause.status === 403 || cause.status === 404)
      return "Your access to this slip changed. Return to your family and try again.";
    if (cause.status === 503)
      return "Online responses are not available at this school yet.";
    if (cause.status === 400)
      return "Check every required answer and your signature, then try again.";
  }
  return "Your response was not sent. Check your connection and retry; your answers are still here.";
}

export function FamilySlipResponseForm({
  slip,
  siteId,
  childId,
  onRecorded,
  onReload,
}: {
  slip: FamilySlipDetail;
  siteId: string;
  childId: string;
  onRecorded: () => void;
  onReload: () => void;
}) {
  const [answers, setAnswers] = React.useState<Record<string, string>>({});
  const [typedName, setTypedName] = React.useState("");
  const [acknowledged, setAcknowledged] = React.useState(false);
  const [confirming, setConfirming] = React.useState<Decision | null>(null);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [stale, setStale] = React.useState(false);
  const requestKey = React.useRef<string | null>(null);
  const confirmationHeading = React.useRef<HTMLHeadingElement>(null);
  React.useEffect(() => {
    if (confirming) confirmationHeading.current?.focus();
  }, [confirming]);

  function prepare(decision: Decision) {
    if (pending) return;
    setError(null);
    if (!typedName.trim() || !acknowledged) {
      setError("Type your name and acknowledge the signature statement.");
      return;
    }
    if (
      decision === "ACCEPTED" &&
      slip.snapshot.questions.some(
        (question) => question.required && !answers[question.id]?.trim(),
      )
    ) {
      setError("Answer every required question before accepting.");
      return;
    }
    setConfirming(decision);
  }

  async function submit() {
    if (!confirming || pending) return;
    setPending(true);
    setError(null);
    try {
      requestKey.current ??= globalThis.crypto.randomUUID();
      await respondToFamilySlip(siteId, slip.id, {
        childId,
        expectedVersionId: slip.versionId,
        expectedVersionHash: slip.versionHash,
        decision: confirming,
        typedName: typedName.trim(),
        signatureAcknowledged: true,
        answers: slip.snapshot.questions.flatMap((question) => {
          const answer = answers[question.id]?.trim();
          return answer ? [{ questionId: question.id, answer }] : [];
        }),
        idempotencyKey: requestKey.current,
      });
      setConfirming(null);
      onRecorded();
    } catch (cause) {
      setError(responseError(cause));
      if (cause instanceof TripSlipRequestError && cause.status === 409) {
        setStale(true);
        setConfirming(null);
      }
    } finally {
      setPending(false);
    }
  }

  return (
    <Card title="Your response">
      <div className="space-y-5">
        {slip.snapshot.questions.map((question) => (
          <div key={question.id} className="space-y-2">
            <label
              htmlFor={`slip-answer-${question.id}`}
              className="block text-sm font-semibold text-text-primary"
            >
              {question.label}
              {question.required ? " (required to accept)" : ""}
            </label>
            <textarea
              id={`slip-answer-${question.id}`}
              value={answers[question.id] ?? ""}
              maxLength={1000}
              rows={3}
              disabled={pending || confirming !== null}
              onChange={(event) => {
                requestKey.current = null;
                setAnswers((current) => ({
                  ...current,
                  [question.id]: event.target.value,
                }));
              }}
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
            />
          </div>
        ))}
        <div className="space-y-2">
          <label
            htmlFor="slip-typed-name"
            className="block text-sm font-semibold text-text-primary"
          >
            Type your full name
          </label>
          <input
            id="slip-typed-name"
            value={typedName}
            maxLength={160}
            disabled={pending || confirming !== null}
            onChange={(event) => {
              requestKey.current = null;
              setTypedName(event.target.value);
            }}
            className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-3 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
          />
        </div>
        <label className="flex items-start gap-3 text-sm leading-6 text-text-primary">
          <input
            type="checkbox"
            checked={acknowledged}
            disabled={pending || confirming !== null}
            onChange={(event) => {
              requestKey.current = null;
              setAcknowledged(event.target.checked);
            }}
            className="mt-1 h-5 w-5 accent-accent-strong"
          />
          <span>
            I understand my typed name records my response to this exact version
            of the school’s consent wording.
          </span>
        </label>
        {error ? (
          <p role="alert" className="text-sm text-text-primary">
            {error}
          </p>
        ) : null}
        {stale ? (
          <Button type="button" variant="outline" onClick={onReload}>
            Read current version
          </Button>
        ) : null}
        {confirming ? (
          <div className="space-y-3 rounded-xl border border-accent-strong bg-accent-subtle p-4">
            <h2
              ref={confirmationHeading}
              tabIndex={-1}
              className="font-heading text-lg font-semibold text-text-primary focus:outline-none"
            >
              Confirm your {confirming === "ACCEPTED" ? "consent" : "decline"}
            </h2>
            <p className="text-sm leading-6 text-text-primary">
              This records {typedName.trim()}’s response to version{" "}
              {slip.version}. It cannot be edited afterwards.
            </p>
            <div className="flex flex-wrap gap-3">
              <Button
                type="button"
                disabled={pending}
                onClick={() => void submit()}
              >
                {pending ? "Recording…" : "Confirm response"}
              </Button>
              <Button
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setConfirming(null)}
              >
                Go back
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap gap-3">
            <Button
              type="button"
              className="min-h-11"
              disabled={stale}
              onClick={() => prepare("ACCEPTED")}
            >
              Accept
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={stale}
              onClick={() => prepare("DECLINED")}
            >
              Decline
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
}
