import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { useUser } from "@clerk/clerk-expo";

/**
 * This screen has no apps/api endpoint - every action here runs directly
 * against the caller's own Clerk user via @clerk/clerk-expo (sub-plan 08f,
 * corrected post-Clerk-migration). Resource types like UserResource and
 * SessionWithActivitiesResource aren't part of @clerk/clerk-expo's own
 * public type exports, and @clerk/types/@clerk/shared are only transitive
 * dependencies (not listed in apps/nexsteps-home/package.json, so importing
 * them directly would be a phantom import that pnpm's isolated node_modules
 * won't resolve). Extracting the types structurally off useUser()'s return
 * type - which IS part of clerk-expo's public surface - avoids that.
 */
type ClerkUser = NonNullable<ReturnType<typeof useUser>["user"]>;
export type ClerkSession = Awaited<ReturnType<ClerkUser["getSessions"]>>[number];

const ACCOUNT_SESSIONS_QUERY_KEY = ["account-sessions"];

export type AccountSessionsData = {
  sessions: ClerkSession[];
  twoFactor: {
    totpEnabled: boolean;
    backupCodeEnabled: boolean;
    twoFactorEnabled: boolean;
  };
};

/**
 * Combines the session list with 2FA status in one query since both come
 * off the same signed-in `user` object and the screen needs both together.
 * `user` is null/undefined until Clerk finishes loading and the user is
 * signed in - `enabled` gates the fetch until then, the same way every
 * other query in this series avoids firing before its dependency is ready.
 * `retry: false` matches useOrgPeople's reasoning elsewhere in this
 * codebase: a failed fetch here should surface as an error promptly, not
 * retry three times first.
 */
export function useAccountSessions(user: ClerkUser | null | undefined) {
  return useQuery({
    queryKey: ACCOUNT_SESSIONS_QUERY_KEY,
    queryFn: async (): Promise<AccountSessionsData> => {
      if (!user) throw new Error("No signed-in user.");
      const sessions = await user.getSessions();
      return {
        sessions,
        twoFactor: {
          totpEnabled: user.totpEnabled,
          backupCodeEnabled: user.backupCodeEnabled,
          twoFactorEnabled: user.twoFactorEnabled,
        },
      };
    },
    enabled: Boolean(user),
    retry: false,
  });
}

/** Revokes a single session. Composable primitive alongside revoke-others. */
export function useRevokeSession() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (session: ClerkSession) => session.revoke(),
    // onSettled, not onSuccess: revoke() already happened at Clerk even if
    // this promise rejects (e.g. an already-revoked session). Gating the
    // refetch on success only would leave the just-revoked device showing
    // as active on error - the exact stale-list bug this screen exists to
    // avoid.
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_SESSIONS_QUERY_KEY });
    },
  });
}

/**
 * "Sign out other sessions": revokes every session except the caller's
 * current one. session.revoke() invalidates the session at Clerk directly,
 * so the revoked device's next token refresh fails at the source - this is
 * the property the removed Auth0-era design was trying to build a guard
 * for, and it comes for free here. Invalidating the sessions query on
 * settle (not just success) is what drives the post-revoke re-fetch the
 * account-session screen depends on to stop showing a just-revoked device
 * as active - including when Promise.all rejects because one of several
 * revoke() calls failed after the others already succeeded at Clerk.
 */
export function useRevokeOtherSessions() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      sessions,
      currentSessionId,
    }: {
      sessions: ClerkSession[];
      currentSessionId: string;
    }) => {
      const others = sessions.filter((session) => session.id !== currentSessionId);
      await Promise.all(others.map((session) => session.revoke()));
    },
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_SESSIONS_QUERY_KEY });
    },
  });
}

/**
 * currentPassword is always passed from this screen even though Clerk's
 * type marks it optional - omitting it is how an *admin* resets a password
 * without knowing the old one, which isn't this screen's flow. Clerk
 * verifies currentPassword server-side and throws ClerkAPIResponseError if
 * it's wrong; the screen handles that the same way
 * (setup)/account-recover.tsx already does.
 */
export function useChangePassword() {
  return useMutation({
    mutationFn: ({
      user,
      currentPassword,
      newPassword,
    }: {
      user: ClerkUser;
      currentPassword: string;
      newPassword: string;
    }) => user.updatePassword({ currentPassword, newPassword }),
  });
}

export function useCreateTotp() {
  return useMutation({
    mutationFn: (user: ClerkUser) => user.createTOTP(),
  });
}

export function useVerifyTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ user, code }: { user: ClerkUser; code: string }) => user.verifyTOTP({ code }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_SESSIONS_QUERY_KEY });
    },
  });
}

export function useDisableTotp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (user: ClerkUser) => user.disableTOTP(),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ACCOUNT_SESSIONS_QUERY_KEY });
    },
  });
}
