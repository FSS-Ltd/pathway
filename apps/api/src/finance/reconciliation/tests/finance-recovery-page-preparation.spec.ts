import {
  prepareFinanceRecoveryPage,
  type FinanceRecoveryPreparationDependencies,
} from "../finance-recovery-page-preparation";
import { projectFinancePayout } from "../finance-settlement.projection";
import { prepareFinancePayoutSettlement } from "../finance-settlement-prepare";

const scope = { stripeAccountId: "acct_school", livemode: false };
const at = new Date("2026-10-23T12:00:00Z");
const balance = (id: string) => ({
  id,
  object: "balance_transaction",
  created: 1,
  amount: 100,
  fee: 10,
  net: 90,
  currency: "gbp",
  type: "charge",
  source: "ch_one",
  status: "available",
  available_on: 2,
});
const rawPayout = {
  id: "po_one",
  object: "payout",
  created: 3,
  livemode: false,
  amount: 180,
  currency: "gbp",
  automatic: true,
  status: "paid",
  arrival_date: 4,
  balance_transaction: "txn_payout",
};
function dependencies(): FinanceRecoveryPreparationDependencies {
  return {
    provider: {
      async retrieve() {
        throw new Error("No supplemental object read expected");
      },
    },
    payouts: {
      async listPage() {
        throw new Error("No payout read expected");
      },
    },
    async readPayoutContinuation() {
      return null;
    },
  };
}
describe("Finance recovery preparation before capture", () => {
  it("strips SetupIntent secrets and retains the mandate read contract", async () => {
    const result = await prepareFinanceRecoveryPage(
      scope,
      "setupIntents",
      [
        {
          id: "seti_one",
          object: "setup_intent",
          created: 1,
          livemode: false,
          status: "processing",
          customer: "cus_one",
          payment_method: null,
          mandate: null,
          metadata: {
            finance_mandate_id: "local",
            finance_payer_account_id: "payer",
            finance_consent_version: "consent",
            private: "private",
          },
          client_secret: "private",
        },
      ],
      dependencies(),
      at,
    );
    expect(result).toEqual([
      {
        kind: "mandate",
        mandate: {
          id: "seti_one",
          object: "setup_intent",
          created: 1,
          livemode: false,
          status: "processing",
          customer: "cus_one",
          payment_method: null,
          mandate: null,
          metadata: {
            finance_mandate_id: "local",
            finance_payer_account_id: "payer",
            finance_consent_version: "consent",
          },
        },
      },
    ]);
  });
  it("resumes the fixed incomplete payout even if a newer page object changed", async () => {
    const payout = projectFinancePayout(scope, rawPayout);
    const previous = await prepareFinancePayoutSettlement(
      {
        async listPage() {
          return { data: [balance("txn_one")], nextCursor: "txn_one" };
        },
      },
      scope,
      payout,
      { maxPages: 1, observedAt: at },
    );
    const deps = dependencies();
    deps.readPayoutContinuation = async () => ({
      payoutId: payout.id,
      payout,
      coverage: previous,
    });
    deps.payouts = {
      async listPage(_scope, _id, options) {
        expect(options.startingAfter).toBe("txn_one");
        return { data: [balance("txn_two")], nextCursor: null };
      },
    };
    const result = await prepareFinanceRecoveryPage(
      scope,
      "payouts",
      [{ ...rawPayout, amount: 999 }],
      deps,
      new Date(at.getTime() + 60_000),
    );
    expect(result).toMatchObject([
      {
        kind: "payout",
        raw: { amount: 180 },
        payout: {
          status: "MATCHED",
          complete: true,
          count: 2,
          netMinor: "180",
          cutoff: at.toISOString(),
        },
      },
    ]);
  });
});
