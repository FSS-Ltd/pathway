"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import type {
  AdminBehaviourCommandInput,
  AdminBehaviourCommandResponse,
  AdminBehaviourEntry,
} from "@/lib/api-client";
import { formatSiteDateTime } from "./behaviour-time";

type BehaviourHistoryProps = {
  isLoading: boolean;
  error: string | null;
  items: AdminBehaviourEntry[];
  children: Array<{ id: string; fullName: string }>;
  canCorrect: boolean;
  canSensitive: boolean;
  siteTimeZone: string;
  onRetry: () => void;
  onCorrect: (
    entryId: string,
    input: AdminBehaviourCommandInput,
  ) => Promise<AdminBehaviourCommandResponse>;
  onSuccess?: (response: AdminBehaviourCommandResponse) => Promise<void> | void;
};

export function BehaviourHistory({
  isLoading,
  error,
  items,
  children,
  canCorrect,
  canSensitive,
  siteTimeZone,
  onRetry,
  onCorrect,
  onSuccess,
}: BehaviourHistoryProps) {
  const visibleItems = items.filter(
    (item) => item.visibility === "GENERAL" || canSensitive,
  );
  const childNames = new Map(
    children.map((child) => [child.id, child.fullName]),
  );
  const [correctionTarget, setCorrectionTarget] = React.useState<string | null>(
    null,
  );
  const [success, setSuccess] = React.useState<string | null>(null);
  const successRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (canSensitive || !correctionTarget) return;
    const target = items.find((item) => item.id === correctionTarget);
    if (target?.visibility === "SENSITIVE") setCorrectionTarget(null);
  }, [canSensitive, correctionTarget, items]);

  React.useEffect(() => {
    if (success) successRef.current?.focus();
  }, [success]);

  return (
    <section className="rounded-lg border border-border bg-surface p-5">
      <div>
        <h2 className="font-heading text-lg font-semibold text-text-primary">
          Behaviour history
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Current records are shown newest first. Corrections create a linked
          replacement and keep the original audit trail.
        </p>
      </div>

      {success ? (
        <div
          ref={successRef}
          className="mt-5 rounded-md bg-green-50 p-3 text-sm text-text-primary"
          role="status"
          tabIndex={-1}
        >
          {success}
        </div>
      ) : null}

      {isLoading ? (
        <div aria-label="Loading behaviour history…" className="mt-5 space-y-2">
          <div className="h-16 animate-pulse rounded-md bg-muted" />
          <div className="h-16 animate-pulse rounded-md bg-muted" />
        </div>
      ) : null}

      {!isLoading && error ? (
        <div
          className="mt-5 rounded-md bg-red-50 p-3 text-sm text-red-700"
          role="alert"
        >
          <p>{error}</p>
          <Button
            id="behaviour-history-retry"
            className="mt-3"
            type="button"
            variant="secondary"
            onClick={onRetry}
          >
            Try again
          </Button>
        </div>
      ) : null}

      {!isLoading && !error && visibleItems.length === 0 ? (
        <p className="mt-5 rounded-md bg-muted p-4 text-sm text-text-muted">
          No behaviour records yet.
        </p>
      ) : null}

      {!isLoading && visibleItems.length > 0 ? (
        <ol className="mt-5 space-y-3">
          {visibleItems.map((item) => (
            <li key={item.id} className="rounded-md border border-border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-text-primary">
                    {childNames.get(item.childId) ?? "Learner"} ·{" "}
                    {formatCategory(item.category)}
                  </p>
                  <p className="mt-1 text-sm text-text-muted">
                    {formatType(item.type)} · {formatPoints(item.pointsDelta)} ·{" "}
                    <time dateTime={item.occurredAt}>
                      {formatSiteDateTime(item.occurredAt, siteTimeZone)}
                    </time>
                  </p>
                  <p className="mt-2 text-sm text-text-primary">
                    {item.reason}
                  </p>
                  {item.note ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm text-text-muted">
                      {item.note}
                    </p>
                  ) : null}
                </div>
                {canCorrect ? (
                  <Button
                    id={`behaviour-correct-${item.id}`}
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      setSuccess(null);
                      setCorrectionTarget(item.id);
                    }}
                  >
                    Correct
                  </Button>
                ) : null}
              </div>
              {correctionTarget === item.id ? (
                <CorrectionForm
                  entry={item}
                  onCancel={() => setCorrectionTarget(null)}
                  onCorrect={onCorrect}
                  onSuccess={async (response) => {
                    setCorrectionTarget(null);
                    setSuccess(
                      response.duplicate
                        ? "This correction was already recorded."
                        : "Correction recorded.",
                    );
                    await onSuccess?.(response);
                  }}
                />
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function CorrectionForm({
  entry,
  onCancel,
  onCorrect,
  onSuccess,
}: {
  entry: AdminBehaviourEntry;
  onCancel: () => void;
  onCorrect: BehaviourHistoryProps["onCorrect"];
  onSuccess: (response: AdminBehaviourCommandResponse) => Promise<void> | void;
}) {
  const [reason, setReason] = React.useState("");
  const [note, setNote] = React.useState(entry.note ?? "");
  const [idempotencyKey, setIdempotencyKey] = React.useState(createCommandKey);
  const [reasonError, setReasonError] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const submitting = React.useRef(false);
  const commandAttempted = React.useRef(false);

  const editCommand = (edit: () => void) => {
    if (commandAttempted.current) {
      commandAttempted.current = false;
      setIdempotencyKey(createCommandKey());
    }
    edit();
    setError(null);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting.current) return;
    if (!reason.trim()) {
      setReasonError("Enter a reason for this correction.");
      return;
    }

    submitting.current = true;
    commandAttempted.current = true;
    setIsSaving(true);
    setError(null);
    try {
      const trimmedNote = note.trim();
      const response = await onCorrect(entry.id, {
        idempotencyKey,
        childId: entry.childId,
        category: entry.category,
        type: entry.type,
        visibility: entry.visibility,
        pointsDelta: entry.pointsDelta,
        occurredAt: entry.occurredAt,
        reason: reason.trim(),
        ...(trimmedNote ? { note: trimmedNote } : {}),
      });
      await onSuccess(response);
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
      <div>
        <Label htmlFor={`behaviour-correction-reason-${entry.id}`}>
          Correction reason
        </Label>
        <input
          id={`behaviour-correction-reason-${entry.id}`}
          className={controlClassName}
          value={reason}
          maxLength={1000}
          disabled={isSaving}
          onChange={(event) => {
            editCommand(() => setReason(event.target.value));
            setReasonError(null);
          }}
          aria-invalid={Boolean(reasonError)}
          aria-describedby={
            reasonError
              ? `behaviour-correction-reason-${entry.id}-error`
              : undefined
          }
        />
        {reasonError ? (
          <p
            id={`behaviour-correction-reason-${entry.id}-error`}
            className="mt-1 text-sm text-red-700"
            role="alert"
          >
            {reasonError}
          </p>
        ) : null}
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
          onChange={(event) => editCommand(() => setNote(event.target.value))}
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

function formatCategory(category: string): string {
  return category
    .split("-")
    .filter(Boolean)
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatType(type: AdminBehaviourEntry["type"]): string {
  if (type === "MERIT") return "Merit";
  if (type === "DEMERIT") return "Demerit";
  return "General";
}

function formatPoints(points: number): string {
  if (points > 0) return `+${points} points`;
  if (points < 0) return `${points} points`;
  return "No points";
}

function createCommandKey(): string {
  const uuid = globalThis.crypto?.randomUUID?.();
  if (uuid) return uuid;
  return `behaviour-correction-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

const controlClassName =
  "mt-1 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
