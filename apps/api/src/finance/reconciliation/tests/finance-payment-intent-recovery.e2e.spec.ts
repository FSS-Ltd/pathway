import type { Prisma } from "@pathway/db";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripeBacsWebhookService } from "../../stripe/finance-stripe-bacs-webhook.service";
import { recoverFinancePaymentIntent } from "../finance-payment-intent-recovery.persistence";
import type { FinanceConnectionScope } from "../finance-reconciliation.types";
import { withReconciliationDebit } from "./finance-reconciliation-debit.fixture";

// PaymentIntent replay never calls the setup/cancellation provider.
const noProviderWrites = {
  async detachPaymentMethod(): Promise<never> {
    throw new Error("Payment recovery must not detach a payment method");
  },
};
const access = {
  async resolveMode(): Promise<never> {
    throw new Error(
      "Confirmed receipt replay must not depend on current collection entitlement",
    );
  },
};
const handler = new FinanceStripeBacsWebhookService(
  access,
  new FinanceBalanceService(),
  noProviderWrites,
);

async function replay(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  type: string,
): Promise<void> {
  const event = await tx.financeStripeWebhookEvent.findFirstOrThrow({
    where: { tenantId: scope.tenantId, orgId: scope.orgId, eventType: type },
  });
  expect(
    await handler.process({
      tenantId: scope.tenantId,
      orgId: scope.orgId,
      stripeEventId: event.stripeEventId,
      stripeAccountId: event.stripeAccountId,
      livemode: event.livemode,
      eventType: event.eventType,
      payloadJson: event.payloadJson,
    }),
  ).toBe("processed");
}

describe("current PaymentIntent recovery through canonical Bacs receipts", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Bacs recovery requires a disposable database");
  });

  it("keeps processing funds separate, then posts a succeeded receipt once", async () => {
    await withReconciliationDebit(
      async ({ tx, scope, paymentIntent, attemptId, invoiceId }) => {
        expect(
          await recoverFinancePaymentIntent(
            tx,
            scope,
            { ...paymentIntent, status: "processing" },
            new Date(),
            "capture",
          ),
        ).toEqual({ recoverable: 1, exceptions: 0 });
        await replay(tx, scope, "payment_intent.processing");
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
        expect(
          await tx.financeDebitAttempt.findUnique({
            where: { id: attemptId },
            select: { status: true },
          }),
        ).toEqual({ status: "PROCESSING" });
        expect(
          await recoverFinancePaymentIntent(
            tx,
            scope,
            paymentIntent,
            new Date(),
            "capture",
          ),
        ).toEqual({ recoverable: 1, exceptions: 0 });
        await replay(tx, scope, "payment_intent.succeeded");
        await replay(tx, scope, "payment_intent.succeeded");
        expect(
          await tx.financeReceipt.findMany({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
            select: { source: true, amountMinor: true },
          }),
        ).toEqual([{ source: "STRIPE_BACS", amountMinor: 2450n }]);
        expect(
          await tx.financeReceiptAllocation.findMany({
            where: { tenantId: scope.tenantId, orgId: scope.orgId, invoiceId },
            select: { amountMinor: true },
          }),
        ).toEqual([{ amountMinor: 2450n }]);
        const evidence = await tx.financeStripeWebhookEvent.findMany({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        });
        expect(JSON.stringify(evidence)).not.toContain("private");
      },
    );
  });

  it("holds a changed principal instead of posting money", async () => {
    await withReconciliationDebit(async ({ tx, scope, paymentIntent }) => {
      expect(
        await recoverFinancePaymentIntent(
          tx,
          scope,
          { ...paymentIntent, amount: 9999 },
          new Date(),
          "capture",
        ),
      ).toEqual({ recoverable: 0, exceptions: 1 });
      expect(
        await tx.financeReceipt.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(0);
    });
  });

  it("does not link or queue a PaymentIntent during a dry run", async () => {
    await withReconciliationDebit(
      async ({ tx, scope, paymentIntent, attemptId }) => {
        expect(
          await recoverFinancePaymentIntent(
            tx,
            scope,
            paymentIntent,
            new Date(),
            "dry-run",
          ),
        ).toEqual({ recoverable: 1, exceptions: 0 });
        expect(
          await tx.financeDebitAttempt.findUnique({
            where: { id: attemptId },
            select: { stripePaymentIntentId: true },
          }),
        ).toEqual({ stripePaymentIntentId: null });
        expect(
          await tx.financeStripeWebhookEvent.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
      },
    );
  });
});
