import { act, fireEvent, render, waitFor } from "@testing-library/react-native";

const mockOpenAuthSessionAsync = jest.fn();
const mockReplace = jest.fn();
const mockPush = jest.fn();
const mockStartCheckout = jest.fn();
const mockGetBankDetails = jest.fn();
const mockSubmitTransfer = jest.fn();
const mockDownloadDocument = jest.fn();

jest.mock("expo-web-browser", () => ({
  openAuthSessionAsync: (...args: unknown[]) =>
    mockOpenAuthSessionAsync(...args),
}));

jest.mock("expo-router", () => ({
  router: {
    replace: (...args: unknown[]) => mockReplace(...args),
    push: (...args: unknown[]) => mockPush(...args),
  },
}));

jest.mock("./family-finance-api", () => ({
  downloadFamilyDocument: (...args: unknown[]) => mockDownloadDocument(...args),
  formatFinanceAmount: (amount: string, currency: string) =>
    `${currency} ${amount}`,
  getFamilyBankTransferDetails: (...args: unknown[]) =>
    mockGetBankDetails(...args),
  minorToMajorInput: () => "10.00",
  parseMajorAmountToMinor: () => "1000",
  startFamilyInvoiceCheckout: (...args: unknown[]) =>
    mockStartCheckout(...args),
  submitFamilyTransferNotice: (...args: unknown[]) =>
    mockSubmitTransfer(...args),
}));

import { FamilyFinanceInvoiceCard } from "./family-finance-invoice-card";
import type { FamilyInvoice } from "./family-finance-api";

const invoice: FamilyInvoice = {
  id: "invoice-a",
  payerAccountId: "payer-account-a",
  invoiceNumber: "42",
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
  dueDate: "2026-10-31",
  createdAt: "2026-10-01T00:00:00.000Z",
  lines: [],
  checkout: null,
};

describe("FamilyFinanceInvoiceCard", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("explains that a pending payment must not be submitted again", () => {
    const { getByText, queryByRole } = render(
      <FamilyFinanceInvoiceCard
        accountName="North School"
        canPay
        invoice={{
          ...invoice,
          checkout: { attemptId: "attempt-a", status: "PROCESSING" },
        }}
        onRefresh={jest.fn()}
      />,
    );

    expect(getByText("Payment processing")).toBeTruthy();
    expect(
      getByText("We’re checking with the school. Please don’t pay again."),
    ).toBeTruthy();
    expect(queryByRole("button", { name: "Pay invoice" })).toBeNull();
  });

  it("ignores repeated taps while secure checkout is opening", async () => {
    mockStartCheckout.mockResolvedValue({
      attemptId: "attempt-a",
      status: "OPEN",
      checkoutUrl: "https://checkout.stripe.com/example",
      expiresAt: null,
    });
    mockOpenAuthSessionAsync.mockReturnValue(new Promise(() => undefined));
    const { getByRole } = render(
      <FamilyFinanceInvoiceCard
        accountName="North School"
        canPay
        invoice={invoice}
        onRefresh={jest.fn()}
      />,
    );

    await act(async () => {
      fireEvent.press(getByRole("button", { name: "Pay invoice" }));
      await Promise.resolve();
    });
    await waitFor(() => expect(mockStartCheckout).toHaveBeenCalledTimes(1));
    fireEvent.press(getByRole("button", { name: "Opening secure payment…" }));

    expect(mockStartCheckout).toHaveBeenCalledTimes(1);
    expect(mockOpenAuthSessionAsync).toHaveBeenCalledWith(
      "https://checkout.stripe.com/example",
      "nexsteps://finance/payment-return",
    );
  });

  it("explains an unsupported card amount while preserving bank transfer and debt", () => {
    const reason =
      "Card payments require at least £0.30. Choose another payment method for this amount.";
    const { getByText, queryByRole, getByRole } = render(
      <FamilyFinanceInvoiceCard
        accountName="North School"
        canPay
        invoice={{
          ...invoice,
          balance: { ...invoice.balance, outstandingMinor: "29" },
          cardPayment: { eligible: false, reason },
        }}
        onRefresh={jest.fn()}
      />,
    );
    expect(getByText(reason)).toBeTruthy();
    expect(queryByRole("button", { name: "Pay invoice" })).toBeNull();
    expect(getByRole("button", { name: "Bank transfer" })).toBeTruthy();
    expect(getByText("GBP 29")).toBeTruthy();
    expect(mockStartCheckout).not.toHaveBeenCalled();
  });

  it("does not offer payment without the family payment permission", () => {
    const { queryByRole } = render(
      <FamilyFinanceInvoiceCard
        accountName="North School"
        canPay={false}
        invoice={invoice}
        onRefresh={jest.fn()}
      />,
    );

    expect(queryByRole("button", { name: "Pay invoice" })).toBeNull();
    expect(queryByRole("button", { name: "Bank transfer" })).toBeNull();
  });

  it("shows settled invoices without offering payment actions", () => {
    const { getByText, queryByRole } = render(
      <FamilyFinanceInvoiceCard
        accountName="North School"
        canPay
        invoice={{
          ...invoice,
          balance: { ...invoice.balance, outstandingMinor: "0" },
        }}
        onRefresh={jest.fn()}
      />,
    );

    expect(getByText("Settled")).toBeTruthy();
    expect(getByText("No balance due")).toBeTruthy();
    expect(queryByRole("button", { name: "Pay invoice" })).toBeNull();
    expect(queryByRole("button", { name: "Bank transfer" })).toBeNull();
  });
});
