import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripePaymentWebhookService } from "../../stripe/finance-stripe-payment-webhook.service";
import type { FinanceReconciliationObject } from "../../stripe/finance-stripe-reconciliation.provider";
import { recoverFinanceProviderEvent } from "../finance-provider-event.persistence";
import { recoverFinanceCheckout } from "../finance-checkout-recovery.persistence";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";

function event(
  type: string,
  object: object,
  account: string,
): FinanceReconciliationObject {
  return {
    id: "evt_recovered",
    object: "event",
    type,
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    account,
    data: { object },
  };
}

describe("durable original-provider recovery", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Event recovery requires a disposable database");
  });

  it.each([
    { amount: 9999, status: "succeeded" },
    { amount: 2450, status: "processing" },
  ])(
    "holds contradictory evidence for a known card PaymentIntent",
    async (override) => {
      await withReconciliationOperation(async ({ tx, scope, checkout }) => {
        await recoverFinanceCheckout(
          tx,
          scope,
          checkout,
          new Date(),
          "capture",
        );
        expect(
          await recoverFinanceProviderEvent(
            tx,
            scope,
            event(
              "payment_intent.succeeded",
              {
                id: checkout.payment_intent,
                object: "payment_intent",
                currency: "eur",
                metadata: {},
                ...override,
              },
              scope.stripeAccountId,
            ),
            new Date(),
            "capture",
          ),
        ).toEqual({ recoverable: 0, exceptions: 1 });
      });
    },
  );

  it("captures a lost Checkout event and posts its original confirmed receipt once", async () => {
    await withReconciliationOperation(async ({ tx, scope, checkout }) => {
      const original = event(
        "checkout.session.completed",
        checkout,
        scope.stripeAccountId,
      );
      expect(
        await recoverFinanceProviderEvent(
          tx,
          scope,
          original,
          new Date(),
          "capture",
        ),
      ).toEqual({ recoverable: 1, exceptions: 0 });
      const row = await tx.financeStripeWebhookEvent.findFirstOrThrow({
        where: { tenantId: scope.tenantId, orgId: scope.orgId },
      });
      expect(row.stripeEventId).toBe("evt_recovered");
      const input = {
        tenantId: scope.tenantId,
        orgId: scope.orgId,
        stripeEventId: row.stripeEventId,
        stripeAccountId: row.stripeAccountId,
        livemode: row.livemode,
        eventType: row.eventType,
        payloadJson: row.payloadJson,
      };
      const handler = new FinanceStripePaymentWebhookService(
        new FinanceBalanceService(),
      );
      expect(await handler.process(input)).toBe("processed");
      expect(await handler.process(input)).toBe("processed");
      expect(
        await tx.financeReceipt.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(1);
    });
  });

  it("holds a confirmed unmatched PaymentIntent with its economic facts and no customer details", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      expect(
        await recoverFinanceProviderEvent(
          tx,
          scope,
          event(
            "payment_intent.succeeded",
            {
              id: "pi_unknown",
              object: "payment_intent",
              amount: 5000,
              currency: "gbp",
              status: "succeeded",
              customer: { id: "cus_private", email: "private@example.test" },
              metadata: {},
            },
            scope.stripeAccountId,
          ),
          new Date(),
          "capture",
        ),
      ).toEqual({ recoverable: 0, exceptions: 1 });
      const row = await tx.financeStripeWebhookEvent.findFirstOrThrow({
        where: { tenantId: scope.tenantId, orgId: scope.orgId },
      });
      expect(row.status).toBe("AWAITING_HANDLER");
      expect(row.payloadJson).toMatchObject({
        data: { object: { amount: 5000, currency: "gbp" } },
      });
      expect(JSON.stringify(row.payloadJson)).not.toContain("private");
      expect(
        await tx.financeReconciliationCase.findFirst({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
          select: { kind: true },
        }),
      ).toEqual({ kind: "UNMATCHED_MONEY" });
    });
  });

  it("stores unrelated customer events as minimal completed observations", async () => {
    await withReconciliationOperation(async ({ tx, scope }) => {
      expect(
        await recoverFinanceProviderEvent(
          tx,
          scope,
          event(
            "customer.created",
            {
              id: "cus_private",
              object: "customer",
              email: "private@example.test",
            },
            scope.stripeAccountId,
          ),
          new Date(),
          "capture",
        ),
      ).toEqual({ recoverable: 0, exceptions: 0 });
      const row = await tx.financeStripeWebhookEvent.findFirstOrThrow({
        where: { tenantId: scope.tenantId, orgId: scope.orgId },
      });
      expect(row.status).toBe("COMPLETED");
      expect(row.payloadJson).toMatchObject({
        data: { object: { id: "cus_private", object: "customer" } },
      });
      expect(JSON.stringify(row.payloadJson)).not.toContain(
        "private@example.test",
      );
      expect(
        await tx.financeReconciliationCase.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(0);
    });
  });

  it("does not create a case, evidence or link during a dry run", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, checkout, attemptId }) => {
        expect(
          await recoverFinanceProviderEvent(
            tx,
            scope,
            event(
              "checkout.session.completed",
              checkout,
              scope.stripeAccountId,
            ),
            new Date(),
            "dry-run",
          ),
        ).toEqual({ recoverable: 1, exceptions: 0 });
        expect(
          await tx.financeStripeWebhookEvent.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
        expect(
          await tx.financeCheckoutAttempt.findUnique({
            where: { id: attemptId },
            select: { stripeCheckoutSessionId: true },
          }),
        ).toEqual({ stripeCheckoutSessionId: null });
      },
    );
  });
});
