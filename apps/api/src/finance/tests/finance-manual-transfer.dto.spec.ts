import { financeBankTransferChangeSchema } from "../dto/finance-bank-transfer.dto";
import {
  financeManualReceiptRequestSchema,
  financeTransferNoticeSchema,
} from "../dto/finance-manual-receipt.dto";

describe("Finance manual transfer DTOs", () => {
  it("accepts a valid UK school bank destination and rejects malformed account details", () => {
    expect(
      financeBankTransferChangeSchema.safeParse({
        accountHolderName: "School Finance",
        sortCode: "123456",
        accountNumber: "00123456",
        reason: "Approved school collection account",
      }).success,
    ).toBe(true);
    expect(
      financeBankTransferChangeSchema.safeParse({
        accountHolderName: " ",
        sortCode: "12-34-56",
        accountNumber: "1234567",
        reason: "",
      }).success,
    ).toBe(false);
  });

  it("requires positive manual receipt amounts, a bank transaction reference and an ISO date", () => {
    const validRequest = {
      payerAccountId: "35025b4e-89f0-4f0c-9367-60c1d01d91e2",
      bankTransactionReference: "BANK-REF-1203",
      amountMinor: "1234",
      receivedAt: "2026-11-15T10:00:00.000Z",
      reason: "Matched to school bank statement",
    };
    expect(
      financeManualReceiptRequestSchema.safeParse(validRequest).success,
    ).toBe(true);
    expect(
      financeManualReceiptRequestSchema.safeParse({
        ...validRequest,
        bankTransactionReference: "BANK\nREF-1203",
      }).success,
    ).toBe(false);
    expect(
      financeManualReceiptRequestSchema.safeParse({
        payerAccountId: "35025b4e-89f0-4f0c-9367-60c1d01d91e2",
        bankTransactionReference: "",
        amountMinor: "0",
        receivedAt: "tomorrow",
        reason: "Matched to school bank statement",
      }).success,
    ).toBe(false);
  });

  it("accepts payer transfer declarations as a distinct non-receipt command", () => {
    expect(
      financeTransferNoticeSchema.safeParse({
        amountMinor: "1234",
        declaredTransferredAt: "2026-11-15T10:00:00.000Z",
      }).success,
    ).toBe(true);
    expect(
      financeTransferNoticeSchema.safeParse({
        amountMinor: "0",
        declaredTransferredAt: "not-a-date",
      }).success,
    ).toBe(false);
  });
});
