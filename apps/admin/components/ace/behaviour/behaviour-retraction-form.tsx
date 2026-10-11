"use client";

import React from "react";
import { Button, Label } from "@pathway/ui";
import type {
  AdminBehaviourEntry,
  AdminBehaviourRetractionInput,
  AdminBehaviourRetractionResponse,
} from "@/lib/api-client";

type Props = {
  entry: AdminBehaviourEntry;
  onCancel: () => void;
  onRetract: (
    entryId: string,
    input: AdminBehaviourRetractionInput,
  ) => Promise<AdminBehaviourRetractionResponse>;
  onSuccess: (
    response: AdminBehaviourRetractionResponse,
  ) => Promise<void> | void;
};

export function BehaviourRetractionForm({
  entry,
  onCancel,
  onRetract,
  onSuccess,
}: Props) {
  const [reason, setReason] = React.useState("");
  const [confirmed, setConfirmed] = React.useState(false);
  const [idempotencyKey, setIdempotencyKey] = React.useState(createCommandKey);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const submitting = React.useRef(false);
  const attempted = React.useRef(false);

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
    if (!reason.trim() || !confirmed) {
      setError("Enter a reason and confirm that this fact should be voided.");
      return;
    }
    submitting.current = true;
    attempted.current = true;
    setIsSaving(true);
    setError(null);
    try {
      await onSuccess(
        await onRetract(entry.id, { idempotencyKey, reason: reason.trim() }),
      );
    } catch (cause) {
      setError(
        cause instanceof Error && cause.message
          ? cause.message
          : "Unable to void this behaviour record.",
      );
    } finally {
      submitting.current = false;
      setIsSaving(false);
    }
  };

  return (
    <form
      aria-label="Void behaviour record"
      className="mt-4 space-y-3 border-t border-border pt-4"
      onSubmit={submit}
    >
      <p className="text-sm text-text-muted">
        This fact leaves active history and totals. The original and your reason
        remain in the audit trail.
      </p>
      <div>
        <Label htmlFor={`behaviour-void-reason-${entry.id}`}>
          Reason for voiding
        </Label>
        <textarea
          id={`behaviour-void-reason-${entry.id}`}
          className={controlClassName}
          value={reason}
          maxLength={1000}
          required
          disabled={isSaving}
          onChange={(event) => edit(() => setReason(event.target.value))}
        />
      </div>
      <label className="flex items-start gap-2 text-sm text-text-primary">
        <input
          className="mt-1"
          type="checkbox"
          checked={confirmed}
          disabled={isSaving}
          onChange={(event) => edit(() => setConfirmed(event.target.checked))}
        />
        I confirm this behaviour record should be voided.
      </label>
      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          type="submit"
          size="sm"
          disabled={isSaving || !confirmed || !reason.trim()}
        >
          {isSaving ? "Voiding…" : "Confirm void"}
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
    `behaviour-void-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}

const controlClassName =
  "mt-1 min-h-20 w-full rounded-md border border-border bg-surface px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60";
