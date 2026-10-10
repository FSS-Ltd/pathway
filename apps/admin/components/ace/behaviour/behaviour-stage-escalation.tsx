"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import {
  AdminBehaviourApiError,
  type AdminDemeritOverrideInput,
  type AdminDemeritOverrideResponse,
  type AdminDemeritStatus,
} from "@/lib/api-client";
import { toSiteDateTimeInput } from "./behaviour-time";

export function BehaviourStageEscalation({
  childId,
  date,
  siteTimeZone,
  status,
  allowed,
  saveOverride,
  onSaved,
  onDenied,
  onConflict,
  onPendingChange,
}: {
  childId: string;
  date: string;
  siteTimeZone: string;
  status: AdminDemeritStatus;
  allowed: boolean;
  saveOverride: (
    input: AdminDemeritOverrideInput,
  ) => Promise<AdminDemeritOverrideResponse>;
  onSaved: () => Promise<void> | void;
  onDenied: () => void;
  onConflict: () => void;
  onPendingChange: (pending: boolean) => void;
}) {
  const [stage, setStage] = React.useState(() => String(status.stage + 1));
  const [reason, setReason] = React.useState("");
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [idempotencyKey, setIdempotencyKey] = React.useState(createCommandKey);
  const attempted = React.useRef(false);
  const submitting = React.useRef(false);
  const successRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    setStage(status.stage < 3 ? String(status.stage + 1) : "");
  }, [status.stage]);

  React.useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  const edit = () => {
    if (attempted.current) {
      attempted.current = false;
      setIdempotencyKey(createCommandKey());
    }
    setError(null);
    setSuccess(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current || !allowed) return;
    if (
      toSiteDateTimeInput(new Date().toISOString(), siteTimeZone).slice(
        0,
        10,
      ) !== date
    ) {
      onConflict();
      setError(
        "The site-local day changed. Select today’s date before escalating.",
      );
      return;
    }
    const selectedStage = Number(stage);
    if (
      !Number.isInteger(selectedStage) ||
      selectedStage <= status.stage ||
      selectedStage > 3
    )
      return;
    if (!reason.trim()) {
      setReasonError("Enter a reason for this escalation.");
      return;
    }
    submitting.current = true;
    attempted.current = true;
    setSaving(true);
    onPendingChange(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await saveOverride({
        childId,
        stage: selectedStage,
        expectedPolicyVersion: status.policyVersion,
        reason: reason.trim(),
        idempotencyKey,
      });
      setSuccess(
        response.duplicate
          ? "This escalation was already saved."
          : "Escalation saved.",
      );
      setReason("");
      setReasonError(null);
      setIdempotencyKey(createCommandKey());
      attempted.current = false;
      try {
        await onSaved();
      } catch {
        setError(
          "Escalation saved, but the current stage could not be refreshed. Try again.",
        );
      }
    } catch (cause) {
      if (
        cause instanceof AdminBehaviourApiError &&
        (cause.status === 401 || cause.status === 403)
      ) {
        onDenied();
        setError(
          "Your reviewer access changed. Refresh your access before trying again.",
        );
      } else if (
        cause instanceof AdminBehaviourApiError &&
        cause.status === 409
      ) {
        onConflict();
        setError(
          "The stage or policy changed. Refresh the status before trying again.",
        );
      } else {
        setError("Unable to save this escalation. Try again.");
      }
    } finally {
      submitting.current = false;
      setSaving(false);
      onPendingChange(false);
    }
  };

  return (
    <>
      {allowed && status.stage < 3 ? (
        <form
          className="mt-5 space-y-4 border-t border-border pt-5"
          aria-label="Escalate demerit stage"
          onSubmit={submit}
        >
          <h3 className="font-medium text-text-primary">
            Escalate today’s stage
          </h3>
          <div>
            <Label htmlFor="behaviour-stage-target">New stage</Label>
            <select
              id="behaviour-stage-target"
              className={controlClassName}
              value={stage}
              disabled={saving}
              onChange={(event) => {
                edit();
                setStage(event.target.value);
              }}
            >
              {Array.from(
                { length: 3 - status.stage },
                (_, index) => status.stage + index + 1,
              ).map((value) => (
                <option key={value} value={value}>
                  Stage {value}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Label htmlFor="behaviour-stage-reason">Reason</Label>
            <textarea
              id="behaviour-stage-reason"
              className={`${controlClassName} min-h-24`}
              value={reason}
              maxLength={1000}
              disabled={saving}
              aria-invalid={Boolean(reasonError)}
              aria-describedby={
                reasonError ? "behaviour-stage-reason-error" : undefined
              }
              onChange={(event) => {
                edit();
                setReason(event.target.value);
                setReasonError(null);
              }}
            />
            {reasonError ? (
              <p
                id="behaviour-stage-reason-error"
                className="mt-1 text-sm text-red-700"
                role="alert"
              >
                {reasonError}
              </p>
            ) : null}
          </div>
          <Button type="submit" disabled={saving || !stage}>
            {saving ? "Saving escalation…" : "Save escalation"}
          </Button>
        </form>
      ) : null}
      {error ? (
        <p className="mt-4 text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <div
          ref={successRef}
          className="mt-4 rounded-md bg-green-50 p-3 text-sm text-text-primary"
          role="status"
          tabIndex={-1}
        >
          {success}
        </div>
      ) : null}
    </>
  );
}

function createCommandKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `behaviour-stage-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

const controlClassName =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
