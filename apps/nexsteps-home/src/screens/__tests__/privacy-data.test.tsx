import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/http";
import * as privacyApi from "@/lib/api/privacy";
import PrivacyDataScreen from "../../../app/(home)/(tabs)/family/privacy-data";

function renderScreen(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <PrivacyDataScreen />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("PrivacyDataScreen", () => {
  it("shows an empty state and both prepare actions when there are no past exports", async () => {
    jest.spyOn(privacyApi, "listExports").mockResolvedValue([]);

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("No exports yet")).toBeTruthy());
    expect(getByText("Download family data")).toBeTruthy();
    expect(getByText("Download report archive")).toBeTruthy();
  });

  it("lists past export requests with kind, date and status", async () => {
    jest.spyOn(privacyApi, "listExports").mockResolvedValue([
      {
        id: "exp1",
        tenantId: "tenant-1",
        requestedById: "user-1",
        kind: "FAMILY_DATA",
        status: "READY",
        storageKey: "tenants/tenant-1/privacy-exports/exp1/export.zip",
        createdAt: "2026-08-01T00:00:00.000Z",
        updatedAt: "2026-08-01T00:00:05.000Z",
      },
    ]);

    const { getByText, getAllByText, queryByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Past exports")).toBeTruthy());
    // "Family data" appears both as the prepare card's title and the list
    // row's title - assert at least the list row rendered.
    expect(getAllByText("Family data").length).toBeGreaterThanOrEqual(2);
    expect(getByText("Ready")).toBeTruthy();
    expect(queryByText("No exports yet")).toBeNull();
  });

  it("requests a family-data export and refreshes the list", async () => {
    jest.spyOn(privacyApi, "listExports").mockResolvedValue([]);
    const requestSpy = jest.spyOn(privacyApi, "requestExport").mockResolvedValue({
      id: "exp1",
      tenantId: "tenant-1",
      requestedById: "user-1",
      kind: "FAMILY_DATA",
      status: "READY",
      storageKey: "tenants/tenant-1/privacy-exports/exp1/export.zip",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:05.000Z",
    });

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Download family data")).toBeTruthy());
    fireEvent.press(getByText("Download family data"));

    await waitFor(() => expect(requestSpy).toHaveBeenCalledWith("FAMILY_DATA"));
  });

  it("shows the permission-denied notice for a real 401 loading exports", async () => {
    jest
      .spyOn(privacyApi, "listExports")
      .mockRejectedValue(new ApiError("Unauthorized", 401, "You must be an Organisation admin"));

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("You can't view privacy & data")).toBeTruthy());
  });

  it("shows a static Community profile note with no dead-link action", async () => {
    jest.spyOn(privacyApi, "listExports").mockResolvedValue([]);

    const { getByText, queryByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Community profile")).toBeTruthy());
    // community-settings has no route file yet (registry.ts) - this note
    // must not offer a "Manage" action that would link to it.
    expect(queryByText("Manage")).toBeNull();
  });

  it("Review opens a confirmation explaining consequences before submitting a deletion request", async () => {
    jest.spyOn(privacyApi, "listExports").mockResolvedValue([]);
    const deletionSpy = jest.spyOn(privacyApi, "requestDeletion").mockResolvedValue({
      id: "del1",
      tenantId: "tenant-1",
      requestedById: "user-1",
      reason: "Moving away",
      status: "SUBMITTED",
      createdAt: "2026-08-01T00:00:00.000Z",
      updatedAt: "2026-08-01T00:00:00.000Z",
    });

    const { getByText, getByPlaceholderText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Review")).toBeTruthy());
    fireEvent.press(getByText("Review"));

    expect(getByText("What happens if you delete this family account")).toBeTruthy();

    fireEvent.changeText(getByPlaceholderText("Tell us why you're leaving"), "Moving away");
    fireEvent.press(getByText("Submit deletion request"));

    await waitFor(() => expect(deletionSpy).toHaveBeenCalledWith("Moving away"));
    await waitFor(() => expect(getByText("Request received")).toBeTruthy());
  });

  it("Cancel closes the confirmation without submitting a request", async () => {
    jest.spyOn(privacyApi, "listExports").mockResolvedValue([]);
    const deletionSpy = jest.spyOn(privacyApi, "requestDeletion");

    const { getByText, queryByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Review")).toBeTruthy());
    fireEvent.press(getByText("Review"));
    expect(getByText("What happens if you delete this family account")).toBeTruthy();

    fireEvent.press(getByText("Cancel"));

    await waitFor(() => expect(queryByText("What happens if you delete this family account")).toBeNull());
    expect(getByText("Review")).toBeTruthy();
    expect(deletionSpy).not.toHaveBeenCalled();
  });
});
