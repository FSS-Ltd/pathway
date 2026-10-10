"use client";

import * as React from "react";
import { Button, Label, Textarea } from "@pathway/ui";
import { revokeStudentAccess } from "@/lib/student-invites-api";

export function StudentAccessRevokeForm({
  childId,
  onRevoked,
}: {
  childId: string;
  onRevoked: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function revoke(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending || reason.trim().length < 10) return;
    setPending(true);
    setError(null);
    try {
      await revokeStudentAccess(childId, reason);
      setOpen(false);
      setReason("");
      onRevoked();
    } catch {
      setError("Student access could not be revoked. Please retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-3">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="min-h-11"
        disabled={pending}
        aria-expanded={open}
        onClick={() => {
          setOpen((value) => !value);
          setError(null);
        }}
      >
        {open ? "Cancel revocation" : "Revoke student access"}
      </Button>
      {open ? (
        <form onSubmit={(event) => void revoke(event)} className="space-y-3">
          <p className="text-sm text-text-secondary">
            This immediately removes the student’s access to this child at this
            school.
          </p>
          <div>
            <Label htmlFor={`student-access-reason-${childId}`}>
              Reason for revocation
            </Label>
            <Textarea
              id={`student-access-reason-${childId}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              minLength={10}
              maxLength={500}
              required
              disabled={pending}
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
          ) : null}
          <Button
            type="submit"
            variant="destructive"
            disabled={pending || reason.trim().length < 10}
          >
            {pending ? "Revoking…" : "Confirm revocation"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
