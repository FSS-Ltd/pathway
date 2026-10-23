import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { AppState, type AppStateStatus } from "react-native";
import type { ReactNode } from "react";
import type { FamilyInvoice, FamilyStatement } from "./family-finance-api";

const mockListPayerAccounts = jest.fn();
const mockListInvoices = jest.fn();
const mockListStatements = jest.fn();
const mockDownloadDocument = jest.fn();
const mockCreateStatement = jest.fn();
let mockFocused = true;
let mockSiteId = "site-a";
let mockUserId = "payer-a";

jest.mock("expo-router", () => {
  const React = jest.requireActual("react") as typeof import("react");
  return {
    router: { push: jest.fn(), replace: jest.fn() },
    useFocusEffect: (callback: React.EffectCallback) => {
      const focused = mockFocused;
      React.useEffect(
        () => (focused ? callback() : undefined),
        [callback, focused],
      );
    },
  };
});
jest.mock("expo-web-browser", () => ({ openAuthSessionAsync: jest.fn() }));
jest.mock("@/hooks/use-app-ready", () => ({
  useAppReady: () => ({
    bootstrapState: {
      status: "ready",
      state: { userId: mockUserId },
      permissions: [
        "finance.family_invoices.read",
        "finance.family_payments.pay",
        "finance.family_statements.read",
      ],
      activeSiteState: {
        activeSiteId: mockSiteId,
        sites: [
          { id: mockSiteId, name: "North School", orgName: "North School" },
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
    Screen: ({ children }: { children: ReactNode }) =>
      React.createElement(Native.View, null, children),
  };
});
jest.mock("./family-finance-api", () => ({
  ...jest.requireActual("./family-finance-money"),
  createFamilyStatement: (...args: unknown[]) => mockCreateStatement(...args),
  listFamilyInvoices: (...args: unknown[]) => mockListInvoices(...args),
  listFamilyPayerAccounts: (...args: unknown[]) =>
    mockListPayerAccounts(...args),
  listFamilyStatements: (...args: unknown[]) => mockListStatements(...args),
  downloadFamilyDocument: (...args: unknown[]) => mockDownloadDocument(...args),
}));

import { ApiError } from "@/lib/api/client";
import { FamilyFinanceScreen } from "./family-finance-screen";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function invoice(id: string): FamilyInvoice {
  return {
    id,
    payerAccountId: "account-a",
    invoiceNumber: id,
    status: "ISSUED",
    currency: "GBP",
    subtotalMinor: "1000",
    taxMinor: "0",
    totalMinor: "1000",
    balance: {
      issuedGrossMinor: "1000",
      issuedCreditsMinor: "0",
      allocatedReceiptsMinor: "0",
      outstandingMinor: "1000",
      creditBalanceMinor: "0",
    },
    issuedAt: "2026-10-01T00:00:00.000Z",
    dueDate: null,
    createdAt: "2026-10-01T00:00:00.000Z",
    lines: [],
    checkout: null,
  };
}
function statement(id: string, start: string, end: string): FamilyStatement {
  return {
    id,
    payerAccountId: "account-a",
    kind: "MONTH_END",
    status: "READY",
    currency: "GBP",
    periodStart: start,
    periodEnd: end,
    generatedAt: end,
    ledgerCutoffAt: end,
    readyAt: end,
    lineCount: 0,
    totals: {
      openingBalanceMinor: "0",
      chargesIssuedMinor: "0",
      creditsIssuedMinor: "0",
      allocatedReceiptsMinor: "0",
      reversalsMinor: "0",
      closingBalanceMinor: "0",
      unappliedFundsMinor: "0",
      uncoveredOutflowsMinor: "0",
      processingFundsMinor: "0",
    },
  };
}

describe("FamilyFinanceScreen access and history", () => {
  let onAppState: (state: AppStateStatus) => void;
  beforeEach(() => {
    jest.clearAllMocks();
    mockListPayerAccounts.mockReset();
    mockListInvoices.mockReset();
    mockListStatements.mockReset();
    mockDownloadDocument.mockReset();
    mockCreateStatement.mockReset().mockResolvedValue({});
    mockFocused = true;
    mockSiteId = "site-a";
    mockUserId = "payer-a";
    mockListPayerAccounts.mockResolvedValue([
      { id: "account-a", displayName: "Family A" },
    ]);
    mockListInvoices.mockResolvedValue({
      items: [invoice("NEW")],
      nextCursor: null,
    });
    mockListStatements.mockResolvedValue({ items: [], nextCursor: null });
    jest
      .spyOn(AppState, "addEventListener")
      .mockImplementation((_event, callback) => {
        onAppState = callback;
        return { remove: jest.fn() };
      });
  });
  afterEach(() => jest.restoreAllMocks());

  it("shows a neutral unavailable state without financial data or an upgrade offer", async () => {
    mockListPayerAccounts.mockRejectedValue(
      new ApiError("Unavailable", 403, ""),
    );
    const view = render(<FamilyFinanceScreen />);
    await waitFor(() =>
      expect(view.getByText("Finance access unavailable")).toBeTruthy(),
    );
    expect(view.queryByText(/upgrade|purchase|sample amount/i)).toBeNull();
  });

  it("clears protected data before a slow foreground grant recheck", async () => {
    const view = render(<FamilyFinanceScreen />);
    await view.findByText("Invoice NEW");
    const check = deferred<Array<{ id: string; displayName: string }>>();
    mockListPayerAccounts.mockReturnValue(check.promise);
    act(() => onAppState("active"));
    expect(view.queryByText("Invoice NEW")).toBeNull();
    await act(async () => check.reject(new ApiError("Revoked", 403, "")));
    expect(view.getByText("Finance access unavailable")).toBeTruthy();
  });

  it("discards in-flight reads on blur and rechecks before showing data on refocus", async () => {
    const pending = deferred<{ items: FamilyInvoice[]; nextCursor: null }>();
    mockListInvoices.mockReturnValueOnce(pending.promise);
    const view = render(<FamilyFinanceScreen />);
    await waitFor(() => expect(mockListInvoices).toHaveBeenCalled());
    mockFocused = false;
    view.rerender(<FamilyFinanceScreen />);
    await act(async () =>
      pending.resolve({ items: [invoice("STALE")], nextCursor: null }),
    );
    expect(view.queryByText("Invoice STALE")).toBeNull();
    mockListPayerAccounts.mockRejectedValue(new ApiError("Revoked", 403, ""));
    mockFocused = true;
    view.rerender(<FamilyFinanceScreen />);
    await view.findByText("Finance access unavailable");
    expect(view.queryByText("Invoice STALE")).toBeNull();
  });

  it.each(["school", "user"])(
    "discards old reads after the signed-in %s changes",
    async (scope) => {
      const pending = deferred<{ items: FamilyInvoice[]; nextCursor: null }>();
      mockListInvoices.mockReturnValueOnce(pending.promise);
      const view = render(<FamilyFinanceScreen />);
      await waitFor(() => expect(mockListInvoices).toHaveBeenCalledTimes(1));
      if (scope === "school") mockSiteId = "site-b";
      else mockUserId = "payer-b";
      mockListPayerAccounts.mockRejectedValue(
        new ApiError("Unavailable", 403, ""),
      );
      view.rerender(<FamilyFinanceScreen />);
      await view.findByText("Finance access unavailable");
      await act(async () =>
        pending.resolve({ items: [invoice("STALE")], nextCursor: null }),
      );
      expect(view.queryByText("Invoice STALE")).toBeNull();
    },
  );

  it("loads older invoices once with its account cursor and retains current records after a retryable failure", async () => {
    mockListInvoices.mockResolvedValueOnce({
      items: [invoice("NEW")],
      nextCursor: "invoice-cursor",
    });
    const view = render(<FamilyFinanceScreen />);
    await view.findByText("Invoice NEW");
    mockListInvoices.mockRejectedValueOnce(new Error("Offline"));
    fireEvent.press(
      view.getByRole("button", { name: "Load more invoices for Family A" }),
    );
    await view.findByRole("button", {
      name: "Retry loading invoices for Family A",
    });
    expect(view.getByText("Invoice NEW")).toBeTruthy();
    const pending = deferred<{ items: FamilyInvoice[]; nextCursor: null }>();
    mockListInvoices.mockReturnValueOnce(pending.promise);
    fireEvent.press(
      view.getByRole("button", { name: "Retry loading invoices for Family A" }),
    );
    expect(view.getByText("Loading more invoices…")).toBeTruthy();
    fireEvent.press(
      view.getByRole("button", {
        name: "Load more invoices for Family A",
        disabled: true,
      }),
    );
    expect(mockListInvoices).toHaveBeenCalledTimes(3);
    await act(async () =>
      pending.resolve({
        items: [invoice("NEW"), invoice("OLD")],
        nextCursor: null,
      }),
    );
    expect(view.getByText("Invoice NEW")).toBeTruthy();
    expect(view.getByText("Invoice OLD")).toBeTruthy();
    expect(view.getAllByText("Invoice NEW")).toHaveLength(1);
    expect(mockListInvoices).toHaveBeenLastCalledWith(
      "account-a",
      "invoice-cursor",
    );
    expect(view.getByText("All invoices loaded.")).toBeTruthy();
  });

  it("loads statement history with its own cursor", async () => {
    mockListStatements.mockResolvedValueOnce({
      items: [statement("new", "2026-09-01T00:00:00Z", "2026-10-01T00:00:00Z")],
      nextCursor: "statement-cursor",
    });
    const view = render(<FamilyFinanceScreen />);
    await view.findByText("Invoice NEW");
    fireEvent.press(view.getByRole("tab", { name: "Statements" }));
    mockListStatements.mockResolvedValueOnce({
      items: [statement("old", "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z")],
      nextCursor: null,
    });
    fireEvent.press(
      view.getByRole("button", { name: "Load more statements for Family A" }),
    );
    await view.findByText("1 Aug 2026 – 31 Aug 2026");
    expect(view.getByText("1 Sept 2026 – 30 Sept 2026")).toBeTruthy();
    expect(mockListStatements).toHaveBeenLastCalledWith(
      "account-a",
      "statement-cursor",
    );
    expect(view.getByText("All statements loaded.")).toBeTruthy();
  });

  it("clears every account after a page denial and rejects another account's late response", async () => {
    mockListPayerAccounts.mockResolvedValue([
      { id: "account-a", displayName: "Family A" },
      { id: "account-b", displayName: "Family B" },
    ]);
    mockListInvoices.mockImplementation((accountId: string) =>
      Promise.resolve({
        items: [invoice(accountId)],
        nextCursor: `cursor-${accountId}`,
      }),
    );
    const view = render(<FamilyFinanceScreen />);
    await view.findByText("Invoice account-a");
    const pending = deferred<{ items: FamilyInvoice[]; nextCursor: null }>();
    mockListInvoices
      .mockReturnValueOnce(pending.promise)
      .mockRejectedValueOnce(new ApiError("Revoked", 403, ""));
    fireEvent.press(
      view.getByRole("button", { name: "Load more invoices for Family A" }),
    );
    fireEvent.press(
      view.getByRole("button", { name: "Load more invoices for Family B" }),
    );
    await view.findByText("Finance access unavailable");
    await act(async () =>
      pending.resolve({ items: [invoice("STALE")], nextCursor: null }),
    );
    expect(view.queryByText("Invoice STALE")).toBeNull();
    expect(view.queryByText("Invoice account-a")).toBeNull();
  });

  it("discards a late history page when a fresh grant check denies access", async () => {
    mockListInvoices.mockResolvedValueOnce({
      items: [invoice("NEW")],
      nextCursor: "cursor",
    });
    const view = render(<FamilyFinanceScreen />);
    await view.findByText("Invoice NEW");
    const pending = deferred<{ items: FamilyInvoice[]; nextCursor: null }>();
    mockListInvoices.mockReturnValueOnce(pending.promise);
    fireEvent.press(
      view.getByRole("button", { name: "Load more invoices for Family A" }),
    );
    mockListPayerAccounts.mockRejectedValue(new ApiError("Revoked", 403, ""));
    act(() => onAppState("active"));
    await view.findByText("Finance access unavailable");
    await act(async () =>
      pending.resolve({ items: [invoice("STALE")], nextCursor: null }),
    );
    expect(view.queryByText("Invoice STALE")).toBeNull();
  });

  it("shows statement success only after the refreshed account passes authorization", async () => {
    const view = render(<FamilyFinanceScreen />);
    await view.findByText("Invoice NEW");
    fireEvent.press(view.getByRole("tab", { name: "Statements" }));
    const refreshedAccounts =
      deferred<Array<{ id: string; displayName: string }>>();
    mockListPayerAccounts.mockReturnValueOnce(refreshedAccounts.promise);
    fireEvent.press(view.getByRole("button", { name: "Request statement" }));
    await view.findByText("Loading your school account…");
    await act(async () =>
      refreshedAccounts.resolve([{ id: "account-a", displayName: "Family A" }]),
    );
    await view.findByText(
      "Statement requested. The latest list is shown below.",
    );
  });

  it("clears loaded data when a document action reports revoked access", async () => {
    const view = render(<FamilyFinanceScreen />);
    await view.findByText("Invoice NEW");
    mockDownloadDocument.mockRejectedValue(new ApiError("Revoked", 403, ""));
    fireEvent.press(view.getByRole("button", { name: "Download invoice" }));
    await view.findByText("Finance access unavailable");
    expect(view.queryByText("Invoice NEW")).toBeNull();
  });
});
