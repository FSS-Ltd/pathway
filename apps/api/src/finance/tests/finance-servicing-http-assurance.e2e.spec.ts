import { runTransaction, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceAccessService } from "../access/finance-access.service";
import { FinanceBacsCollectionService } from "../finance-bacs-collection.service";
import { FinanceRecurringInvoiceService } from "../finance-recurring-invoice.service";
import {
  createFinanceLifecycleFixture,
  responsePlanId,
} from "./finance-lifecycle-assurance.fixture";

describe("Finance servicing HTTP and due-job assurance", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Servicing assurance requires the central disposable database",
      );
  });

  it("independently approves existing instructions in servicing while denying new instructions, payer acceptance and actual due jobs", async () => {
    const fixture = await createFinanceLifecycleFixture();
    const {
      f,
      app,
      staffAuthorization,
      payerAuthorization,
      reviewerAuthorization,
    } = fixture;
    try {
      const invoiceId = await f.createIssuedInvoice("500");
      const pendingInvoiceId = await f.createIssuedInvoice("600");
      const mandate = await fixture.seedActiveMandate();
      const draft = {
        payerAccountId: f.payer.id,
        mandateId: mandate.id,
        instalmentCount: 1,
        firstDueDate: "2026-01-05",
      };
      const createPlan = async (id: string) => {
        const response = await request(app.getHttpServer())
          .post(`/finance/invoices/${id}/collection-plans`)
          .set("Authorization", staffAuthorization)
          .send(draft)
          .expect(201);
        return responsePlanId(response.body);
      };
      const activePlanId = await createPlan(invoiceId);
      const pendingPlanId = await createPlan(pendingInvoiceId);
      await request(app.getHttpServer())
        .post(`/finance/collection-plans/${activePlanId}/approve`)
        .set("Authorization", staffAuthorization)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/finance/collection-plans/${activePlanId}/approve`)
        .set("Authorization", reviewerAuthorization)
        .expect(200);
      await request(app.getHttpServer())
        .post(
          `/finance/payer-accounts/${f.payer.id}/collection-plans/${activePlanId}/accept`,
        )
        .set("Authorization", payerAuthorization)
        .expect(200);
      const recurring = app.get(FinanceRecurringInvoiceService);
      const template = await recurring.createTemplate(f.actor, {
        payerAccountId: f.payer.id,
        firstPeriodStart: "2001-01-01",
        dayOfMonth: 1,
        dueDays: 14,
        lines: [
          {
            description: "Due recurring charge",
            quantity: "1.000",
            unitAmountMinor: "500",
            taxRateBasisPoints: 0,
          },
        ],
      });
      const asOf = new Date();
      const due = await runTransaction(
        (tx) =>
          tx.$queryRaw<
            Array<{ tenantId: string; orgId: string }>
          >`SELECT * FROM app.list_due_finance_collection_scopes(${asOf})`,
      );
      expect(due).toEqual(
        expect.arrayContaining([{ tenantId: f.tenantId, orgId: f.orgId }]),
      );
      const before = await fixture.persistedMoney(invoiceId);
      await fixture.setMode("SERVICING");
      const invoiceInput = {
        payerAccountId: f.payer.id,
        dueDate: "2026-12-31",
        lines: [
          {
            description: "Blocked new invoice",
            quantity: "1.000",
            unitAmountMinor: "500",
            taxRateBasisPoints: 0,
          },
        ],
      };
      await request(app.getHttpServer())
        .post("/finance/invoices")
        .set("Authorization", staffAuthorization)
        .set("Idempotency-Key", randomUUID())
        .send(invoiceInput)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/finance/payer-accounts/${f.payer.id}/bacs/mandates/setup`)
        .set("Authorization", payerAuthorization)
        .send({})
        .expect(403);
      await request(app.getHttpServer())
        .post(`/finance/invoices/${invoiceId}/collection-plans`)
        .set("Authorization", staffAuthorization)
        .send(draft)
        .expect(403);
      // Approval of existing instructions is a servicing exception. The creator
      // still cannot self-approve; an independent approver cannot enable collection.
      await request(app.getHttpServer())
        .post(`/finance/collection-plans/${pendingPlanId}/approve`)
        .set("Authorization", staffAuthorization)
        .expect(403);
      await request(app.getHttpServer())
        .post(`/finance/collection-plans/${pendingPlanId}/approve`)
        .set("Authorization", reviewerAuthorization)
        .expect(200);
      for (const planId of [activePlanId, pendingPlanId])
        await request(app.getHttpServer())
          .post(
            `/finance/payer-accounts/${f.payer.id}/collection-plans/${planId}/accept`,
          )
          .set("Authorization", payerAuthorization)
          .expect(403);
      const access = app.get(FinanceAccessService);
      expect(await access.resolveMode(f.actor)).toBe("SERVICING_ONLY");
      const actualResolve = access.resolveMode.bind(access);
      // Only foreign fixture discovery is isolated. This tenant always uses the
      // actual database reader and cancellation policy, never a mocked denial.
      const isolation = jest
        .spyOn(access, "resolveMode")
        .mockImplementation((scope) =>
          scope.tenantId === f.tenantId && scope.orgId === f.orgId
            ? actualResolve(scope)
            : Promise.resolve("LOCKED"),
        );
      try {
        const run = await new FinanceBacsCollectionService(
          access,
          f.balances,
          recurring,
          {
            mode: "test",
            secretKey: "sk_test_no_network",
            webAppUrl: "https://family.example.test",
          },
          fixture.noNetworkBacs,
        ).runDue(asOf);
        expect(run).toMatchObject({
          invoicesGenerated: 0,
          debitsSubmitted: 0,
          debitsPending: 0,
          debitsFailed: 0,
        });
        expect(await recurring.generateDueForScope(f.actor, asOf)).toEqual({
          generated: 0,
          invoiceIds: [],
        });
        for (const operation of Object.values(fixture.noNetworkBacs))
          expect(operation).not.toHaveBeenCalled();
      } finally {
        isolation.mockRestore();
      }
      expect(await fixture.persistedMoney(invoiceId)).toEqual(before);
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        expect(
          await tx.financeDebitAttempt.count({
            where: { tenantId: f.tenantId, orgId: f.orgId },
          }),
        ).toBe(0);
        expect(
          await tx.financeCollectionPlan.findUniqueOrThrow({
            where: { id: activePlanId },
            select: {
              status: true,
              approvedByUserId: true,
              acceptedByUserId: true,
            },
          }),
        ).toEqual({
          status: "ACTIVE",
          approvedByUserId: f.reviewer.userId,
          acceptedByUserId: f.payerActor.userId,
        });
        expect(
          await tx.financeCollectionPlan.findUniqueOrThrow({
            where: { id: pendingPlanId },
            select: {
              status: true,
              approvedByUserId: true,
              acceptedByUserId: true,
            },
          }),
        ).toEqual({
          status: "PENDING_PAYER_ACCEPTANCE",
          approvedByUserId: f.reviewer.userId,
          acceptedByUserId: null,
        });
        expect(
          await tx.financeCollectionInstalment.count({
            where: { planId: activePlanId, status: "SCHEDULED" },
          }),
        ).toBe(1);
        expect(
          await tx.financeCollectionInstalment.count({
            where: { planId: pendingPlanId },
          }),
        ).toBe(0);
        expect(
          (
            await tx.financeRecurringInvoiceTemplate.findUniqueOrThrow({
              where: { id: template.templateId },
            })
          ).nextPeriodStart,
        ).toEqual(new Date("2001-01-01T00:00:00Z"));
      });
    } finally {
      await app.close();
    }
  });
});
