import { ConflictException } from "@nestjs/common";
import { requireDatabase } from "../../../../test-helpers.e2e";
import { FinanceStripeBacsMandateService } from "../../stripe/finance-stripe-bacs-mandate.service";
import type { FinanceStripeBacsProvider } from "../../stripe/finance-stripe-bacs.provider";
import { StripeFinanceMandateServicingProvider } from "../../stripe/finance-stripe-mandate-servicing.provider";
import { withReconciliationOperation } from "./finance-reconciliation-operation.fixture";

function setupService(failSetup = false): FinanceStripeBacsMandateService {
  const provider: FinanceStripeBacsProvider = {
    async createCustomer() {
      return { id: "cus_retention" };
    },
    async createMandateSetupSession({ mandateId }) {
      if (failSetup) throw new Error("Provider accepted, response lost");
      return {
        id: `cs_${mandateId.replaceAll("-", "")}`,
        url: "https://checkout.stripe.com/c/pay/retention",
        expiresAt: new Date(Date.now() + 3_600_000),
      };
    },
    async createDebit() {
      throw new Error("No collection permitted in this test");
    },
  };
  return new FinanceStripeBacsMandateService(
    { async assertPayerAction() {} },
    {
      mode: "test",
      secretKey: "sk_test_fixture",
      webAppUrl: "https://example.test",
    },
    provider,
    new StripeFinanceMandateServicingProvider({ mode: "disabled" }),
  );
}

describe("uncertain mandate setup retention", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Mandate retention requires a disposable database");
  });

  it.each(["lost session", "local expiry", "provider timeout"] as const)(
    "retains the original mandate for review after %s",
    async (failure) => {
      await withReconciliationOperation(async ({ tx, scope, grantId }) => {
        const grant = await tx.financePayerGrant.findUniqueOrThrow({
          where: { id: grantId },
        });
        const actor = { ...scope, userId: grant.payerUserId };
        const mandates = setupService(failure === "provider timeout");
        const first = mandates.startSetup(actor, grant.financePayerAccountId);
        if (failure === "provider timeout")
          await expect(first).rejects.toThrow();
        else await first;
        const original = await tx.financeMandate.findFirstOrThrow({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        });
        if (failure === "lost session")
          await tx.financeMandate.update({
            where: { id: original.id },
            data: {
              stripeCheckoutSessionId: null,
              checkoutUrl: null,
              setupExpiresAt: null,
            },
          });
        if (failure === "local expiry")
          await tx.financeMandate.update({
            where: { id: original.id },
            data: { setupExpiresAt: new Date(Date.now() - 1_000) },
          });
        await expect(
          mandates.startSetup(actor, grant.financePayerAccountId),
        ).rejects.toBeInstanceOf(ConflictException);
        expect(
          await tx.financeMandate.findMany({
            where: { tenantId: scope.tenantId, orgId: scope.orgId },
            select: { id: true, status: true },
          }),
        ).toEqual([{ id: original.id, status: "UNKNOWN" }]);
      }, "GBP");
    },
  );

  it("reuses an unexpired setup session for the same school connection", async () => {
    await withReconciliationOperation(async ({ tx, scope, grantId }) => {
      const grant = await tx.financePayerGrant.findUniqueOrThrow({
        where: { id: grantId },
      });
      const actor = { ...scope, userId: grant.payerUserId };
      const mandates = setupService();
      const first = await mandates.startSetup(
        actor,
        grant.financePayerAccountId,
      );
      expect(
        await mandates.startSetup(actor, grant.financePayerAccountId),
      ).toEqual(first);
      expect(
        await tx.financeMandate.count({
          where: { tenantId: scope.tenantId, orgId: scope.orgId },
        }),
      ).toBe(1);
    }, "GBP");
  });
});
