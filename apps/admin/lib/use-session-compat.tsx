"use client";

import React from "react";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import { fetchMe, setApiClientToken } from "./api-client";
import { cancelApiReads, setApiTokenGetter } from "./api-transport";

export type CompatSessionUser = {
  id: string;
  name?: string | null;
  email?: string | null;
};

export type CompatSession = {
  /** Legacy shape for consumers; the API transport always gets a current token. */
  accessToken: string;
  user: CompatSessionUser;
};

export type SessionStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated"
  | "error";

export type SessionContextValue = {
  data: CompatSession | null;
  status: SessionStatus;
  error: string | null;
  update: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue>({
  data: null,
  status: "loading",
  error: null,
  update: async () => undefined,
});

export function SessionProvider({ children }: PropsWithChildren) {
  const { isLoaded, isSignedIn, getToken } = useAuth();
  const { user } = useUser();
  return (
    <SessionRuntime
      isLoaded={isLoaded}
      isSignedIn={isSignedIn}
      getToken={getToken}
      identity={{
        id: user?.id ?? null,
        name: user?.fullName ?? user?.firstName ?? null,
        email: user?.primaryEmailAddress?.emailAddress ?? null,
      }}
    >
      {children}
    </SessionRuntime>
  );
}

type SessionRuntimeProps = PropsWithChildren<{
  isLoaded: boolean;
  isSignedIn: boolean | undefined;
  getToken: () => Promise<string | null>;
  identity: { id: string | null; name: string | null; email: string | null };
}>;

/** Clerk-facing adapter stays thin; the runtime can be verified with real React. */
export function SessionRuntime({
  children,
  isLoaded,
  isSignedIn,
  getToken,
  identity,
}: SessionRuntimeProps) {
  const [session, setSession] = useState<CompatSession | null>(null);
  const [status, setStatus] = useState<SessionStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const activeIdentity = useRef<string | null | undefined>(undefined);
  const getTokenRef = useRef(getToken);
  getTokenRef.current = getToken;
  const currentToken = useCallback(() => getTokenRef.current(), []);
  const clerkUserId = identity.id;
  const name = identity.name;
  const email = identity.email;

  const resolve = useCallback(async () => {
    const requestGeneration = ++generation.current;
    const nextIdentity = isSignedIn ? clerkUserId : null;
    if (activeIdentity.current !== nextIdentity) {
      cancelApiReads();
      activeIdentity.current = nextIdentity;
    }
    setSession(null);
    setError(null);
    setStatus("loading");
    setApiClientToken(null);
    setApiTokenGetter(null);

    if (!isLoaded) return;
    if (!isSignedIn) {
      setStatus("unauthenticated");
      return;
    }

    try {
      const token = await currentToken();
      if (!token) throw new Error("No session token is available.");
      if (requestGeneration !== generation.current) return;
      setApiTokenGetter(currentToken);
      const me = await fetchMe();
      if (!me.userId?.trim())
        throw new Error("Your account identity is unavailable.");
      if (requestGeneration !== generation.current) return;
      setApiClientToken(token);
      setSession({ accessToken: token, user: { id: me.userId, name, email } });
      setStatus("authenticated");
    } catch {
      if (requestGeneration !== generation.current) return;
      setApiTokenGetter(null);
      setApiClientToken(null);
      setSession(null);
      setError("Unable to verify your account. Please retry.");
      setStatus("error");
    }
  }, [isLoaded, isSignedIn, currentToken, clerkUserId, name, email]);

  useEffect(() => {
    void resolve();
    return () => {
      generation.current += 1;
      setApiTokenGetter(null);
      setApiClientToken(null);
    };
  }, [resolve, clerkUserId]);

  const value = useMemo(
    () => ({ data: session, status, error, update: resolve }),
    [session, status, error, resolve],
  );

  return (
    <SessionContext.Provider value={value}>{children}</SessionContext.Provider>
  );
}

export function useSession(): SessionContextValue {
  return useContext(SessionContext);
}
