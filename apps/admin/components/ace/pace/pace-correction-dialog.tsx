"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import type {
  AdminPaceCommandResponse,
  AdminPaceCorrectionInput,
  AdminPaceRosterItem,
} from "@/lib/api-client";
import { PolicyResultCallout } from "./policy-result-callout";

type PaceCorrectionDialogProps = {
  isOpen: boolean;
  assessmentId: string | null;
  rosterItem: AdminPaceRosterItem | null;
  onClose: () => void;
  onSave: (
    input: AdminPaceCorrectionInput,
  ) => Promise<AdminPaceCommandResponse>;
  onSuccess: (response: AdminPaceCommandResponse) => Promise<void> | void;
};

type CorrectionForm = {
  childId: string;
  subjectId: string;
  paceNumber: string;
  assessmentType: "SelfTest" | "FinalTest";
  score: string;
  assessedAt: string;
  reason: string;
};

export function PaceCorrectionDialog({
  isOpen,
  assessmentId,
  rosterItem,
  onClose,
  onSave,
  onSuccess,
}: PaceCorrectionDialogProps) {
  const [form, setForm] = React.useState<CorrectionForm>(() =>
    initialForm(rosterItem),
  );
  const [validation, setValidation] = React.useState<Record<string, string>>(
    {},
  );
  const [error, setError] = React.useState<string | null>(null);
  const [response, setResponse] =
    React.useState<AdminPaceCommandResponse | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const isSubmitting = React.useRef(false);
  const successRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!isOpen) return;
    setForm(initialForm(rosterItem));
    setValidation({});
    setError(null);
    setResponse(null);
  }, [assessmentId, isOpen, rosterItem?.child.id, rosterItem?.subject.id]);

  React.useEffect(() => {
    if (response) successRef.current?.focus();
  }, [response]);

  if (!isOpen || !assessmentId || !rosterItem) return null;

  const update = (field: keyof CorrectionForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting.current) return;
    const errors = validateCorrection(form);
    setValidation(errors);
    if (Object.keys(errors).length > 0) return;

    isSubmitting.current = true;
    setIsSaving(true);
    setError(null);
    setResponse(null);
    try {
      const result = await onSave(toCommand(form));
      setResponse(result);
      await onSuccess(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to correct this assessment.",
      );
    } finally {
      isSubmitting.current = false;
      setIsSaving(false);
    }
  };

  return (
    <div
      aria-labelledby="pace-correction-title"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-end bg-black/40 p-4 sm:items-center sm:justify-center"
      role="dialog"
    >
      <div className="max-h-full w-full max-w-2xl overflow-y-auto rounded-lg bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2
              id="pace-correction-title"
              className="font-heading text-xl font-semibold text-text-primary"
            >
              Correct PACE assessment
            </h2>
            <p className="mt-1 text-sm text-text-muted">
              {rosterItem.child.displayName} · {rosterItem.subject.name}. This
              creates a linked correction; the original assessment remains in
              the audit trail.
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
              id="pace-correction-pace-number"
              error={validation.paceNumber}
            >
              <input
                className={inputClassName}
                id="pace-correction-pace-number"
                inputMode="numeric"
                value={form.paceNumber}
                onChange={(event) => update("paceNumber", event.target.value)}
                disabled={isSaving}
                aria-invalid={Boolean(validation.paceNumber)}
                aria-describedby={
                  validation.paceNumber
                    ? "pace-correction-pace-number-error"
                    : undefined
                }
              />
            </Field>
            <Field
              label="Assessment type"
              id="pace-correction-assessment-type"
              error={validation.assessmentType}
            >
              <select
                className={inputClassName}
                id="pace-correction-assessment-type"
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
            <Field
              label="Score"
              id="pace-correction-score"
              error={validation.score}
            >
              <input
                className={inputClassName}
                id="pace-correction-score"
                inputMode="numeric"
                min="0"
                max="100"
                type="number"
                value={form.score}
                onChange={(event) => update("score", event.target.value)}
                disabled={isSaving}
                aria-invalid={Boolean(validation.score)}
                aria-describedby={
                  validation.score ? "pace-correction-score-error" : undefined
                }
              />
            </Field>
            <Field
              label="Assessed at"
              id="pace-correction-assessed-at"
              error={validation.assessedAt}
            >
              <input
                className={inputClassName}
                id="pace-correction-assessed-at"
                type="datetime-local"
                value={form.assessedAt}
                onChange={(event) => update("assessedAt", event.target.value)}
                disabled={isSaving}
                aria-invalid={Boolean(validation.assessedAt)}
                aria-describedby={
                  validation.assessedAt
                    ? "pace-correction-assessed-at-error"
                    : undefined
                }
              />
            </Field>
          </div>
          <Field
            label="Reason for correction"
            id="pace-correction-reason"
            error={validation.reason}
          >
            <textarea
              className={inputClassName}
              id="pace-correction-reason"
              value={form.reason}
              onChange={(event) => update("reason", event.target.value)}
              disabled={isSaving}
              rows={3}
              aria-invalid={Boolean(validation.reason)}
              aria-describedby={
                validation.reason ? "pace-correction-reason-error" : undefined
              }
            />
          </Field>
          {Object.keys(validation).length > 0 ? (
            <p className="text-sm text-status-danger" role="alert">
              Please correct the highlighted fields before saving the
              correction.
            </p>
          ) : null}
          {response?.policy ? (
            <PolicyResultCallout policy={response.policy} />
          ) : null}
          {error ? (
            <p className="text-sm text-status-danger" role="alert">
              {error}
            </p>
          ) : null}
          {response ? (
            <div
              ref={successRef}
              tabIndex={-1}
              role="status"
              className="text-sm text-status-success"
            >
              Assessment correction recorded.
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
              {isSaving ? "Saving correction…" : "Save correction"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function initialForm(rosterItem: AdminPaceRosterItem | null): CorrectionForm {
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

function validateCorrection(value: CorrectionForm): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isPaceNumber(value.paceNumber))
    errors.paceNumber = "Enter a valid PACE number.";
  if (!isScore(value.score)) errors.score = "Enter a score from 0 to 100.";
  if (!toIsoDateTime(value.assessedAt))
    errors.assessedAt = "Enter when the assessment was completed.";
  if (!value.reason.trim())
    errors.reason = "Enter a reason for this correction.";
  return errors;
}

function toCommand(value: CorrectionForm): AdminPaceCorrectionInput {
  const assessedAt = toIsoDateTime(value.assessedAt);
  if (!assessedAt) throw new Error("Enter when the assessment was completed.");
  return {
    childId: value.childId,
    subjectId: value.subjectId,
    paceNumber: Number(value.paceNumber),
    assessmentType: value.assessmentType,
    score: Number(value.score),
    assessedAt,
    reason: value.reason.trim(),
  };
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
