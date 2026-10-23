import { requireDatabase } from "../../../../test-helpers.e2e";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";
import {
  captureFinanceSettlementObservation,
  readFinancePayoutContinuation,
  readFinanceUnresolvedPayoutPage,
} from "../finance-settlement.persistence";
import { prepareFinancePayoutSettlement } from "../finance-settlement-prepare";
import { projectFinancePayout } from "../finance-settlement.projection";

const now = new Date("2026-10-23T12:00:00Z");
const balance = (id: string, net = 90) => ({
  id,
  object: "balance_transaction",
  created: 1,
  amount: 100,
  fee: 100 - net,
  net,
  currency: "eur",
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
  currency: "eur",
  automatic: true,
  status: "paid",
  arrival_date: 4,
  balance_transaction: "txn_payout",
};

describe("private settlement evidence and durable payout coverage", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Settlement reconciliation requires a working disposable database",
      );
  });

  it("resumes partial payout constituents and leaves family ledger untouched", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      const before = await tx.financeReceipt.count({
        where: { tenantId: scope.tenantId, orgId: scope.orgId },
      });
      const payout = projectFinancePayout(scope, rawPayout);
      const first = await prepareFinancePayoutSettlement(
        {
          listPage: async () => ({
            data: [balance("txn_one")],
            nextCursor: "txn_one",
          }),
        },
        scope,
        payout,
        { maxPages: 1, observedAt: now },
      );
      await captureFinanceSettlementObservation(
        tx,
        scope,
        "payouts",
        payout,
        now,
        first,
      );
      const stored = await readFinancePayoutContinuation(tx, scope, payout.id);
      expect(stored?.coverage).toMatchObject({
        status: "INCOMPLETE",
        netMinor: "90",
        nextCursor: "txn_one",
      });
      const outstanding = await readFinanceUnresolvedPayoutPage(tx, scope, now);
      expect(outstanding.data.map((row) => row.payoutId)).toContain(payout.id);
      if (!stored) throw new Error("Expected stored payout continuation");
      const second = await prepareFinancePayoutSettlement(
        {
          listPage: async () => ({
            data: [balance("txn_two")],
            nextCursor: null,
          }),
        },
        scope,
        stored.payout,
        { previous: stored.coverage },
      );
      await captureFinanceSettlementObservation(
        tx,
        scope,
        "payouts",
        stored.payout,
        new Date(now.getTime() + 1000),
        second,
      );
      await captureFinanceSettlementObservation(
        tx,
        scope,
        "payouts",
        stored.payout,
        new Date(now.getTime() + 1000),
        second,
      );
      expect(
        (await readFinancePayoutContinuation(tx, scope, payout.id))?.coverage,
      ).toMatchObject({ status: "MATCHED", count: 2, netMinor: "180" });
      expect(
        (await readFinanceUnresolvedPayoutPage(tx, scope, now)).data,
      ).toEqual([]);
      expect(
        await tx.financeReceipt.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(before);
      expect(
        await tx.financeReconciliationCase.findFirst({
          where: {
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeConnectionId: scope.connectionId,
            resourceReference: payout.id,
          },
        }),
      ).toMatchObject({ status: "RESOLVED" });
    });
  });

  it("retains incomplete coverage on outage and records manual/mismatch cases without inferred payment", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      for (const automatic of [false, true]) {
        const payout = projectFinancePayout(scope, {
          ...rawPayout,
          id: automatic ? "po_difference" : "po_manual",
          automatic,
        });
        const prepared = await prepareFinancePayoutSettlement(
          {
            listPage: async () => ({
              data: [balance("txn_one")],
              nextCursor: null,
            }),
          },
          scope,
          payout,
          { observedAt: now },
        );
        await captureFinanceSettlementObservation(
          tx,
          scope,
          "payouts",
          payout,
          now,
          prepared,
        );
        expect(
          (await readFinancePayoutContinuation(tx, scope, payout.id))?.coverage
            .status,
        ).toBe(automatic ? "DIFFERENCE" : "MANUAL_UNSUPPORTED");
      }
      const payout = projectFinancePayout(scope, {
        ...rawPayout,
        id: "po_outage",
      });
      const first = await prepareFinancePayoutSettlement(
        {
          listPage: async () => ({
            data: [balance("txn_prefix")],
            nextCursor: "txn_prefix",
          }),
        },
        scope,
        payout,
        { observedAt: now, maxPages: 1 },
      );
      await captureFinanceSettlementObservation(
        tx,
        scope,
        "payouts",
        payout,
        now,
        first,
      );
      const stored = await readFinancePayoutContinuation(tx, scope, payout.id);
      if (!stored) throw new Error("Missing outage fixture coverage");
      await expect(
        prepareFinancePayoutSettlement(
          {
            listPage: async () => {
              throw new Error("Outage");
            },
          },
          scope,
          stored.payout,
          { previous: stored.coverage },
        ),
      ).rejects.toThrow("Outage");
      expect(
        (await readFinancePayoutContinuation(tx, scope, payout.id))?.coverage,
      ).toEqual(stored.coverage);
      expect(
        await tx.financeReceipt.count({ where: { tenantId: scope.tenantId } }),
      ).toBe(0);
    });
  });

  it("matches Charge principal without creating receipt and keeps minimal private evidence", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId }) => {
        await tx.financeCheckoutAttempt.update({
          where: { id: attemptId },
          data: { stripePaymentIntentId: String(checkout.payment_intent) },
        });
        const charge = {
          id: "py_one",
          object: "charge",
          created: 1,
          livemode: false,
          amount: 2450,
          currency: "eur",
          paid: true,
          captured: true,
          status: "succeeded",
          payment_intent: checkout.payment_intent,
          balance_transaction: "txn_one",
          customer: "cus_private",
          billing_details: { email: "private@example.test" },
        };
        await captureFinanceSettlementObservation(
          tx,
          scope,
          "charges",
          charge,
          now,
        );
        await captureFinanceSettlementObservation(
          tx,
          scope,
          "charges",
          charge,
          now,
        );
        const rows = await tx.$queryRaw<
          { facts: unknown }[]
        >`SELECT "facts" FROM "FinanceSettlementEvidence" WHERE "stripeConnectionId" = ${scope.connectionId}`;
        expect(rows).toHaveLength(1);
        expect(JSON.stringify(rows)).not.toContain("private");
        expect(
          await tx.financeReconciliationCase.count({
            where: {
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              stripeConnectionId: scope.connectionId,
            },
          }),
        ).toBe(0);
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId },
          }),
        ).toBe(0);
        await captureFinanceSettlementObservation(
          tx,
          scope,
          "charges",
          { ...charge, amount: 2449 },
          now,
        );
        expect(
          await tx.financeReconciliationCase.findFirst({
            where: {
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              stripeConnectionId: scope.connectionId,
            },
          }),
        ).toMatchObject({ kind: "UNKNOWN_OPERATION" });
      },
    );
  });

  it("dry run reports settlement exceptions without any persistent writes", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      const payout = projectFinancePayout(scope, rawPayout);
      const prepared = await prepareFinancePayoutSettlement(
        {
          listPage: async () => ({
            data: [balance("txn_dry")],
            nextCursor: null,
          }),
        },
        scope,
        payout,
        { observedAt: now },
      );
      expect(
        await captureFinanceSettlementObservation(
          tx,
          scope,
          "payouts",
          payout,
          now,
          prepared,
          "dry-run",
        ),
      ).toEqual({ recoverable: 0, exceptions: 1 });
      expect(
        await readFinancePayoutContinuation(tx, scope, payout.id),
      ).toBeNull();
      expect(
        await tx.$queryRaw<
          unknown[]
        >`SELECT * FROM "FinanceSettlementEvidence" WHERE "stripeConnectionId" = ${scope.connectionId}`,
      ).toEqual([]);
      expect(
        await tx.financeReconciliationCase.count({
          where: {
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeConnectionId: scope.connectionId,
          },
        }),
      ).toBe(0);
      expect(
        await tx.financeReceipt.count({ where: { tenantId: scope.tenantId } }),
      ).toBe(0);
      expect(
        await tx.financeCreditNote.count({
          where: { tenantId: scope.tenantId },
        }),
      ).toBe(0);
      expect(
        await tx.financeReceiptAllocation.count({
          where: { tenantId: scope.tenantId },
        }),
      ).toBe(0);
    });
  });

  it("enforces tenant RLS and immutable settlement facts", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      await captureFinanceSettlementObservation(
        tx,
        scope,
        "balanceTransactions",
        balance("txn_one"),
        now,
      );
      await tx.$executeRawUnsafe("SAVEPOINT settlement_immutable");
      await expect(
        tx.$executeRaw`UPDATE "FinanceSettlementEvidence" SET "facts" = '{}'::jsonb WHERE "stripeConnectionId" = ${scope.connectionId}`,
      ).rejects.toThrow();
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT settlement_immutable");
      await tx.$executeRawUnsafe("SAVEPOINT settlement_tenant_scope");
      if (process.env.E2E_TENANT_RLS_ROLE !== "pathway_e2e_tenant_rls") {
        throw new Error(
          "Settlement RLS test requires the restricted tenant role",
        );
      }
      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      // Exercise database RLS directly without changing the application's active transaction scope.
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${"unrelated-tenant"}, true)`;
      expect(
        await tx.$queryRaw<
          unknown[]
        >`SELECT * FROM "FinanceSettlementEvidence" WHERE "stripeConnectionId" = ${scope.connectionId}`,
      ).toEqual([]);
      await expect(
        readFinanceUnresolvedPayoutPage(tx, scope, now),
      ).rejects.toThrow("scope");
      await tx.$executeRawUnsafe(
        "ROLLBACK TO SAVEPOINT settlement_tenant_scope",
      );
    });
  });
});
