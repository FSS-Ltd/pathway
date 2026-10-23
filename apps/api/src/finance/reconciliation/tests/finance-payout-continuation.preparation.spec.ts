import { prepareFinancePayoutContinuation } from "../finance-payout-continuations.runner";
import { settlementDigest } from "../finance-settlement-prepare";
import type { FinanceUnresolvedPayout } from "../finance-settlement.repository";
const scope = {
  tenantId: "tenant",
  orgId: "org",
  connectionId: "connection",
  stripeAccountId: "acct_school",
  livemode: false,
};
const now = new Date("2026-10-23T12:00:00Z");
const payout = {
  id: "po_known",
  object: "payout" as const,
  created: 1,
  livemode: false,
  amount: 180,
  currency: "EUR" as const,
  automatic: true,
  status: "paid" as const,
  arrival_date: 2,
  balance_transaction: "txn_payout",
};
const stored: FinanceUnresolvedPayout = {
  payoutId: payout.id,
  payout,
  coverage: {
    payoutDigest: settlementDigest(payout),
    cutoff: now.toISOString(),
    nextCursor: "txn_first",
    complete: false,
    status: "INCOMPLETE",
    count: 1,
    netMinor: "90",
    currencies: ["EUR"],
  },
};
const balance = {
  id: "txn_second",
  object: "balance_transaction",
  created: 1,
  amount: 100,
  fee: 10,
  net: 90,
  currency: "eur",
  type: "charge",
  source: "ch_known",
  status: "available",
  available_on: 2,
};
describe("one-page payout continuation preparation", () => {
  it("resumes the fixed incomplete snapshot without reading a changed payout", async () => {
    const provider = { retrieve: jest.fn() };
    const payouts = {
      listPage: jest
        .fn()
        .mockResolvedValue({ data: [balance], nextCursor: null }),
    };
    const result = await prepareFinancePayoutContinuation(
      scope,
      stored,
      { provider, payouts },
      new Date(now.getTime() + 1000),
    );
    expect(provider.retrieve).not.toHaveBeenCalled();
    expect(payouts.listPage).toHaveBeenCalledWith(scope, payout.id, {
      startingAfter: "txn_first",
      pageSize: 25,
    });
    expect(result.prepared).toMatchObject({
      cutoff: now.toISOString(),
      count: 2,
      netMinor: "180",
      status: "MATCHED",
    });
  });
  it("refreshes a completed pending observation instead of reusing it as incomplete coverage", async () => {
    const provider = {
      retrieve: jest.fn().mockResolvedValue({ ...payout, currency: "eur" }),
    };
    const payouts = {
      listPage: jest
        .fn()
        .mockResolvedValue({ data: [balance], nextCursor: null }),
    };
    const result = await prepareFinancePayoutContinuation(
      scope,
      {
        ...stored,
        coverage: {
          ...stored.coverage,
          complete: true,
          status: "PAYOUT_PENDING",
          nextCursor: null,
        },
      },
      { provider, payouts },
      now,
    );
    expect(provider.retrieve).toHaveBeenCalledWith(scope, "payouts", payout.id);
    expect(result.prepared.previousDigest).toBeNull();
    expect(payouts.listPage).toHaveBeenCalledTimes(1);
  });
});
