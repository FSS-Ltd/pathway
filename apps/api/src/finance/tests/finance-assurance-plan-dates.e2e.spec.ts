import { randomUUID } from "node:crypto";
import { Module, prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import type { FinanceAccessService } from "../access/finance-access.service";
import { FINANCE_BACS_MANDATE_CONSENT_VERSION } from "../domain/finance-collection-terms";
import { FinanceCollectionPlanService } from "../finance-collection-plan.service";
import { FinanceBacsCollectionService } from "../finance-bacs-collection.service";
import { FinanceRecurringInvoiceService } from "../finance-recurring-invoice.service";
import type { FinanceStripeBacsProvider } from "../stripe/finance-stripe-bacs.provider";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";

const config = {
  mode: "test" as const,
  secretKey: "sk_test_assurance_fixture",
  webAppUrl: "https://family.example.test",
};

async function createPlan(amount: string, count: number, firstDueDate: string) {
  const orgId = randomUUID();
  await prisma.org.create({
    data: {
      id: orgId,
      name: "Synthetic plan dates",
      slug: `plan-dates-${orgId}`,
      planCode: "trial",
    },
  });
  await prisma.orgModule.create({
    data: { orgId, module: Module.FINANCE, status: "ACTIVE" },
  });
  const f = await createFinanceAssuranceFixture(orgId);
  const stripeAccountId = f.connection.stripeAccountId;
  if (!stripeAccountId) throw new Error("Synthetic account required");
  const invoiceId = await f.createIssuedInvoice(amount);
  const mandate = await withTenantRlsContext(
    f.tenantId,
    f.orgId,
    async (tx) => {
      const account = {
        tenantId: f.tenantId,
        orgId,
        financeProfileId: f.profile.id,
        payerAccountId: f.payer.id,
        stripeConnectionId: f.connection.id,
        stripeAccountId,
      };
      const customer = await tx.financeStripeCustomer.create({
        data: {
          ...account,
          stripeCustomerId: `cus_${randomUUID()}`,
          livemode: false,
        },
      });
      return tx.financeMandate.create({
        data: {
          ...account,
          financeStripeCustomerId: customer.id,
          livemode: false,
          status: "ACTIVE",
          createdByUserId: f.payerUser.id,
          acceptedByUserId: f.payerUser.id,
          acceptedAt: new Date(),
          consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
          stripeSetupIntentId: `seti_${randomUUID()}`,
          stripePaymentMethodId: `pm_${randomUUID()}`,
          stripeMandateId: `mandate_${randomUUID()}`,
        },
      });
    },
  );
  // Explicit service-only permission adapter. It retains independent approval;
  // real HTTP permission enforcement has separate AppModule assurance coverage.
  const access = {
    ...f.access,
    resolveMode: async (scope: { tenantId: string; orgId: string }) =>
      scope.tenantId === f.tenantId && scope.orgId === f.orgId
        ? "ACTIVE"
        : "LOCKED",
    authorizeAutomatedDebitApproval: (
      ...args: Parameters<
        FinanceAccessService["authorizeIndependentFinanceApproval"]
      >
    ) => f.access.authorizeIndependentFinanceApproval(...args),
  } as unknown as FinanceAccessService;
  const plans = new FinanceCollectionPlanService(access, f.balances, config);
  const plan = await plans.create(f.actor, invoiceId, {
    payerAccountId: f.payer.id,
    mandateId: mandate.id,
    instalmentCount: count,
    firstDueDate,
  });
  await plans.approve(f.reviewer, plan.planId);
  await plans.accept(f.payerActor, f.payer.id, plan.planId);
  await plans.accept(f.payerActor, f.payer.id, plan.planId);
  return { f, access, invoiceId, planId: plan.planId };
}

describe("Finance persisted collection plan and London scheduler dates", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error("Central disposable database required");
  });

  it("persists three 10000 instalments against one 30000 invoice after independent approval and repeated payer acceptance", async () => {
    const { f, invoiceId, planId } = await createPlan("30000", 3, "2026-11-05");
    await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
      const scope = { tenantId: f.tenantId, orgId: f.orgId };
      expect(await tx.financeInvoice.count({ where: scope })).toBe(1);
      const rows = await tx.financeCollectionInstalment.findMany({
        where: { ...scope, planId },
        orderBy: { sequence: "asc" },
      });
      expect(rows.map((row) => row.amountMinor)).toEqual([
        10000n,
        10000n,
        10000n,
      ]);
      expect(rows.every((row) => row.status === "SCHEDULED")).toBe(true);
      expect(await tx.financeDebitAttempt.count({ where: scope })).toBe(0);
      expect(await tx.financeReceipt.count({ where: scope })).toBe(0);
    });
    expect(
      (await f.invoices.get(f.actor, invoiceId)).balance.outstandingMinor,
    ).toBe("30000");
  });

  it.each([
    {
      name: "weekend",
      first: "2026-10-31",
      due: "2026-11-02",
      before: [
        "2026-10-30T12:00:00Z",
        "2026-10-31T12:00:00Z",
        "2026-11-01T12:00:00Z",
      ],
      at: "2026-11-02T00:00:00Z",
    },
    {
      name: "Christmas substitute holiday",
      first: "2026-12-25",
      due: "2026-12-29",
      before: [
        "2026-12-24T12:00:00Z",
        "2026-12-25T12:00:00Z",
        "2026-12-28T12:00:00Z",
      ],
      at: "2026-12-29T00:00:00Z",
    },
    {
      name: "spring London midnight",
      first: "2028-03-26",
      due: "2028-03-27",
      before: ["2028-03-26T00:30:00Z"],
      at: "2028-03-26T23:15:00Z",
    },
    {
      name: "autumn London midnight",
      first: "2026-10-25",
      due: "2026-10-26",
      before: ["2026-10-25T23:15:00Z"],
      at: "2026-10-26T00:15:00Z",
    },
  ])(
    "submits once at $name across restarted public scheduler jobs",
    async ({ first, due, before, at }) => {
      const { f, access, invoiceId, planId } = await createPlan(
        "500",
        1,
        first,
      );
      const identities = new Set<string>();
      let calls = 0;
      const paymentIntentId = `pi_assurance_${randomUUID().replaceAll("-", "")}`;
      const provider: FinanceStripeBacsProvider = {
        async createCustomer() {
          throw new Error("Existing customer required");
        },
        async createMandateSetupSession() {
          throw new Error("Existing mandate required");
        },
        async createDebit(input) {
          calls++;
          expect(input.stripeAccountId).toBe(f.connection.stripeAccountId);
          identities.add(input.idempotencyKey);
          return { id: paymentIntentId, status: "processing" };
        },
      };
      const scheduler = () =>
        new FinanceBacsCollectionService(
          access,
          f.balances,
          new FinanceRecurringInvoiceService(access),
          config,
          provider,
        );
      for (const date of before) await scheduler().runDue(new Date(date));
      expect(calls).toBe(0);
      await scheduler().runDue(new Date(at));
      await scheduler().runDue(new Date(at));
      expect(calls).toBe(1);
      expect(identities.size).toBe(1);
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        const scope = { tenantId: f.tenantId, orgId: f.orgId };
        const row = await tx.financeCollectionInstalment.findFirstOrThrow({
          where: { ...scope, planId },
        });
        expect(row.dueAt.toISOString().slice(0, 10)).toBe(due);
        expect(await tx.financeDebitAttempt.count({ where: scope })).toBe(1);
        expect(await tx.financeReceipt.count({ where: scope })).toBe(0);
      });
      expect(
        (await f.invoices.get(f.actor, invoiceId)).balance.outstandingMinor,
      ).toBe("500");
    },
  );
});
