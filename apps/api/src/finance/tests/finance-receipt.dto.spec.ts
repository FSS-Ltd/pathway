import {
  financeReceiptAllocationSchema,
  financeReceiptReversalSchema,
} from "../dto/finance-receipt.dto";
import { parsePositiveAmount } from "../finance-receipt-operations";

describe("Finance receipt request validation", () => {
  it("accepts exact positive minor-unit amounts and rejects decimal or zero values", () => {
    const invoiceId = "20000000-0000-4000-8000-000000000001";
    expect(
      financeReceiptAllocationSchema.safeParse({
        invoiceId,
        amountMinor: "1",
      }).success,
    ).toBe(true);

    for (const amountMinor of ["0", "-1", "1.50", "01"]) {
      expect(
        financeReceiptAllocationSchema.safeParse({ invoiceId, amountMinor })
          .success,
      ).toBe(false);
    }
  });

  it("rejects over-range amounts and requires a meaningful reversal reason", () => {
    expect(() => parsePositiveAmount("9223372036854775808")).toThrow(
      "outside the supported integer range",
    );
    expect(
      financeReceiptReversalSchema.safeParse({
        amountMinor: "25",
        reason: "   ",
      }).success,
    ).toBe(false);
  });
});
