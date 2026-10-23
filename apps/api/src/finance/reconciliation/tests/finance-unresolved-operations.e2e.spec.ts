import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripePaymentWebhookService } from "../../stripe/finance-stripe-payment-webhook.service";
import { recordFinanceReceiptMovement } from "../../finance-receipt-movement.service";
import { recoverFinanceCheckout } from "../finance-checkout-recovery.persistence";
import { readFinanceUnresolvedPage } from "../finance-unresolved-operations.persistence";
import { withReconciliationMandate } from "./finance-reconciliation-mandate.fixture";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";
import { withReconciliationDebit } from "./finance-reconciliation-debit.fixture";

const cutoff = () => new Date(Date.now() + 60_000);

describe("historical unresolved operation paging", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Unresolved recovery requires a disposable database");
  });

  it("pages by immutable operation identity without starving the next operation type", async () => {
    await withReconciliationMandate(
      async ({ tx, scope, mandateId, attemptId }) => {
        const first = await readFinanceUnresolvedPage(
          tx,
          scope,
          cutoff(),
          null,
          1,
        );
        expect(first.data.map((row) => [row.kind, row.id])).toEqual([
          ["checkout", attemptId],
        ]);
        expect(first.nextCursor).toBe(`checkout:${attemptId}`);
        const second = await readFinanceUnresolvedPage(
          tx,
          scope,
          cutoff(),
          first.nextCursor,
          1,
        );
        expect(second.data.map((row) => [row.kind, row.id])).toEqual([
          ["mandate", mandateId],
        ]);
        expect(second.nextCursor).toBeNull();
        expect(await tx.financeReconciliationState.count()).toBe(0);
        expect(await tx.financeReconciliationCase.count()).toBe(0);
      },
    );
  });

  it("includes unresolved records older than the recent provider window", async () => {
    const old = new Date("2026-01-01T00:00:00Z");
    await withReconciliationOperation(
      async ({ tx, scope, attemptId }) => {
        expect(
          await readFinanceUnresolvedPage(tx, scope, cutoff(), null),
        ).toMatchObject({
          data: [
            {
              kind: "checkout",
              id: attemptId,
              createdAt: old,
              resourceId: null,
            },
          ],
          nextCursor: null,
        });
      },
      "GBP",
      old,
    );
  });

  it("keeps debit and active mandate inspection in the stored connection", async () => {
    await withReconciliationDebit(
      async ({ tx, scope, attemptId, mandateId }) => {
        const page = await readFinanceUnresolvedPage(tx, scope, cutoff(), null);
        expect(page.data).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ kind: "debit", id: attemptId }),
            expect.objectContaining({ kind: "mandate", id: mandateId }),
          ]),
        );
        await expect(
          readFinanceUnresolvedPage(
            tx,
            { ...scope, livemode: true },
            cutoff(),
            null,
          ),
        ).rejects.toThrow("scope is invalid");
      },
    );
  });

  it("retains approved refunds and withdrawals, scoped through their confirmed receipt", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, grantId }) => {
        await recoverFinanceCheckout(
          tx,
          scope,
          checkout,
          new Date(),
          "capture",
        );
        const event = await tx.financeStripeWebhookEvent.findFirstOrThrow({
          where: { eventType: "checkout.session.completed" },
        });
        await new FinanceStripePaymentWebhookService(
          new FinanceBalanceService(),
        ).process({
          ...scope,
          stripeEventId: event.stripeEventId,
          eventType: event.eventType,
          payloadJson: event.payloadJson,
        });
        const receipt = await tx.financeReceipt.findFirstOrThrow();
        const grant = await tx.financePayerGrant.findUniqueOrThrow({
          where: { id: grantId },
        });
        const refund = await tx.financeRefund.create({
          data: {
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            financeProfileId: receipt.financeProfileId,
            receiptId: receipt.id,
            requestedByUserId: grant.payerUserId,
            approvedByUserId: grant.grantedByUserId,
            approvedAt: new Date(),
            source: "STRIPE_CARD",
            status: "APPROVED",
            stripeAccountId: scope.stripeAccountId,
            amountMinor: 500n,
            currency: receipt.currency,
            reason: "Synthetic refund",
            decisionReason: "Independently approved",
          },
        });
        await recordFinanceReceiptMovement(tx, {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          financeProfileId: receipt.financeProfileId,
          receiptId: receipt.id,
          type: "DISPUTE_WITHDRAWAL",
          source: "STRIPE",
          amountMinor: 100n,
          currency: receipt.currency,
          sourceReference: "du_historical",
          occurredAt: new Date(),
        });
        const page = await readFinanceUnresolvedPage(tx, scope, cutoff(), null);
        expect(page.data.map((row) => [row.kind, row.resourceId])).toEqual([
          ["dispute", "du_historical"],
          ["refund", null],
        ]);
        expect(page.data[1].id).toBe(refund.id);
        const withdrawal = await tx.financeReceiptMovement.findFirstOrThrow({
          where: { type: "DISPUTE_WITHDRAWAL" },
        });
        await recordFinanceReceiptMovement(tx, {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          financeProfileId: receipt.financeProfileId,
          receiptId: receipt.id,
          type: "DISPUTE_REINSTATEMENT",
          source: "STRIPE",
          amountMinor: 100n,
          currency: receipt.currency,
          sourceReference: "du_historical",
          originalMovementId: withdrawal.id,
          occurredAt: new Date(),
        });
        expect(
          (await readFinanceUnresolvedPage(tx, scope, cutoff(), null)).data.map(
            (row) => row.kind,
          ),
        ).toEqual(["refund"]);
      },
    );
  });

  it("does not include operations created after a resumed sweep cutoff", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      expect(
        await readFinanceUnresolvedPage(
          tx,
          scope,
          new Date("2026-01-01T00:00:00Z"),
          null,
        ),
      ).toEqual({ data: [], nextCursor: null });
    });
  });
});
