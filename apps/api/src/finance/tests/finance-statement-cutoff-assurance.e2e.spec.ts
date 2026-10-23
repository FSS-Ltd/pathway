import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { buildFinanceStatementSnapshot } from "../finance-statement-snapshot";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";

describe("statement period cutoff and later adjustments", () => {
  beforeAll(() => {
    if (!requireDatabase()) throw new Error("Disposable database required");
  });

  it.each(["prior period", "statement period"])(
    "records a late %s withdrawal in the next statement without rewriting a frozen month",
    async (occurrence) => {
      const f = await createFinanceAssuranceFixture();
      const invoiceId = await f.createIssuedInvoice("30000");
      await (
        await prepareAssuranceProviderSuccess(f, invoiceId, "card", 30_000)
      )();
      const today = new Date();
      const periodStart = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 2, 1),
      );
      const periodEnd = new Date(
        Date.UTC(
          periodStart.getUTCFullYear(),
          periodStart.getUTCMonth() + 1,
          1,
        ),
      );
      const nextEnd = new Date(
        Date.UTC(periodEnd.getUTCFullYear(), periodEnd.getUTCMonth() + 1, 1),
      );
      const cutoff = new Date(periodEnd.getTime() - 1);
      const recordedAt = new Date(periodEnd.getTime() + 86_400_000);
      const generatedAt = new Date(periodEnd.getTime() + 3 * 86_400_000);
      const occurredAt = new Date(
        periodStart.getTime() +
          (occurrence === "prior period" ? -2 : 3) * 86_400_000,
      );
      const input = {
        payerAccountId: f.payer.id,
        payerName: f.payer.displayName,
        legalEntityName: f.profile.legalEntityName,
        currency: f.profile.currency,
        periodStart,
        periodEnd,
        generatedAt: periodEnd,
      };
      const frozen = await withTenantRlsContext(
        f.tenantId,
        f.orgId,
        async (tx) => {
          const snapshot = await buildFinanceStatementSnapshot(
            tx,
            f.balances,
            f.actor,
            input,
          );
          return tx.financeStatement.create({
            data: {
              financeProfileId: f.profile.id,
              payerAccountId: f.payer.id,
              tenantId: f.tenantId,
              orgId: f.orgId,
              kind: "MONTH_END",
              periodStart,
              periodEnd,
              generatedAt: periodEnd,
              ledgerCutoffAt: new Date(snapshot.ledgerCutoffAt),
              currency: f.profile.currency,
              openingBalanceMinor: 0n,
              chargesIssuedMinor: 0n,
              creditsIssuedMinor: 0n,
              allocatedReceiptsMinor: 0n,
              reversalsMinor: 0n,
              closingBalanceMinor: 0n,
              unappliedFundsMinor: 0n,
              snapshot,
              idempotencyKey: randomUUID(),
              requestHash: "0".repeat(64),
            },
          });
        },
      );
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        const allocation = await tx.financeReceiptAllocation.findFirstOrThrow({
          where: { invoiceId, tenantId: f.tenantId, orgId: f.orgId },
        });
        const movement = await tx.financeReceiptMovement.create({
          data: {
            tenantId: f.tenantId,
            orgId: f.orgId,
            financeProfileId: f.profile.id,
            receiptId: allocation.receiptId,
            type: "DISPUTE_WITHDRAWAL",
            source: "STRIPE",
            sourceReference: `du_${randomUUID().replaceAll("-", "")}`,
            amountMinor: 30_000n,
            currency: "GBP",
            occurredAt,
            createdAt: recordedAt,
          },
        });
        await tx.financeReceiptMovementApplication.create({
          data: {
            tenantId: f.tenantId,
            orgId: f.orgId,
            movementId: movement.id,
            receiptAllocationId: allocation.id,
            invoiceId,
            amountMinor: 30_000n,
            createdAt: recordedAt,
          },
        });
        const regenerated = await buildFinanceStatementSnapshot(
          tx,
          f.balances,
          f.actor,
          {
            ...input,
            generatedAt,
          },
        );
        expect(regenerated.totals.closingBalanceMinor).toBe("0");
        expect(regenerated.ledgerCutoffAt).toBe(cutoff.toISOString());
        expect(regenerated.generatedAt).toBe(generatedAt.toISOString());
        expect(regenerated.lines).toEqual([]);
        const next = await buildFinanceStatementSnapshot(
          tx,
          f.balances,
          f.actor,
          {
            ...input,
            periodStart: periodEnd,
            periodEnd: nextEnd,
            generatedAt: new Date(nextEnd.getTime() + 86_400_000),
          },
        );
        expect(next.totals.openingBalanceMinor).toBe("0");
        expect(next.totals.reversalsMinor).toBe("30000");
        expect(next.totals.closingBalanceMinor).toBe("30000");
        expect(next.lines).toEqual([
          expect.objectContaining({
            date: recordedAt.toISOString(),
            description: expect.stringContaining("recorded late"),
            amountMinor: "30000",
          }),
        ]);
        const retained = await tx.financeStatement.findFirstOrThrow({
          where: { id: frozen.id, tenantId: f.tenantId, orgId: f.orgId },
        });
        expect(retained.snapshot).toEqual(frozen.snapshot);
      });
      await expect(
        withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
          tx.financeStatement.update({
            where: { id: frozen.id },
            data: { closingBalanceMinor: 30_000n },
          }),
        ),
      ).rejects.toThrow();
    },
  );
});
