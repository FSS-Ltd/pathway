"use client";

import React from "react";
import { Button } from "@pathway/ui";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import { AdminPaceApiError } from "@/lib/api-client";
import type {
  PaceDiagnosticResult,
  PaceDiagnosticRetractionResult,
} from "@/lib/pace-diagnostic-api";

type Props = {
  result: PaceDiagnosticResult;
  onRetract: (
    resultId: string,
    reason: string,
  ) => Promise<PaceDiagnosticRetractionResult>;
  onRetracted: () => void;
};

export function PaceDiagnosticRetraction({
  result,
  onRetract,
  onRetracted,
}: Props) {
  const [confirming, setConfirming] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);
  const submitting = React.useRef(false);
  const siteGeneration = React.useRef(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const reasonRef = React.useRef<HTMLTextAreaElement>(null);
  const reasonId = React.useId();

  React.useEffect(() => {
    const unsubscribe = subscribeToActiveSiteChanges(() => {
      siteGeneration.current += 1;
    });
    return () => {
      siteGeneration.current += 1;
      unsubscribe();
    };
  }, []);
  React.useEffect(() => {
    if (confirming) reasonRef.current?.focus();
  }, [confirming]);

  function cancel() {
    setConfirming(false);
    setReason("");
    setError(null);
    triggerRef.current?.focus();
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting.current || pending) return;
    const trimmedReason = reason.trim();
    if (!trimmedReason || trimmedReason.length > 2000) {
      setError("Enter a reason of 1 to 2000 characters.");
      return;
    }
    submitting.current = true;
    const requestGeneration = siteGeneration.current;
    setPending(true);
    setError(null);
    try {
      await onRetract(result.id, trimmedReason);
      if (requestGeneration !== siteGeneration.current) return;
      setConfirming(false);
      setReason("");
      onRetracted();
    } catch (cause) {
      if (requestGeneration !== siteGeneration.current) return;
      setError(
        cause instanceof AdminPaceApiError && cause.status < 500
          ? cause.message
          : "Unable to retract this diagnostic. Please try again.",
      );
    } finally {
      submitting.current = false;
      if (requestGeneration === siteGeneration.current) setPending(false);
    }
  }

  return (
    <div className="mt-3">
      <Button
        ref={triggerRef}
        type="button"
        variant="secondary"
        onClick={() => setConfirming(true)}
        disabled={confirming}
      >
        Retract result
      </Button>
      {confirming ? (
        <form
          onSubmit={submit}
          className="mt-3 space-y-3 rounded-lg border border-border-subtle bg-muted p-4"
        >
          <p className="text-sm leading-6 text-text-primary">
            Confirm retraction of level {result.level} ·{" "}
            {result.outcome === "PASS" ? "Pass" : "Fail"}. The original result
            remains in audit history.
          </p>
          <div className="space-y-2">
            <label
              htmlFor={reasonId}
              className="block text-sm font-medium text-text-primary"
            >
              Reason for retraction
            </label>
            <textarea
              ref={reasonRef}
              id={reasonId}
              rows={3}
              maxLength={2000}
              required
              value={reason}
              disabled={pending}
              onChange={(event) => {
                setReason(event.currentTarget.value);
                setError(null);
              }}
              className="w-full rounded-lg border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-strong"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          ) : null}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending}>
              {pending ? "Retracting…" : "Confirm retraction"}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={cancel}
            >
              Cancel
            </Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
