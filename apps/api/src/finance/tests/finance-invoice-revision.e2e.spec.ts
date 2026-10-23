import request from "supertest";
import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase, seedE2eTypedRole } from "../../../test-helpers.e2e";
import {
  createFinanceHttpFixture,
  type FinanceHttpFixture,
} from "./finance-http-auth.fixture";

// Storage/PDF are local doubles; authentication, permissions and transitions are real.
jest.mock("../finance-document-pdf", () => ({
  renderFinancePdf: jest.fn(async () =>
    Buffer.from("%PDF-1.4 synthetic-private-finance-http-evidence"),
  ),
}));

describe("Finance human preview revision HTTP contract", () => {
  let fixture: FinanceHttpFixture;
  const bucket = process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
  beforeAll(async () => {
    if (!requireDatabase()) throw new Error("Disposable database required");
    process.env.SUPABASE_STORAGE_PRIVATE_BUCKET =
      "synthetic-private-revision-bucket";
    fixture = await createFinanceHttpFixture();
    const f = fixture.f;
    await seedE2eTypedRole({
      orgId: f.orgId,
      tenantId: f.tenantId,
      userId: f.actor.userId,
      scope: "site",
      permissionKeys: ["finance.invoices.manage"],
    });
    await seedE2eTypedRole({
      orgId: f.orgId,
      tenantId: f.tenantId,
      userId: f.reviewer.userId,
      scope: "site",
      permissionKeys: ["finance.invoices.read", "finance.approvals.review"],
    });
  });
  afterAll(async () => {
    await fixture?.app.close();
    if (bucket === undefined)
      delete process.env.SUPABASE_STORAGE_PRIVATE_BUCKET;
    else process.env.SUPABASE_STORAGE_PRIVATE_BUCKET = bucket;
  });
  const draftInput = () => ({
    payerAccountId: fixture.f.payer.id,
    dueDate: "2026-12-31",
    lines: [
      {
        description: "Reviewed school charge",
        quantity: "1.000",
        unitAmountMinor: "1000",
        taxRateBasisPoints: 2000,
      },
    ],
  });
  async function draft() {
    return fixture.f.invoices.createDraft(
      fixture.f.actor,
      randomUUID(),
      draftInput(),
    );
  }
  async function detail(invoiceId: string) {
    const response = await request(fixture.app.getHttpServer())
      .get(`/finance/invoices/${invoiceId}`)
      .set("Authorization", fixture.staffAuthorization);
    expect(response.status).toBe(200);
    // Fallback lets the baseline execute the actual stale mutation and fail409,
    // rather than failing before reproducing the missing revision check.
    return {
      revision:
        typeof response.body.reviewRevision === "string"
          ? response.body.reviewRevision
          : "0".repeat(64),
      body: response.body,
    };
  }
  function transition(
    invoiceId: string,
    action: string,
    expectedRevision: string,
    key = randomUUID(),
  ) {
    return request(fixture.app.getHttpServer())
      .post(`/finance/invoices/${invoiceId}/${action}`)
      .set(
        "Authorization",
        action === "approve"
          ? fixture.deniedAuthorization
          : fixture.staffAuthorization,
      )
      .set("Idempotency-Key", key)
      .send({ expectedRevision });
  }

  it("rejects an approval preview after request-changes/edit/resubmit and scopes idempotency to the reviewed revision", async () => {
    const f = fixture.f;
    const invoice = await draft();
    await f.invoices.submitForReview(f.actor, invoice.id, randomUUID());
    const old = await detail(invoice.id);
    await f.invoices.requestChanges(f.reviewer, invoice.id, randomUUID(), {
      reason: "Correct the charge",
    });
    await f.invoices.updateDraft(f.actor, invoice.id, randomUUID(), {
      ...draftInput(),
      lines: [{ ...draftInput().lines[0], unitAmountMinor: "2000" }],
    });
    await f.invoices.submitForReview(f.actor, invoice.id, randomUUID());
    const stale = await transition(invoice.id, "approve", old.revision);
    expect(stale.status).toBe(409);
    expect((await f.invoices.get(f.actor, invoice.id)).approvedAt).toBeNull();
    const fresh = await detail(invoice.id);
    expect(fresh.revision).not.toBe(old.revision);
    const key = randomUUID();
    expect(
      (await transition(invoice.id, "approve", fresh.revision, key)).status,
    ).toBe(201);
    expect(
      (await transition(invoice.id, "approve", fresh.revision, key)).status,
    ).toBe(201);
    expect(
      (await transition(invoice.id, "approve", old.revision, key)).status,
    ).toBe(409);
  });

  it("rejects an issue preview from before an identical-content reapproval cycle", async () => {
    const f = fixture.f;
    const invoiceId = await f.createReviewedInvoice("1000");
    const old = await detail(invoiceId);
    await f.invoices.requestChanges(f.reviewer, invoiceId, randomUUID(), {
      reason: "Review the same charge again",
    });
    await f.invoices.submitForReview(f.actor, invoiceId, randomUUID());
    await f.invoices.approve(f.reviewer, invoiceId, randomUUID());
    expect((await transition(invoiceId, "issue", old.revision)).status).toBe(
      409,
    );
    expect((await f.invoices.get(f.actor, invoiceId)).invoiceNumber).toBeNull();
    const fresh = await detail(invoiceId);
    expect((await transition(invoiceId, "issue", fresh.revision)).status).toBe(
      201,
    );
  });

  it.each(["payer", "school"] as const)(
    "rejects an approval when current %s identity changed without updating the invoice",
    async (identity) => {
      const f = fixture.f;
      const invoice = await draft();
      await f.invoices.submitForReview(f.actor, invoice.id, randomUUID());
      const old = await detail(invoice.id);
      const before = await f.invoices.get(f.actor, invoice.id);
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        if (identity === "payer")
          await tx.financePayerAccount.update({
            where: { id: f.payer.id },
            data: { displayName: `Fresh payer ${randomUUID()}` },
          });
        else
          await tx.financeProfile.update({
            where: { id: f.profile.id },
            data: { legalEntityName: `Fresh school ${randomUUID()}` },
          });
      });
      expect(
        (await transition(invoice.id, "approve", old.revision)).status,
      ).toBe(409);
      const fresh = await detail(invoice.id);
      expect(fresh.body.updatedAt).toBe(before.updatedAt);
      expect(fresh.revision).not.toBe(old.revision);
      if (identity === "school")
        expect(fresh.body.legalEntityName).toMatch(/^Fresh school /);
      else expect(fresh.body.payerName).toMatch(/^Fresh payer /);
    },
  );

  it("requires a human preview precondition and rejects stale draft submission", async () => {
    const f = fixture.f;
    const invoice = await draft();
    const old = await detail(invoice.id);
    const missing = await request(fixture.app.getHttpServer())
      .post(`/finance/invoices/${invoice.id}/submit-review`)
      .set("Authorization", fixture.staffAuthorization)
      .set("Idempotency-Key", randomUUID())
      .send({});
    expect(missing.status).toBe(400);
    await f.invoices.updateDraft(f.actor, invoice.id, randomUUID(), {
      ...draftInput(),
      dueDate: "2026-12-30",
    });
    expect(
      (await transition(invoice.id, "submit-review", old.revision)).status,
    ).toBe(409);
    expect((await f.invoices.get(f.actor, invoice.id)).status).toBe("DRAFT");
  });
});
