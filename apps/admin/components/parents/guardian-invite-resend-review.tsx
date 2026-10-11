"use client";

import * as React from "react";
import { Button, Label, Select } from "@pathway/ui";
import type { GuardianInviteReviewBasis } from "../../lib/api-client";

export function GuardianInviteResendReview({
  inviteId,
  busy,
  resending,
  onConfirm,
  onCancel,
}: {
  inviteId: string;
  busy: boolean;
  resending: boolean;
  onConfirm: (basis: GuardianInviteReviewBasis) => void;
  onCancel: () => void;
}) {
  const [basis, setBasis] =
    React.useState<GuardianInviteReviewBasis>("SCHOOL_RECORDS");
  const [confirmed, setConfirmed] = React.useState(false);

  return (
    <div
      id={`guardian-resend-review-${inviteId}`}
      className="mt-3 w-full rounded-md border border-border-subtle p-3"
    >
      <p className="text-sm text-text-primary">
        Recheck this guardian’s legal access before resending.
      </p>
      <div className="mt-3 max-w-sm">
        <Label htmlFor={`guardian-resend-basis-${inviteId}`}>
          Evidence checked
        </Label>
        <Select
          id={`guardian-resend-basis-${inviteId}`}
          value={basis}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "SCHOOL_RECORDS" || value === "LEGAL_DOCUMENT") {
              setBasis(value);
            }
          }}
          disabled={busy}
          className="mt-1"
        >
          <option value="SCHOOL_RECORDS">School records</option>
          <option value="LEGAL_DOCUMENT">Legal document</option>
        </Select>
      </div>
      <label className="mt-3 flex items-start gap-2 text-sm text-text-primary">
        <input
          type="checkbox"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
          disabled={busy}
          className="mt-1"
        />
        I confirmed this person still has legal access to this child.
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          className="min-h-11"
          disabled={!confirmed || busy}
          onClick={() => onConfirm(basis)}
        >
          {resending ? "Resending…" : "Confirm and resend"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="min-h-11"
          disabled={busy}
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
