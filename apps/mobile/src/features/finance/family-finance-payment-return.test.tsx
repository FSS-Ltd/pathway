import { render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

const mockGetCheckoutStatus = jest.fn();
const mockUseLocalSearchParams = jest.fn();

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useLocalSearchParams: () => mockUseLocalSearchParams(),
    useFocusEffect: (callback: React.EffectCallback) =>
      React.useEffect(callback, [callback]),
  };
});

jest.mock("@/hooks/use-app-ready", () => ({
  useAppReady: () => ({ bootstrapState: { status: "ready" } }),
}));

jest.mock("@/components/primitives/screen", () => {
  const React = jest.requireActual("react") as typeof import("react");
  const Native = jest.requireActual(
    "react-native",
  ) as typeof import("react-native");
  return {
    Screen: ({ children, title }: { children: ReactNode; title: string }) =>
      React.createElement(
        Native.View,
        null,
        React.createElement(Native.Text, null, title),
        children,
      ),
  };
});

jest.mock("./family-finance-api", () => ({
  getPayerCheckoutStatus: (...args: unknown[]) =>
    mockGetCheckoutStatus(...args),
}));

import { ApiError } from "@/lib/api/client";
import FamilyFinancePaymentReturnRoute from "../../../app/(family)/finance/payment-return";

describe("FamilyFinancePaymentReturnRoute", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseLocalSearchParams.mockReturnValue({
      attemptId: "attempt-after-reopen",
    });
  });

  it("checks the server again when Family Space opens from a checkout return", async () => {
    mockGetCheckoutStatus.mockResolvedValue({
      attemptId: "attempt-after-reopen",
      invoiceId: "invoice-a",
      payerAccountId: "payer-account-a",
      status: "CHECKING",
      checkedAt: "2026-10-22T19:30:00.000Z",
    });
    const { getByText } = render(<FamilyFinancePaymentReturnRoute />);

    await waitFor(() =>
      expect(mockGetCheckoutStatus).toHaveBeenCalledWith(
        "attempt-after-reopen",
      ),
    );
    expect(getByText("Payment is processing")).toBeTruthy();
    expect(
      getByText("Please don’t pay again while we’re checking."),
    ).toBeTruthy();
    expect(mockGetCheckoutStatus).toHaveBeenCalledTimes(1);
  });

  it("does not show payment information after payer access is revoked", async () => {
    mockGetCheckoutStatus.mockRejectedValue(
      new ApiError("Finance access unavailable", 403, ""),
    );
    const { getByText, queryByText } = render(
      <FamilyFinancePaymentReturnRoute />,
    );

    await waitFor(() =>
      expect(getByText("Finance access unavailable")).toBeTruthy(),
    );
    expect(
      getByText(
        "Your Finance access has changed. Contact the school office if you need help.",
      ),
    ).toBeTruthy();
    expect(queryByText(/GBP|£|invoice-a/)).toBeNull();
  });
});
