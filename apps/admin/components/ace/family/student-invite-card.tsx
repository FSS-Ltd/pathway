"use client";

import * as React from "react";
import { Badge, Button, Card, Input, Label } from "@pathway/ui";
import { toast } from "sonner";
import { subscribeToActiveSiteChanges } from "@/lib/active-site-events";
import {
  createStudentInvite,
  getStudentAccess,
  getStudentPortalPolicy,
  listStudentInvites,
  setStudentPortalPolicy,
  updateStudentInvite,
  type StudentAccess,
  type StudentInvite,
} from "@/lib/student-invites-api";
import { StudentAccessRevokeForm } from "./student-access-revoke-form";

type StudentInviteState = {
  enabled: boolean;
  invites: StudentInvite[];
  access: StudentAccess;
};

function inviteStatus(
  invite: StudentInvite,
): "Accepted" | "Revoked" | "Expired" | "Pending" {
  if (invite.acceptedAt) return "Accepted";
  if (invite.revokedAt) return "Revoked";
  if (new Date(invite.expiresAt).getTime() <= Date.now()) return "Expired";
  return "Pending";
}

export function StudentInviteCard({ childId }: { childId: string }) {
  const [state, setState] = React.useState<StudentInviteState | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [email, setEmail] = React.useState("");
  const [approved, setApproved] = React.useState(false);
  const [revision, setRevision] = React.useState(0);

  React.useEffect(() => {
    const controller = new AbortController();
    const unsubscribe = subscribeToActiveSiteChanges(() => {
      setState(null);
      setApproved(false);
      setRevision((value) => value + 1);
    });
    setLoading(true);
    setError(null);
    void Promise.all([
      getStudentPortalPolicy(controller.signal),
      listStudentInvites(childId, controller.signal),
      getStudentAccess(childId, controller.signal),
    ])
      .then(([policy, invites, access]) => {
        if (!controller.signal.aborted)
          setState({ enabled: policy.enabled, invites, access });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState(null);
          setError("Student access could not be loaded. Please retry.");
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => {
      controller.abort();
      unsubscribe();
    };
  }, [childId, revision]);

  const refresh = () => setRevision((value) => value + 1);

  async function changePolicy() {
    if (!state || busy) return;
    const next = !state.enabled;
    if (
      !window.confirm(
        next
          ? "Enable student portal access for this school site? Each student still requires an approved invitation."
          : "Disable student portal access for this school site? Current students will lose access immediately.",
      )
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await setStudentPortalPolicy(next);
      toast.success(
        next ? "Student portal enabled." : "Student portal disabled.",
      );
      refresh();
    } catch {
      setError("Student portal policy could not be updated. Please retry.");
    } finally {
      setBusy(false);
    }
  }

  async function send(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !state?.enabled ||
      state.access.active ||
      !approved ||
      !email.trim() ||
      busy
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await createStudentInvite(childId, email);
      setEmail("");
      setApproved(false);
      toast.success("Student invitation sent.");
      refresh();
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Unable to send invitation.",
      );
    } finally {
      setBusy(false);
    }
  }

  async function changeInvite(inviteId: string, action: "resend" | "revoke") {
    if (busy) return;
    if (
      action === "revoke" &&
      !window.confirm("Revoke this pending student invitation?")
    )
      return;
    setBusy(true);
    setError(null);
    try {
      await updateStudentInvite(inviteId, action);
      toast.success(
        action === "revoke" ? "Invitation revoked." : "Invitation resent.",
      );
      refresh();
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : `Unable to ${action} invitation.`,
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card
      title="Student web access"
      description="Approve one student account for this child. Sign-in alone does not grant access."
      actions={
        <Button
          variant="secondary"
          size="sm"
          disabled={loading || busy}
          onClick={refresh}
        >
          Refresh
        </Button>
      }
    >
      {loading ? (
        <p role="status" className="text-sm text-text-muted">
          Loading student access…
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-status-danger">
          {error}
        </p>
      ) : null}
      {!loading && state ? (
        <div className="mt-4 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle p-3">
            <div>
              <p className="font-medium text-text-primary">
                School student portal
              </p>
              <p className="text-sm text-text-muted">
                {state.enabled
                  ? "Enabled for this school site"
                  : "Off for this school site"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              disabled={busy}
              onClick={() => void changePolicy()}
            >
              {state.enabled ? "Disable portal" : "Enable portal"}
            </Button>
          </div>

          {state.access.active ? (
            <div className="space-y-3 rounded-lg border border-border-subtle p-3">
              <Badge variant="success">Student access active</Badge>
              <p className="break-all text-sm text-text-primary">
                {state.access.active.email ?? "Verified student account"}
              </p>
              {!state.enabled ? (
                <p className="text-sm text-text-muted">
                  The portal is off, so this account cannot read student
                  information.
                </p>
              ) : null}
              <StudentAccessRevokeForm
                childId={childId}
                onRevoked={() => {
                  toast.success("Student access revoked.");
                  refresh();
                }}
              />
            </div>
          ) : state.enabled ? (
            <form
              onSubmit={(event) => void send(event)}
              className="space-y-3 border-t border-border-subtle pt-4"
            >
              <div>
                <Label htmlFor={`student-invite-email-${childId}`}>
                  Student email
                </Label>
                <Input
                  id={`student-invite-email-${childId}`}
                  type="email"
                  required
                  maxLength={254}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  disabled={busy}
                  className="mt-1 max-w-md"
                />
              </div>
              <label className="flex items-start gap-2 text-sm text-text-primary">
                <input
                  type="checkbox"
                  checked={approved}
                  onChange={(event) => setApproved(event.target.checked)}
                  disabled={busy}
                  className="mt-1"
                />
                <span>
                  I confirmed this student account meets the school’s age and
                  safeguarding policy.
                </span>
              </label>
              <Button
                type="submit"
                className="min-h-11"
                disabled={!approved || !email.trim() || busy}
              >
                {busy ? "Sending…" : "Send student invitation"}
              </Button>
            </form>
          ) : (
            <p className="text-sm text-text-muted">
              Enable the school student portal before inviting a student.
            </p>
          )}

          <div className="border-t border-border-subtle pt-4">
            <h3 className="text-sm font-semibold text-text-primary">
              Invitations
            </h3>
            {state.invites.length === 0 ? (
              <p className="mt-2 text-sm text-text-muted">
                No student invitations for this child yet.
              </p>
            ) : null}
            <ul className="mt-2 divide-y divide-border-subtle">
              {state.invites.map((invite) => {
                const status = inviteStatus(invite);
                const pending = status === "Pending" || status === "Expired";
                return (
                  <li
                    key={invite.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
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
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        variant={status === "Accepted" ? "success" : "default"}
                      >
                        {status}
                      </Badge>
                      {pending ? (
                        <>
                          <Button
                            size="sm"
                            variant="secondary"
                            disabled={busy || !state.enabled}
                            onClick={() =>
                              void changeInvite(invite.id, "resend")
                            }
                          >
                            Resend
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busy}
                            onClick={() =>
                              void changeInvite(invite.id, "revoke")
                            }
                          >
                            Revoke
                          </Button>
                        </>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
