import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as childrenApi from "@/lib/api/children";
import type { Child } from "@/lib/api/children";
import ChildDetailsScreen from "../../../app/(home)/(tabs)/family/child-details";

jest.mock("expo-router", () => ({
  router: { push: jest.fn(), replace: jest.fn(), canGoBack: () => false, back: jest.fn() },
  useLocalSearchParams: () => ({ childId: "c1" }),
}));

// Isolate this test from the Subjects card's data source - irrelevant to
// the hydration bug under test here.
jest.mock("@/lib/queries/family-planner", () => ({
  useSubjects: () => ({ data: [] }),
}));

/**
 * Regression test for the bug found in review: local edit state was synced
 * from childQuery.data on every change via a bare useEffect, with no guard.
 * The app's QueryClient uses TanStack Query's default staleTime (0,
 * un-overridden in src/providers/app-providers.tsx), so any background
 * refetch of ["children", id] while the user is mid-edit (focus remount,
 * another mutation invalidating the key, etc.) would silently replace
 * unsaved keystrokes with whatever the server returned. Exercises the
 * actual failure mode - types into the field, forces a real refetch via
 * queryClient.invalidateQueries with different server data queued up, and
 * asserts the typed value survives - rather than only asserting a guard
 * exists structurally.
 *
 * Lives under src/, not colocated with child-details.tsx in app/ - a test
 * file inside app/ registers as a live expo-router route (confirmed via
 * expo-router's own getRoutes(), which only excludes +html/+native-intent/
 * +api/+middleware, not .test files), pulling @testing-library/react-native
 * into the production bundle graph.
 */
describe("ChildDetailsScreen background refetch", () => {
  it("keeps unsaved local edits when the child query refetches with different server data", async () => {
    const client = new QueryClient();
    jest
      .spyOn(childrenApi, "getChild")
      .mockResolvedValueOnce({
        id: "c1",
        firstName: "Maya",
        lastName: "",
        preferredName: null,
        yearGroup: null,
      } as never)
      .mockResolvedValueOnce({
        id: "c1",
        firstName: "Maya From Server",
        lastName: "",
        preferredName: null,
        yearGroup: null,
      } as never);

    const { getByLabelText, findByDisplayValue } = render(
      <QueryClientProvider client={client}>
        <ChildDetailsScreen />
      </QueryClientProvider>,
    );

    // Initial hydration from the first fetch.
    await findByDisplayValue("Maya");

    // User starts editing but hasn't saved yet.
    fireEvent.changeText(getByLabelText("First name"), "Mayaa");
    expect(getByLabelText("First name").props.value).toBe("Mayaa");

    // Simulate a background refetch (e.g. screen refocus, or another
    // mutation invalidating this query key) that delivers different data
    // from the server while the user is still editing.
    await act(async () => {
      await client.invalidateQueries({ queryKey: ["children", "c1"] });
    });

    // Confirm the refetch actually landed new data in the cache (proves
    // this test would catch the bug, not just that nothing happened).
    await waitFor(() =>
      expect((client.getQueryData(["children", "c1"]) as Child).firstName).toBe("Maya From Server"),
    );

    // React Query's notifyManager batches subscriber updates onto a
    // setTimeout(0); flush it so a not-guarded useEffect has had its
    // chance to fire before asserting.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });

    // The unsaved edit must survive the refetch - it must not be
    // silently overwritten with "Maya From Server".
    expect(getByLabelText("First name").props.value).toBe("Mayaa");
  });
});
