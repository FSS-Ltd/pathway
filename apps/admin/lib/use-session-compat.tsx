"use client";

/**
 * next-auth/react's useSession() shape, backed by Clerk. Kept deliberately
 * narrow to what the app actually reads (accessToken, user.id/name/email) -
 * see docs/auth-migration for the full audit. `roles` is intentionally
 * omitted: useAdminAccess() already fetches roles itself from
 * session.accessToken and only ever fell back to session.roles when the
 * token was missing, which can't happen here (status is only
 * "authenticated" once a token exists).
 *
 * Rewriting all ~45 call sites to Clerk's own hooks would be a much larger,
 * riskier diff than swapping the provider underneath this shim - see the
 * PR3 write-up for why this shape was chosen deliberately.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { setApiClientToken, fetchMe } from "./api-client";

export type CompatSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type CompatSession = {
  accessToken: string;
  user: CompatSessionUser;
};

export type SessionStatus = "loading" | "authenticated" | "unauthenticated";

type SessionContextValue = {
  data: CompatSession | null;
  status: SessionStatus;
  /** Re-resolves the internal user id/token. See fetchMe() in api-client.ts. */
  update: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "loading",
  update: async () => {},
});

/**
 * Resolves the Clerk session to the internal user id/token exactly once per
 * sign-in and broadcasts it via context, matching NextAuth's SessionProvider
 * caching behaviour (each page's own useSession() call would otherwise
 * re-fetch /auth/me independently).
 */
export function SessionProvider({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  const [session, setSession] = useState<CompatSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");

  const resolve = useCallback(async () => {
    if (!isSignedIn) {
      setApiClientToken(null);
      setSession(null);
      setStatus("unauthenticated");
      return;
    }

    const token = await getToken();
    if (!token) {
      setApiClientToken(null);
      setSession(null);
      setStatus("unauthenticated");
      return;
    }

    setApiClientToken(token);

    const compatUser: CompatSessionUser = {
      id: "",
      name: user?.fullName ?? user?.firstName ?? null,
      email: user?.primaryEmailAddress?.emailAddress ?? null,
    };

    try {
      const me = await fetchMe();
      compatUser.id = me.userId;
    } catch (err) {
      // AuthUserGuard JIT-provisions on first verified request, so this
      // should be transient at worst (e.g. a cold start). Surface the
      // session anyway rather than stalling on "loading" forever -
      // userId-dependent call sites already handle a missing id.
      console.error("[SESSION] Failed to resolve internal user id:", err);
    }

    setSession({ accessToken: token, user: compatUser });
    setStatus("authenticated");
  }, [isSignedIn, getToken, user]);

  useEffect(() => {
    if (!isLoaded) {
      setStatus("loading");
      return;
    }
    void resolve();
  }, [isLoaded, resolve]);

  const value = useMemo(
    () => ({ data: session, status, update: resolve }),
    [session, status, resolve],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
