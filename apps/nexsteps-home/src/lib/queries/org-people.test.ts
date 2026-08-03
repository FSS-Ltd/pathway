import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

import * as orgPeopleApi from "../api/org-people";
import { useInviteAdult, useOrgPeople, usePendingInvites, useRemovePersonAccess, useRevokeInvite } from "./org-people";

// See children.test.ts for why `wrapper` is cast `as never` here - two
// resolved copies of @types/react across the workspace boundary, not a
// real runtime issue.
function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe("org-people queries", () => {
  it("useOrgPeople fetches household members", async () => {
    jest.spyOn(orgPeopleApi, "listOrgPeople").mockResolvedValue([
      { id: "u1", name: "Sam R.", orgRole: "ORG_ADMIN" } as never,
    ]);
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const { result } = renderHook(() => useOrgPeople(), { wrapper } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].name).toBe("Sam R.");
  });

  it("usePendingInvites fetches pending invites", async () => {
    jest.spyOn(orgPeopleApi, "listPendingInvites").mockResolvedValue([
      { id: "inv1", email: "auntie.may@example.com", status: "pending" } as never,
    ]);
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const { result } = renderHook(() => usePendingInvites(), { wrapper } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].email).toBe("auntie.may@example.com");
  });

  it("useInviteAdult posts an invite and invalidates the people and invites queries", async () => {
    jest.spyOn(orgPeopleApi, "inviteAdult").mockResolvedValue({ id: "inv1" } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = makeWrapper(client);
    const { result } = renderHook(() => useInviteAdult(), { wrapper } as never);
    await result.current.mutateAsync({ email: "auntie.may@example.com", name: "Auntie May" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["org-people"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["org-invites"] });
  });

  it("useRevokeInvite revokes an invite and invalidates the invites query", async () => {
    jest.spyOn(orgPeopleApi, "revokeInvite").mockResolvedValue({ id: "inv1" } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = makeWrapper(client);
    const { result } = renderHook(() => useRevokeInvite(), { wrapper } as never);
    await result.current.mutateAsync("inv1");
    expect(orgPeopleApi.revokeInvite).toHaveBeenCalledWith("inv1");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["org-invites"] });
  });

  it("useRemovePersonAccess removes a person and invalidates the people query", async () => {
    jest.spyOn(orgPeopleApi, "removePersonAccess").mockResolvedValue(undefined);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = makeWrapper(client);
    const { result } = renderHook(() => useRemovePersonAccess(), { wrapper } as never);
    await result.current.mutateAsync("u2");
    expect(orgPeopleApi.removePersonAccess).toHaveBeenCalledWith("u2");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["org-people"] });
  });
});
