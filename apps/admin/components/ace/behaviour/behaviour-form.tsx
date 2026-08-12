"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import type {
  AdminBehaviourCategory,
  AdminBehaviourCommandInput,
  AdminBehaviourCommandResponse,
  AdminBehaviourType,
  AdminBehaviourVisibility,
} from "@/lib/api-client";
import { siteDateTimeToIso, toSiteDateTimeInput } from "./behaviour-time";

export type BehaviourDraft = {
  childId: string;
  category: string;
  pointsDelta: string;
  occurredAt: string;
  reason: string;
  note: string;
};

type BehaviourFormProps = {
  children: Array<{ id: string; fullName: string }>;
  categories: AdminBehaviourCategory[];
  canSensitive: boolean;
  siteTimeZone: string;
  disabled?: boolean;
  initialDraft?: BehaviourDraft;
  onSave: (
    input: AdminBehaviourCommandInput,
  ) => Promise<AdminBehaviourCommandResponse>;
  onSuccess?: (response: AdminBehaviourCommandResponse) => Promise<void> | void;
};

type Validation = Partial<Record<keyof BehaviourDraft, string>>;
type TypeFilter = AdminBehaviourType | "ALL";

export function BehaviourForm({
  children,
  categories,
  canSensitive,
  siteTimeZone,
  disabled = false,
  initialDraft,
  onSave,
  onSuccess,
}: BehaviourFormProps) {
  const [draft, setDraft] = React.useState<BehaviourDraft>(() =>
    sanitiseDraft(
      initialDraft ?? emptyDraft(siteTimeZone),
      categories,
      canSensitive,
      siteTimeZone,
    ),
  );
  const [typeFilter, setTypeFilter] = React.useState<TypeFilter>("ALL");
  const [visibility, setVisibility] = React.useState<AdminBehaviourVisibility>(
    () => visibilityForDraft(initialDraft, categories, canSensitive),
  );
  const [idempotencyKey, setIdempotencyKey] = React.useState(createCommandKey);
  const [validation, setValidation] = React.useState<Validation>({});
  const [isSaving, setIsSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const submissionGate = React.useRef(false);
  const commandAttempted = React.useRef(false);
  const successRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (!initialDraft) return;
    setDraft(
      sanitiseDraft(initialDraft, categories, canSensitive, siteTimeZone),
    );
    setVisibility(visibilityForDraft(initialDraft, categories, canSensitive));
    setTypeFilter("ALL");
    setIdempotencyKey(createCommandKey());
    setValidation({});
    setError(null);
    setSuccess(null);
    commandAttempted.current = false;
  }, [canSensitive, categories, initialDraft, siteTimeZone]);

  React.useEffect(() => {
    if (canSensitive) return;
    if (commandAttempted.current) {
      commandAttempted.current = false;
      setIdempotencyKey(createCommandKey());
    }
    setVisibility("GENERAL");
    setDraft((current) =>
      sanitiseDraft(current, categories, false, siteTimeZone),
    );
  }, [canSensitive, categories, siteTimeZone]);

  React.useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  const availableCategories = categories.filter(
    (category) =>
      category.isActive &&
      category.visibility === visibility &&
      (typeFilter === "ALL" || category.type === typeFilter),
  );

  const editDraft = (
    updateDraft: (current: BehaviourDraft) => BehaviourDraft,
  ) => {
    const rotateKey = commandAttempted.current;
    commandAttempted.current = false;
    if (rotateKey) setIdempotencyKey(createCommandKey());
    setDraft(updateDraft);
    setError(null);
    setSuccess(null);
  };

  const update = (field: keyof BehaviourDraft, value: string) => {
    editDraft((current) => ({ ...current, [field]: value }));
    setValidation((current) => ({ ...current, [field]: undefined }));
  };

  const selectVisibility = (next: AdminBehaviourVisibility) => {
    if (next === "SENSITIVE" && !canSensitive) return;
    setVisibility(next);
    editDraft((current) => ({ ...current, category: "" }));
    setValidation((current) => ({ ...current, category: undefined }));
  };

  const selectCategory = (category: AdminBehaviourCategory) => {
    if (!isSelectableCategory(category, canSensitive)) return;
    editDraft((current) => ({
      ...current,
      category: category.code,
      pointsDelta: defaultPoints(category.type),
    }));
    setValidation((current) => ({
      ...current,
      category: undefined,
      pointsDelta: undefined,
    }));
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submissionGate.current || disabled) return;

    const category = categories.find(
      (candidate) =>
        candidate.code === draft.category &&
        isSelectableCategory(candidate, canSensitive),
    );
    const errors = validateDraft(draft, category, siteTimeZone);
    setValidation(errors);
    if (Object.keys(errors).length > 0 || !category) return;

    submissionGate.current = true;
    commandAttempted.current = true;
    setIsSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await onSave(
        toCommand(draft, category, idempotencyKey, siteTimeZone),
      );
      setSuccess(
        response.duplicate
          ? "This behaviour was already recorded."
          : "Behaviour recorded.",
      );
      setIdempotencyKey(createCommandKey());
      commandAttempted.current = false;
      setDraft((current) => ({
        ...emptyDraft(siteTimeZone),
        childId: current.childId,
      }));
      setTypeFilter("ALL");
      setVisibility("GENERAL");
      setValidation({});
      await onSuccess?.(response);
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Unable to record this behaviour.",
      );
    } finally {
      submissionGate.current = false;
      setIsSaving(false);
    }
  };

  const formDisabled = disabled || isSaving;

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div>
        <h2 className="font-heading text-lg font-semibold text-text-primary">
          Record behaviour
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Choose a learner and one active site category. Policy and escalation
          are confirmed by the server.
        </p>
      </div>

      <form
        aria-label="Record behaviour"
        className="mt-5 space-y-5"
        onSubmit={submit}
      >
        <Field id="behaviour-child" label="Learner" error={validation.childId}>
          <select
            id="behaviour-child"
            className={controlClassName}
            value={draft.childId}
            disabled={formDisabled}
            onChange={(event) => update("childId", event.target.value)}
            aria-invalid={Boolean(validation.childId)}
            aria-describedby={
              validation.childId ? "behaviour-child-error" : undefined
            }
          >
            <option value="">Choose a learner</option>
            {children.map((child) => (
              <option key={child.id} value={child.id}>
                {child.fullName}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="behaviour-type-filter" label="Category type">
            <select
              id="behaviour-type-filter"
              className={controlClassName}
              value={typeFilter}
              disabled={formDisabled}
              onChange={(event) => {
                setTypeFilter(event.target.value as TypeFilter);
                update("category", "");
              }}
            >
              <option value="ALL">All types</option>
              <option value="MERIT">Merit</option>
              <option value="DEMERIT">Demerit</option>
              <option value="GENERAL">General</option>
            </select>
          </Field>

          {canSensitive ? (
            <fieldset>
              <legend className="text-sm font-medium text-text-primary">
                Record visibility
              </legend>
              <div className="mt-2 flex flex-wrap gap-2">
                <VisibilityOption
                  id="behaviour-visibility-general"
                  label="General records"
                  value="GENERAL"
                  checked={visibility === "GENERAL"}
                  disabled={formDisabled}
                  onSelect={selectVisibility}
                />
                <VisibilityOption
                  id="behaviour-visibility-sensitive"
                  label="Sensitive records"
                  value="SENSITIVE"
                  checked={visibility === "SENSITIVE"}
                  disabled={formDisabled}
                  onSelect={selectVisibility}
                />
              </div>
            </fieldset>
          ) : null}
        </div>

        {visibility === "SENSITIVE" && canSensitive ? (
          <div
            className="rounded-md border border-warning/40 bg-warning/10 p-3 text-sm text-text-primary"
            role="alert"
          >
            You are creating a restricted behaviour record. Only authorised
            staff can view or correct it.
          </div>
        ) : null}

        <fieldset
          aria-describedby={
            validation.category ? "behaviour-category-error" : undefined
          }
          aria-label="Behaviour categories"
          role="radiogroup"
        >
          <legend className="text-sm font-medium text-text-primary">
            Category
          </legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {availableCategories.map((category) => (
              <label
                key={category.code}
                htmlFor={`behaviour-category-${category.code}`}
                className="flex min-h-12 cursor-pointer items-center gap-3 rounded-md border border-border px-3 py-2 text-sm text-text-primary has-[:checked]:border-primary has-[:checked]:bg-primary/5"
              >
                <input
                  id={`behaviour-category-${category.code}`}
                  name="behaviour-category"
                  type="radio"
                  value={category.code}
                  checked={draft.category === category.code}
                  disabled={formDisabled}
                  onChange={() => selectCategory(category)}
                />
                <span>
                  <span className="block font-medium">{category.label}</span>
                  <span className="block text-xs text-text-muted">
                    {typeLabel(category.type)}
                  </span>
                </span>
              </label>
            ))}
          </div>
          {availableCategories.length === 0 ? (
            <p className="mt-2 text-sm text-text-muted">
              No active categories match this filter.
            </p>
          ) : null}
          {validation.category ? (
            <p
              id="behaviour-category-error"
              className="mt-1 text-sm text-red-700"
              role="alert"
            >
              {validation.category}
            </p>
          ) : null}
        </fieldset>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            id="behaviour-points"
            label="Points"
            error={validation.pointsDelta}
          >
            <input
              id="behaviour-points"
              className={controlClassName}
              inputMode="numeric"
              type="number"
              value={draft.pointsDelta}
              disabled={formDisabled}
              onChange={(event) => update("pointsDelta", event.target.value)}
              aria-invalid={Boolean(validation.pointsDelta)}
              aria-describedby={
                validation.pointsDelta ? "behaviour-points-error" : undefined
              }
            />
          </Field>
          <Field
            id="behaviour-occurred-at"
            label="Occurred at"
            error={validation.occurredAt}
          >
            <input
              id="behaviour-occurred-at"
              className={controlClassName}
              type="datetime-local"
              value={draft.occurredAt}
              disabled={formDisabled}
              onChange={(event) => update("occurredAt", event.target.value)}
              aria-invalid={Boolean(validation.occurredAt)}
              aria-describedby={
                validation.occurredAt
                  ? "behaviour-occurred-at-error"
                  : undefined
              }
            />
          </Field>
        </div>

        <Field id="behaviour-reason" label="Reason" error={validation.reason}>
          <input
            id="behaviour-reason"
            className={controlClassName}
            value={draft.reason}
            disabled={formDisabled}
            maxLength={1000}
            onChange={(event) => update("reason", event.target.value)}
            aria-invalid={Boolean(validation.reason)}
            aria-describedby={
              validation.reason ? "behaviour-reason-error" : undefined
            }
          />
        </Field>
        <Field id="behaviour-note" label="Note (optional)">
          <textarea
            id="behaviour-note"
            className={`${controlClassName} min-h-24`}
            value={draft.note}
            disabled={formDisabled}
            maxLength={4000}
            onChange={(event) => update("note", event.target.value)}
          />
        </Field>

        {error ? (
          <div
            className="rounded-md bg-red-50 p-3 text-sm text-red-700"
            role="alert"
          >
            {error}
          </div>
        ) : null}
        {success ? (
          <div
            ref={successRef}
            className="rounded-md bg-green-50 p-3 text-sm text-text-primary"
            role="status"
            tabIndex={-1}
          >
            {success}
          </div>
        ) : null}

        <Button type="submit" disabled={formDisabled}>
          {isSaving ? "Recording behaviour…" : "Record behaviour"}
        </Button>
      </form>
    </section>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="mt-1">{children}</div>
      {error ? (
        <p
          id={`${id}-error`}
          className="mt-1 text-sm text-red-700"
          role="alert"
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function VisibilityOption({
  id,
  label,
  value,
  checked,
  disabled,
  onSelect,
}: {
  id: string;
  label: string;
  value: AdminBehaviourVisibility;
  checked: boolean;
  disabled: boolean;
  onSelect: (value: AdminBehaviourVisibility) => void;
}) {
  return (
    <label
      htmlFor={id}
      className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-text-primary"
    >
      <input
        id={id}
        name="behaviour-visibility"
        type="radio"
        checked={checked}
        disabled={disabled}
        onChange={() => onSelect(value)}
      />
      {label}
    </label>
  );
}

function emptyDraft(siteTimeZone: string): BehaviourDraft {
  return {
    childId: "",
    category: "",
    pointsDelta: "",
    occurredAt: toSiteDateTimeInput(new Date().toISOString(), siteTimeZone),
    reason: "",
    note: "",
  };
}

function sanitiseDraft(
  draft: BehaviourDraft,
  categories: AdminBehaviourCategory[],
  canSensitive: boolean,
  siteTimeZone: string,
): BehaviourDraft {
  const localDraft = {
    ...draft,
    occurredAt: toSiteDateTimeInput(draft.occurredAt, siteTimeZone),
  };
  const category = categories.find(
    (candidate) => candidate.code === localDraft.category,
  );
  if (
    !canSensitive &&
    (category?.visibility === "SENSITIVE" || (!category && draft.category))
  ) {
    return {
      ...localDraft,
      category: "",
      pointsDelta: "",
      reason: "",
      note: "",
    };
  }
  if (!category || !isSelectableCategory(category, canSensitive)) {
    return { ...localDraft, category: "" };
  }
  return localDraft;
}

function visibilityForDraft(
  draft: BehaviourDraft | undefined,
  categories: AdminBehaviourCategory[],
  canSensitive: boolean,
): AdminBehaviourVisibility {
  if (!draft || !canSensitive) return "GENERAL";
  return categories.find((category) => category.code === draft.category)
    ?.visibility === "SENSITIVE"
    ? "SENSITIVE"
    : "GENERAL";
}

function isSelectableCategory(
  category: AdminBehaviourCategory,
  canSensitive: boolean,
): boolean {
  return (
    category.isActive && (category.visibility === "GENERAL" || canSensitive)
  );
}

function validateDraft(
  draft: BehaviourDraft,
  category: AdminBehaviourCategory | undefined,
  siteTimeZone: string,
): Validation {
  const errors: Validation = {};
  if (!draft.childId) errors.childId = "Choose a learner.";
  if (!category) errors.category = "Choose an active category.";
  const points = Number(draft.pointsDelta);
  if (!Number.isInteger(points)) {
    errors.pointsDelta = "Enter a whole number of points.";
  } else if (
    category &&
    ((category.type === "MERIT" && points <= 0) ||
      (category.type === "DEMERIT" && points >= 0) ||
      (category.type === "GENERAL" && points !== 0))
  ) {
    errors.pointsDelta =
      "Merit points must be positive, Demerit points negative, and General points zero.";
  }
  if (!siteDateTimeToIso(draft.occurredAt, siteTimeZone)) {
    errors.occurredAt = "Enter when this behaviour occurred.";
  }
  if (!draft.reason.trim()) errors.reason = "Enter a reason.";
  return errors;
}

function toCommand(
  draft: BehaviourDraft,
  category: AdminBehaviourCategory,
  idempotencyKey: string,
  siteTimeZone: string,
): AdminBehaviourCommandInput {
  const note = draft.note.trim();
  return {
    idempotencyKey,
    childId: draft.childId,
    category: category.code,
    type: category.type,
    visibility: category.visibility,
    pointsDelta: Number(draft.pointsDelta),
    occurredAt: siteDateTimeToIso(draft.occurredAt, siteTimeZone)!,
    reason: draft.reason.trim(),
    ...(note ? { note } : {}),
  };
}

function defaultPoints(type: AdminBehaviourType): string {
  if (type === "MERIT") return "1";
  if (type === "DEMERIT") return "-1";
  return "0";
}

function typeLabel(type: AdminBehaviourType): string {
  if (type === "MERIT") return "Merit";
  if (type === "DEMERIT") return "Demerit";
  return "General";
}

function createCommandKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `behaviour-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const controlClassName =
  "w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
