import { render, waitFor } from "@testing-library/react-native";
import type { ReactNode } from "react";

const mockListPayerAccounts = jest.fn();

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (callback: React.EffectCallback) =>
      React.useEffect(callback, [callback]),
  };
});

jest.mock("@/hooks/use-app-ready", () => ({
  useAppReady: () => ({
    bootstrapState: {
      status: "ready",
      permissions: [
        "finance.family_invoices.read",
        "finance.family_payments.pay",
        "finance.family_statements.read",
      ],
      activeSiteState: {
        activeSiteId: "site-a",
        sites: [
          { id: "site-a", name: "North School", orgName: "North School" },
        ],
      },
    },
  }),
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
  createFamilyStatement: jest.fn(),
  listFamilyInvoices: jest.fn(),
  listFamilyPayerAccounts: (...args: unknown[]) =>
    mockListPayerAccounts(...args),
  listFamilyStatements: jest.fn(),
}));

jest.mock("./family-finance-invoice-card", () => ({
  FamilyFinanceInvoiceCard: () => null,
}));

jest.mock("./family-finance-statement-card", () => ({
  FamilyFinanceStatementCard: () => null,
}));

import { ApiError } from "@/lib/api/client";
import { FamilyFinanceScreen } from "./family-finance-screen";

describe("FamilyFinanceScreen access gate", () => {
  beforeEach(() => jest.clearAllMocks());

  it("shows a neutral unavailable state without financial data or an upgrade offer", async () => {
    mockListPayerAccounts.mockRejectedValue(
      new ApiError("Finance access unavailable", 403, ""),
    );
    const { getByText, queryByText } = render(<FamilyFinanceScreen />);

    await waitFor(() =>
      expect(getByText("Finance access unavailable")).toBeTruthy(),
    );
    expect(
      getByText(
        "This school account hasn’t shared Finance with your Family Space profile. Contact the school office if you need access.",
      ),
    ).toBeTruthy();
    expect(queryByText(/upgrade|purchase|sample amount/i)).toBeNull();
  });
});
