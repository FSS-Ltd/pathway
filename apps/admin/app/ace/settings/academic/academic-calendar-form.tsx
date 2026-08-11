"use client";

import React from "react";
import { Badge, Button, Card, Label } from "@pathway/ui";
import type {
  AdminAcademicYear,
  CreateAdminAcademicYearInput,
} from "@/lib/api-client";

type AcademicPeriodForm = CreateAdminAcademicYearInput["periods"][number];

export type AcademicCalendarForm = CreateAdminAcademicYearInput;

type AcademicCalendarPresentationInput = {
  isLoading: boolean;
  academicYears: AdminAcademicYear[];
  isSaving: boolean;
  error: string | null;
  success: string | null;
};

export type AcademicCalendarPresentation = {
  state: "loading" | "empty" | "saving" | "error" | "success" | "ready";
  message: string;
};

type AcademicCalendarFormProps = AcademicCalendarPresentationInput & {
  canManage: boolean;
  timezone: string | null;
  onSave: (input: CreateAdminAcademicYearInput) => Promise<void>;
};

const EMPTY_PERIOD: AcademicPeriodForm = {
  name: "",
  startsOn: "",
  endsOn: "",
};

export function createInitialAcademicCalendarForm(
  values: Partial<AcademicCalendarForm> = {},
): AcademicCalendarForm {
  return {
    reason: values.reason ?? "",
    name: values.name ?? "",
    startsOn: values.startsOn ?? "",
    endsOn: values.endsOn ?? "",
    periods: values.periods?.length ? values.periods : [{ ...EMPTY_PERIOD }],
  };
}

export function academicCalendarPresentation({
  isLoading,
  academicYears,
  isSaving,
  error,
  success,
}: AcademicCalendarPresentationInput): AcademicCalendarPresentation {
  if (isLoading)
    return { state: "loading", message: "Loading academic calendar…" };
  if (error) return { state: "error", message: error };
  if (isSaving)
    return { state: "saving", message: "Saving academic calendar…" };
  if (success) return { state: "success", message: success };
  if (academicYears.length === 0) {
    return { state: "empty", message: "No academic years have been set up." };
  }
  return { state: "ready", message: "Academic calendar ready." };
}

export function getAcademicCalendarValidation(
  value: AcademicCalendarForm,
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!value.name.trim()) errors.name = "Enter an academic year name.";
  if (!isDateOnly(value.startsOn) || !isDateOnly(value.endsOn)) {
    errors.dates = "Enter the academic year start and end dates.";
  } else if (value.endsOn < value.startsOn) {
    errors.dates = "The academic year must end on or after its start date.";
  }
  if (!value.reason.trim()) {
    errors.reason = "Enter a reason for this academic calendar.";
  }
  if (value.periods.length === 0) {
    errors.periods = "Add at least one academic period.";
  } else if (
    value.periods.some(
      (period) =>
        !period.name.trim() ||
        !isDateOnly(period.startsOn) ||
        !isDateOnly(period.endsOn) ||
        period.endsOn < period.startsOn,
    )
  ) {
    errors.periods = "Enter a name and valid date range for each period.";
  } else if (
    isDateOnly(value.startsOn) &&
    isDateOnly(value.endsOn) &&
    value.periods.some(
      (period) =>
        period.startsOn < value.startsOn || period.endsOn > value.endsOn,
    )
  ) {
    errors.periods = "Each period must fall within the academic year.";
  } else if (hasOverlappingPeriods(value.periods)) {
    errors.periods = "Academic periods must not overlap.";
  }
  return errors;
}

export function isAcademicCalendarKeyboardSubmit(event: {
  key: string;
  shiftKey: boolean;
}): boolean {
  return event.key === "Enter" && !event.shiftKey;
}

export function AcademicCalendarForm({
  isLoading,
  academicYears,
  isSaving,
  error,
  success,
  canManage,
  timezone,
  onSave,
}: AcademicCalendarFormProps) {
  const [form, setForm] = React.useState(createInitialAcademicCalendarForm);
  const [validation, setValidation] = React.useState<Record<string, string>>(
    {},
  );
  const presentation = academicCalendarPresentation({
    isLoading,
    academicYears,
    isSaving,
    error,
    success,
  });

  const updateForm = (
    field: Exclude<keyof AcademicCalendarForm, "periods">,
    value: string,
  ) => {
    setForm((current) => ({ ...current, [field]: value }));
  };
  const updatePeriod = (
    index: number,
    field: keyof AcademicPeriodForm,
    value: string,
  ) => {
    setForm((current) => ({
      ...current,
      periods: current.periods.map((period, periodIndex) =>
        periodIndex === index ? { ...period, [field]: value } : period,
      ),
    }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const errors = getAcademicCalendarValidation(form);
    setValidation(errors);
    if (Object.keys(errors).length > 0 || !canManage || isSaving) return;
    await onSave({
      ...form,
      reason: form.reason.trim(),
      name: form.name.trim(),
      periods: form.periods.map((period) => ({
        ...period,
        name: period.name.trim(),
      })),
    });
  };

  return (
    <Card
      title="Academic calendar"
      description="Create the active academic year and its initial periods for this site."
    >
      <div className="space-y-5">
        {timezone ? (
          <p className="text-sm text-text-muted">Site timezone: {timezone}</p>
        ) : null}

        <div aria-live="polite" aria-atomic="true">
          {presentation.state === "loading" ? (
            <div className="space-y-2" aria-label={presentation.message}>
              <span className="block h-3 w-48 animate-pulse rounded bg-muted" />
              <span className="block h-16 w-full animate-pulse rounded bg-muted" />
            </div>
          ) : null}
          {presentation.state !== "loading" &&
          presentation.state !== "ready" ? (
            <p
              className={
                presentation.state === "error"
                  ? "text-sm text-status-danger"
                  : "text-sm text-text-muted"
              }
              role={presentation.state === "error" ? "alert" : "status"}
            >
              {presentation.message}
            </p>
          ) : null}
        </div>

        {!isLoading && academicYears.length > 0 ? (
          <div className="space-y-3">
            <p className="text-sm font-medium text-text-primary">
              Configured years
            </p>
            <ul className="space-y-3">
              {academicYears.map((year) => (
                <li
                  key={year.id}
                  className="rounded-md border border-border-subtle p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-text-primary">
                      {year.name}
                    </span>
                    <Badge
                      variant={
                        year.status === "ACTIVE" ? "success" : "secondary"
                      }
                    >
                      {year.status}
                    </Badge>
                    <span className="text-sm text-text-muted">
                      {year.startsOn} to {year.endsOn}
                    </span>
                  </div>
                  <ul className="mt-2 space-y-1 text-sm text-text-muted">
                    {year.periods.map((period) => (
                      <li key={period.id}>
                        {period.name}: {period.startsOn} to {period.endsOn} (
                        {period.status})
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <form
          onSubmit={submit}
          onKeyDown={(event) => {
            if (isAcademicCalendarKeyboardSubmit(event)) {
              event.preventDefault();
              event.currentTarget.requestSubmit();
            }
          }}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Academic year name"
              id="academic-year-name"
              error={validation.name}
            >
              <input
                id="academic-year-name"
                value={form.name}
                disabled={!canManage || isSaving}
                onChange={(event) => updateForm("name", event.target.value)}
                className={inputClassName}
              />
            </Field>
            <Field
              label="Reason"
              id="academic-year-reason"
              error={validation.reason}
            >
              <input
                id="academic-year-reason"
                value={form.reason}
                disabled={!canManage || isSaving}
                onChange={(event) => updateForm("reason", event.target.value)}
                className={inputClassName}
              />
            </Field>
            <Field
              label="Year starts"
              id="academic-year-start"
              error={validation.dates}
            >
              <input
                id="academic-year-start"
                type="date"
                value={form.startsOn}
                disabled={!canManage || isSaving}
                onChange={(event) => updateForm("startsOn", event.target.value)}
                className={inputClassName}
              />
            </Field>
            <Field
              label="Year ends"
              id="academic-year-end"
              error={validation.dates}
            >
              <input
                id="academic-year-end"
                type="date"
                value={form.endsOn}
                disabled={!canManage || isSaving}
                onChange={(event) => updateForm("endsOn", event.target.value)}
                className={inputClassName}
              />
            </Field>
          </div>

          <fieldset className="space-y-3 rounded-md border border-border-subtle p-3">
            <legend className="px-1 text-sm font-medium text-text-primary">
              Initial periods
            </legend>
            {form.periods.map((period, index) => (
              <div key={index} className="grid gap-3 sm:grid-cols-3">
                <Field
                  label={`Period ${index + 1} name`}
                  id={`academic-period-name-${index}`}
                  error={validation.periods}
                >
                  <input
                    id={`academic-period-name-${index}`}
                    value={period.name}
                    disabled={!canManage || isSaving}
                    onChange={(event) =>
                      updatePeriod(index, "name", event.target.value)
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field
                  label={`Period ${index + 1} starts`}
                  id={`academic-period-start-${index}`}
                  error={validation.periods}
                >
                  <input
                    id={`academic-period-start-${index}`}
                    type="date"
                    value={period.startsOn}
                    disabled={!canManage || isSaving}
                    onChange={(event) =>
                      updatePeriod(index, "startsOn", event.target.value)
                    }
                    className={inputClassName}
                  />
                </Field>
                <Field
                  label={`Period ${index + 1} ends`}
                  id={`academic-period-end-${index}`}
                  error={validation.periods}
                >
                  <input
                    id={`academic-period-end-${index}`}
                    type="date"
                    value={period.endsOn}
                    disabled={!canManage || isSaving}
                    onChange={(event) =>
                      updatePeriod(index, "endsOn", event.target.value)
                    }
                    className={inputClassName}
                  />
                </Field>
              </div>
            ))}
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!canManage || isSaving}
              onClick={() =>
                setForm((current) => ({
                  ...current,
                  periods: [...current.periods, { ...EMPTY_PERIOD }],
                }))
              }
            >
              Add period
            </Button>
          </fieldset>

          {!canManage ? (
            <p className="text-sm text-text-muted">
              You need ACE settings permission to create an academic calendar.
            </p>
          ) : null}
          <Button type="submit" disabled={!canManage || isSaving}>
            {isSaving ? "Saving…" : "Save academic year"}
          </Button>
        </form>
      </div>
    </Card>
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
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error ? <p className="text-sm text-status-danger">{error}</p> : null}
    </div>
  );
}

const inputClassName =
  "h-10 w-full rounded-md border border-border-subtle bg-surface px-3 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary";

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

function hasOverlappingPeriods(periods: AcademicPeriodForm[]): boolean {
  const ordered = [...periods].sort((left, right) =>
    left.startsOn.localeCompare(right.startsOn),
  );
  return ordered.some(
    (period, index) =>
      index > 0 && period.startsOn <= ordered[index - 1].endsOn,
  );
}
