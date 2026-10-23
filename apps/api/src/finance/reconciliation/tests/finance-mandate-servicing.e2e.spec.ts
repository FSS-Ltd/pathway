import { ForbiddenException } from "@nestjs/common";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { canPerformFinancePayerAction } from "../../access/finance-access.policy";
import type { FinanceAccessService } from "../../access/finance-access.service";
import { FinanceStripeBacsMandateService } from "../../stripe/finance-stripe-bacs-mandate.service";
import { DisabledFinanceStripeBacsProvider } from "../../stripe/finance-stripe-bacs.provider";
import { StripeFinanceMandateServicingProvider } from "../../stripe/finance-stripe-mandate-servicing.provider";
import { withReconciliationDebit } from "./finance-reconciliation-debit.fixture";

const servicingAccess: Pick<FinanceAccessService, "assertPayerAction"> = {
  async assertPayerAction(_scope, _user, _payer, action) {
    if (!canPerformFinancePayerAction("SERVICING_ONLY", action))
      throw new ForbiddenException("Finance action unavailable");
  },
};
function service(fetcher: typeof fetch): FinanceStripeBacsMandateService {
  return new FinanceStripeBacsMandateService(
    servicingAccess,
    { mode: "disabled" },
    new DisabledFinanceStripeBacsProvider(),
    new StripeFinanceMandateServicingProvider(
      { mode: "test", secretKey: "rk_test_fixture" },
      fetcher,
    ),
  );
}

describe("mandate cancellation after new collection stops", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Mandate servicing requires a disposable database");
  });

  it("uses the servicing connection, cancels future plans and confirms provider cancellation", async () => {
    await withReconciliationDebit(
      async ({
        tx,
        scope,
        paymentIntent,
        mandateId,
        payerAccountId,
        payerUserId,
      }) => {
        const fetcher = jest
          .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
          .mockImplementation(
            async (_url, init) =>
              new Response(
                JSON.stringify({
                  id: paymentIntent.payment_method,
                  object: "payment_method",
                  created: paymentIntent.created,
                  livemode: false,
                  type: "bacs_debit",
                  customer:
                    init?.method === "POST" ? null : paymentIntent.customer,
                }),
              ),
          );
        expect(
          await service(fetcher).cancel(
            { ...scope, userId: payerUserId },
            payerAccountId,
            mandateId,
          ),
        ).toEqual({
          mandateId,
          status: "CANCELLED",
          providerCancellation: "CONFIRMED",
        });
        expect(
          await tx.financeMandate.findUnique({
            where: { id: mandateId },
            select: { status: true, providerCancellationPending: true },
          }),
        ).toEqual({ status: "CANCELLED", providerCancellationPending: false });
        expect(
          await tx.financeCollectionPlan.findFirst({
            where: { tenantId: scope.tenantId, orgId: scope.orgId, mandateId },
            select: { status: true },
          }),
        ).toEqual({ status: "CANCELLED" });
        expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual([
          "GET",
          "POST",
        ]);
        expect(fetcher.mock.calls[1]?.[1]?.headers).toMatchObject({
          "Stripe-Account": scope.stripeAccountId,
        });
      },
    );
  });

  it("retains an outage as pending and completes a retry after a provider Dashboard detachment", async () => {
    await withReconciliationDebit(
      async ({
        tx,
        scope,
        paymentIntent,
        mandateId,
        payerAccountId,
        payerUserId,
      }) => {
        const fetcher = jest
          .fn<ReturnType<typeof fetch>, Parameters<typeof fetch>>()
          .mockRejectedValueOnce(new Error("Provider outage"))
          .mockResolvedValue(
            new Response(
              JSON.stringify({
                id: paymentIntent.payment_method,
                object: "payment_method",
                created: paymentIntent.created,
                livemode: false,
                type: "bacs_debit",
                customer: null,
              }),
            ),
          );
        const mandates = service(fetcher);
        const actor = { ...scope, userId: payerUserId };
        expect(
          (await mandates.cancel(actor, payerAccountId, mandateId))
            .providerCancellation,
        ).toBe("PENDING");
        expect(
          await tx.financeMandate.findUnique({
            where: { id: mandateId },
            select: { providerCancellationPending: true },
          }),
        ).toEqual({ providerCancellationPending: true });
        expect(
          (await mandates.cancel(actor, payerAccountId, mandateId))
            .providerCancellation,
        ).toBe("CONFIRMED");
        expect(
          fetcher.mock.calls.some(([, init]) => init?.method === "POST"),
        ).toBe(false);
      },
    );
  });
});
