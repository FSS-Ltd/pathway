import { matchFinanceCharge } from "./finance-charge-match";
import { projectFinanceCharge } from "./finance-settlement.projection";
const charge = projectFinanceCharge(
  { stripeAccountId: "acct_school", livemode: false },
  {
    id: "ch_one",
    object: "charge",
    created: 1,
    livemode: false,
    amount: 2450,
    currency: "eur",
    paid: true,
    captured: true,
    status: "succeeded",
    payment_intent: "pi_one",
    balance_transaction: "txn_one",
  },
);
describe("Charge operation matching without receipt inference", () => {
  it("matches only equal principal and currency", () => {
    expect(
      matchFinanceCharge(charge, { amountMinor: 2450n, currency: "EUR" }),
    ).toBe("MATCHED");
    expect(
      matchFinanceCharge(charge, { amountMinor: 2449n, currency: "EUR" }),
    ).toBe("MISMATCH");
    expect(
      matchFinanceCharge(charge, { amountMinor: 2450n, currency: "GBP" }),
    ).toBe("MISMATCH");
  });
  it("flags captured unmatched money but treats an authorization as observation", () => {
    expect(matchFinanceCharge(charge, null)).toBe("UNMATCHED_MONEY");
    expect(matchFinanceCharge({ ...charge, captured: false }, null)).toBe(
      "OBSERVED",
    );
    expect(
      matchFinanceCharge({ ...charge, paid: false, status: "failed" }, null),
    ).toBe("OBSERVED");
  });
});
