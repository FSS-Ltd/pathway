import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceBalanceService } from "../../finance-balance.service";
import { FinanceStripePaymentWebhookService } from "../../stripe/finance-stripe-payment-webhook.service";
import { FinanceStripeReconciliationError } from "../../stripe/finance-stripe-reconciliation.provider";
import { FinanceReconciliationStateRepository } from "../finance-reconciliation-state.repository";
import {
  runFinanceUnresolvedReconciliation,
  type FinanceUnresolvedDependencies,
} from "../finance-unresolved-runner";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";
const old = new Date("2026-01-01T00:00:00Z");
function dependencies(now: Date) {
  return {
    clock: () => now,
    states: new FinanceReconciliationStateRepository(),
    provider: {
      listPage: jest
        .fn<
          ReturnType<FinanceUnresolvedDependencies["provider"]["listPage"]>,
          Parameters<FinanceUnresolvedDependencies["provider"]["listPage"]>
        >()
        .mockResolvedValue({ data: [], nextCursor: null }),
      retrieve: jest.fn<
        ReturnType<FinanceUnresolvedDependencies["provider"]["retrieve"]>,
        Parameters<FinanceUnresolvedDependencies["provider"]["retrieve"]>
      >(),
    },
    mandates: {
      async retrieve(): Promise<never> {
        throw new Error("No mandate in checkout fixture");
      },
      async detachPaymentMethod(): Promise<never> {
        throw new Error("No cancellation in checkout fixture");
      },
      async expireMandateSetupSession(): Promise<never> {
        throw new Error("No cancellation in checkout fixture");
      },
    },
  };
}
describe("historical unresolved runtime sweep", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Runtime sweep requires a disposable database");
  });
  it("persists one search page and resumes the same old provider window next sweep", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, attemptId }) => {
        let now = new Date(Date.now() + 600_000);
        const deps = dependencies(now);
        deps.clock = () => now;
        deps.provider.listPage.mockResolvedValueOnce({
          data: [
            {
              id: "cs_other",
              object: "checkout.session",
              created: old.getTime() / 1000,
              metadata: {},
            },
          ],
          nextCursor: "cs_other",
        });
        expect(
          await runFinanceUnresolvedReconciliation(
            { scope, mode: "sync" },
            deps,
          ),
        ).toMatchObject({ status: "completed", objects: 1, exceptions: 1 });
        expect(
          await tx.financeReconciliationCase.findFirst({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
            select: { caseKey: true, details: true },
          }),
        ).toMatchObject({
          caseKey: `unresolved:checkout:${attemptId}`,
          details: { search: { cursor: "cs_other", exhausted: false } },
        });
        now = new Date(now.getTime() + 300_000);
        await runFinanceUnresolvedReconciliation({ scope, mode: "sync" }, deps);
        expect(deps.provider.listPage.mock.calls[1]?.[2]).toEqual({
          ...deps.provider.listPage.mock.calls[0]?.[2],
          startingAfter: "cs_other",
        });
        expect(
          await tx.financeCheckoutAttempt.findUnique({
            where: { id: attemptId },
            select: { status: true, stripeCheckoutSessionId: true },
          }),
        ).toEqual({ status: "CREATING", stripeCheckoutSessionId: null });
        expect(
          await tx.financeReconciliationCase.findFirst({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
            select: { status: true, details: true },
          }),
        ).toMatchObject({
          status: "OPEN",
          details: { search: { exhausted: true } },
        });
      },
      "GBP",
      old,
    );
  });
  it("recovers a known historical session through the canonical inbox exactly once", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, attemptId, checkout }) => {
        await tx.financeCheckoutAttempt.update({
          where: { id: attemptId },
          data: {
            status: "OPEN",
            stripeCheckoutSessionId: checkout.id,
            expiresAt: new Date(Date.now() + 3_600_000),
            checkoutUrl: "https://checkout.stripe.com/c/pay/fixture",
          },
        });
        const deps = dependencies(new Date(Date.now() + 600_000));
        deps.provider.retrieve.mockResolvedValue(checkout);
        expect(
          await runFinanceUnresolvedReconciliation(
            { scope, mode: "sync" },
            deps,
          ),
        ).toMatchObject({ status: "completed", recoverable: 1 });
        expect(deps.provider.retrieve).toHaveBeenCalledWith(
          scope,
          "checkoutSessions",
          checkout.id,
        );
        expect(deps.provider.listPage).not.toHaveBeenCalled();
        const evidence = await tx.financeStripeWebhookEvent.findFirstOrThrow({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        });
        const handler = new FinanceStripePaymentWebhookService(
          new FinanceBalanceService(),
        );
        for (let i = 0; i < 2; i++)
          await handler.process({
            ...scope,
            stripeEventId: evidence.stripeEventId,
            eventType: evidence.eventType,
            payloadJson: evidence.payloadJson,
          });
        expect(
          await tx.financeReceipt.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(1);
        expect(
          await tx.financeReceiptAllocation.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(1);
      },
      "GBP",
      old,
    );
  });
  it("previews aged unknown outcomes without evidence, cases, leases or cursor writes", async () => {
    await withReconciliationOperation(
      async ({ tx, scope }) => {
        const deps = dependencies(new Date(Date.now() + 600_000));
        expect(
          await runFinanceUnresolvedReconciliation(
            { scope, mode: "dry-run" },
            deps,
          ),
        ).toMatchObject({ status: "completed", exceptions: 1 });
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
        expect(
          await tx.financeReconciliationState.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
      },
      "GBP",
      old,
    );
  });
  it("does not advance an operation cursor after a provider outage", async () => {
    await withReconciliationOperation(
      async ({ tx, scope }) => {
        const deps = dependencies(new Date(Date.now() + 600_000));
        deps.provider.listPage.mockRejectedValue(
          new FinanceStripeReconciliationError("UNAVAILABLE"),
        );
        expect(
          await runFinanceUnresolvedReconciliation(
            { scope, mode: "sync" },
            deps,
          ),
        ).toMatchObject({ status: "failed", reason: "UNAVAILABLE", pages: 0 });
        expect(
          await tx.financeReconciliationState.findFirst({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
            select: { completedThrough: true, pageCursor: true },
          }),
        ).toEqual({ completedThrough: null, pageCursor: null });
        expect(
          await tx.financeStripeWebhookEvent.count({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
          }),
        ).toBe(0);
      },
      "GBP",
      old,
    );
  });
});
