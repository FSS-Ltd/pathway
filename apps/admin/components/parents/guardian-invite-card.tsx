"use client";

import * as React from "react";
import { Badge, Button, Card, Input, Label, Select } from "@pathway/ui";
import { toast } from "sonner";
import {
  createGuardianInvite,
  listGuardianInvites,
  resendGuardianInvite,
  revokeGuardianInvite,
  type GuardianInvite,
  type GuardianInviteReviewBasis,
} from "../../lib/api-client";
import { GuardianInviteResendReview } from "./guardian-invite-resend-review";

function inviteStatus(invite: GuardianInvite): string {
  if (invite.acceptedAt) return "Accepted";
  if (invite.revokedAt) return "Revoked";
  if (new Date(invite.expiresAt).getTime() <= Date.now()) return "Expired";
  return "Pending";
}

export function GuardianInviteCard({ childId }: { childId: string }) {
  const [email, setEmail] = React.useState("");
  const [reviewBasis, setReviewBasis] =
    React.useState<GuardianInviteReviewBasis>("SCHOOL_RECORDS");
  const [confirmed, setConfirmed] = React.useState(false);
  const [invites, setInvites] = React.useState<GuardianInvite[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [resendInviteId, setResendInviteId] = React.useState<string | null>(
    null,
  );
  const resendButtonRef = React.useRef<HTMLButtonElement>(null);
  const [error, setError] = React.useState<string | null>(null);

  const refresh = React.useCallback(async () => {
    setError(null);
    try {
      setInvites(await listGuardianInvites(childId));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to load invitations.",
      );
    } finally {
      setLoading(false);
    }
  }, [childId]);

  React.useEffect(() => {
    void refresh();
  }, [refresh]);

  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirmed || !email.trim() || busy) return;
    setBusy("create");
    setError(null);
    try {
      await createGuardianInvite(childId, email, reviewBasis);
      setEmail("");
      setConfirmed(false);
      await refresh();
      toast.success("Guardian invitation sent.");
    } catch (cause) {
      await refresh();
      setError(
        cause instanceof Error ? cause.message : "Unable to send invitation.",
      );
    } finally {
      setBusy(null);
    }
  };

  const change = async (
    inviteId: string,
    action:
      | { type: "resend"; basis: GuardianInviteReviewBasis }
      | { type: "revoke" },
  ) => {
    if (busy) return;
    if (
      action.type === "revoke" &&
      !window.confirm("Revoke this pending invitation?")
    )
      return;
    setBusy(inviteId);
    setError(null);
    try {
      if (action.type === "resend") {
        await resendGuardianInvite(inviteId, action.basis);
      } else {
        await revokeGuardianInvite(inviteId);
      }
      if (action.type === "resend") resendButtonRef.current?.focus();
      setResendInviteId(null);
      await refresh();
      toast.success(
        action.type === "revoke" ? "Invitation revoked." : "Invitation resent.",
      );
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Unable to ${action.type} invitation.`,
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card
      title="Invite guardian"
      description="Invite a verified account to access this child after confirming legal access. Access starts only when the guardian accepts."
    >
      <form className="mt-4 space-y-3" onSubmit={(event) => void send(event)}>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label htmlFor="guardian-invite-email">Guardian email</Label>
            <Input
              id="guardian-invite-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy !== null}
              className="mt-1"
            />
          </div>
          <div>
            <Label htmlFor="guardian-invite-basis">
              Legal access checked against
            </Label>
            <Select
              id="guardian-invite-basis"
              value={reviewBasis}
              onChange={(event) =>
                setReviewBasis(event.target.value as GuardianInviteReviewBasis)
              }
              disabled={busy !== null}
              className="mt-1"
            >
              <option value="SCHOOL_RECORDS">School records</option>
              <option value="LEGAL_DOCUMENT">Legal document</option>
            </Select>
          </div>
        </div>
        <label className="flex items-start gap-2 text-sm text-text-secondary">
          <input
            type="checkbox"
            checked={confirmed}
            onChange={(event) => setConfirmed(event.target.checked)}
            disabled={busy !== null}
            className="mt-1"
          />
          I checked that this person has legal access to this child.
        </label>
        <Button
          type="submit"
          size="sm"
          disabled={!confirmed || !email.trim() || busy !== null}
        >
          {busy === "create" ? "Sending…" : "Send invitation"}
        </Button>
      </form>

      <div className="mt-6 border-t border-border-subtle pt-4">
        <h3 className="text-sm font-semibold text-text-primary">Invitations</h3>
        {loading ? (
          <p className="mt-2 text-sm text-text-muted">Loading invitations…</p>
        ) : null}
        {!loading && invites.length === 0 ? (
          <p className="mt-2 text-sm text-text-muted">
            No invitations for this child yet.
          </p>
        ) : null}
        {invites.length > 0 ? (
          <ul className="mt-2 divide-y divide-border-subtle">
            {invites.map((invite) => {
              const status = inviteStatus(invite);
              return (
                <li
                  key={invite.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-3"
                >
                  <div className="min-w-0">
                    <p className="break-all text-sm font-medium text-text-primary">
                      {invite.email}
                    </p>
                    <p className="text-xs text-text-muted">
                      {status === "Pending"
                        ? `Expires ${new Date(invite.expiresAt).toLocaleDateString()}`
                        : status}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={status === "Accepted" ? "success" : "default"}
                    >
                      {status}
                    </Badge>
                    {status === "Pending" || status === "Expired" ? (
                      <Button
                        ref={
                          resendInviteId === invite.id
                            ? resendButtonRef
                            : undefined
                        }
                        size="sm"
                        variant="secondary"
                        disabled={busy !== null}
                        aria-expanded={resendInviteId === invite.id}
                        aria-controls={
                          resendInviteId === invite.id
                            ? `guardian-resend-review-${invite.id}`
                            : undefined
                        }
                        onClick={() =>
                          setResendInviteId((current) =>
                            current === invite.id ? null : invite.id,
                          )
                        }
                      >
                        Resend
                      </Button>
                    ) : null}
                    {status === "Pending" || status === "Expired" ? (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={busy !== null}
                        onClick={() =>
                          void change(invite.id, { type: "revoke" })
                        }
                      >
                        Revoke
                      </Button>
                    ) : null}
                  </div>
                  {resendInviteId === invite.id ? (
                    <GuardianInviteResendReview
                      inviteId={invite.id}
                      busy={busy !== null}
                      resending={busy === invite.id}
                      onConfirm={(basis) =>
                        void change(invite.id, { type: "resend", basis })
                      }
                      onCancel={() => {
                        resendButtonRef.current?.focus();
                        setResendInviteId(null);
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-danger">
          {error}
        </p>
      ) : null}
    </Card>
  );
}
