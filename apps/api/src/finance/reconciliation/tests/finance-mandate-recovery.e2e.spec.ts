import type { Prisma } from "@pathway/db";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripeBacsWebhookService } from "../../stripe/finance-stripe-bacs-webhook.service";
import { recoverFinanceProviderEvent } from "../finance-provider-event.persistence";
import { recoverFinanceMandateObject } from "../finance-mandate-recovery.persistence";
import type { FinanceConnectionScope } from "../finance-reconciliation.types";
import { withReconciliationMandate } from "./finance-reconciliation-mandate.fixture";
import { withReconciliationDebit } from "./finance-reconciliation-debit.fixture";

async function replay(
  tx: Prisma.TransactionClient,
  scope: FinanceConnectionScope,
  eventType: string,
): Promise<void> {
  const evidence = await tx.financeStripeWebhookEvent.findFirstOrThrow({
    where: { eventType },
  });
  const handler = new FinanceStripeBacsWebhookService(
    {
      async resolveMode() {
        return "ACTIVE";
      },
    },
    new FinanceBalanceService(),
    {
      async detachPaymentMethod() {
        throw new Error("Retain cleanup for retry");
      },
    },
  );
  expect(
    await handler.process({
      ...scope,
      stripeEventId: evidence.stripeEventId,
      eventType,
      payloadJson: evidence.payloadJson,
    }),
  ).toBe("processed");
}

describe("matched historical mandate recovery", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Mandate recovery requires a disposable database");
  });

  it("recovers an UNKNOWN setup once through the canonical handler without a receipt", async () => {
    await withReconciliationMandate(
      async ({ tx, scope, mandateId, setupIntent }) => {
        await tx.financeMandate.update({
          where: { id: mandateId },
          data: { status: "UNKNOWN" },
        });
        for (let i = 0; i < 2; i++) {
          expect(
            await recoverFinanceMandateObject(
              tx,
              scope,
              setupIntent,
              new Date(),
              "capture",
            ),
          ).toEqual({ recoverable: 1, exceptions: 0 });
          await replay(tx, scope, "setup_intent.succeeded");
        }
        expect(
          await tx.financeMandate.findUnique({
            where: { id: mandateId },
            select: { status: true, stripeSetupIntentId: true },
          }),
        ).toEqual({ status: "ACTIVE", stripeSetupIntentId: setupIntent.id });
        expect(await tx.financeReceipt.count()).toBe(0);
        expect(await tx.financeStripeWebhookEvent.count()).toBe(1);
      },
    );
  });

  it.each(["customer", "consent", "environment"] as const)(
    "holds a %s mismatch before queueing",
    async (mismatch) => {
      await withReconciliationMandate(
        async ({ tx, scope, setupIntent, mandateId }) => {
          const value = {
            ...setupIntent,
            metadata: { ...setupIntent.metadata },
          };
          if (mismatch === "customer") value.customer = "cus_other";
          if (mismatch === "consent")
            value.metadata.finance_consent_version = "different";
          if (mismatch === "environment") value.livemode = true;
          const currentScope = scope;
          expect(
            await recoverFinanceMandateObject(
              tx,
              currentScope,
              value,
              new Date(),
              "capture",
            ),
          ).toEqual({ recoverable: 0, exceptions: 1 });
          expect(
            await tx.financeMandate.findUnique({
              where: { id: mandateId },
              select: { status: true },
            }),
          ).toEqual({ status: "PENDING_SETUP" });
          expect(
            await tx.financeStripeWebhookEvent.count({
              where: { status: "RECEIVED" },
            }),
          ).toBe(0);
          expect(
            await tx.financeReconciliationCase.findFirst({
              select: { kind: true, details: true },
            }),
          ).toMatchObject({
            kind: "UNKNOWN_OPERATION",
            details: { fundsConfirmed: false },
          });
        },
      );
    },
  );

  it("does not turn an unconfirmed current setup into failure", async () => {
    await withReconciliationMandate(
      async ({ tx, scope, setupIntent, mandateId }) => {
        expect(
          await recoverFinanceMandateObject(
            tx,
            scope,
            {
              ...setupIntent,
              status: "requires_payment_method",
              payment_method: null,
              mandate: null,
            },
            new Date(),
            "capture",
          ),
        ).toEqual({ recoverable: 0, exceptions: 0 });
        expect(
          await tx.financeMandate.findUnique({
            where: { id: mandateId },
            select: { status: true },
          }),
        ).toEqual({ status: "PENDING_SETUP" });
        expect(
          await tx.financeStripeWebhookEvent.findFirst({
            select: { status: true },
          }),
        ).toEqual({ status: "COMPLETED" });
      },
    );
  });

  it("checks without writing in dry run", async () => {
    await withReconciliationMandate(async ({ tx, scope, setupIntent }) => {
      expect(
        await recoverFinanceMandateObject(
          tx,
          scope,
          setupIntent,
          new Date(),
          "dry-run",
        ),
      ).toEqual({ recoverable: 1, exceptions: 0 });
      expect(await tx.financeStripeWebhookEvent.count()).toBe(0);
      expect(await tx.financeReconciliationCase.count()).toBe(0);
    });
  });

  it("does not restore a revoked payer grant after successful provider setup", async () => {
    await withReconciliationMandate(
      async ({ tx, scope, setupIntent, mandateId, grantId }) => {
        await tx.financePayerGrant.update({
          where: { id: grantId },
          data: {
            revokedAt: new Date(),
            revokedByUserId: (
              await tx.financePayerGrant.findUniqueOrThrow({
                where: { id: grantId },
              })
            ).grantedByUserId,
          },
        });
        await recoverFinanceMandateObject(
          tx,
          scope,
          setupIntent,
          new Date(),
          "capture",
        );
        await replay(tx, scope, "setup_intent.succeeded");
        expect(
          await tx.financeMandate.findUnique({
            where: { id: mandateId },
            select: { status: true, providerCancellationPending: true },
          }),
        ).toEqual({ status: "CANCELLED", providerCancellationPending: true });
        expect(await tx.financeReceipt.count()).toBe(0);
      },
    );
  });

  it("holds original setup evidence with a mismatched customer", async () => {
    await withReconciliationMandate(async ({ tx, scope, setupIntent }) => {
      expect(
        await recoverFinanceProviderEvent(
          tx,
          scope,
          {
            id: "evt_setup_mismatch",
            object: "event",
            type: "setup_intent.succeeded",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: { object: { ...setupIntent, customer: "cus_different" } },
          },
          new Date(),
          "capture",
        ),
      ).toEqual({ recoverable: 0, exceptions: 1 });
    });
  });

  it("retains pending cancellation after an active provider mandate event", async () => {
    await withReconciliationDebit(
      async ({ tx, scope, mandateId, paymentIntent }) => {
        const mandate = await tx.financeMandate.update({
          where: { id: mandateId },
          data: {
            status: "CANCELLED",
            cancelledAt: new Date(),
            providerCancellationPending: true,
          },
        });
        await recoverFinanceProviderEvent(
          tx,
          scope,
          {
            id: "evt_active_mandate",
            object: "event",
            type: "mandate.updated",
            created: Math.floor(Date.now() / 1000),
            livemode: false,
            data: {
              object: {
                id: mandate.stripeMandateId,
                object: "mandate",
                status: "active",
                payment_method: paymentIntent.payment_method,
              },
            },
          },
          new Date(),
          "capture",
        );
        await replay(tx, scope, "mandate.updated");
        expect(
          await tx.financeMandate.findUnique({
            where: { id: mandateId },
            select: { status: true, providerCancellationPending: true },
          }),
        ).toEqual({ status: "CANCELLED", providerCancellationPending: true });
      },
    );
  });

  it.each(["mandate", "method"] as const)(
    "honours same-second %s inactivity after setup confirmation",
    async (resource) => {
      await withReconciliationMandate(
        async ({ tx, scope, setupIntent, mandateId }) => {
          const observedAt = new Date("2026-10-23T12:00:00Z");
          if (!setupIntent.mandate || !setupIntent.payment_method)
            throw new Error("Fixture setup identity is missing");
          await recoverFinanceMandateObject(
            tx,
            scope,
            setupIntent,
            observedAt,
            "capture",
          );
          await replay(tx, scope, "setup_intent.succeeded");
          await recoverFinanceMandateObject(
            tx,
            scope,
            resource === "mandate"
              ? {
                  id: setupIntent.mandate,
                  object: "mandate",
                  livemode: false,
                  status: "inactive",
                  payment_method: setupIntent.payment_method,
                  acceptedAt: null,
                }
              : {
                  id: setupIntent.payment_method,
                  object: "payment_method",
                  livemode: false,
                  created: setupIntent.created,
                  type: "bacs_debit",
                  customer: null,
                },
            observedAt,
            "capture",
          );
          await replay(
            tx,
            scope,
            resource === "mandate"
              ? "mandate.updated"
              : "payment_method.detached",
          );
          expect(
            await tx.financeMandate.findUnique({
              where: { id: mandateId },
              select: { status: true, providerStatusAt: true },
            }),
          ).toEqual({
            status: "CANCELLED",
            providerStatusAt: observedAt,
          });
        },
      );
    },
  );

  it("replays actual provider inactivity to cancel future plans", async () => {
    await withReconciliationDebit(
      async ({ tx, scope, mandateId, paymentIntent }) => {
        const mandate = await tx.financeMandate.findUniqueOrThrow({
          where: { id: mandateId },
        });
        if (!mandate.stripeMandateId)
          throw new Error("Missing fixture provider mandate");
        expect(
          await recoverFinanceMandateObject(
            tx,
            scope,
            {
              id: mandate.stripeMandateId,
              object: "mandate",
              livemode: false,
              status: "inactive",
              payment_method: String(paymentIntent.payment_method),
              acceptedAt: null,
            },
            new Date(),
            "capture",
          ),
        ).toEqual({ recoverable: 1, exceptions: 0 });
        await replay(tx, scope, "mandate.updated");
        expect(
          await tx.financeMandate.findUnique({
            where: { id: mandateId },
            select: { status: true },
          }),
        ).toEqual({ status: "CANCELLED" });
        expect(
          await tx.financeCollectionPlan.findFirst({
            select: { status: true },
          }),
        ).toEqual({ status: "CANCELLED" });
      },
    );
  });
});
