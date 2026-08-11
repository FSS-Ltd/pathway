"use client";

import React from "react";
import { Badge, Button, Card, Label } from "@pathway/ui";
import type {
  AdminStudentSubjectOption,
  AdminStudentSubjectPlacement,
  CreateAdminStudentSubjectInput,
} from "@/lib/api-client";

export type SubjectPlacementFormProps = {
  isLoading: boolean;
  placements: AdminStudentSubjectPlacement[];
  subjects: AdminStudentSubjectOption[];
  isSaving: boolean;
  error: string | null;
  success: string | null;
  canRecord: boolean;
  onSave: (input: CreateAdminStudentSubjectInput) => Promise<void>;
};

type SubjectPlacementFormValue = {
  subjectId: string;
  startsOn: string;
  startingPace: string;
  currentPace: string;
  targetPace: string;
  reason: string;
  replacesEnrollmentId: string;
};

export function createInitialSubjectPlacementForm(
  subjects: AdminStudentSubjectOption[],
): SubjectPlacementFormValue {
  return {
    subjectId: subjects[0]?.id ?? "",
    startsOn: "",
    startingPace: "",
    currentPace: "",
    targetPace: "",
    reason: "",
    replacesEnrollmentId: "",
  };
}

export function SubjectPlacementForm({
  isLoading,
  placements,
  subjects,
  isSaving,
  error,
  success,
  canRecord,
  onSave,
}: SubjectPlacementFormProps) {
  const [form, setForm] = React.useState<SubjectPlacementFormValue>(() =>
    createInitialSubjectPlacementForm(subjects),
  );
  const [validation, setValidation] = React.useState<Record<string, string>>(
    {},
  );
  const formDisabled = !canRecord || isSaving || subjects.length === 0;
  const replacement = placements.find(
    (placement) => placement.id === form.replacesEnrollmentId,
  );

  React.useEffect(() => {
    setForm((current) =>
      current.subjectId || subjects.length === 0
        ? current
        : { ...current, subjectId: subjects[0].id },
    );
  }, [subjects]);

  const update = (field: keyof SubjectPlacementFormValue, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
  const updateSubject = (subjectId: string) => {
    setForm((current) => ({ ...current, subjectId, replacesEnrollmentId: "" }));
  };
  const updateReplacement = (replacesEnrollmentId: string) => {
    const selected = placements.find(
      (placement) => placement.id === replacesEnrollmentId,
    );
    setForm((current) => ({
      ...current,
      replacesEnrollmentId,
      subjectId: selected?.subjectId ?? current.subjectId,
    }));
  };
  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = getSubjectPlacementValidation(form);
    setValidation(errors);
    if (Object.keys(errors).length > 0 || formDisabled) return;
    await onSave({
      subjectId: form.subjectId,
      startsOn: form.startsOn,
      startingPace: Number(form.startingPace),
      currentPace: Number(form.currentPace),
      targetPace: Number(form.targetPace),
      reason: form.reason.trim(),
      ...(form.replacesEnrollmentId
        ? { replacesEnrollmentId: form.replacesEnrollmentId }
        : {}),
    });
  };

  return (
    <Card
      title="Subject placement"
      description="Set a student’s starting, current, and target PACE for an active subject."
    >
      <div className="space-y-5">
        <Status
          isLoading={isLoading}
          isSaving={isSaving}
          error={error}
          success={success}
        />
        {!isLoading && placements.length === 0 ? (
          <p className="text-sm text-text-muted">
            No active subject placements.
          </p>
        ) : null}
        {!isLoading && placements.length > 0 ? (
          <ul className="space-y-3" aria-label="Active subject placements">
            {placements.map((placement) => (
              <li
                key={placement.id}
                className="rounded-md border border-border-subtle p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-text-primary">
                    {placement.subjectName}
                  </span>
                  <Badge variant="success">{placement.status}</Badge>
                  <span className="text-sm text-text-muted">
                    Starts {placement.startsOn}
                  </span>
                </div>
                <p className="mt-1 text-sm text-text-muted">
                  Starting PACE {placement.startingPace} · Current PACE{" "}
                  {placement.currentPace} · Target PACE {placement.targetPace}
                </p>
              </li>
            ))}
          </ul>
        ) : null}
        <form
          onSubmit={submit}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              event.currentTarget.requestSubmit();
            }
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Subject"
              id="subject-placement-subject"
              error={validation.subjectId}
            >
              <select
                id="subject-placement-subject"
                value={form.subjectId}
                disabled={formDisabled}
                onChange={(event) => updateSubject(event.target.value)}
                className={inputClassName}
              >
                {subjects.length === 0 ? (
                  <option value="">No active subjects available</option>
                ) : (
                  subjects.map((subject) => (
                    <option key={subject.id} value={subject.id}>
                      {subject.name}
                    </option>
                  ))
                )}
              </select>
            </Field>
            {placements.length > 0 ? (
              <Field
                label="Replace an active placement (optional)"
                id="subject-placement-replacement"
              >
                <select
                  id="subject-placement-replacement"
                  value={form.replacesEnrollmentId}
                  disabled={formDisabled}
                  onChange={(event) => updateReplacement(event.target.value)}
                  className={inputClassName}
                >
                  <option value="">Create a new placement</option>
                  {placements.map((placement) => (
                    <option key={placement.id} value={placement.id}>
                      {placement.subjectName} (started {placement.startsOn})
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}
            <Field
              label="Placement starts"
              id="subject-placement-starts-on"
              error={validation.startsOn}
            >
              <input
                id="subject-placement-starts-on"
                type="date"
                value={form.startsOn}
                disabled={formDisabled}
                onChange={(event) => update("startsOn", event.target.value)}
                className={inputClassName}
              />
            </Field>
            <PaceField
              label="Starting PACE"
              id="subject-placement-starting-pace"
              value={form.startingPace}
              disabled={formDisabled}
              error={validation.startingPace}
              onChange={(value) => update("startingPace", value)}
            />
            <PaceField
              label="Current PACE"
              id="subject-placement-current-pace"
              value={form.currentPace}
              disabled={formDisabled}
              error={validation.currentPace}
              onChange={(value) => update("currentPace", value)}
            />
            <PaceField
              label="Target PACE"
              id="subject-placement-target-pace"
              value={form.targetPace}
              disabled={formDisabled}
              error={validation.targetPace}
              onChange={(value) => update("targetPace", value)}
            />
            <Field
              label="Reason"
              id="subject-placement-reason"
              error={validation.reason}
            >
              <input
                id="subject-placement-reason"
                value={form.reason}
                disabled={formDisabled}
                onChange={(event) => update("reason", event.target.value)}
                className={inputClassName}
              />
            </Field>
          </div>
          {replacement ? (
            <p className="text-sm text-text-muted" role="status">
              The existing {replacement.subjectName} placement will end on{" "}
              {isDateOnly(form.startsOn)
                ? previousDate(form.startsOn)
                : "the day before this new placement starts"}
              .
            </p>
          ) : null}
          {validationSummary(validation) ? (
            <p className="text-sm text-status-danger" role="alert">
              Please correct the highlighted fields before saving the placement.
            </p>
          ) : null}
          {!canRecord ? (
            <p className="text-sm text-text-muted">
              You need ACE PACE record permission to save a subject placement.
            </p>
          ) : null}
          {subjects.length === 0 ? (
            <p className="text-sm text-text-muted">
              Add an active subject before placing this student.
            </p>
          ) : null}
          <Button type="submit" disabled={formDisabled}>
            {isSaving ? "Saving…" : "Save subject placement"}
          </Button>
        </form>
      </div>
    </Card>
  );
}

export function getSubjectPlacementValidation(
  value: SubjectPlacementFormValue,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!value.subjectId) errors.subjectId = "Choose an active subject.";
  if (!isDateOnly(value.startsOn))
    errors.startsOn = "Enter a valid placement start date.";
  if (!isValidPace(value.startingPace))
    errors.startingPace = "Enter a valid starting PACE.";
  if (!isValidPace(value.currentPace))
    errors.currentPace = "Enter a valid current PACE.";
  if (!isValidPace(value.targetPace))
    errors.targetPace = "Enter a valid target PACE.";
  if (!value.reason.trim())
    errors.reason = "Enter a reason for this placement.";
  return errors;
}

function Status({
  isLoading,
  isSaving,
  error,
  success,
}: Pick<
  SubjectPlacementFormProps,
  "isLoading" | "isSaving" | "error" | "success"
>) {
  if (isLoading)
    return (
      <div className="space-y-2" aria-label="Loading subject placements…">
        <span className="block h-3 w-48 animate-pulse rounded bg-muted" />
        <span className="block h-16 w-full animate-pulse rounded bg-muted" />
      </div>
    );
  if (error)
    return (
      <p className="text-sm text-status-danger" role="alert">
        {error}
      </p>
    );
  if (isSaving)
    return (
      <p className="text-sm text-text-muted" role="status">
        Saving subject placement…
      </p>
    );
  if (success)
    return (
      <p className="text-sm text-text-muted" role="status">
        {success}
      </p>
    );
  return null;
}

function PaceField({
  label,
  id,
  value,
  disabled,
  error,
  onChange,
}: {
  label: string;
  id: string;
  value: string;
  disabled: boolean;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field label={label} id={id} error={error}>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className={inputClassName}
      />
    </Field>
  );
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
  children: React.ReactElement<
    React.InputHTMLAttributes<HTMLInputElement | HTMLSelectElement>
  >;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {React.cloneElement(children, {
        "aria-invalid": Boolean(error),
        "aria-describedby": error ? errorId : undefined,
      })}
      {error ? (
        <p id={errorId} className="text-sm text-status-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function validationSummary(validation: Record<string, string>): boolean {
  return Object.keys(validation).length > 0;
}

function isDateOnly(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isValidPace(value: string): boolean {
  if (!/^\d+$/.test(value)) return false;
  const pace = Number(value);
  return (pace >= 1 && pace <= 144) || (pace >= 1001 && pace <= 1144);
}

function previousDate(value: string): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12));
  date.setUTCDate(date.getUTCDate() - 1);
  return [
    date.getUTCFullYear().toString().padStart(4, "0"),
    (date.getUTCMonth() + 1).toString().padStart(2, "0"),
    date.getUTCDate().toString().padStart(2, "0"),
  ].join("-");
}

const inputClassName =
  "h-10 w-full rounded-md border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary";
