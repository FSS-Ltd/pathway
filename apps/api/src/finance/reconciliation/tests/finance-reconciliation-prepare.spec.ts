import {
  FinanceStripeReconciliationError,
  type FinanceReconciliationObject,
  type FinanceReconciliationStream,
} from "../../stripe/finance-stripe-reconciliation.provider";
import { prepareFinanceReconciliationObjects } from "../finance-reconciliation-prepare";

const scope = { stripeAccountId: "acct_school", livemode: false };
const refund = {
  id: "re_refund",
  object: "refund",
  created: 1_800_000_000,
  charge: "py_payment",
  payment_intent: null,
};
const dispute = {
  id: "du_dispute",
  object: "dispute",
  created: 1_800_000_000,
  charge: "ch_payment",
  balance_transactions: ["txn_withdrawal", "txn_reinstatement"],
};
const charge = {
  id: "py_payment",
  object: "charge",
  created: 1_800_000_000,
  livemode: false,
  payment_intent: "pi_verified",
};

function reader() {
  return {
    retrieve: jest
      .fn<
        Promise<FinanceReconciliationObject>,
        [typeof scope, FinanceReconciliationStream, string]
      >()
      .mockImplementation(async (_scope, stream, id) =>
        stream === "charges"
          ? { ...charge, id }
          : {
              id,
              object: "balance_transaction",
              created: 1_800_000_000,
              amount: id === "txn_withdrawal" ? -1000 : 1000,
              currency: "gbp",
            },
      ),
  };
}

describe("read-only enrichment before durable page capture", () => {
  it("finds the PaymentIntent of a non-card charge without mutating provider input", async () => {
    const provider = reader();
    const result = await prepareFinanceReconciliationObjects(
      scope,
      "refunds",
      [refund],
      provider,
    );
    expect(result[0]?.payment_intent).toBe("pi_verified");
    expect(refund.payment_intent).toBeNull();
    expect(provider.retrieve).toHaveBeenCalledWith(
      scope,
      "charges",
      "py_payment",
    );
  });
  it("expands dispute movement references under the same account scope", async () => {
    const result = await prepareFinanceReconciliationObjects(
      scope,
      "disputes",
      [dispute],
      reader(),
    );
    expect(result[0]).toMatchObject({
      payment_intent: "pi_verified",
      balance_transactions: [
        { id: "txn_withdrawal", amount: -1000 },
        { id: "txn_reinstatement", amount: 1000 },
      ],
    });
  });
  it("enriches nested event data while preserving original event identity and time", async () => {
    const event = {
      id: "evt_original",
      object: "event",
      created: 1_800_001_000,
      type: "refund.updated",
      livemode: false,
      account: scope.stripeAccountId,
      data: { object: refund },
    };
    const result = await prepareFinanceReconciliationObjects(
      scope,
      "events",
      [event],
      reader(),
    );
    expect(result[0]).toMatchObject({
      id: "evt_original",
      created: 1_800_001_000,
      data: { object: { payment_intent: "pi_verified" } },
    });
  });
  it("reuses a page-local charge read for multiple refunds", async () => {
    const provider = reader();
    await prepareFinanceReconciliationObjects(
      scope,
      "refunds",
      [refund, { ...refund, id: "re_second" }],
      provider,
    );
    expect(provider.retrieve).toHaveBeenCalledTimes(1);
  });
  it("propagates provider failure so coverage cannot advance", async () => {
    const provider = reader();
    provider.retrieve.mockRejectedValue(
      new FinanceStripeReconciliationError("UNAVAILABLE"),
    );
    await expect(
      prepareFinanceReconciliationObjects(scope, "refunds", [refund], provider),
    ).rejects.toThrow(FinanceStripeReconciliationError);
  });
  it("leaves unsupported event payloads unchanged without extra reads", async () => {
    const provider = reader();
    const event = {
      id: "evt_other",
      object: "event",
      created: 1_800_000_000,
      type: "customer.created",
      data: { object: { id: "cus_private" } },
    };
    expect(
      await prepareFinanceReconciliationObjects(
        scope,
        "events",
        [event],
        provider,
      ),
    ).toEqual([event]);
    expect(provider.retrieve).not.toHaveBeenCalled();
  });
});
