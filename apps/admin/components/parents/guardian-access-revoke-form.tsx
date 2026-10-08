"use client";

import * as React from "react";
import { Button, Label, Textarea } from "@pathway/ui";
import { revokeGuardianAccess } from "../../lib/guardian-access-review-api";

interface GuardianAccessRevokeFormProps {
  parentId: string;
  childId: string;
  childName: string;
  onRevoked: () => void;
}

export function GuardianAccessRevokeForm({
  parentId,
  childId,
  childName,
  onRevoked,
}: GuardianAccessRevokeFormProps) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function revoke(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedReason = reason.trim();
    if (pending || trimmedReason.length < 10 || trimmedReason.length > 500)
      return;
    setPending(true);
    setError(null);
    try {
      await revokeGuardianAccess(parentId, childId, trimmedReason);
      onRevoked();
    } catch {
      setError("Access could not be revoked. Please retry.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
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
        {open ? "Cancel revocation" : "Revoke access"}
      </Button>
      {open ? (
        <form
          onSubmit={(event) => void revoke(event)}
          className="mt-4 space-y-3 border-t border-border-subtle pt-4"
        >
          <p className="text-sm text-text-primary">
            Revoking access to {childName} immediately removes this parent’s
            child access, including school messages about this child.
          </p>
          <div>
            <Label htmlFor={`revocation-reason-${childId}`}>
              Reason for revocation
            </Label>
            <Textarea
              id={`revocation-reason-${childId}`}
              className="mt-1"
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
            className="min-h-11"
            disabled={pending || reason.trim().length < 10}
          >
            {pending ? "Revoking…" : "Confirm revocation"}
          </Button>
        </form>
      ) : null}
    </div>
  );
}
