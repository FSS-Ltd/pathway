import { Alert } from "react-native";
import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import * as orgPeopleApi from "@/lib/api/org-people";
import { ApiError } from "@/lib/api/http";
import { AppBootstrapContext } from "@/providers/app-providers";
import PeoplePermissionsScreen from "../../../app/(home)/(tabs)/family/people-permissions";

const bootstrapContextValue = {
  bootstrapState: {
    status: "ready" as const,
    route: "/(home)/(tabs)/week" as const,
    state: { userId: "u1", updatedAt: "2026-08-01T00:00:00.000Z" },
    activeSiteState: { activeSiteId: "site-1", sites: [] },
  },
  refreshBootstrap: jest.fn(),
  signOut: jest.fn(),
};

function renderScreen(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <AppBootstrapContext.Provider value={bootstrapContextValue}>
        <PeoplePermissionsScreen />
      </AppBootstrapContext.Provider>
    </QueryClientProvider>,
  );
}

afterEach(() => {
  jest.restoreAllMocks();
});

describe("PeoplePermissionsScreen", () => {
  it("labels the current user's row 'You' and shows role copy for others", async () => {
    jest.spyOn(orgPeopleApi, "listOrgPeople").mockResolvedValue([
      { id: "u1", name: "Sam R.", displayName: null, email: "sam@example.com", orgRole: "ORG_ADMIN", siteAccessSummary: { allSites: true, siteCount: 1 } },
      { id: "u2", name: "Jordan R.", displayName: null, email: "jordan@example.com", orgRole: "ORG_MEMBER", siteAccessSummary: { allSites: false, siteCount: 1 } },
    ]);
    jest.spyOn(orgPeopleApi, "listPendingInvites").mockResolvedValue([]);

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Sam R.")).toBeTruthy());
    expect(getByText("You")).toBeTruthy();
    expect(getByText("Owner · full family and billing access")).toBeTruthy();
    expect(getByText("Jordan R.")).toBeTruthy();
    expect(getByText("Active")).toBeTruthy();
  });

  it("shows pending invites as 'Invited' and revokes on confirm", async () => {
    jest.spyOn(orgPeopleApi, "listOrgPeople").mockResolvedValue([
      { id: "u1", name: "Sam R.", displayName: null, email: "sam@example.com", orgRole: "ORG_ADMIN", siteAccessSummary: { allSites: true, siteCount: 1 } },
    ]);
    jest.spyOn(orgPeopleApi, "listPendingInvites").mockResolvedValue([
      {
        id: "inv1",
        email: "auntie.may@example.com",
        orgRole: null,
        siteAccessMode: null,
        siteCount: 0,
        siteRole: null,
        expiresAt: "2026-08-10T00:00:00.000Z",
        usedAt: null,
        revokedAt: null,
        lastSentAt: null,
        status: "pending",
      },
    ]);
    const revokeSpy = jest.spyOn(orgPeopleApi, "revokeInvite").mockResolvedValue({} as never);
    jest.spyOn(Alert, "alert").mockImplementation((_title, _message, buttons) => {
      const confirmButton = buttons?.find((button) => button.style === "destructive");
      confirmButton?.onPress?.();
    });

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("auntie.may@example.com")).toBeTruthy());
    expect(getByText("Invited")).toBeTruthy();

    fireEvent.press(getByText("auntie.may@example.com"));

    await waitFor(() => expect(revokeSpy).toHaveBeenCalledWith("inv1"));
  });

  it("only enables Send invite once a valid email is entered", async () => {
    jest.spyOn(orgPeopleApi, "listOrgPeople").mockResolvedValue([
      { id: "u1", name: "Sam R.", displayName: null, email: "sam@example.com", orgRole: "ORG_ADMIN", siteAccessSummary: { allSites: true, siteCount: 1 } },
    ]);
    jest.spyOn(orgPeopleApi, "listPendingInvites").mockResolvedValue([]);
    const inviteSpy = jest.spyOn(orgPeopleApi, "inviteAdult").mockResolvedValue({} as never);

    const { getByText, getByLabelText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Invite an adult")).toBeTruthy());
    fireEvent.press(getByText("Invite"));

    fireEvent.press(getByText("Send invite"));
    expect(inviteSpy).not.toHaveBeenCalled();

    fireEvent.changeText(getByLabelText("Email"), "auntie.may@example.com");
    fireEvent.press(getByText("Send invite"));

    await waitFor(() => expect(inviteSpy).toHaveBeenCalledWith({ email: "auntie.may@example.com", name: undefined }));
  });

  it("shows the permission-denied notice for a real 401 from a non-admin invite attempt", async () => {
    jest.spyOn(orgPeopleApi, "listOrgPeople").mockResolvedValue([
      { id: "u1", name: "Sam R.", displayName: null, email: "sam@example.com", orgRole: "ORG_MEMBER", siteAccessSummary: { allSites: false, siteCount: 1 } },
    ]);
    jest.spyOn(orgPeopleApi, "listPendingInvites").mockResolvedValue([]);
    jest
      .spyOn(orgPeopleApi, "inviteAdult")
      .mockRejectedValue(new ApiError("Unauthorized", 401, "You must be an Organisation admin to invite people"));

    const { getByText, getByLabelText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Invite an adult")).toBeTruthy());
    fireEvent.press(getByText("Invite"));
    fireEvent.changeText(getByLabelText("Email"), "auntie.may@example.com");
    fireEvent.press(getByText("Send invite"));

    await waitFor(() => expect(getByText("You can't manage people")).toBeTruthy());
    expect(getByText("Only admins can invite, remove or revoke access.")).toBeTruthy();
  });

  it("shows the permission-denied notice for a real 401 loading the member list", async () => {
    jest
      .spyOn(orgPeopleApi, "listOrgPeople")
      .mockRejectedValue(new ApiError("Unauthorized", 401, "You must be an Organisation admin to view people"));
    jest.spyOn(orgPeopleApi, "listPendingInvites").mockResolvedValue([]);

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("You can't manage people")).toBeTruthy());
    expect(getByText("Only admins can invite, remove or revoke access.")).toBeTruthy();
  });
});
