import { fireEvent, render, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { ApiError } from "@/lib/api/http";
import * as billingApi from "@/lib/api/billing";
import MembershipScreen from "../../../app/(home)/(tabs)/family/membership";

const mockOpenBrowserAsync = jest.fn().mockResolvedValue({ type: "dismiss" });
jest.mock("expo-web-browser", () => ({
  openBrowserAsync: (...args: unknown[]) => mockOpenBrowserAsync(...args),
}));

afterEach(() => {
  jest.restoreAllMocks();
  mockOpenBrowserAsync.mockClear();
});

function renderScreen(client: QueryClient) {
  return render(
    <QueryClientProvider client={client}>
      <MembershipScreen />
    </QueryClientProvider>,
  );
}

describe("MembershipScreen", () => {
  it("shows the current plan and included entitlements", async () => {
    jest.spyOn(billingApi, "getEntitlements").mockResolvedValue({
      orgId: "org1",
      isMasterOrg: false,
      subscriptionStatus: "ACTIVE",
      subscription: {
        planCode: "GROWTH_99_MONTHLY",
        status: "ACTIVE",
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEnd: "2026-08-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      maxChildren: 4,
      leaderSeatsIncluded: 2,
    });

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Growth 99")).toBeTruthy());
    expect(getByText("Active")).toBeTruthy();
    expect(getByText("Up to 4 children")).toBeTruthy();
    expect(getByText("2 leader seats included")).toBeTruthy();
    expect(getByText("Manage billing")).toBeTruthy();
    expect(getByText("Open portal")).toBeTruthy();
  });

  it("disables Manage billing and explains why when the household has no subscription", async () => {
    jest.spyOn(billingApi, "getEntitlements").mockResolvedValue({
      orgId: "org1",
      isMasterOrg: false,
      subscriptionStatus: "NONE",
      subscription: null,
      maxChildren: null,
      leaderSeatsIncluded: null,
    });
    const portalSpy = jest.spyOn(billingApi, "createBillingPortalSession");

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("No active plan")).toBeTruthy());
    // Card title still shows, but with no separate pressable action label
    // (ContentCard only renders the action row when `action` is truthy) -
    // the explanatory body is the only "Manage billing" text on screen.
    expect(getByText("Manage billing")).toBeTruthy();
    expect(
      getByText("Manage billing becomes available once this household has a paid subscription."),
    ).toBeTruthy();
    expect(portalSpy).not.toHaveBeenCalled();
  });

  it("opens the Stripe portal URL on Manage billing", async () => {
    jest.spyOn(billingApi, "getEntitlements").mockResolvedValue({
      orgId: "org1",
      isMasterOrg: false,
      subscriptionStatus: "ACTIVE",
      subscription: {
        planCode: "STARTER_49_MONTHLY",
        status: "ACTIVE",
        periodStart: "2026-07-01T00:00:00.000Z",
        periodEnd: "2026-08-01T00:00:00.000Z",
        cancelAtPeriodEnd: false,
      },
      maxChildren: 2,
      leaderSeatsIncluded: 1,
    });
    jest
      .spyOn(billingApi, "createBillingPortalSession")
      .mockResolvedValue({ url: "https://billing.stripe.com/session/abc" });

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("Open portal")).toBeTruthy());
    fireEvent.press(getByText("Open portal"));

    await waitFor(() =>
      expect(mockOpenBrowserAsync).toHaveBeenCalledWith("https://billing.stripe.com/session/abc"),
    );
  });

  it("shows the permission-denied notice for a real 401 loading entitlements", async () => {
    jest
      .spyOn(billingApi, "getEntitlements")
      .mockRejectedValue(new ApiError("Unauthorized", 401, "You must be an Organisation admin"));

    const { getByText } = renderScreen(new QueryClient());

    await waitFor(() => expect(getByText("You can't view membership")).toBeTruthy());
    expect(getByText("Only admins can view billing and membership details.")).toBeTruthy();
  });
});
