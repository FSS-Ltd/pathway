"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import type {
  AdminBehaviourBatchInput,
  AdminBehaviourBatchResponse,
  AdminBehaviourCategory,
} from "@/lib/api-client";
import { siteDateTimeToIso, toSiteDateTimeInput } from "./behaviour-time";

type BatchRow = {
  id: string;
  category: string;
  points: string;
  quantity: string;
  reason: string;
  note: string;
};

type Props = {
  children: Array<{ id: string; fullName: string }>;
  categories: AdminBehaviourCategory[];
  canSensitive: boolean;
  siteTimeZone: string;
  disabled: boolean;
  onSave: (
    input: AdminBehaviourBatchInput,
  ) => Promise<AdminBehaviourBatchResponse>;
  onSuccess: () => Promise<void> | void;
};

const controlClass =
  "w-full min-h-10 rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

function newRow(): BatchRow {
  return {
    id: crypto.randomUUID(),
    category: "",
    points: "",
    quantity: "1",
    reason: "",
    note: "",
  };
}

export function BehaviourBatchForm({
  children,
  categories,
  canSensitive,
  siteTimeZone,
  disabled,
  onSave,
  onSuccess,
}: Props) {
  const [childIds, setChildIds] = React.useState<string[]>([]);
  const [occurredAt, setOccurredAt] = React.useState(() =>
    toSiteDateTimeInput(new Date().toISOString(), siteTimeZone),
  );
  const [rows, setRows] = React.useState<BatchRow[]>(() => [newRow()]);
  const [key, setKey] = React.useState(() => crypto.randomUUID());
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);
  const attempted = React.useRef(false);
  const submitting = React.useRef(false);
  const successRef = React.useRef<HTMLParagraphElement>(null);
  const allowedCategories = categories.filter(
    (category) =>
      category.isActive && (canSensitive || category.visibility === "GENERAL"),
  );
  const selectedCategories = rows.map((row) =>
    allowedCategories.find((category) => category.code === row.category),
  );
  const factCount =
    childIds.length *
    rows.reduce((count, row) => count + (Number(row.quantity) || 0), 0);

  React.useEffect(() => {
    if (canSensitive) return;
    setRows((current) =>
      current.map((row) => {
        const category = categories.find((item) => item.code === row.category);
        return category?.visibility === "SENSITIVE"
          ? { ...row, category: "", points: "", reason: "", note: "" }
          : row;
      }),
    );
  }, [canSensitive, categories]);

  React.useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  const edit = (next: () => void) => {
    if (attempted.current) setKey(crypto.randomUUID());
    attempted.current = false;
    setError(null);
    setSuccess(null);
    next();
  };

  const updateRow = (id: string, change: Partial<BatchRow>) => {
    edit(() =>
      setRows((current) =>
        current.map((row) => (row.id === id ? { ...row, ...change } : row)),
      ),
    );
  };

  const selectCategory = (row: BatchRow, code: string) => {
    const category = allowedCategories.find((item) => item.code === code);
    updateRow(row.id, {
      category: code,
      points:
        category?.type === "MERIT"
          ? "1"
          : category?.type === "DEMERIT"
            ? "-1"
            : "0",
    });
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (disabled || submitting.current) return;
    const instant = siteDateTimeToIso(occurredAt, siteTimeZone);
    const quantities = rows.map((row) => Number(row.quantity));
    const points = rows.map((row) => Number(row.points));
    if (childIds.length === 0) return setError("Choose at least one learner.");
    if (!instant) return setError("Enter a valid site-local occurrence time.");
    if (
      factCount < 1 ||
      factCount > 50 ||
      quantities.some(
        (quantity) =>
          !Number.isInteger(quantity) || quantity < 1 || quantity > 50,
      )
    )
      return setError("A batch must create between 1 and 50 facts.");
    if (
      rows.some((row, index) => {
        const category = selectedCategories[index];
        const value = points[index];
        return (
          !category ||
          !row.reason.trim() ||
          !Number.isInteger(value) ||
          (category.type === "MERIT" && value <= 0) ||
          (category.type === "DEMERIT" && value >= 0) ||
          (category.type === "GENERAL" && value !== 0)
        );
      })
    )
      return setError(
        "Each row needs an active category, a reason, and valid points.",
      );

    submitting.current = true;
    attempted.current = true;
    setPending(true);
    setError(null);
    try {
      const result = await onSave({
        idempotencyKey: key,
        childIds,
        occurredAt: instant,
        entries: rows.map((row, index) => {
          const category = selectedCategories[index];
          if (!category)
            throw new Error("Choose an active category for every entry.");
          return {
            category: category.code,
            type: category.type,
            visibility: category.visibility,
            pointsDelta: points[index] ?? 0,
            reason: row.reason.trim(),
            ...(row.note.trim() ? { note: row.note.trim() } : {}),
            quantity: quantities[index] ?? 0,
          };
        }),
      });
      setSuccess(
        result.duplicate
          ? "This batch was already recorded."
          : `${result.entries.length} behaviour facts recorded.`,
      );
      setRows([newRow()]);
      setKey(crypto.randomUUID());
      attempted.current = false;
      await onSuccess();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to record this batch.",
      );
    } finally {
      submitting.current = false;
      setPending(false);
    }
  };

  return (
    <form
      aria-label="Record behaviour batch"
      onSubmit={submit}
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label htmlFor="batch-occurred-at">Occurred at</Label>
          <input
            id="batch-occurred-at"
            type="datetime-local"
            className={controlClass}
            value={occurredAt}
            disabled={disabled || pending}
            onChange={(event) => edit(() => setOccurredAt(event.target.value))}
          />
        </div>
        <p className="self-end text-sm text-text-muted" aria-live="polite">
          {factCount} of 50 facts · {childIds.length} learners · {rows.length}{" "}
          rows
        </p>
      </div>
      <fieldset className="rounded-lg border border-border p-3">
        <legend className="px-1 text-sm font-medium text-text-primary">
          Learners
        </legend>
        <div className="max-h-36 space-y-1 overflow-y-auto">
          {children.map((child) => (
            <label
              key={child.id}
              className="flex min-h-9 items-center gap-2 rounded px-2 text-sm text-text-primary hover:bg-muted"
            >
              <input
                type="checkbox"
                checked={childIds.includes(child.id)}
                disabled={disabled || pending}
                onChange={() =>
                  edit(() =>
                    setChildIds((current) =>
                      current.includes(child.id)
                        ? current.filter((id) => id !== child.id)
                        : [...current, child.id],
                    ),
                  )
                }
              />
              {child.fullName}
            </label>
          ))}
          {children.length === 0 ? (
            <p className="text-sm text-text-muted">No active learners found.</p>
          ) : null}
        </div>
      </fieldset>
      <div className="space-y-3">
        {rows.map((row, index) => (
          <fieldset
            key={row.id}
            className="rounded-xl border border-border bg-muted/30 p-3"
          >
            <legend className="px-1 text-sm font-medium text-text-primary">
              Entry {index + 1}
            </legend>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_5rem_5rem]">
              <div>
                <Label htmlFor={`batch-category-${row.id}`}>Category</Label>
                <select
                  id={`batch-category-${row.id}`}
                  className={controlClass}
                  value={row.category}
                  disabled={disabled || pending}
                  onChange={(event) => selectCategory(row, event.target.value)}
                >
                  <option value="">Choose category</option>
                  {allowedCategories.map((category) => (
                    <option key={category.code} value={category.code}>
                      {category.label} · {category.type.toLowerCase()}
                      {category.visibility === "SENSITIVE"
                        ? " · sensitive"
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor={`batch-points-${row.id}`}>Points</Label>
                <input
                  id={`batch-points-${row.id}`}
                  type="number"
                  className={controlClass}
                  value={row.points}
                  disabled={disabled || pending}
                  onChange={(event) =>
                    updateRow(row.id, { points: event.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor={`batch-quantity-${row.id}`}>Quantity</Label>
                <input
                  id={`batch-quantity-${row.id}`}
                  type="number"
                  min={1}
                  max={50}
                  className={controlClass}
                  value={row.quantity}
                  disabled={disabled || pending}
                  onChange={(event) =>
                    updateRow(row.id, { quantity: event.target.value })
                  }
                />
              </div>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor={`batch-reason-${row.id}`}>Reason</Label>
                <input
                  id={`batch-reason-${row.id}`}
                  className={controlClass}
                  maxLength={1000}
                  value={row.reason}
                  disabled={disabled || pending}
                  onChange={(event) =>
                    updateRow(row.id, { reason: event.target.value })
                  }
                />
              </div>
              <div>
                <Label htmlFor={`batch-note-${row.id}`}>Note (optional)</Label>
                <input
                  id={`batch-note-${row.id}`}
                  className={controlClass}
                  maxLength={4000}
                  value={row.note}
                  disabled={disabled || pending}
                  onChange={(event) =>
                    updateRow(row.id, { note: event.target.value })
                  }
                />
              </div>
            </div>
            {rows.length > 1 ? (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="mt-3"
                disabled={disabled || pending}
                onClick={() =>
                  edit(() =>
                    setRows((current) =>
                      current.filter((item) => item.id !== row.id),
                    ),
                  )
                }
              >
                Remove entry {index + 1}
              </Button>
            ) : null}
          </fieldset>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || pending || rows.length >= 50}
          onClick={() =>
            edit(() => setRows((current) => [...current, newRow()]))
          }
        >
          Add entry
        </Button>
        <Button type="submit" disabled={disabled || pending || factCount > 50}>
          {pending ? "Recording batch…" : "Record batch"}
        </Button>
      </div>
      {factCount > 50 ? (
        <p role="alert" className="text-sm text-status-danger">
          Reduce learners or quantities to 50 facts or fewer.
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="text-sm text-status-danger">
          {error}
        </p>
      ) : null}
      {success ? (
        <p
          ref={successRef}
          role="status"
          tabIndex={-1}
          className="text-sm text-status-success"
        >
          {success}
        </p>
      ) : null}
    </form>
  );
}
