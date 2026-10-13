"use client";

import * as React from "react";
import { Button, Label } from "@pathway/ui";
import type {
  AdminStudentSubjectPlacement,
  EndAdminStudentSubjectInput,
} from "@/lib/api-client";

export function EndSubjectPlacementDialog({
  placement,
  onClose,
  onSave,
}: {
  placement: AdminStudentSubjectPlacement;
  onClose: () => void;
  onSave: (input: EndAdminStudentSubjectInput) => Promise<void>;
}) {
  const [endsOn, setEndsOn] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const dateRef = React.useRef<HTMLInputElement>(null);
  const dialogRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => dateRef.current?.focus(), []);

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending) return;
    if (endsOn < placement.startsOn) {
      setError("End date must be on or after the placement start date.");
      dateRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      await onSave({ endsOn, reason: reason.trim() });
      setPending(false);
      onClose();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to unassign the subject.",
      );
      setPending(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="end-subject-title"
        aria-describedby="end-subject-description"
        onKeyDown={(event) => {
          if (event.key === "Escape" && !pending) {
            event.preventDefault();
            onClose();
          }
          if (event.key !== "Tab") return;
          const controls = Array.from(
            dialogRef.current?.querySelectorAll<HTMLElement>(
              "button:not([disabled]), input:not([disabled])",
            ) ?? [],
          );
          const first = controls[0];
          const last = controls.at(-1);
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last?.focus();
          } else if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first?.focus();
          }
        }}
        className="w-full max-w-md rounded-xl border border-border-subtle bg-surface p-5 shadow-xl"
      >
        <h2
          id="end-subject-title"
          className="font-heading text-lg font-semibold text-text-primary"
        >
          Unassign {placement.subjectName}?
        </h2>
        <p
          id="end-subject-description"
          className="mt-1 text-sm text-text-muted"
        >
          This ends the current placement and removes its active progress.
          Historical assessments remain available.
        </p>
        <form
          onSubmit={(event) => void submit(event)}
          className="mt-5 space-y-4"
        >
          <div>
            <Label htmlFor="end-subject-date">Last assigned day</Label>
            <input
              ref={dateRef}
              id="end-subject-date"
              type="date"
              min={placement.startsOn}
              value={endsOn}
              required
              disabled={pending}
              onChange={(event) => setEndsOn(event.target.value)}
              className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            />
          </div>
          <div>
            <Label htmlFor="end-subject-reason">Reason</Label>
            <input
              id="end-subject-reason"
              value={reason}
              maxLength={1000}
              required
              disabled={pending}
              onChange={(event) => setReason(event.target.value)}
              className="mt-1 w-full rounded-md border border-border-subtle bg-surface px-3 py-2 text-sm text-text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-primary"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Unassigning…" : "Unassign subject"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
