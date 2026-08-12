"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import type {
  AdminPaceAssessmentInput,
  AdminPaceCommandResponse,
  AdminPacePolicyCode,
  AdminPacePolicyOverride,
  AdminPacePolicyOverrideInput,
  AdminPaceRosterItem,
} from "@/lib/api-client";
import { PolicyResultCallout } from "./policy-result-callout";

export type PaceEntryFormValue = {
  childId: string;
  subjectId: string;
  paceNumber: string;
  assessmentType: "SelfTest" | "FinalTest";
  score: string;
  assessedAt: string;
  reason: string;
};

type PaceEntryDialogProps = {
  isOpen: boolean;
  rosterItem: AdminPaceRosterItem | null;
  canOverride: boolean;
  onClose: () => void;
  onSave: (
    input: AdminPaceAssessmentInput,
  ) => Promise<AdminPaceCommandResponse>;
  onAuthoriseOverride: (
    input: AdminPacePolicyOverrideInput,
  ) => Promise<AdminPacePolicyOverride>;
  onSuccess: (response: AdminPaceCommandResponse) => Promise<void> | void;
  onRefreshStepUp: () => Promise<void>;
};

export function PaceEntryDialog({
  isOpen,
  rosterItem,
  canOverride,
  onClose,
  onSave,
  onAuthoriseOverride,
  onSuccess,
  onRefreshStepUp,
}: PaceEntryDialogProps) {
  const [form, setForm] = React.useState<PaceEntryFormValue>(() =>
    initialForm(rosterItem),
  );
  const [idempotencyKey, setIdempotencyKey] = React.useState(createCommandKey);
  const [useOverride, setUseOverride] = React.useState(false);
  const [authorisedOverride, setAuthorisedOverride] =
    React.useState<AdminPacePolicyOverride | null>(null);
  const [validation, setValidation] = React.useState<Record<string, string>>(
    {},
  );
  const [error, setError] = React.useState<string | null>(null);
  const [policy, setPolicy] =
    React.useState<AdminPaceCommandResponse["policy"]>();
  const [stepUpRequired, setStepUpRequired] = React.useState(false);
  const [isSaving, setIsSaving] = React.useState(false);
  const [success, setSuccess] = React.useState<string | null>(null);
  const isSubmitting = React.useRef(false);
  const successRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setForm(initialForm(rosterItem));
    setIdempotencyKey(createCommandKey());
    setUseOverride(false);
    setAuthorisedOverride(null);
    setValidation({});
    setError(null);
    setPolicy(undefined);
    setStepUpRequired(false);
    setSuccess(null);
  }, [isOpen, rosterItem?.child.id, rosterItem?.subject.id]);

  React.useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  if (!isOpen || !rosterItem) return null;

  const update = (field: keyof PaceEntryFormValue, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting.current) return;
    const errors = validatePaceEntry(form);
    setValidation(errors);
    if (Object.keys(errors).length > 0) return;

    isSubmitting.current = true;
    setIsSaving(true);
    setError(null);
    setPolicy(undefined);
    setStepUpRequired(false);
    setSuccess(null);
    try {
      const command = toAssessmentCommand(form, idempotencyKey);
      const override = useOverride
        ? (authorisedOverride ??
          (await onAuthoriseOverride(toOverrideCommand(command))))
        : undefined;
      if (override && !authorisedOverride) setAuthorisedOverride(override);
      const response = await onSave(
        override ? { ...command, policyOverrideId: override.id } : command,
      );
      setPolicy(response.policy);
      setSuccess(
        response.duplicate
          ? "This assessment was already recorded."
          : "Assessment recorded.",
      );
      await onSuccess(response);
    } catch (cause) {
      const code = errorCode(cause);
      setStepUpRequired(code === "STEP_UP_REQUIRED");
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to record this assessment.",
      );
      setPolicy(policyFromError(cause));
    } finally {
      isSubmitting.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div
      aria-labelledby="pace-entry-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="pace-entry-title"
              className="font-heading text-xl font-semibold text-text-primary"
            >
              Record PACE assessment
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {rosterItem.child.displayName} · {rosterItem.subject.name} ·
              current PACE {rosterItem.currentPace}
            </p>
          </div>
          <Button
            type="button"
            variant="secondary"
            disabled={isSaving}
            onClick={onClose}
          >
            Close
          </Button>
        </div>

        <form
          className="mt-5 space-y-4"
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.requestSubmit();
            }
          }}
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="PACE number"
              id="pace-entry-pace-number"
              error={validation.paceNumber}
            >
              <input
                className={inputClassName}
                id="pace-entry-pace-number"
                inputMode="numeric"
                value={form.paceNumber}
                onChange={(event) => update("paceNumber", event.target.value)}
                disabled={isSaving}
                aria-invalid={Boolean(validation.paceNumber)}
                aria-describedby={
                  validation.paceNumber
                    ? "pace-entry-pace-number-error"
                    : undefined
                }
              />
            </Field>
            <Field
              label="Assessment type"
              id="pace-entry-assessment-type"
              error={validation.assessmentType}
            >
              <select
                className={inputClassName}
                id="pace-entry-assessment-type"
                value={form.assessmentType}
                onChange={(event) =>
                  update("assessmentType", event.target.value)
                }
                disabled={isSaving}
              >
                <option value="SelfTest">Self Test</option>
                <option value="FinalTest">PACE Test</option>
              </select>
            </Field>
            <Field label="Score" id="pace-entry-score" error={validation.score}>
              <input
                className={inputClassName}
                id="pace-entry-score"
                inputMode="numeric"
                min="0"
                max="100"
                type="number"
                value={form.score}
                onChange={(event) => update("score", event.target.value)}
                disabled={isSaving}
                aria-invalid={Boolean(validation.score)}
                aria-describedby={
                  validation.score ? "pace-entry-score-error" : undefined
                }
              />
            </Field>
            <Field
              label="Assessed at"
              id="pace-entry-assessed-at"
              error={validation.assessedAt}
            >
              <input
                className={inputClassName}
                id="pace-entry-assessed-at"
                type="datetime-local"
                value={form.assessedAt}
                onChange={(event) => update("assessedAt", event.target.value)}
                disabled={isSaving}
                aria-invalid={Boolean(validation.assessedAt)}
                aria-describedby={
                  validation.assessedAt
                    ? "pace-entry-assessed-at-error"
                    : undefined
                }
              />
            </Field>
          </div>
          <Field
            label="Reason"
            id="pace-entry-reason"
            error={validation.reason}
          >
            <textarea
              className={inputClassName}
              id="pace-entry-reason"
              value={form.reason}
              onChange={(event) => update("reason", event.target.value)}
              disabled={isSaving}
              rows={3}
              aria-invalid={Boolean(validation.reason)}
              aria-describedby={
                validation.reason ? "pace-entry-reason-error" : undefined
              }
            />
          </Field>

          {canOverride ? (
            <label className="flex items-start gap-2 rounded-md border border-border-subtle p-3 text-sm text-text-primary">
              <input
                id="pace-entry-override"
                type="checkbox"
                checked={useOverride}
                disabled={isSaving}
                onChange={(event) => setUseOverride(event.target.checked)}
              />
              <span>
                Authorise a score-below-threshold override before recording.
                This is a separate, short-lived decision and requires recent
                MFA.
              </span>
            </label>
          ) : null}

          {Object.keys(validation).length > 0 ? (
            <p className="text-sm text-status-danger" role="alert">
              Please correct the highlighted fields before recording the
              assessment.
            </p>
          ) : null}
          {policy ? <PolicyResultCallout policy={policy} /> : null}
          {error ? (
            <p className="text-sm text-status-danger" role="alert">
              {error}
            </p>
          ) : null}
          {stepUpRequired ? (
            <div
              className="rounded-md border border-status-warning/30 bg-status-warning/5 p-3"
              role="alert"
            >
              <p className="text-sm text-text-primary">
                Complete MFA, then refresh your session and retry the override.
                The API accepts only fresh signed MFA claims; this page does not
                create authorisation locally.
              </p>
              <Button
                type="button"
                variant="secondary"
                className="mt-3"
                onClick={() => void onRefreshStepUp()}
              >
                Refresh session after MFA
              </Button>
            </div>
          ) : null}
          {success ? (
            <div
              ref={successRef}
              tabIndex={-1}
              role="status"
              className="text-sm text-status-success"
            >
              {success}
            </div>
          ) : null}
          <div className="flex flex-wrap justify-end gap-3">
            <Button
              type="button"
              variant="secondary"
              disabled={isSaving}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving
                ? "Recording…"
                : useOverride
                  ? "Authorise and record"
                  : "Record assessment"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function initialForm(
  rosterItem: AdminPaceRosterItem | null,
): PaceEntryFormValue {
  return {
    childId: rosterItem?.child.id ?? "",
    subjectId: rosterItem?.subject.id ?? "",
    paceNumber: rosterItem ? String(rosterItem.currentPace) : "",
    assessmentType: "FinalTest",
    score: "",
    assessedAt: localDateTime(),
    reason: "",
  };
}

export function validatePaceEntry(
  value: PaceEntryFormValue,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isPaceNumber(value.paceNumber))
    errors.paceNumber = "Enter a valid PACE number.";
  if (!isScore(value.score)) errors.score = "Enter a score from 0 to 100.";
  if (!toIsoDateTime(value.assessedAt))
    errors.assessedAt = "Enter when the assessment was completed.";
  if (!value.reason.trim())
    errors.reason = "Enter a reason for this assessment.";
  return errors;
}

function toAssessmentCommand(
  value: PaceEntryFormValue,
  idempotencyKey: string,
): AdminPaceAssessmentInput {
  const assessedAt = toIsoDateTime(value.assessedAt);
  if (!assessedAt) throw new Error("Enter when the assessment was completed.");
  return {
    idempotencyKey,
    childId: value.childId,
    subjectId: value.subjectId,
    paceNumber: Number(value.paceNumber),
    assessmentType: value.assessmentType,
    score: Number(value.score),
    assessedAt,
    reason: value.reason.trim(),
  };
}

function toOverrideCommand(
  command: AdminPaceAssessmentInput,
): AdminPacePolicyOverrideInput {
  return {
    ...command,
    idempotencyKey: `${command.idempotencyKey}:override`,
    policyCode: "score-below-threshold",
    expiresAt: new Date(Date.now() + 14 * 60_000).toISOString(),
  };
}

function policyFromError(cause: unknown) {
  const policyCode = errorPolicyCode(cause);
  return policyCode
    ? { decision: "block" as const, code: policyCode }
    : undefined;
}

function errorCode(cause: unknown): string | undefined {
  return isErrorWithCode(cause) ? cause.code : undefined;
}

function isErrorWithCode(value: unknown): value is { code: string } {
  return (
    typeof value === "object" &&
    value !== null &&
    "code" in value &&
    typeof value.code === "string"
  );
}

function errorPolicyCode(value: unknown): AdminPacePolicyCode | undefined {
  if (typeof value !== "object" || value === null || !("policyCode" in value)) {
    return undefined;
  }
  const policyCode = value.policyCode;
  return isPacePolicyCode(policyCode) ? policyCode : undefined;
}

function isPacePolicyCode(value: unknown): value is AdminPacePolicyCode {
  return (
    value === "allowed" ||
    value === "score-below-threshold" ||
    value === "daily-limit" ||
    value === "duplicate-self-test" ||
    value === "same-pace-same-day" ||
    value === "progression-blocked" ||
    value === "override-required"
  );
}

function isPaceNumber(value: string): boolean {
  const pace = Number(value);
  return (
    Number.isInteger(pace) &&
    ((pace >= 1 && pace <= 144) || (pace >= 1001 && pace <= 1144))
  );
}

function isScore(value: string): boolean {
  const score = Number(value);
  return Number.isInteger(score) && score >= 0 && score <= 100;
}

function toIsoDateTime(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function localDateTime(): string {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function createCommandKey(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? `pace-${crypto.randomUUID()}`
    : `pace-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function Field({
  label,
  id,
  error,
  children,
}: {
  label: string;
  id: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="text-sm text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

const inputClassName =
  "w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-text-primary shadow-sm focus:border-status-info focus:outline-none focus:ring-2 focus:ring-status-info/20 disabled:cursor-not-allowed disabled:opacity-60";
