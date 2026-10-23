import type { FinanceAccessService } from "../../access/finance-access.service";
import { FinanceReportService } from "../../finance-report.service";
import { FinanceReportRepository } from "../../finance-report.repository";
import { FinanceBalanceService } from "../../finance-balance.service";
import { prepareFinancePayoutSettlement } from "../finance-settlement-prepare";
import { projectFinancePayout } from "../finance-settlement.projection";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";
import { captureFinanceSettlementObservation } from "../finance-settlement.persistence";
import { FinanceSettlementReportRepository } from "../finance-settlement-report.repository";

const now = new Date("2026-10-23T12:00:00Z");
const filters = { from: "2026-10-23", to: "2026-10-23", asOf: "2026-10-23" };
const balance = {
  id: "txn_report",
  object: "balance_transaction",
  created: Math.floor(now.getTime() / 1000) - 10,
  amount: 100,
  fee: 10,
  net: 90,
  currency: "eur",
  type: "charge",
  source: "ch_one",
  available_on: 2,
  status: "pending",
};
const reports = new FinanceSettlementReportRepository();

describe("saved settlement reporting", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Settlement reports require a working disposable database",
      );
  });
  it("deduplicates repeated immutable observations and exposes absent stream coverage", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      await captureFinanceSettlementObservation(
        tx,
        scope,
        "balanceTransactions",
        balance,
        new Date(now.getTime() - 1000),
      );
      await captureFinanceSettlementObservation(
        tx,
        scope,
        "balanceTransactions",
        { ...balance, status: "available" },
        now,
      );
      const connection = {
        id: scope.connectionId,
        accountId: scope.stripeAccountId,
        livemode: scope.livemode,
      };
      const report = await reports.load(
        { ...scope, userId: "synthetic-report-staff" },
        connection,
        filters,
        now,
      );
      expect(report).toMatchObject({
        context: connection,
        freshness: "NOT_SYNCED",
        periodStartCoverage: "UNPROVEN",
        source: "PERSISTED_RECONCILIATION",
        feesByCurrency: [{ currency: "EUR", amountMinor: "10" }],
      });
      expect(report.fetchedAt).toBe(now.toISOString());
    });
  });
  it.each(["RESTRICTED", "DISCONNECTED"] as const)(
    "retains fees and payouts through the public service for %s accounts",
    async (status) => {
      await withReconciliationOperation(async ({ tx, scope }) => {
        const historyAt = new Date("2026-10-22T12:00:00Z");
        const historicalBalance = {
          ...balance,
          created: Math.floor(historyAt.getTime() / 1000) - 10,
        };
        await captureFinanceSettlementObservation(
          tx,
          scope,
          "balanceTransactions",
          historicalBalance,
          historyAt,
        );
        const payout = projectFinancePayout(scope, {
          id: "po_retained",
          object: "payout",
          created: historicalBalance.created,
          livemode: false,
          amount: 90,
          currency: "eur",
          automatic: true,
          status: "paid",
          arrival_date: historicalBalance.created,
          balance_transaction: "txn_payout",
        });
        const prepared = await prepareFinancePayoutSettlement(
          {
            async listPage() {
              return { data: [historicalBalance], nextCursor: null };
            },
          },
          scope,
          payout,
          { observedAt: historyAt },
        );
        await captureFinanceSettlementObservation(
          tx,
          scope,
          "payouts",
          payout,
          historyAt,
          prepared,
        );
        const connection = await tx.financeStripeConnection.findUniqueOrThrow({
          where: { id: scope.connectionId },
        });
        await tx.financeStripeConnection.update({
          where: { id: scope.connectionId },
          data: {
            status,
            ...(status === "DISCONNECTED"
              ? {
                  disconnectedAt: now,
                  disconnectedByUserId: connection.requestedByUserId,
                }
              : {}),
          },
        });
        const access = {
          assertStaffAction: jest.fn(async () => undefined),
          resolveMode: jest.fn(async () => "SERVICING_ONLY" as const),
        } as unknown as FinanceAccessService;
        const service = new FinanceReportService(
          access,
          new FinanceReportRepository(new FinanceBalanceService()),
          { mode: "test", secretKey: "sk_test_synthetic" },
          reports,
        );
        const report = await service.report(
          { ...scope, userId: connection.requestedByUserId },
          "payout-reconciliation",
          { ...filters, from: "2026-10-22" },
        );
        expect(report.provider).toMatchObject({
          status: "UNAVAILABLE",
          source: "PERSISTED_RECONCILIATION",
          context: {
            id: scope.connectionId,
            accountId: scope.stripeAccountId,
            livemode: false,
          },
          feesByCurrency: [{ currency: "EUR", amountMinor: "10" }],
        });
        expect(report.rows.some((row) => row.reference === "po_retained")).toBe(
          true,
        );
      });
    },
  );
  it("rejects a forged account/mode selector without leaking saved amounts", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      await captureFinanceSettlementObservation(
        tx,
        scope,
        "balanceTransactions",
        balance,
        now,
      );
      for (const connection of [
        { id: scope.connectionId, accountId: "acct_other", livemode: false },
        {
          id: scope.connectionId,
          accountId: scope.stripeAccountId,
          livemode: true,
        },
        {
          id: "other-connection",
          accountId: scope.stripeAccountId,
          livemode: false,
        },
      ]) {
        expect(
          await reports.load(
            { ...scope, userId: "synthetic-report-staff" },
            connection,
            filters,
            now,
          ),
        ).toMatchObject({
          status: "UNAVAILABLE",
          feesByCurrency: [],
          payouts: [],
        });
      }
    });
  });
  it("hides saved report amounts under another SQL tenant using the restricted role", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      await captureFinanceSettlementObservation(
        tx,
        scope,
        "balanceTransactions",
        balance,
        now,
      );
      if (process.env.E2E_TENANT_RLS_ROLE !== "pathway_e2e_tenant_rls")
        throw new Error(
          "Settlement reporting RLS requires the restricted tenant role",
        );
      const connection = {
        id: scope.connectionId,
        accountId: scope.stripeAccountId,
        livemode: scope.livemode,
      };
      const actor = { ...scope, userId: "synthetic-report-staff" };
      await tx.$executeRawUnsafe("SAVEPOINT settlement_report_rls");
      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      expect(
        (await reports.load(actor, connection, filters, now)).feesByCurrency,
      ).toEqual([{ currency: "EUR", amountMinor: "10" }]);
      await tx.$executeRaw`SELECT set_config('app.tenant_id', ${"unrelated-tenant"}, true)`;
      expect(await reports.load(actor, connection, filters, now)).toMatchObject(
        { status: "UNAVAILABLE", feesByCurrency: [], payouts: [] },
      );
      await tx.$executeRawUnsafe("ROLLBACK TO SAVEPOINT settlement_report_rls");
    });
  });
});
