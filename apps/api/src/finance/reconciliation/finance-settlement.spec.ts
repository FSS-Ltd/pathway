import {
  projectFinanceCharge,
  projectFinanceBalanceTransaction,
  projectFinancePayout,
} from "./finance-settlement.projection";
import { prepareFinancePayoutSettlement } from "./finance-settlement-prepare";

const scope = { stripeAccountId: "acct_school", livemode: false };
const balance = (id = "txn_one", net = 90) => ({
  id,
  object: "balance_transaction",
  created: 1,
  amount: 100,
  fee: 100 - net,
  net,
  currency: "gbp",
  type: "charge",
  source: "ch_one",
  status: "available",
  available_on: 2,
});
const payout = (automatic = true) =>
  projectFinancePayout(scope, {
    id: "po_one",
    object: "payout",
    created: 3,
    livemode: false,
    amount: 180,
    currency: "gbp",
    automatic,
    status: "paid",
    arrival_date: 4,
    balance_transaction: "txn_payout",
  });

describe("settlement evidence", () => {
  it("projects Charge identifiers and principal without customer or payment secrets", () => {
    expect(
      projectFinanceCharge(scope, {
        id: "py_one",
        object: "charge",
        created: 1,
        livemode: false,
        amount: 100,
        currency: "gbp",
        paid: true,
        captured: true,
        status: "succeeded",
        payment_intent: { id: "pi_one", client_secret: "secret" },
        balance_transaction: "txn_one",
        customer: "cus_private",
        billing_details: { name: "private" },
      }),
    ).toEqual({
      id: "py_one",
      object: "charge",
      created: 1,
      livemode: false,
      amount: 100,
      currency: "GBP",
      paid: true,
      captured: true,
      status: "succeeded",
      payment_intent: "pi_one",
      balance_transaction: "txn_one",
    });
  });
  it("rejects account/mode, invalid arithmetic and unsafe principal", () => {
    expect(() =>
      projectFinanceBalanceTransaction(scope, { ...balance(), net: 99 }),
    ).toThrow();
    expect(() =>
      projectFinanceBalanceTransaction(scope, {
        ...balance(),
        account: "acct_other",
      }),
    ).toThrow();
    expect(() =>
      projectFinancePayout(scope, { ...payout(), livemode: true }),
    ).toThrow();
    expect(() =>
      projectFinanceBalanceTransaction(scope, {
        ...balance(),
        amount: Number.MAX_SAFE_INTEGER + 1,
      }),
    ).toThrow();
  });
  it("compares same-currency net after every constituent page completes", async () => {
    const listPage = jest
      .fn()
      .mockResolvedValueOnce({ data: [balance()], nextCursor: "txn_one" })
      .mockResolvedValueOnce({ data: [balance("txn_two")], nextCursor: null });
    const result = await prepareFinancePayoutSettlement(
      { listPage },
      scope,
      payout(),
      { maxPages: 2 },
    );
    expect(result).toMatchObject({
      status: "MATCHED",
      complete: true,
      netMinor: "180",
      nextCursor: null,
    });
    expect(listPage.mock.calls[1][2]).toMatchObject({
      startingAfter: "txn_one",
    });
  });
  it("never compares partial coverage or manual payouts", async () => {
    const listPage = jest
      .fn()
      .mockResolvedValue({ data: [balance()], nextCursor: "txn_one" });
    expect(
      await prepareFinancePayoutSettlement({ listPage }, scope, payout(), {
        maxPages: 1,
      }),
    ).toMatchObject({ status: "INCOMPLETE", complete: false });
    expect(
      await prepareFinancePayoutSettlement({ listPage }, scope, payout(false)),
    ).toMatchObject({ status: "MANUAL_UNSUPPORTED", complete: false });
    expect(listPage).toHaveBeenCalledTimes(1);
  });
  it("reports mismatch, currency differences and repeated cursors explicitly", async () => {
    expect(
      await prepareFinancePayoutSettlement(
        { listPage: async () => ({ data: [balance()], nextCursor: null }) },
        scope,
        payout(),
      ),
    ).toMatchObject({ status: "DIFFERENCE", complete: true, netMinor: "90" });
    expect(
      await prepareFinancePayoutSettlement(
        {
          listPage: async () => ({
            data: [{ ...balance(), currency: "eur" }],
            nextCursor: null,
          }),
        },
        scope,
        payout(),
      ),
    ).toMatchObject({
      status: "CURRENCY_MISMATCH",
      complete: true,
      netMinor: "0",
    });
    await expect(
      prepareFinancePayoutSettlement(
        {
          listPage: async () => ({ data: [balance()], nextCursor: "txn_one" }),
        },
        scope,
        payout(),
        { maxPages: 2 },
      ),
    ).rejects.toThrow();
  });
});

describe("payout continuation", () => {
  it("resumes totals/cursor/cutoff beyond a bounded prefix", async () => {
    const first = await prepareFinancePayoutSettlement(
      { listPage: async () => ({ data: [balance()], nextCursor: "txn_one" }) },
      scope,
      payout(),
      { maxPages: 1, observedAt: new Date("2026-10-23T12:00:00Z") },
    );
    const { constituents, previousDigest, ...previous } = first;
    expect(constituents).toHaveLength(1);
    expect(previousDigest).toBeNull();
    const listPage = jest
      .fn()
      .mockResolvedValue({ data: [balance("txn_two")], nextCursor: null });
    expect(
      await prepareFinancePayoutSettlement({ listPage }, scope, payout(), {
        previous,
        observedAt: new Date("2026-10-24T12:00:00Z"),
      }),
    ).toMatchObject({
      status: "MATCHED",
      count: 2,
      netMinor: "180",
      cutoff: "2026-10-23T12:00:00.000Z",
    });
    expect(listPage).toHaveBeenCalledWith(scope, "po_one", {
      startingAfter: "txn_one",
      pageSize: 25,
    });
    await expect(
      prepareFinancePayoutSettlement(
        { listPage },
        scope,
        { ...payout(), amount: 181 },
        { previous },
      ),
    ).rejects.toThrow("fixed observation");
  });
  it("throws on provider outage instead of returning false completion", async () => {
    await expect(
      prepareFinancePayoutSettlement(
        {
          listPage: async () => {
            throw new Error("provider unavailable");
          },
        },
        scope,
        payout(),
      ),
    ).rejects.toThrow("provider unavailable");
  });
});
