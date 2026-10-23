import { REQUIRED_PERMISSION } from "../../access-control/require-permission.decorator";
import { FinancePayerCheckoutStatusController } from "../finance-payer-checkout-status.controller";

describe("FinancePayerCheckoutStatusController", () => {
  // Break caught: a payer who can start checkout but cannot read invoices is
  // blocked from checking the result of their own payment.
  it("allows payment-authorised payers to read their checkout status", () => {
    const permission = Reflect.getMetadata(
      REQUIRED_PERMISSION,
      FinancePayerCheckoutStatusController.prototype.getStatus,
    );

    expect(permission).toBe("finance.family_payments.pay");
  });
});
