import { randomUUID } from "node:crypto";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripeBacsWebhookService } from "../../stripe/finance-stripe-bacs-webhook.service";
import { FinanceStripeBacsMandateService } from "../../stripe/finance-stripe-bacs-mandate.service";
import { DisabledFinanceStripeBacsProvider } from "../../stripe/finance-stripe-bacs.provider";
import { StripeFinanceMandateServicingProvider } from "../../stripe/finance-stripe-mandate-servicing.provider";
import { recoverFinanceProviderEvent } from "../finance-provider-event.persistence";
import { withReconciliationDebit } from "./finance-reconciliation-debit.fixture";

const noProviderWrites = {
  async detachPaymentMethod(): Promise<never> {
    throw new Error("Receipt processing cannot change mandates");
  },
};
const servicingAccess = {
  async assertPayerAction(): Promise<void> {},
  async resolveMode(): Promise<"SERVICING_ONLY"> {
    return "SERVICING_ONLY";
  },
};
function receipts() {
  return new FinanceStripeBacsWebhookService(
    servicingAccess,
    new FinanceBalanceService(),
    noProviderWrites,
  );
}

describe("Finance canonical PaymentIntent and in-flight cancellation assurance", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "In-flight assurance requires the central disposable database",
      );
  });

  it.each(["charge-first", "intent-first"])(
    "keeps one receipt when PaymentIntent success and Charge success are replayed %s",
    async (order) => {
      await withReconciliationDebit(
        async ({ tx, scope, paymentIntent, invoiceId }) => {
          const chargeId = `ch_${randomUUID().replaceAll("-", "")}`;
          const events = {
            intent: {
              id: `evt_${randomUUID().replaceAll("-", "")}`,
              object: "event",
              created: paymentIntent.created,
              account: scope.stripeAccountId,
              livemode: false,
              type: "payment_intent.succeeded",
              data: { object: paymentIntent },
            },
            charge: {
              id: `evt_${randomUUID().replaceAll("-", "")}`,
              object: "event",
              created: paymentIntent.created,
              account: scope.stripeAccountId,
              livemode: false,
              type: "charge.succeeded",
              data: {
                object: {
                  id: chargeId,
                  object: "charge",
                  created: paymentIntent.created,
                  livemode: false,
                  amount: 2450,
                  currency: "gbp",
                  paid: true,
                  captured: true,
                  status: "succeeded",
                  payment_intent: paymentIntent.id,
                },
              },
            },
          };
          const ordered =
            order === "charge-first"
              ? [events.charge, events.intent]
              : [events.intent, events.charge];
          for (const event of [...ordered, ...ordered]) {
            expect(
              (
                await recoverFinanceProviderEvent(
                  tx,
                  scope,
                  event,
                  new Date(),
                  "capture",
                )
              ).exceptions,
            ).toBe(0);
            if (event.type === "payment_intent.succeeded") {
              const inbox = await tx.financeStripeWebhookEvent.findFirstOrThrow(
                {
                  where: {
                    tenantId: scope.tenantId,
                    orgId: scope.orgId,
                    stripeEventId: event.id,
                  },
                },
              );
              expect(
                await receipts().process({
                  ...scope,
                  stripeEventId: inbox.stripeEventId,
                  eventType: inbox.eventType,
                  payloadJson: inbox.payloadJson,
                }),
              ).toBe("processed");
            }
          }
          expect(
            await tx.financeReceipt.findMany({
              where: { tenantId: scope.tenantId, orgId: scope.orgId },
              select: {
                source: true,
                sourceReference: true,
                amountMinor: true,
              },
            }),
          ).toEqual([
            {
              source: "STRIPE_BACS",
              sourceReference: paymentIntent.id,
              amountMinor: 2450n,
            },
          ]);
          expect(
            await tx.financeReceiptAllocation.findMany({
              where: {
                tenantId: scope.tenantId,
                orgId: scope.orgId,
                invoiceId,
              },
              select: { amountMinor: true },
            }),
          ).toEqual([{ amountMinor: 2450n }]);
          expect(
            await tx.financeStripeWebhookEvent.count({
              where: {
                tenantId: scope.tenantId,
                orgId: scope.orgId,
                stripeEventId: { in: [events.intent.id, events.charge.id] },
              },
            }),
          ).toBe(2);
        },
      );
    },
  );

  it("keeps processing debt outstanding and emits no routine reminder outbox event", async () => {
    await withReconciliationDebit(
      async ({
        tx,
        scope,
        paymentIntent,
        invoiceId,
        attemptId,
        payerAccountId,
      }) => {
        const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
        const eventType = "payment_intent.processing";
        expect(
          (
            await recoverFinanceProviderEvent(
              tx,
              scope,
              {
                id: eventId,
                object: "event",
                created: paymentIntent.created,
                account: scope.stripeAccountId,
                livemode: false,
                type: eventType,
                data: { object: { ...paymentIntent, status: "processing" } },
              },
              new Date(),
              "capture",
            )
          ).exceptions,
        ).toBe(0);
        const inbox = await tx.financeStripeWebhookEvent.findFirstOrThrow({
          where: {
            tenantId: scope.tenantId,
            orgId: scope.orgId,
            stripeEventId: eventId,
          },
        });
        expect(
          await receipts().process({
            ...scope,
            stripeEventId: eventId,
            eventType,
            payloadJson: inbox.payloadJson,
          }),
        ).toBe("processed");
        expect(
          await tx.financeDebitAttempt.findUnique({
            where: { id: attemptId },
            select: { status: true },
          }),
        ).toEqual({ status: "PROCESSING" });
        const invoice = await tx.financeInvoice.findUniqueOrThrow({
          where: { id: invoiceId },
          select: { id: true, status: true, currency: true, totalMinor: true },
        });
        const balances = await new FinanceBalanceService().forInvoices(
          tx,
          scope,
          [invoice],
        );
        expect(balances.get(invoiceId)?.outstandingMinor).toBe("2450");
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
        // There is currently no Finance reminder producer. This proves this actual
        // processing transition emits none; it does not claim a scheduler suppressor.
        expect(
          await tx.outboxEvent.count({
            where: {
              orgId: scope.orgId,
              aggregateId: { in: [invoiceId, attemptId, payerAccountId] },
            },
          }),
        ).toBe(0);
      },
    );
  });

  it.each(["succeeded", "requires_payment_method"])(
    "preserves a submitted debit after mandate cancellation and applies its eventual %s outcome without refund",
    async (status) => {
      await withReconciliationDebit(
        async ({
          tx,
          scope,
          paymentIntent,
          attemptId,
          invoiceId,
          mandateId,
          payerAccountId,
          payerUserId,
        }) => {
          await tx.financeDebitAttempt.update({
            where: { id: attemptId },
            data: {
              status: "SUBMITTED",
              stripePaymentIntentId: paymentIntent.id,
              submittedAt: new Date(),
            },
          });
          const before = await tx.financeDebitAttempt.findUniqueOrThrow({
            where: { id: attemptId },
          });
          const mandates = new FinanceStripeBacsMandateService(
            servicingAccess,
            { mode: "disabled" },
            new DisabledFinanceStripeBacsProvider(),
            new StripeFinanceMandateServicingProvider({ mode: "disabled" }),
          );
          // Disabled servicing models an outage: local cancellation must still stop
          // future collections while retaining the submitted debit's identity.
          expect(
            await mandates.cancel(
              { ...scope, userId: payerUserId },
              payerAccountId,
              mandateId,
            ),
          ).toMatchObject({
            status: "CANCELLED",
            providerCancellation: "PENDING",
          });
          expect(
            await tx.financeDebitAttempt.findUniqueOrThrow({
              where: { id: attemptId },
            }),
          ).toEqual(before);
          const eventId = `evt_${randomUUID().replaceAll("-", "")}`;
          const eventType =
            status === "succeeded"
              ? "payment_intent.succeeded"
              : "payment_intent.payment_failed";
          const payload = { ...paymentIntent, status };
          expect(
            (
              await recoverFinanceProviderEvent(
                tx,
                scope,
                {
                  id: eventId,
                  object: "event",
                  created: paymentIntent.created,
                  livemode: false,
                  account: scope.stripeAccountId,
                  type: eventType,
                  data: { object: payload },
                },
                new Date(),
                "capture",
              )
            ).exceptions,
          ).toBe(0);
          const inbox = await tx.financeStripeWebhookEvent.findFirstOrThrow({
            where: {
              tenantId: scope.tenantId,
              orgId: scope.orgId,
              stripeEventId: eventId,
            },
          });
          for (let delivery = 0; delivery < 2; delivery++)
            expect(
              await receipts().process({
                ...scope,
                stripeEventId: inbox.stripeEventId,
                eventType,
                payloadJson: inbox.payloadJson,
              }),
            ).toBe("processed");
          const confirmed = status === "succeeded";
          expect(
            await tx.financeReceipt.count({
              where: { tenantId: scope.tenantId, orgId: scope.orgId },
            }),
          ).toBe(confirmed ? 1 : 0);
          expect(
            await tx.financeRefund.count({
              where: { tenantId: scope.tenantId, orgId: scope.orgId },
            }),
          ).toBe(0);
          expect(
            await tx.financeReceiptMovement.count({
              where: { tenantId: scope.tenantId, orgId: scope.orgId },
            }),
          ).toBe(0);
          expect(
            await tx.financeDebitAttempt.findUnique({
              where: { id: attemptId },
              select: { status: true, stripePaymentIntentId: true },
            }),
          ).toEqual({
            status: confirmed ? "SUCCEEDED" : "FAILED",
            stripePaymentIntentId: paymentIntent.id,
          });
          const invoice = await tx.financeInvoice.findUniqueOrThrow({
            where: { id: invoiceId },
            select: {
              id: true,
              status: true,
              currency: true,
              totalMinor: true,
            },
          });
          expect(invoice.totalMinor).toBe(2450n);
          const balance = await new FinanceBalanceService().forInvoices(
            tx,
            scope,
            [invoice],
          );
          expect(balance.get(invoiceId)?.outstandingMinor).toBe(
            confirmed ? "0" : "2450",
          );
          expect(
            await tx.financeCollectionPlan.findFirst({
              where: {
                tenantId: scope.tenantId,
                orgId: scope.orgId,
                mandateId,
              },
              select: { status: true },
            }),
          ).toEqual({ status: "CANCELLED" });
        },
      );
    },
  );
});
