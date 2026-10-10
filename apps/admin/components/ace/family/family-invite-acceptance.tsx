"use client";

import * as React from "react";
import { useParams, useRouter } from "next/navigation";
import { useClerk } from "@clerk/nextjs";
import { Button, Card } from "@pathway/ui";
import { useSession } from "@/lib/use-session-compat";
import {
  acceptGuardianInvite,
  getGuardianInviteForRecipient,
  setActiveSite,
  type GuardianInviteForRecipient,
} from "@/lib/api-client";
import {
  acceptStudentInvite,
  getStudentInviteForRecipient,
} from "@/lib/student-invites-api";

type InviteKind = "guardian" | "student";

const inviteActions = {
  guardian: {
    get: getGuardianInviteForRecipient,
    accept: acceptGuardianInvite,
    path: "family-invites",
    title: "Guardian invitation",
    description:
      "Your school invited you to view information for one child. Sign in with the invited email address to continue.",
    pendingDescription:
      "Accepting gives your verified account access to this child’s family information at this school.",
  },
  student: {
    get: getStudentInviteForRecipient,
    accept: acceptStudentInvite,
    path: "student-invites",
    title: "Student invitation",
    description:
      "Your school invited you to use your student account. Sign in with the invited email address to continue.",
    pendingDescription:
      "Accepting links your verified account to your own student information at this school.",
  },
} as const;

export function FamilyInviteAcceptance({ kind }: { kind: InviteKind }) {
  const { siteId, inviteId } = useParams<{
    siteId: string;
    inviteId: string;
  }>();
  const router = useRouter();
  const { redirectToSignIn, signOut } = useClerk();
  const { status } = useSession();
  const [invite, setInvite] = React.useState<GuardianInviteForRecipient | null>(
    null,
  );
  const [loading, setLoading] = React.useState(true);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const actions = inviteActions[kind];
  const returnTo = `/${actions.path}/${encodeURIComponent(siteId)}/${encodeURIComponent(inviteId)}`;

  React.useEffect(() => {
    if (status !== "authenticated") return;
    let active = true;
    setLoading(true);
    setError(null);
    void actions
      .get(siteId, inviteId)
      .then((result) => {
        if (active) setInvite(result);
      })
      .catch(() => {
        if (active) {
          setInvite(null);
          setError(
            "This invitation could not be opened for the signed-in account. Check that you used the invited email address.",
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [actions, status, siteId, inviteId]);

  async function accept() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      if (!invite?.acceptedAt) await actions.accept(siteId, inviteId);
      await setActiveSite(siteId);
      router.push("/ace/family");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Unable to complete the invitation.",
      );
      setBusy(false);
    }
  }

  const studentAccessUnavailable =
    kind === "student" &&
    invite?.acceptedAt &&
    "accessAvailable" in invite &&
    invite.accessAvailable === false;
  const unavailable =
    studentAccessUnavailable ||
    invite?.revokedAt ||
    (invite &&
      !invite.acceptedAt &&
      new Date(invite.expiresAt).getTime() <= Date.now());

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center px-4 py-10 sm:px-6">
      <Card
        title={actions.title}
        description={actions.description}
        className="w-full"
      >
        {status === "loading" || (status === "authenticated" && loading) ? (
          <p role="status" className="mt-4 text-sm text-text-muted">
            Checking your invitation…
          </p>
        ) : null}
        {status === "unauthenticated" ? (
          <div className="mt-5">
            <Button
              onClick={() => void redirectToSignIn({ redirectUrl: returnTo })}
            >
              Sign in or create an account
            </Button>
          </div>
        ) : null}
        {status === "error" ? (
          <p role="alert" className="mt-4 text-sm text-status-danger">
            Sign in is temporarily unavailable. Please retry.
          </p>
        ) : null}
        {status === "authenticated" && invite && !loading ? (
          <div className="mt-5 space-y-4">
            <p className="text-sm text-text-primary">
              <strong>{invite.siteName}</strong> invited you to connect your
              account as a {kind}.
            </p>
            {unavailable ? (
              <p role="status" className="text-sm text-text-secondary">
                {studentAccessUnavailable
                  ? "Student access is currently unavailable. Ask the school to review this account."
                  : "This invitation is no longer available. Ask the school to send a new one."}
              </p>
            ) : (
              <>
                <p className="text-sm text-text-secondary">
                  {invite.acceptedAt
                    ? "This invitation has been accepted."
                    : actions.pendingDescription}
                </p>
                <Button disabled={busy} onClick={() => void accept()}>
                  {busy
                    ? "Opening family view…"
                    : invite.acceptedAt
                      ? "Open family view"
                      : "Accept invitation"}
                </Button>
              </>
            )}
          </div>
        ) : null}
        {error ? (
          <div className="mt-4 space-y-3">
            <p role="alert" className="text-sm text-status-danger">
              {error}
            </p>
            {status === "authenticated" ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => void signOut({ redirectUrl: returnTo })}
              >
                Use another account
              </Button>
            ) : null}
          </div>
        ) : null}
      </Card>
    </main>
  );
}
