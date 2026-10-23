import { withTenantRlsContext } from "@pathway/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { requireDatabase } from "../../../test-helpers.e2e";
import type { FinancePdfInput } from "../finance-document-pdf";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";
import {
  createFinanceLifecycleFixture,
  responseId,
} from "./finance-lifecycle-assurance.fixture";

// Observe the real document service's immutable rendering input and bytes.
// Rendering/layout itself has separate PDF tests; storage uses the shared private seam.
jest.mock("../finance-document-pdf", () => ({
  renderFinancePdf: jest.fn(async (input: FinancePdfInput) =>
    Buffer.from(JSON.stringify(input)),
  ),
}));

describe("Finance persisted return, bank review and document HTTP assurance", () => {
  const previousBucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Lifecycle HTTP assurance requires the central disposable database",
      );
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET =
      "synthetic-private-lifecycle-bucket";
  });

  afterAll(() => {
    if (previousBucket === undefined)
      delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    else process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = previousBucket;
  });

  it("ignores forged success-return parameters when rereading the authenticated invoice and persisted debt", async () => {
    const fixture = await createFinanceLifecycleFixture();
    const { f, app, payerAuthorization, persistedMoney } = fixture;
    try {
      const invoiceId = await f.createIssuedInvoice("500");
      await prepareAssuranceProviderSuccess(f, invoiceId, "card", 500);
      const attempt = await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
        tx.financeCheckoutAttempt.findFirstOrThrow({
          where: { tenantId: f.tenantId, orgId: f.orgId, invoiceId },
        }),
      );
      const before = await persistedMoney(invoiceId);
      const response = await request(app.getHttpServer())
        .get(`/finance/payer-accounts/${f.payer.id}/invoices/${invoiceId}`)
        .query({
          payment_status: "paid",
          status: "success",
          session_id: attempt.stripeCheckoutSessionId,
          payment_intent: "pi_forged_success",
          amount_total: "500",
        })
        .set("Authorization", payerAuthorization)
        .expect(200);
      expect(response.body).toMatchObject({
        id: invoiceId,
        balance: { outstandingMinor: "500" },
        checkout: null,
      });
      expect(await persistedMoney(invoiceId)).toEqual(before);
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        expect(
          await tx.financeCheckoutAttempt.count({
            where: { tenantId: f.tenantId, orgId: f.orgId, invoiceId },
          }),
        ).toBe(1);
      });
    } finally {
      await app.close();
    }
  });

  it("keeps the correct invoice reference with reported wrong bank destination in independent review without allocating", async () => {
    const fixture = await createFinanceLifecycleFixture();
    const {
      f,
      app,
      staffAuthorization,
      payerAuthorization,
      reviewerAuthorization,
      persistedMoney,
    } = fixture;
    try {
      const invoiceId = await f.createIssuedInvoice("500");
      await fixture.approveBank(await fixture.requestBank("00123456"));
      const invoice = await f.invoices.get(f.actor, invoiceId);
      const before = await persistedMoney(invoiceId);
      const notice = await request(app.getHttpServer())
        .post(
          `/finance/payer-accounts/${f.payer.id}/invoices/${invoiceId}/transfer-notices`,
        )
        .set("Authorization", payerAuthorization)
        .set("Idempotency-Key", randomUUID())
        .send({
          amountMinor: "500",
          declaredTransferredAt: new Date(Date.now() - 60000).toISOString(),
        })
        .expect(201);
      const noticeId = responseId(notice.body);
      expect(notice.body).toMatchObject({
        invoiceNumber: invoice.invoiceNumber,
        receiptStatus: "DECLARED_ONLY",
      });
      // Destination verification is an operator workflow: the strict intake has
      // no bank-destination parser. This proves review/nonallocation, not automatic detection.
      const review = await request(app.getHttpServer())
        .post("/finance/manual-receipt-requests")
        .set("Authorization", staffAuthorization)
        .set("Idempotency-Key", randomUUID())
        .send({
          payerAccountId: f.payer.id,
          transferNoticeId: noticeId,
          bankTransactionReference: `INV-${invoice.invoiceNumber}`,
          amountMinor: "500",
          receivedAt: new Date(Date.now() - 60000).toISOString(),
          reason:
            "Right invoice reference; evidence names destination 00987654, different from approved school account 00123456",
        })
        .expect(201);
      const reviewId = responseId(review.body);
      expect(review.body).toMatchObject({
        status: "PENDING",
        receiptId: null,
        invoiceNumber: invoice.invoiceNumber,
      });
      expect(await persistedMoney(invoiceId)).toEqual(before);
      await request(app.getHttpServer())
        .post(`/finance/manual-receipt-requests/${reviewId}/reject`)
        .set("Authorization", reviewerAuthorization)
        .set("Idempotency-Key", randomUUID())
        .send({
          reason:
            "Wrong bank destination: no credit reached the approved school collection account",
        })
        .expect(201);
      const requests = await request(app.getHttpServer())
        .get("/finance/manual-receipt-requests?status=REJECTED")
        .set("Authorization", staffAuthorization)
        .expect(200);
      expect(requests.body.items).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: reviewId,
            status: "REJECTED",
            receiptId: null,
          }),
        ]),
      );
      expect(await persistedMoney(invoiceId)).toEqual(before);
    } finally {
      await app.close();
    }
  });

  it("keeps issued document and tax snapshots stable while approved live bank instructions advance by retained versions", async () => {
    const fixture = await createFinanceLifecycleFixture();
    const { f, app, staffAuthorization, payerAuthorization } = fixture;
    try {
      const invoice = await fixture.issueTaxInvoice();
      const documentPath = `/finance/invoices/${invoice.id}/document`;
      const bankPath = `/finance/payer-accounts/${f.payer.id}/invoices/${invoice.id}/bank-transfer`;
      const before = await request(app.getHttpServer())
        .get(documentPath)
        .set("Authorization", staffAuthorization)
        .expect(200);
      if (!Buffer.isBuffer(before.body))
        throw new Error("Document HTTP response was not bytes");
      expect(before.body.toString("utf8")).toContain(
        '"label":"Tax","amountMinor":"5000"',
      );
      expect(before.body.toString("utf8")).toContain(f.profile.legalEntityName);
      const issued = await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
        tx.financeInvoice.findUniqueOrThrow({
          where: { id: invoice.id },
          include: { lines: true },
        }),
      );
      expect(issued).toMatchObject({
        subtotalMinor: 25000n,
        taxMinor: 5000n,
        totalMinor: 30000n,
      });
      const { requestBank, approveBank } = fixture;
      const first = await requestBank("00123456");
      await approveBank(first);
      const liveFirst = await request(app.getHttpServer())
        .get(bankPath)
        .set("Authorization", payerAuthorization)
        .expect(200);
      expect(liveFirst.body).toMatchObject({
        accountNumber: "00123456",
        reference: invoice.invoiceNumber,
        outstandingMinor: "30000",
      });
      const second = await requestBank("00987654");
      const pending = await request(app.getHttpServer())
        .get(bankPath)
        .set("Authorization", payerAuthorization)
        .expect(200);
      expect(pending.body).toEqual(liveFirst.body);
      await approveBank(second);
      const liveSecond = await request(app.getHttpServer())
        .get(bankPath)
        .set("Authorization", payerAuthorization)
        .expect(200);
      expect(liveSecond.body).toMatchObject({
        accountNumber: "00987654",
        reference: invoice.invoiceNumber,
        outstandingMinor: "30000",
      });
      await request(app.getHttpServer())
        .patch("/finance/profile")
        .set("Authorization", staffAuthorization)
        .send({
          legalEntityName: "Changed school identity",
          countryCode: "GB",
          currency: "GBP",
        })
        .expect(409);
      // Controlled source-data drift models a later administrative migration;
      // no public API currently permits identity edits after Finance activity.
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        await tx.financeProfile.update({
          where: { id: f.profile.id },
          data: { legalEntityName: "Changed source identity" },
        });
        await tx.financePayerAccount.update({
          where: { id: f.payer.id },
          data: { displayName: "Changed source payer" },
        });
      });
      const after = await request(app.getHttpServer())
        .get(documentPath)
        .set("Authorization", staffAuthorization)
        .expect(200);
      expect(after.body).toEqual(before.body);
      expect(after.headers["cache-control"]).toBe("private, no-store");
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        expect(
          await tx.financeInvoice.findUniqueOrThrow({
            where: { id: invoice.id },
            include: { lines: true },
          }),
        ).toEqual(issued);
        const versions = await tx.financeBankTransferChange.findMany({
          where: {
            id: { in: [first, second] },
            tenantId: f.tenantId,
            orgId: f.orgId,
          },
          orderBy: { decidedAt: "asc" },
        });
        expect(versions).toHaveLength(2);
        expect(
          versions.map((row) => ({
            id: row.id,
            status: row.status,
            requester: row.requestedByUserId,
            approver: row.decidedByUserId,
            account: row.accountNumber,
          })),
        ).toEqual([
          {
            id: first,
            status: "APPROVED",
            requester: f.actor.userId,
            approver: f.reviewer.userId,
            account: "00123456",
          },
          {
            id: second,
            status: "APPROVED",
            requester: f.actor.userId,
            approver: f.reviewer.userId,
            account: "00987654",
          },
        ]);
      });
    } finally {
      await app.close();
    }
  });
});
