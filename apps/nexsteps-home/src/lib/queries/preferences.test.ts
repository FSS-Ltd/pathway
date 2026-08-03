import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import React from "react";

import * as preferencesApi from "../api/preferences";
import {
  useNotificationPreferences,
  usePlanningPreferences,
  useUpdateNotificationPreferences,
  useUpdatePlanningPreferences,
} from "./preferences";

// See children.test.ts for why `wrapper` is cast `as never` here - two
// resolved copies of @types/react across the workspace boundary, not a
// real runtime issue.
function makeWrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) =>
    React.createElement(QueryClientProvider, { client }, children);
}

describe("preferences queries", () => {
  it("usePlanningPreferences fetches planning preferences", async () => {
    jest.spyOn(preferencesApi, "getPlanningPreferences").mockResolvedValue({
      weekStartsOn: "Mon",
      defaultActivityDurationMinutes: 45,
      dailyPlanningLimit: 2,
      timeFormat: "24h",
      language: "en-GB",
    });
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const { result } = renderHook(() => usePlanningPreferences(), { wrapper } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.weekStartsOn).toBe("Mon");
  });

  it("useUpdatePlanningPreferences invalidates planning preferences on success", async () => {
    jest.spyOn(preferencesApi, "updatePlanningPreferences").mockResolvedValue({
      weekStartsOn: "Mon",
      defaultActivityDurationMinutes: 45,
      dailyPlanningLimit: 2,
      timeFormat: "12h",
      language: "en-GB",
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = makeWrapper(client);
    const { result } = renderHook(() => useUpdatePlanningPreferences(), { wrapper } as never);
    await result.current.mutateAsync({ timeFormat: "12h" });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["planning-preferences"] });
  });

  it("useNotificationPreferences fetches notification preferences", async () => {
    jest.spyOn(preferencesApi, "getNotificationPreferences").mockResolvedValue({
      todaySummary: true,
      activityReminders: true,
      tasksDue: true,
      communityHellos: true,
      channelActivity: true,
      meetupsNearby: false,
      quietHours: { start: "20:30", end: "07:30", enabled: true },
    });
    const wrapper = makeWrapper(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
    const { result } = renderHook(() => useNotificationPreferences(), { wrapper } as never);
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.meetupsNearby).toBe(false);
  });

  it("useUpdateNotificationPreferences invalidates notification preferences on success", async () => {
    jest.spyOn(preferencesApi, "updateNotificationPreferences").mockResolvedValue({
      todaySummary: true,
      activityReminders: true,
      tasksDue: true,
      communityHellos: true,
      channelActivity: true,
      meetupsNearby: true,
      quietHours: { start: "20:30", end: "07:30", enabled: true },
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = jest.spyOn(client, "invalidateQueries");
    const wrapper = makeWrapper(client);
    const { result } = renderHook(() => useUpdateNotificationPreferences(), { wrapper } as never);
    await result.current.mutateAsync({ meetupsNearby: true });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["notification-preferences"] });
  });
});
