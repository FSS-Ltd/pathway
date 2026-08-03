import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as preferencesApi from "@/lib/api/preferences";
import NotificationsScreen from "../../../app/(home)/(tabs)/family/notifications";

/**
 * E2E-style check for the mutation + invalidation wiring (build-plan Step
 * 12): toggle "Meetups nearby" on, save, and confirm the persisted value
 * comes back after the query refetches - not just that the screen renders.
 * Mirrors child-details.test.tsx's real-query-client, mocked-api-module
 * approach rather than a full mock of the query hooks.
 */
describe("NotificationsScreen", () => {
  it("persists a toggled preference through save and refetch", async () => {
    const client = new QueryClient();
    const initial = {
      todaySummary: true,
      activityReminders: true,
      tasksDue: true,
      communityHellos: true,
      channelActivity: true,
      meetupsNearby: false,
      quietHours: { start: "20:30", end: "07:30", enabled: true },
    };

    jest.spyOn(preferencesApi, "getNotificationPreferences").mockResolvedValue(initial);
    const updateSpy = jest
      .spyOn(preferencesApi, "updateNotificationPreferences")
      .mockResolvedValue({ ...initial, meetupsNearby: true });

    const { getByLabelText, getByText } = render(
      <QueryClientProvider client={client}>
        <NotificationsScreen />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getByLabelText("Meetups nearby").props.accessibilityState.checked).toBe(false));

    fireEvent(getByLabelText("Meetups nearby"), "valueChange", true);
    expect(getByLabelText("Meetups nearby").props.accessibilityState.checked).toBe(true);

    fireEvent.press(getByText("Save notifications"));

    await waitFor(() =>
      expect(updateSpy).toHaveBeenCalledWith(expect.objectContaining({ meetupsNearby: true })),
    );

    // React Query invalidates ["notification-preferences"] on success; force
    // the resulting refetch to flush before asserting the toggle reflects
    // the persisted server value, not just local state.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    await waitFor(() => expect(getByLabelText("Meetups nearby").props.accessibilityState.checked).toBe(true));
  });
});
