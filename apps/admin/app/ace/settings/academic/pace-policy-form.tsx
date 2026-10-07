"use client";

import React from "react";
import { Badge, Button, Card, Input } from "@pathway/ui";
import type {
  AcePacePolicy,
  AcePacePolicyChange,
} from "@/lib/ace-settings-api";

export type PacePolicySubmission = {
  reason: string;
  pacePolicy: AcePacePolicyChange;
};

type PacePolicyFormProps = {
  policy: AcePacePolicy | null;
  timezone: string | null;
  canManage: boolean;
  isAvailable: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  success: string | null;
  onSave: (input: PacePolicySubmission) => Promise<void>;
};

type FormValues = {
  selfTestPassingScore: string;
  paceTestPassingScore: string;
  maxAssessmentsPerDay: string;
  allowSamePaceSameDay: boolean;
  reason: string;
};

function valuesFromPolicy(policy: AcePacePolicy | null): FormValues {
  return {
    selfTestPassingScore: String(policy?.selfTestPassingScore ?? 80),
    paceTestPassingScore: String(policy?.paceTestPassingScore ?? 80),
    maxAssessmentsPerDay: String(policy?.maxAssessmentsPerDay ?? 2),
    allowSamePaceSameDay: policy?.allowSamePaceSameDay ?? false,
    reason: "",
  };
}

function parseWholeNumber(value: string): number | null {
  if (!/^\d+$/.test(value.trim())) return null;
  const number = Number(value);
  return Number.isSafeInteger(number) ? number : null;
}

export function validatePacePolicyForm(
  values: FormValues,
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const key of ["selfTestPassingScore", "paceTestPassingScore"] as const) {
    const score = parseWholeNumber(values[key]);
    if (score === null || score > 100) {
      errors[key] = "Enter a whole-number score from 0 to 100.";
    }
  }
  const dailyLimit = parseWholeNumber(values.maxAssessmentsPerDay);
  if (dailyLimit === null || dailyLimit < 1) {
    errors.maxAssessmentsPerDay = "Enter a daily limit of at least 1.";
  }
  if (!values.reason.trim() || values.reason.trim().length > 1_000) {
    errors.reason = "Enter a reason of up to 1,000 characters.";
  }
  return errors;
}

export function PacePolicyForm({
  policy,
  timezone,
  canManage,
  isAvailable,
  isLoading,
  isSaving,
  error,
  success,
  onSave,
}: PacePolicyFormProps) {
  const [values, setValues] = React.useState(() => valuesFromPolicy(policy));
  const [validation, setValidation] = React.useState<Record<string, string>>(
    {},
  );

  React.useEffect(() => {
    setValues(valuesFromPolicy(policy));
    setValidation({});
  }, [policy]);

  const disabled = isLoading || isSaving || !canManage || !isAvailable;
  const update = (key: keyof FormValues, value: string | boolean) => {
    setValues((current) => ({ ...current, [key]: value }));
    setValidation((current) => ({ ...current, [key]: "" }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled) return;
    const errors = validatePacePolicyForm(values);
    setValidation(errors);
    if (Object.keys(errors).length) return;
    await onSave({
      reason: values.reason.trim(),
      pacePolicy: {
        selfTestPassingScore: Number(values.selfTestPassingScore),
        paceTestPassingScore: Number(values.paceTestPassingScore),
        maxAssessmentsPerDay: Number(values.maxAssessmentsPerDay),
        allowSamePaceSameDay: values.allowSamePaceSameDay,
      },
    });
  };

  return (
    <Card
      title="PACE assessment policy"
      description="Set the pass marks and assessment limits for the active ACE site. Changes are audited and take effect immediately."
    >
      <div className="mb-5 flex flex-wrap items-center gap-2 text-sm text-text-muted">
        {isLoading ? null : (
          <Badge variant={policy ? "success" : "secondary"}>
            {policy ? `Version ${policy.version}` : "Not configured"}
          </Badge>
        )}
        {timezone ? <span>Site timezone: {timezone}</span> : null}
      </div>
      {isLoading ? (
        <p role="status" className="text-sm text-text-muted">
          Loading PACE policy…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mb-4 text-sm text-status-danger">
          {error}
        </p>
      ) : null}
      {success ? (
        <p role="status" className="mb-4 text-sm text-status-success">
          {success}
        </p>
      ) : null}
      {!isLoading && isAvailable && !policy ? (
        <p className="mb-4 text-sm text-text-muted">
          Save a policy before staff record PACE assessments at this site.
        </p>
      ) : null}
      <form onSubmit={submit} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-3">
          <NumberField
            id="pace-self-test-score"
            label="Self Test pass mark (%)"
            value={values.selfTestPassingScore}
            error={validation.selfTestPassingScore}
            disabled={disabled}
            onChange={(value) => update("selfTestPassingScore", value)}
          />
          <NumberField
            id="pace-final-test-score"
            label="Final Test pass mark (%)"
            value={values.paceTestPassingScore}
            error={validation.paceTestPassingScore}
            disabled={disabled}
            onChange={(value) => update("paceTestPassingScore", value)}
          />
          <NumberField
            id="pace-daily-limit"
            label="Assessments per day"
            value={values.maxAssessmentsPerDay}
            error={validation.maxAssessmentsPerDay}
            disabled={disabled}
            onChange={(value) => update("maxAssessmentsPerDay", value)}
          />
        </div>
        <label className="flex min-h-11 items-center gap-3 rounded-lg border border-border-subtle bg-muted/30 px-4 py-3 text-sm text-text-primary">
          <input
            type="checkbox"
            checked={values.allowSamePaceSameDay}
            disabled={disabled}
            onChange={(event) =>
              update("allowSamePaceSameDay", event.target.checked)
            }
            className="h-5 w-5 accent-accent-primary"
          />
          Allow more than one assessment of the same PACE on one day
        </label>
        {canManage ? (
          <div className="grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
            <label className="space-y-1 text-sm font-medium text-text-primary">
              Reason for change
              <Input
                id="pace-policy-reason"
                value={values.reason}
                maxLength={1_000}
                disabled={disabled}
                aria-invalid={Boolean(validation.reason)}
                aria-describedby={
                  validation.reason ? "pace-policy-reason-error" : undefined
                }
                onChange={(event) => update("reason", event.target.value)}
              />
              {validation.reason ? (
                <span
                  id="pace-policy-reason-error"
                  className="block text-status-danger"
                >
                  {validation.reason}
                </span>
              ) : null}
            </label>
            <Button type="submit" disabled={disabled} className="min-h-11">
              {isSaving ? "Saving…" : "Save PACE policy"}
            </Button>
          </div>
        ) : (
          <p className="text-sm text-text-muted">
            You can view this policy. ACE settings management access is required
            to change it.
          </p>
        )}
      </form>
    </Card>
  );
}

function NumberField({
  id,
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  error?: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-1 text-sm font-medium text-text-primary">
      {label}
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={id === "pace-daily-limit" ? 1 : 0}
        max={id === "pace-daily-limit" ? undefined : 100}
        step={1}
        value={value}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? (
        <span id={`${id}-error`} className="block text-status-danger">
          {error}
        </span>
      ) : null}
    </label>
  );
}
