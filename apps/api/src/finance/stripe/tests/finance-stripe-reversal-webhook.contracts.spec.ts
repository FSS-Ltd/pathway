import {
  stripeDisputeSchema,
  stripeRefundSchema,
} from "../finance-stripe-reversal-webhook.contracts";

describe("Finance non-card charge reversal contracts", () => {
  it.each(["py_bacs_payment", { id: "py_bacs_payment" }])(
    "accepts a Bacs charge reference on a refund or dispute",
    (charge) => {
      expect(
        stripeRefundSchema.safeParse({
          id: "re_bacs",
          object: "refund",
          amount: 100,
          currency: "gbp",
          status: "succeeded",
          charge,
        }).success,
      ).toBe(true);
      expect(
        stripeDisputeSchema.safeParse({
          id: "du_bacs",
          object: "dispute",
          amount: 100,
          currency: "gbp",
          charge,
        }).success,
      ).toBe(true);
    },
  );

  it("accepts absent refund metadata without treating it as an operation identity", () => {
    expect(
      stripeRefundSchema.safeParse({
        id: "re_external",
        object: "refund",
        amount: 100,
        currency: "gbp",
        status: "succeeded",
        charge: "ch_card_payment",
        metadata: null,
      }).success,
    ).toBe(true);
  });

  it("rejects a different resource passed as a charge", () => {
    expect(
      stripeDisputeSchema.safeParse({
        id: "du_bad",
        object: "dispute",
        amount: 100,
        currency: "gbp",
        charge: "pi_wrong_resource",
      }).success,
    ).toBe(false);
  });
});
