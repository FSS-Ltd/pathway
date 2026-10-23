import { requireDatabase } from "../../../../test-helpers.e2e";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";
import { prepareFinancePayoutSettlement } from "../finance-settlement-prepare";
import {
  captureFinanceSettlementObservation,
  readFinancePayoutContinuation,
} from "../finance-settlement.persistence";
import { projectFinancePayout } from "../finance-settlement.projection";
import { FinanceReconciliationStateRepository } from "../finance-reconciliation-state.repository";
import { runFinancePayoutContinuationsReconciliation } from "../finance-payout-continuations.runner";
const balance = (id: string) => ({
  id,
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
});
const raw = {
  id: "po_continuation",
  object: "payout",
  created: 1,
  livemode: false,
  amount: 180,
  currency: "eur",
  automatic: true,
  status: "paid",
  arrival_date: 2,
  balance_transaction: "txn_payout",
};
describe("scheduled historical payout continuations", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Payout continuation requires a disposable database");
  });
  it.each(["sync", "dry-run"] as const)(
    "continues one frozen payout in %s mode without changing family debt",
    async (mode) => {
      await withReconciliationOperation(async ({ tx, scope }) => {
        const observedAt = new Date();
        const payout = projectFinancePayout(scope, raw);
        const first = await prepareFinancePayoutSettlement(
          {
            async listPage() {
              return { data: [balance("txn_first")], nextCursor: "txn_first" };
            },
          },
          scope,
          payout,
          { observedAt },
        );
        await captureFinanceSettlementObservation(
          tx,
          scope,
          "payouts",
          payout,
          observedAt,
          first,
        );
        const before = await readFinancePayoutContinuation(
          tx,
          scope,
          payout.id,
        );
        const provider = {
          retrieve: jest
            .fn()
            .mockRejectedValue(
              new Error("Frozen payout must not be refetched"),
            ),
        };
        const payouts = {
          listPage: jest.fn().mockResolvedValue({
            data: [balance("txn_second")],
            nextCursor: null,
          }),
        };
        expect(
          await runFinancePayoutContinuationsReconciliation(
            { scope, mode },
            {
              provider,
              payouts,
              states: new FinanceReconciliationStateRepository(),
              clock: () => new Date(observedAt.getTime() + 600_000),
            },
          ),
        ).toMatchObject({
          status: "completed",
          pages: 1,
          objects: 1,
          exceptions: 0,
        });
        expect(payouts.listPage).toHaveBeenCalledTimes(1);
        expect(provider.retrieve).not.toHaveBeenCalled();
        const after = await readFinancePayoutContinuation(tx, scope, payout.id);
        expect(after?.coverage).toMatchObject(
          mode === "sync"
            ? {
                status: "MATCHED",
                cutoff: before?.coverage.cutoff,
                netMinor: "180",
                count: 2,
              }
            : (before?.coverage ?? {}),
        );
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
        expect(
          await tx.financeReceiptMovement.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
        expect(
          await tx.financeReconciliationState.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(mode === "sync" ? 1 : 0);
      });
    },
  );
});
