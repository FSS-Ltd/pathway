"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import type {
  AdminBehaviourCategory,
  AdminBehaviourCorrectionInput,
  AdminBehaviourCommandResponse,
  AdminBehaviourEntry,
} from "@/lib/api-client";
import { siteDateTimeToIso, toSiteDateTimeInput } from "./behaviour-time";

type Props = {
  entry: AdminBehaviourEntry;
  categories: AdminBehaviourCategory[];
  canSensitive: boolean;
  siteTimeZone: string;
  onCancel: () => void;
  onCorrect: (
    entryId: string,
    input: AdminBehaviourCorrectionInput,
  ) => Promise<AdminBehaviourCommandResponse>;
  onSuccess: (response: AdminBehaviourCommandResponse) => Promise<void> | void;
};

export function BehaviourCorrectionForm({
  entry,
  categories,
  canSensitive,
  siteTimeZone,
  onCancel,
  onCorrect,
  onSuccess,
}: Props) {
  const [categoryCode, setCategoryCode] = React.useState(entry.category);
  const [points, setPoints] = React.useState(String(entry.pointsDelta));
  const [occurredAt, setOccurredAt] = React.useState(
    toSiteDateTimeInput(entry.occurredAt, siteTimeZone),
  );
  const [reason, setReason] = React.useState(entry.reason);
  const [note, setNote] = React.useState(entry.note ?? "");
  const [correctionReason, setCorrectionReason] = React.useState("");
  const [idempotencyKey, setIdempotencyKey] = React.useState(createCommandKey);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const submitting = React.useRef(false);
  const attempted = React.useRef(false);
  const availableCategories = categories.filter(
    (candidate) =>
      candidate.isActive &&
      (candidate.visibility === "GENERAL" || canSensitive),
  );
  const selectedCategory = availableCategories.find(
    (candidate) => candidate.code === categoryCode,
  );

  const edit = (change: () => void) => {
    if (attempted.current) {
      attempted.current = false;
      setIdempotencyKey(createCommandKey());
    }
    change();
    setError(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    const pointValue = Number(points);
    const occurredIso = siteDateTimeToIso(occurredAt, siteTimeZone);
    if (!selectedCategory) return setError("Choose an active category.");
    if (
      !points.trim() ||
      !Number.isInteger(pointValue) ||
      Math.abs(pointValue) > 10_000 ||
      (selectedCategory.type === "MERIT" && pointValue <= 0) ||
      (selectedCategory.type === "DEMERIT" && pointValue >= 0) ||
      (selectedCategory.type === "GENERAL" && pointValue !== 0)
    ) {
      return setError(
        "Enter valid whole-number points for the selected category.",
      );
    }
    if (!occurredIso)
      return setError("Enter a valid site-local occurrence time.");
    if (!reason.trim())
      return setError("Enter the replacement behaviour reason.");
    if (!correctionReason.trim())
      return setError("Explain why this correction is needed.");

    submitting.current = true;
    attempted.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const input: AdminBehaviourCorrectionInput = {
        idempotencyKey,
        childId: entry.childId,
        category: selectedCategory.code,
        type: selectedCategory.type,
        visibility: selectedCategory.visibility,
        pointsDelta: pointValue,
        occurredAt: occurredIso,
        reason: reason.trim(),
        correctionReason: correctionReason.trim(),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      await onSuccess(await onCorrect(entry.id, input));
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Unable to correct this behaviour record.",
      );
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  };

  return (
    <form
      aria-label="Correct behaviour record"
      className="mt-4 space-y-3 border-t border-border pt-4"
      onSubmit={submit}
    >
      <p className="text-sm text-text-muted">
        The learner stays the same. Your changes create a linked replacement
        fact.
      </p>
      <div>
        <Label htmlFor={`behaviour-correction-category-${entry.id}`}>
          Replacement category
        </Label>
        <select
          id={`behaviour-correction-category-${entry.id}`}
          className={controlClassName}
          value={categoryCode}
          disabled={isSaving}
          required
          onChange={(event) => {
            const next = availableCategories.find(
              (candidate) => candidate.code === event.target.value,
            );
            edit(() => {
              setCategoryCode(event.target.value);
              if (next && next.code !== categoryCode)
                setPoints(
                  next.type === "MERIT"
                    ? "1"
                    : next.type === "DEMERIT"
                      ? "-1"
                      : "0",
                );
            });
          }}
        >
          <option value="">Choose a category</option>
          {availableCategories.map((candidate) => (
            <option key={candidate.code} value={candidate.code}>
              {candidate.label} · {candidate.type.toLowerCase()} ·{" "}
              {candidate.visibility.toLowerCase()}
            </option>
          ))}
        </select>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label htmlFor={`behaviour-correction-points-${entry.id}`}>
            Replacement points
          </Label>
          <input
            id={`behaviour-correction-points-${entry.id}`}
            className={controlClassName}
            type="number"
            min={-10000}
            max={10000}
            step={1}
            value={points}
            disabled={isSaving}
            required
            onChange={(event) => edit(() => setPoints(event.target.value))}
          />
        </div>
        <div>
          <Label htmlFor={`behaviour-correction-occurred-${entry.id}`}>
            Occurred at
          </Label>
          <input
            id={`behaviour-correction-occurred-${entry.id}`}
            className={controlClassName}
            type="datetime-local"
            value={occurredAt}
            disabled={isSaving}
            required
            onChange={(event) => edit(() => setOccurredAt(event.target.value))}
          />
        </div>
      </div>
      <div>
        <Label htmlFor={`behaviour-correction-fact-reason-${entry.id}`}>
          Replacement behaviour reason
        </Label>
        <input
          id={`behaviour-correction-fact-reason-${entry.id}`}
          className={controlClassName}
          value={reason}
          maxLength={1000}
          disabled={isSaving}
          required
          onChange={(event) => edit(() => setReason(event.target.value))}
        />
      </div>
      <div>
        <Label htmlFor={`behaviour-correction-note-${entry.id}`}>
          Replacement note (optional)
        </Label>
        <textarea
          id={`behaviour-correction-note-${entry.id}`}
          className={`${controlClassName} min-h-20`}
          value={note}
          maxLength={4000}
          disabled={isSaving}
          onChange={(event) => edit(() => setNote(event.target.value))}
        />
      </div>
      <div>
        <Label htmlFor={`behaviour-correction-reason-${entry.id}`}>
          Why are you correcting this?
        </Label>
        <textarea
          id={`behaviour-correction-reason-${entry.id}`}
          className={`${controlClassName} min-h-20`}
          value={correctionReason}
          maxLength={1000}
          disabled={isSaving}
          required
          onChange={(event) =>
            edit(() => setCorrectionReason(event.target.value))
          }
        />
      </div>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" disabled={isSaving}>
          {isSaving ? "Saving correction…" : "Save correction"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={isSaving}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}

function createCommandKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `behaviour-correction-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

const controlClassName =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
