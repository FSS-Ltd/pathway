import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

import * as childrenApi from "../api/children";
import { useChild, useChildren, useUpdateChild } from "./children";

// The workspace resolves two copies of @types/react (root vs this app's),
// so @testing-library/react-native's `wrapper` option type-checks against a
// different ReactNode than the one this file's JSX produces. Not a real
// runtime issue - `as never` on the options object is the escape hatch
// across that duplicate-package boundary (renderHook still runs the real
// wrapper at runtime, only the static type check is bypassed).
function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe("children queries", () => {
  it("useChildren fetches the list", async () => {
    jest.spyOn(childrenApi, "listChildren").mockResolvedValue([
      { id: "c1", firstName: "Maya" } as never,
    ]);
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const { result } = renderHook(() => useChildren(), { wrapper } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].firstName).toBe("Maya");
  });

  it("useChild fetches a single child by id", async () => {
    jest.spyOn(childrenApi, "getChild").mockResolvedValue({ id: "c1", firstName: "Maya" } as never);
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const { result } = renderHook(() => useChild("c1"), { wrapper } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(childrenApi.getChild).toHaveBeenCalledWith("c1");
  });

  it("useUpdateChild invalidates both list and detail queries on success", async () => {
    jest.spyOn(childrenApi, "updateChild").mockResolvedValue({ id: "c1", firstName: "Maya R." } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = makeWrapper(client);
    const { result } = renderHook(() => useUpdateChild(), { wrapper } as never);
    await result.current.mutateAsync({ id: "c1", input: { firstName: "Maya R." } });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["children"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["children", "c1"] });
  });
});
