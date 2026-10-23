import { randomUUID } from "node:crypto";
import { Module, prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceBacsCollectionService } from "../finance-bacs-collection.service";
import { FinanceRecurringInvoiceService } from "../finance-recurring-invoice.service";
import type { FinanceStripeBacsProvider } from "../stripe/finance-stripe-bacs.provider";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";

// Public runDue scans all due scopes. The access adapter below activates only
// this synthetic tenant, so the test cannot submit other fixtures' collections.
describe("Finance public Bacs scheduler restart assurance", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Scheduler assurance requires the central disposable database",
      );
  });
  it("uses one debit identity for overlapping due jobs and a restarted scheduler", async () => {
    const orgId = randomUUID();
    await prisma.org.create({
      data: {
        id: orgId,
        name: "Synthetic scheduler assurance",
        slug: `scheduler-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.orgModule.create({
      data: { orgId, module: Module.FINANCE, status: "ACTIVE" },
    });
    const f = await createFinanceAssuranceFixture(orgId);
    const invoiceId = await f.createIssuedInvoice("500");
    await prepareAssuranceProviderSuccess(f, invoiceId, "bacs", 500);
    const instalment = await withTenantRlsContext(
      f.tenantId,
      f.orgId,
      async (tx) => {
        const attempt = await tx.financeDebitAttempt.findFirstOrThrow({
          where: { tenantId: f.tenantId, orgId: f.orgId },
        });
        await tx.financeDebitAttempt.delete({ where: { id: attempt.id } });
        return tx.financeCollectionInstalment.update({
          where: { id: attempt.instalmentId },
          data: {
            status: "SCHEDULED",
            dueAt: new Date("2001-01-02T00:00:00Z"),
          },
        });
      },
    );
    jest
      .spyOn(f.access, "resolveMode")
      .mockImplementation(async (scope) =>
        scope.tenantId === f.tenantId && scope.orgId === f.orgId
          ? "ACTIVE"
          : "LOCKED",
      );
    const operationKeys = new Set<string>();
    const objectIds = new Map<string, string>();
    const provider: FinanceStripeBacsProvider = {
      async createCustomer() {
        throw new Error("Scheduler must reuse its payer customer");
      },
      async createMandateSetupSession() {
        throw new Error("Scheduler must reuse its mandate");
      },
      async createDebit(input) {
        expect(input.stripeAccountId).toBe(f.connection.stripeAccountId);
        expect(input.instalmentId).toBe(instalment.id);
        operationKeys.add(input.idempotencyKey);
        const id =
          objectIds.get(input.idempotencyKey) ??
          `pi_assurance_${randomUUID().replaceAll("-", "")}`;
        objectIds.set(input.idempotencyKey, id);
        return { id, status: "processing" };
      },
    };
    const createScheduler = () =>
      new FinanceBacsCollectionService(
        f.access,
        f.balances,
        new FinanceRecurringInvoiceService(f.access),
        {
          mode: "test",
          secretKey: "sk_test_assurance_fixture",
          webAppUrl: "https://family.example.test",
        },
        provider,
      );
    const asOf = new Date("2001-01-03T12:00:00Z");
    await Promise.all([
      createScheduler().runDue(asOf),
      createScheduler().runDue(asOf),
    ]);
    await createScheduler().runDue(asOf);
    expect(operationKeys.size).toBe(1);
    expect(objectIds.size).toBe(1);
    await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
      expect(
        await tx.financeDebitAttempt.findMany({
          where: { tenantId: f.tenantId, orgId: f.orgId },
          select: { status: true, instalmentId: true },
        }),
      ).toEqual([{ status: "SUBMITTED", instalmentId: instalment.id }]);
      expect(
        await tx.financeReceipt.count({
          where: { tenantId: f.tenantId, orgId: f.orgId },
        }),
      ).toBe(0);
      expect(
        await tx.financeInvoice.count({
          where: { tenantId: f.tenantId, orgId: f.orgId },
        }),
      ).toBe(1);
    });
    expect(
      (await f.invoices.get(f.actor, invoiceId)).balance.outstandingMinor,
    ).toBe("500");
  });
});
