import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripePaymentWebhookService } from "../../stripe/finance-stripe-payment-webhook.service";
import { recoverFinanceCheckout } from "../finance-checkout-recovery.persistence";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";

describe("lost Finance Checkout recovery", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Checkout recovery requires a disposable database");
  });

  it("links a lost session, records API provenance and replays a confirmed receipt once", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId, invoiceId }) => {
        const now = new Date();
        expect(
          await recoverFinanceCheckout(tx, scope, checkout, now, "capture"),
        ).toEqual({ recoverable: 1, exceptions: 0 });
        const attempt = await tx.financeCheckoutAttempt.findUniqueOrThrow({
          where: { id: attemptId },
        });
        expect(attempt.stripeCheckoutSessionId).toBe(checkout.id);
        const evidence = await tx.financeStripeWebhookEvent.findFirstOrThrow({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        });
        expect(evidence).toMatchObject({
          evidenceSource: "API_RECONCILIATION",
          reconciliationConnectionId: scope.connectionId,
          status: "RECEIVED",
        });
        expect(JSON.stringify(evidence.payloadJson)).not.toContain(
          "fixture-secret",
        );
        expect(JSON.stringify(evidence.payloadJson)).not.toContain(
          "private@example.test",
        );
        const handler = new FinanceStripePaymentWebhookService(
          new FinanceBalanceService(),
        );
        const input = {
          tenantId: scope.tenantId,
          orgId: scope.orgId,
          stripeEventId: evidence.stripeEventId,
          stripeAccountId: evidence.stripeAccountId,
          livemode: evidence.livemode,
          eventType: evidence.eventType,
          payloadJson: evidence.payloadJson,
        };
        expect(await handler.process(input)).toBe("processed");
        expect(await handler.process(input)).toBe("processed");
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(1);
        expect(
          await tx.financeReceiptAllocation.findMany({
            where: { invoiceId, tenantId: scope.tenantId, orgId: scope.orgId },
            select: { amountMinor: true },
          }),
        ).toEqual([{ amountMinor: 2450n }]);
        await recoverFinanceCheckout(
          tx,
          scope,
          checkout,
          new Date(now.getTime() + 60_000),
          "capture",
        );
        expect(
          await tx.financeStripeWebhookEvent.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(1);
      },
    );
  });

  it("inspects a dry run without linking an ID, recording evidence or opening cases", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId }) => {
        expect(
          await recoverFinanceCheckout(
            tx,
            scope,
            checkout,
            new Date(),
            "dry-run",
          ),
        ).toEqual({ recoverable: 1, exceptions: 0 });
        expect(
          (
            await tx.financeCheckoutAttempt.findUniqueOrThrow({
              where: { id: attemptId },
            })
          ).stripeCheckoutSessionId,
        ).toBeNull();
        expect(
          await tx.financeStripeWebhookEvent.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
        expect(
          await tx.financeReconciliationCase.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
      },
    );
  });

  it("retains unmatched money visibly without changing family debt", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId }) => {
        expect(
          await recoverFinanceCheckout(
            tx,
            scope,
            { ...checkout, amount_total: 2500 },
            new Date(),
            "capture",
          ),
        ).toEqual({ recoverable: 0, exceptions: 1 });
        expect(
          (
            await tx.financeCheckoutAttempt.findUniqueOrThrow({
              where: { id: attemptId },
            })
          ).stripeCheckoutSessionId,
        ).toBeNull();
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
        expect(
          await tx.financeReconciliationCase.findMany({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
            select: { kind: true, amountMinor: true, currency: true },
          }),
        ).toEqual([
          { kind: "UNMATCHED_MONEY", amountMinor: 2500n, currency: "EUR" },
        ]);
        expect(
          await tx.financeStripeWebhookEvent.findFirstOrThrow({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toMatchObject({ status: "AWAITING_HANDLER" });
      },
    );
  });

  it("records an already accepted payment after a payer grant is revoked", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, grantId }) => {
        const grant = await tx.financePayerGrant.findUniqueOrThrow({
          where: { id: grantId },
        });
        await tx.financePayerGrant.update({
          where: { id: grantId },
          data: {
            revokedAt: new Date(),
            revokedByUserId: grant.grantedByUserId,
          },
        });
        await recoverFinanceCheckout(
          tx,
          scope,
          checkout,
          new Date(),
          "capture",
        );
        const evidence = await tx.financeStripeWebhookEvent.findFirstOrThrow({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        });
        const handler = new FinanceStripePaymentWebhookService(
          new FinanceBalanceService(),
        );
        expect(
          await handler.process({
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeEventId: evidence.stripeEventId,
            stripeAccountId: evidence.stripeAccountId,
            livemode: evidence.livemode,
            eventType: evidence.eventType,
            payloadJson: evidence.payloadJson,
          }),
        ).toBe("processed");
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(1);
      },
    );
  });

  it("recovers an open session without treating it as a receipt or leaking its URL into evidence", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId }) => {
        const url = "https://checkout.stripe.com/c/pay/synthetic-private-link";
        await recoverFinanceCheckout(
          tx,
          scope,
          {
            ...checkout,
            status: "open",
            payment_status: "unpaid",
            payment_intent: null,
            url,
          },
          new Date(),
          "capture",
        );
        expect(
          await tx.financeCheckoutAttempt.findUniqueOrThrow({
            where: { id: attemptId },
          }),
        ).toMatchObject({
          status: "OPEN",
          checkoutUrl: url,
          stripeCheckoutSessionId: checkout.id,
        });
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
        const evidence = await tx.financeStripeWebhookEvent.findFirstOrThrow({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        });
        expect(evidence.status).toBe("COMPLETED");
        expect(JSON.stringify(evidence.payloadJson)).not.toContain(
          "synthetic-private-link",
        );
      },
    );
  });

  it("preserves an already known PaymentIntent when an open session read has no intent yet", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId }) => {
        await tx.financeCheckoutAttempt.update({
          where: { id: attemptId },
          data: { stripePaymentIntentId: "pi_already_known" },
        });
        await recoverFinanceCheckout(
          tx,
          scope,
          {
            ...checkout,
            status: "open",
            payment_status: "unpaid",
            payment_intent: null,
            url: "https://checkout.stripe.com/c/pay/synthetic",
          },
          new Date(),
          "capture",
        );
        expect(
          (
            await tx.financeCheckoutAttempt.findUniqueOrThrow({
              where: { id: attemptId },
            })
          ).stripePaymentIntentId,
        ).toBe("pi_already_known");
      },
    );
  });

  it("retains a processing session without inferring a confirmed receipt", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId }) => {
        await recoverFinanceCheckout(
          tx,
          scope,
          { ...checkout, payment_status: "unpaid" },
          new Date(),
          "capture",
        );
        const evidence = await tx.financeStripeWebhookEvent.findFirstOrThrow({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        });
        const handler = new FinanceStripePaymentWebhookService(
          new FinanceBalanceService(),
        );
        expect(
          await handler.process({
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeEventId: evidence.stripeEventId,
            stripeAccountId: evidence.stripeAccountId,
            livemode: evidence.livemode,
            eventType: evidence.eventType,
            payloadJson: evidence.payloadJson,
          }),
        ).toBe("processed");
        expect(
          (
            await tx.financeCheckoutAttempt.findUniqueOrThrow({
              where: { id: attemptId },
            })
          ).status,
        ).toBe("COMPLETED");
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
      },
    );
  });

  it("only releases an unknown attempt after provider-confirmed expiry", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId }) => {
        await recoverFinanceCheckout(
          tx,
          scope,
          {
            ...checkout,
            status: "expired",
            payment_status: "unpaid",
            payment_intent: null,
          },
          new Date(),
          "capture",
        );
        expect(
          (
            await tx.financeCheckoutAttempt.findUniqueOrThrow({
              where: { id: attemptId },
            })
          ).status,
        ).toBe("EXPIRED");
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
      },
    );
  });

  it("retains both provider evidence and a case for a duplicate session without replacing the first link", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId }) => {
        await recoverFinanceCheckout(
          tx,
          scope,
          checkout,
          new Date(),
          "capture",
        );
        expect(
          await recoverFinanceCheckout(
            tx,
            scope,
            { ...checkout, id: "cs_duplicate" },
            new Date(),
            "capture",
          ),
        ).toEqual({ recoverable: 0, exceptions: 1 });
        expect(
          (
            await tx.financeCheckoutAttempt.findUniqueOrThrow({
              where: { id: attemptId },
            })
          ).stripeCheckoutSessionId,
        ).toBe(checkout.id);
        expect(
          await tx.financeStripeWebhookEvent.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(2);
        const exception = await tx.financeReconciliationCase.findFirstOrThrow({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        });
        expect(exception.details).toMatchObject({
          reason: "DUPLICATE_SESSION",
          fundsConfirmed: true,
        });
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
      },
    );
  });
});
