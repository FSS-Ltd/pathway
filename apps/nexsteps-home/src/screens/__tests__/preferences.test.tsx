import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/http";
import * as preferencesApi from "@/lib/api/preferences";
import PreferencesScreen from "../../../app/(home)/(tabs)/family/preferences";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), canGoBack: () => false, back: jest.fn() },
}));

// jest.spyOn on a property that's already a mock (from a prior test in this
// file) returns the SAME mock instance rather than a fresh one - without
// this, the second describe block's spy would inherit the first's call
// count and implementation.
afterEach(() => {
  jest.restoreAllMocks();
});

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

/**
 * Regression test for the review finding: nothing gated Save on the numeric
 * fields being in the Zod schema's valid range (defaultActivityDurationMinutes
 * 5-240, dailyPlanningLimit 1-10), unlike every other edit screen in this
 * app (child-details.tsx, task-editor.tsx, ...) which disables its primary
 * action via a canSave check. Clearing the duration field made
 * Number("") -> 0 reach the server and fail the min(5) bound as an
 * unexplained "Could not save preferences" error. Save must now be inert
 * while the field is out of range.
 */
describe("PreferencesScreen canSave guard", () => {
  it("does not call the mutation when the duration field is cleared", async () => {
    const client = new QueryClient();
    jest.spyOn(preferencesApi, "getPlanningPreferences").mockResolvedValue({
      weekStartsOn: "Mon",
      defaultActivityDurationMinutes: 45,
      dailyPlanningLimit: 2,
      timeFormat: "24h",
      language: "en-GB",
    });
    const updateSpy = jest.spyOn(preferencesApi, "updatePlanningPreferences");

    const { getByText, getByLabelText, findByDisplayValue } = render(
      <QueryClientProvider client={client}>
        <PreferencesScreen />
      </QueryClientProvider>,
    );

    // Wait for hydration to actually land (not just the title to appear) -
    // the fetched value commits one render after the loading branch clears,
    // so asserting on the hydrated duration value avoids racing the
    // hydration effect with this test's own changeText below.
    await findByDisplayValue("45");

    fireEvent.changeText(getByLabelText("Default activity duration (minutes)"), "");
    fireEvent.press(getByText("Save preferences"));

    // Give any (incorrect) mutation a tick to fire before asserting it didn't.
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(updateSpy).not.toHaveBeenCalled();
  });
});

/**
 * Regression test for the final-review finding: household-config endpoints
 * throw UnauthorizedException (401) for "not permitted", not
 * ForbiddenException (403) - the permission-denied check only looked for
 * 403, so a real non-admin's save attempt fell through to the generic
 * "Something went wrong" notice instead.
 */
describe("PreferencesScreen permission denied", () => {
  it("shows the permission-denied notice for a real 401 on save", async () => {
    const client = new QueryClient();
    jest.spyOn(preferencesApi, "getPlanningPreferences").mockResolvedValue({
      weekStartsOn: "Mon",
      defaultActivityDurationMinutes: 45,
      dailyPlanningLimit: 2,
      timeFormat: "24h",
      language: "en-GB",
    });
    jest
      .spyOn(preferencesApi, "updatePlanningPreferences")
      .mockRejectedValue(new ApiError("Unauthorized", 401, "You must be an Organisation admin"));

    const { getByText } = render(
      <QueryClientProvider client={client}>
        <PreferencesScreen />
      </QueryClientProvider>,
    );

    await waitFor(() => expect(getByText("Planning preferences")).toBeTruthy());
    fireEvent.press(getByText("Save preferences"));

    await waitFor(() => expect(getByText("You can't edit preferences")).toBeTruthy());
    expect(getByText("Only admins and linked parents can make changes.")).toBeTruthy();
  });
});
