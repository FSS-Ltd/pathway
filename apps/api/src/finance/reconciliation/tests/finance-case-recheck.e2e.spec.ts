import { randomUUID } from "node:crypto";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";
import { createFinanceCaseRecheckPreparation } from "../finance-case-recheck.preparation";
import { readFinanceCaseUnresolvedContext } from "../finance-case-unresolved.persistence";
import type { FinanceCaseRequest } from "../finance-case-request.contracts";
import type { FinanceReconciliationObject } from "../../stripe/finance-stripe-reconciliation.provider";
function request(key: string): FinanceCaseRequest {
  return {
    eventId: randomUUID(),
    caseId: randomUUID(),
    requestId: randomUUID(),
    action: "RECHECK",
    evidenceId: null,
    createdAt: new Date(),
    caseKey: key,
    kind: "UNKNOWN_OPERATION",
    resourceReference: null,
    details: {},
  };
}
function dependencies(checkout: FinanceReconciliationObject) {
  return {
    clock: () => new Date(),
    provider: {
      retrieve: jest.fn().mockResolvedValue(checkout),
      listPage: jest
        .fn()
        .mockResolvedValue({ data: [checkout], nextCursor: null }),
    },
    mandates: {
      async retrieve(): Promise<never> {
        throw new Error("No mandate in checkout test");
      },
      async detachPaymentMethod(): Promise<never> {
        throw new Error("No cancellation permitted");
      },
      async expireMandateSetupSession(): Promise<never> {
        throw new Error("No cancellation permitted");
      },
    },
    payouts: {
      async listPage(): Promise<never> {
        throw new Error("No payout in checkout test");
      },
    },
  };
}
describe("actual case recheck preparation and canonical capture", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Case recheck requires a disposable database");
  });
  it.each(["sync", "dry-run"] as const)(
    "checks one exact local operation in %s mode",
    async (mode) => {
      await withReconciliationOperation(
        async ({ tx, scope, attemptId, checkout }) => {
          const deps = dependencies(checkout);
          const prepared = await createFinanceCaseRecheckPreparation(deps)(
            scope,
            request(`unresolved:checkout:${attemptId}`),
          );
          expect(await prepared.capture(tx, scope, new Date(), mode)).toEqual({
            recoverable: 1,
            exceptions: 0,
          });
          expect(await tx.financeStripeWebhookEvent.count()).toBe(
            mode === "sync" ? 1 : 0,
          );
          expect(
            await tx.financeCheckoutAttempt.findUnique({
              where: { id: attemptId },
              select: { stripeCheckoutSessionId: true },
            }),
          ).toEqual({
            stripeCheckoutSessionId: mode === "sync" ? checkout.id : null,
          });
          expect(await tx.financeReceipt.count()).toBe(0);
        },
      );
    },
  );
  it("holds a nonexistent exact operation and rejects a connection scope mismatch", async () => {
    await withReconciliationOperation(
      async ({ tx, scope, attemptId, checkout }) => {
        const deps = dependencies(checkout);
        const prepared = await createFinanceCaseRecheckPreparation(deps)(
          scope,
          request(`unresolved:checkout:${randomUUID()}`),
        );
        expect(prepared.outcome).toBe("MANUAL_REVIEW_REQUIRED_LOCAL_REFERENCE");
        expect(await prepared.capture(tx, scope, new Date(), "sync")).toEqual({
          recoverable: 0,
          exceptions: 1,
        });
        expect(deps.provider.listPage).not.toHaveBeenCalled();
        await expect(
          readFinanceCaseUnresolvedContext(
            tx,
            { ...scope, livemode: true },
            `unresolved:checkout:${attemptId}`,
          ),
        ).rejects.toThrow(/scope/);
        expect(await tx.financeStripeWebhookEvent.count()).toBe(0);
        expect(await tx.financeReconciliationCase.count()).toBe(0);
      },
    );
  });
});
