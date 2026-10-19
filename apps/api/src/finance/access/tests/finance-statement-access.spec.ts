import { canPerformFinancePayerAction } from "../finance-access.policy";

describe("Finance statement payer access", () => {
  it("allows authorised payer statements in servicing mode", () => {
    expect(
      canPerformFinancePayerAction("SERVICING_ONLY", "READ_STATEMENTS"),
    ).toBe(true);
  });

  it("allows statement downloads in servicing mode while retaining a payer grant requirement", () => {
    expect(
      canPerformFinancePayerAction("SERVICING_ONLY", "DOWNLOAD_DOCUMENT"),
    ).toBe(true);
  });

  it("does not allow payer statements without a Finance entitlement", () => {
    expect(canPerformFinancePayerAction("LOCKED", "READ_STATEMENTS")).toBe(
      false,
    );
  });
});
