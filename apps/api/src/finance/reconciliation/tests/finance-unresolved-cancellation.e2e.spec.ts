import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceStripeBacsMandateService } from "../../stripe/finance-stripe-bacs-mandate.service";
import { DisabledFinanceStripeBacsProvider } from "../../stripe/finance-stripe-bacs.provider";
import { FinanceStripeBacsWebhookService } from "../../stripe/finance-stripe-bacs-webhook.service";
import { FinanceBalanceService } from "../../finance-balance.service";
import { recoverFinanceMandateObject } from "../finance-mandate-recovery.persistence";
import { withReconciliationMandate } from "./finance-reconciliation-mandate.fixture";

describe("unknown mandate cancellation acknowledgement", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Cancellation race requires a disposable database");
  });
  it("does not acknowledge setup expiry after a late first successful setup introduces a payment method", async () => {
    await withReconciliationMandate(
      async ({
        tx,
        scope,
        mandateId,
        setupIntent,
        payerUserId,
        payerAccountId,
      }) => {
        const service = new FinanceStripeBacsMandateService(
          { async assertPayerAction() {} },
          { mode: "disabled" },
          new DisabledFinanceStripeBacsProvider(),
          {
            async retrieve() {
              throw new Error("No reads needed in cancellation fixture");
            },
            async detachPaymentMethod() {
              throw new Error("New method still needs cancellation");
            },
            async expireMandateSetupSession() {
              await recoverFinanceMandateObject(
                tx,
                scope,
                setupIntent,
                new Date(),
                "capture",
              );
              const evidence =
                await tx.financeStripeWebhookEvent.findFirstOrThrow({
                  where: { eventType: "setup_intent.succeeded" },
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
                    throw new Error(
                      "Retain late method for cancellation retry",
                    );
                  },
                },
              );
              await handler.process({
                ...scope,
                stripeEventId: evidence.stripeEventId,
                eventType: evidence.eventType,
                payloadJson: evidence.payloadJson,
              });
            },
          },
        );
        expect(
          (
            await service.cancel(
              { ...scope, userId: payerUserId },
              payerAccountId,
              mandateId,
            )
          ).providerCancellation,
        ).toBe("PENDING");
        expect(
          await tx.financeMandate.findUnique({
            where: { id: mandateId },
            select: {
              status: true,
              stripePaymentMethodId: true,
              providerCancellationPending: true,
            },
          }),
        ).toEqual({
          status: "CANCELLED",
          stripePaymentMethodId: setupIntent.payment_method,
          providerCancellationPending: true,
        });
      },
    );
  });
});
