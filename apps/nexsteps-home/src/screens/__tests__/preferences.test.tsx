import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as preferencesApi from "@/lib/api/preferences";
import PreferencesScreen from "../../../app/(home)/(tabs)/family/preferences";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), canGoBack: () => false, back: jest.fn() },
}));

/**
 * Regression test for the review finding: `language` is a free 2-10 char
 * string in the DTO, not a true enum like weekStartsOn/timeFormat, but the
 * screen only shows two chips (en-GB/en-US). Saving without touching the
 * language chips must not overwrite an unrecognized stored value (e.g.
 * "fr-FR") back to en-GB - `handleSave` must omit `language` from the
 * mutation payload entirely unless the user actually picked a chip this
 * session, since the service does `{...current, ...dto}` and would
 * otherwise silently clobber it.
 */
describe("PreferencesScreen language clobbering", () => {
  it("does not include language in the save payload when the stored value is unrecognized and untouched", async () => {
    const client = new QueryClient();
    jest.spyOn(preferencesApi, "getPlanningPreferences").mockResolvedValue({
      weekStartsOn: "Mon",
      defaultActivityDurationMinutes: 45,
      dailyPlanningLimit: 2,
      timeFormat: "24h",
      language: "fr-FR",
    });
    const updateSpy = jest.spyOn(preferencesApi, "updatePlanningPreferences").mockResolvedValue({
      weekStartsOn: "Mon",
      defaultActivityDurationMinutes: 45,
      dailyPlanningLimit: 2,
      timeFormat: "24h",
      language: "fr-FR",
    });

    const { getByText } = render(
      <QueryClientProvider client={client}>
        <PreferencesScreen />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getByText("Planning preferences")).toBeTruthy());

    fireEvent.press(getByText("Save preferences"));

    await waitFor(() => expect(updateSpy).toHaveBeenCalled());
    const payload = updateSpy.mock.calls[0][0];
    expect(payload).not.toHaveProperty("language");
  });
});
