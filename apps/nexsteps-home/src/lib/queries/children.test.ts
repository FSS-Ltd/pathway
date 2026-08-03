import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

import * as childrenApi from "../api/children";
import { useChild, useChildren, useUpdateChild } from "./children";

const wrapper = ({ children }: { children: ReactNode }) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return React.createElement(QueryClientProvider, { client }, children);
};

describe("children queries", () => {
  it("useChildren fetches the list", async () => {
    jest.spyOn(childrenApi, "listChildren").mockResolvedValue([
      { id: "c1", firstName: "Maya" } as never,
    ]);
    const { result } = renderHook(() => useChildren(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0].firstName).toBe("Maya");
  });

  it("useChild fetches a single child by id", async () => {
    jest.spyOn(childrenApi, "getChild").mockResolvedValue({ id: "c1", firstName: "Maya" } as never);
    const { result } = renderHook(() => useChild("c1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(childrenApi.getChild).toHaveBeenCalledWith("c1");
  });

  it("useUpdateChild invalidates both list and detail queries on success", async () => {
    jest.spyOn(childrenApi, "updateChild").mockResolvedValue({ id: "c1", firstName: "Maya R." } as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useUpdateChild(), {
      wrapper: ({ children }: { children: ReactNode }) =>
        React.createElement(QueryClientProvider, { client }, children),
    });
    await result.current.mutateAsync({ id: "c1", input: { firstName: "Maya R." } });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["children"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["children", "c1"] });
  });
});
