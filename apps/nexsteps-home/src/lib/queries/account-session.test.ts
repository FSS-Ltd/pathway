import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

import {
  useAccountSessions,
  useChangePassword,
  useCreateTotp,
  useDisableTotp,
  useRevokeOtherSessions,
  useRevokeSession,
  useVerifyTotp,
} from "./account-session";

// See children.test.ts for why `wrapper` is cast `as never` here - two
// resolved copies of @types/react across the workspace boundary, not a
// real runtime issue.
function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

function makeSession(id: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    lastActiveAt: new Date("2026-08-01T00:00:00.000Z"),
    latestActivity: { browserName: "Safari", city: "Bristol", country: "UK", isMobile: false },
    revoke: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  } as never;
}

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    totpEnabled: false,
    backupCodeEnabled: false,
    twoFactorEnabled: false,
    getSessions: jest.fn(),
    updatePassword: jest.fn(),
    createTOTP: jest.fn(),
    verifyTOTP: jest.fn(),
    disableTOTP: jest.fn(),
    ...overrides,
  } as never;
}

describe("account-session queries", () => {
  it("useAccountSessions fetches the session list and 2FA status from the current user", async () => {
    const currentSession = makeSession("sess_current");
    const user = makeUser({
      getSessions: jest.fn().mockResolvedValue([currentSession]),
      twoFactorEnabled: true,
    });
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    const { result } = renderHook(() => useAccountSessions(user), { wrapper } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.sessions).toEqual([currentSession]);
    expect(result.current.data?.twoFactor).toEqual({
      totpEnabled: false,
      backupCodeEnabled: false,
      twoFactorEnabled: true,
    });
  });

  it("useAccountSessions stays disabled and never calls getSessions when there's no user", () => {
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const { result } = renderHook(() => useAccountSessions(null), { wrapper } as never);

    expect(result.current.isLoading).toBe(false);
    expect(result.current.fetchStatus).toBe("idle");
  });

  it("useRevokeSession revokes one session and invalidates the sessions query", async () => {
    const session = makeSession("sess_other");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = makeWrapper(client);

    const { result } = renderHook(() => useRevokeSession(), { wrapper } as never);
    await result.current.mutateAsync(session);

    expect((session as { revoke: jest.Mock }).revoke).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["account-sessions"] });
  });

  it("useRevokeOtherSessions revokes every session except the current one", async () => {
    const currentSession = makeSession("sess_current");
    const otherA = makeSession("sess_a");
    const otherB = makeSession("sess_b");
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = makeWrapper(client);

    const { result } = renderHook(() => useRevokeOtherSessions(), { wrapper } as never);
    await result.current.mutateAsync({
      sessions: [currentSession, otherA, otherB],
      currentSessionId: "sess_current",
    });

    expect((currentSession as { revoke: jest.Mock }).revoke).not.toHaveBeenCalled();
    expect((otherA as { revoke: jest.Mock }).revoke).toHaveBeenCalledTimes(1);
    expect((otherB as { revoke: jest.Mock }).revoke).toHaveBeenCalledTimes(1);
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["account-sessions"] });
  });

  // This is the state sub-plan 08f calls out as unique to this screen: a
  // stale list that still shows a just-revoked device as active would be a
  // real, visible bug on a security-sensitive screen. getSessions() is
  // mocked to return a different list on its second call (the refetch
  // invalidateQueries triggers), and the still-mounted useAccountSessions
  // hook must reflect that new list once the revoke mutation settles.
  it("re-fetches the session list after revoking other sessions, showing only the current device", async () => {
    const currentSession = makeSession("sess_current");
    const otherSession = makeSession("sess_other");
    const getSessions = jest
      .fn()
      .mockResolvedValueOnce([currentSession, otherSession])
      .mockResolvedValueOnce([currentSession]);
    const user = makeUser({ getSessions });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);

    const { result: sessionsResult } = renderHook(() => useAccountSessions(user), { wrapper } as never);
    await waitFor(() => expect(sessionsResult.current.isSuccess).toBe(true));
    expect(sessionsResult.current.data?.sessions).toHaveLength(2);

    const { result: revokeResult } = renderHook(() => useRevokeOtherSessions(), { wrapper } as never);
    await revokeResult.current.mutateAsync({
      sessions: sessionsResult.current.data!.sessions,
      currentSessionId: "sess_current",
    });

    expect((otherSession as { revoke: jest.Mock }).revoke).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(sessionsResult.current.data?.sessions).toHaveLength(1));
    expect(sessionsResult.current.data?.sessions[0].id).toBe("sess_current");
    expect(getSessions).toHaveBeenCalledTimes(2);
  });

  // Promise.all rejects on the first failure even after other revoke()
  // calls already succeeded at Clerk - onSettled (not onSuccess) must
  // still trigger the refetch, or the screen would keep showing an
  // already-revoked device as active whenever one of several revokes
  // fails and the others don't.
  it("still re-fetches the session list when one of several revokes fails", async () => {
    const currentSession = makeSession("sess_current");
    const revokedOk = makeSession("sess_ok");
    const revokedFailed = makeSession("sess_failed", {
      revoke: jest.fn().mockRejectedValue(new Error("already revoked")),
    });
    const getSessions = jest
      .fn()
      .mockResolvedValueOnce([currentSession, revokedOk, revokedFailed])
      .mockResolvedValueOnce([currentSession]);
    const user = makeUser({ getSessions });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = makeWrapper(client);

    const { result: sessionsResult } = renderHook(() => useAccountSessions(user), { wrapper } as never);
    await waitFor(() => expect(sessionsResult.current.isSuccess).toBe(true));
    expect(sessionsResult.current.data?.sessions).toHaveLength(3);

    const { result: revokeResult } = renderHook(() => useRevokeOtherSessions(), { wrapper } as never);
    await expect(
      revokeResult.current.mutateAsync({
        sessions: sessionsResult.current.data!.sessions,
        currentSessionId: "sess_current",
      }),
    ).rejects.toThrow("already revoked");

    expect((revokedOk as { revoke: jest.Mock }).revoke).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(sessionsResult.current.data?.sessions).toHaveLength(1));
    expect(getSessions).toHaveBeenCalledTimes(2);
  });

  it("useChangePassword calls updatePassword with the current and new password", async () => {
    const updatePassword = jest.fn().mockResolvedValue({ id: "user_1" });
    const user = makeUser({ updatePassword });
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    const { result } = renderHook(() => useChangePassword(), { wrapper } as never);
    await result.current.mutateAsync({ user, currentPassword: "old-pass", newPassword: "new-password-123" });

    expect(updatePassword).toHaveBeenCalledWith({ currentPassword: "old-pass", newPassword: "new-password-123" });
  });

  it("useChangePassword surfaces the thrown error for the screen to handle", async () => {
    const error = new Error("wrong password");
    const user = makeUser({ updatePassword: jest.fn().mockRejectedValue(error) });
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));

    const { result } = renderHook(() => useChangePassword(), { wrapper } as never);
    await expect(
      result.current.mutateAsync({ user, currentPassword: "wrong", newPassword: "new-password-123" }),
    ).rejects.toThrow("wrong password");
  });

  it("useCreateTotp, useVerifyTotp and useDisableTotp call the matching Clerk methods", async () => {
    const createTOTP = jest.fn().mockResolvedValue({ id: "totp_1", verified: false });
    const verifyTOTP = jest.fn().mockResolvedValue({ id: "totp_1", verified: true });
    const disableTOTP = jest.fn().mockResolvedValue({ id: "totp_1", deleted: true });
    const user = makeUser({ createTOTP, verifyTOTP, disableTOTP });

    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = makeWrapper(client);

    const { result: createResult } = renderHook(() => useCreateTotp(), { wrapper } as never);
    await createResult.current.mutateAsync(user);
    expect(createTOTP).toHaveBeenCalledTimes(1);

    const { result: verifyResult } = renderHook(() => useVerifyTotp(), { wrapper } as never);
    await verifyResult.current.mutateAsync({ user, code: "123456" });
    expect(verifyTOTP).toHaveBeenCalledWith({ code: "123456" });

    const { result: disableResult } = renderHook(() => useDisableTotp(), { wrapper } as never);
    await disableResult.current.mutateAsync(user);
    expect(disableTOTP).toHaveBeenCalledTimes(1);

    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["account-sessions"] });
  });
});
