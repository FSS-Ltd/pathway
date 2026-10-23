import { runTransaction } from "@pathway/db";
import { requireDatabase } from "../../../../test-helpers.e2e";
import {
  readFinanceRecoveryWork,
  loadFinanceRecoveryScope,
} from "../finance-recovery-scope.repository";
import { FinanceReconciliationStateRepository } from "../finance-reconciliation-state.repository";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";

const now = new Date("2026-10-23T12:00:00Z");
describe("backend recovery work discovery", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Recovery discovery requires a disposable database");
  });
  it("discovers only the configured environment and does not return provider identifiers", async () => {
    await withReconciliationOperation(async ({ scope }) => {
      const work = (await readFinanceRecoveryWork(now, false)).filter(
        (row) => row.connectionId === scope.connectionId,
      );
      expect(new Set(work.map((row) => row.stream)).size).toBe(10);
      expect(work.every((row) => !("stripeAccountId" in row))).toBe(true);
      expect(
        (await readFinanceRecoveryWork(now, true)).some(
          (row) => row.connectionId === scope.connectionId,
        ),
      ).toBe(false);
    });
  });
  it("excludes transport-failed work while preserving later due work", async () => {
    await withReconciliationOperation(async ({ scope }) => {
      const excluded = [`${scope.connectionId}:events`];
      const work = await runTransaction(
        (tx) => tx.$queryRaw<{ connectionId: string; stream: string }[]>`
        SELECT * FROM app.list_due_finance_reconciliation_scopes(${now},${false},${100}::INTEGER,${excluded}::TEXT[])
      `,
      );
      const selected = work.filter(
        (row) => row.connectionId === scope.connectionId,
      );
      expect(selected).toHaveLength(9);
      expect(selected.some((row) => row.stream === "events")).toBe(false);
      expect(selected.some((row) => row.stream === "checkoutSessions")).toBe(
        true,
      );
    });
  });
  it("skips leased work and keeps other streams due", async () => {
    await withReconciliationOperation(async ({ scope }) => {
      await new FinanceReconciliationStateRepository().claim(
        scope,
        "events",
        now,
      );
      const work = (await readFinanceRecoveryWork(now, false)).filter(
        (row) => row.connectionId === scope.connectionId,
      );
      expect(work.some((row) => row.stream === "events")).toBe(false);
      expect(work.some((row) => row.stream === "unresolvedOperations")).toBe(
        true,
      );
    });
  });
  it("loads account and environment from the stored connection and denies another tenant", async () => {
    await withReconciliationOperation(async ({ scope }) => {
      expect(await loadFinanceRecoveryScope(scope)).toMatchObject(scope);
      await expect(
        loadFinanceRecoveryScope({ ...scope, tenantId: "unrelated-tenant" }),
      ).rejects.toThrow();
    });
  });
});
