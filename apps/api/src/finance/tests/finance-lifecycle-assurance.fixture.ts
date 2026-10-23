import { Test } from "@nestjs/testing";
import { Module, prisma, withTenantRlsContext } from "@pathway/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../app.module";
import { AccessCacheService } from "../../access-control/access-cache.service";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
import { seedE2eAuthUser, seedE2eTypedRole } from "../../../test-helpers.e2e";
import { FINANCE_BACS_MANDATE_CONSENT_VERSION } from "../domain/finance-collection-terms";
import { FINANCE_STRIPE_CHECKOUT_CONFIG } from "../stripe/finance-stripe-checkout.config";
import {
  FINANCE_STRIPE_BACS_PROVIDER,
  type FinanceStripeBacsProvider,
} from "../stripe/finance-stripe-bacs.provider";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";

/** Real auth/access/services; only private storage and provider I/O are replaced. */
export async function createFinanceLifecycleFixture() {
  const orgId = randomUUID();
  await prisma.org.create({
    data: {
      id: orgId,
      name: "Synthetic lifecycle assurance",
      slug: `lifecycle-${orgId}`,
      planCode: "trial",
    },
  });
  await prisma.orgVertical.create({ data: { orgId, vertical: "ACE_SCHOOL" } });
  await prisma.orgModule.create({
    data: { orgId, module: Module.FINANCE, status: "ACTIVE" },
  });
  const f = await createFinanceAssuranceFixture(orgId);
  async function authenticate(userId: string, permissionKeys: string[]) {
    const identity = await seedE2eAuthUser({
      subject: `finance-lifecycle-${randomUUID()}`,
      userId,
      tenantId: f.tenantId,
      orgId,
      siteRole: "STAFF",
      orgRole: "ORG_MEMBER",
    });
    await seedE2eTypedRole({
      orgId,
      tenantId: f.tenantId,
      userId,
      scope: "site",
      permissionKeys,
    });
    return identity.authorization;
  }
  const staffAuthorization = await authenticate(f.actor.userId, [
    "finance.invoices.read",
    "finance.invoices.manage",
    "finance.payments.read",
    "finance.payments.manage",
    "finance.approvals.review",
  ]);
  const reviewerAuthorization = await authenticate(f.reviewer.userId, [
    "finance.payments.read",
    "finance.payments.manage",
    "finance.approvals.review",
  ]);
  const payerAuthorization = await authenticate(f.payerActor.userId, [
    "finance.family_invoices.read",
    "finance.family_payments.pay",
  ]);
  const noNetworkBacs = {
    createCustomer: jest.fn<
      ReturnType<FinanceStripeBacsProvider["createCustomer"]>,
      Parameters<FinanceStripeBacsProvider["createCustomer"]>
    >(async () => {
      throw new Error("Provider I/O forbidden in lifecycle assurance");
    }),
    createMandateSetupSession: jest.fn<
      ReturnType<FinanceStripeBacsProvider["createMandateSetupSession"]>,
      Parameters<FinanceStripeBacsProvider["createMandateSetupSession"]>
    >(async () => {
      throw new Error("Provider I/O forbidden in lifecycle assurance");
    }),
    createDebit: jest.fn<
      ReturnType<FinanceStripeBacsProvider["createDebit"]>,
      Parameters<FinanceStripeBacsProvider["createDebit"]>
    >(async () => {
      throw new Error("Provider I/O forbidden in lifecycle assurance");
    }),
  } satisfies FinanceStripeBacsProvider;
  const objects = new Map<string, Buffer>();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FINANCE_STRIPE_CHECKOUT_CONFIG)
    .useValue({
      mode: "test",
      secretKey: "sk_test_no_network_lifecycle",
      webAppUrl: "https://family.example.test",
    })
    .overrideProvider(FINANCE_STRIPE_BACS_PROVIDER)
    .useValue(noNetworkBacs)
    .overrideProvider(SupabaseStorageService)
    .useValue({
      privateBucketName: () =>
        process.env.SUPABASE_STORAGE_PRIVATE_BUCKET?.trim() ?? null,
      uploadObject: async (input: {
        key: string;
        body: Buffer;
        overwrite?: boolean;
      }) => {
        if (input.overwrite !== false || !objects.has(input.key)) {
          objects.set(input.key, input.body);
        }
        return true;
      },
      downloadObject: async (_bucket: string, key: string) =>
        objects.get(key) ?? null,
    })
    .compile();
  const app = module.createNestApplication();
  await app.init();
  async function setMode(mode: "ACTIVE" | "SERVICING") {
    await prisma.orgModule.update({
      where: { orgId_module: { orgId, module: Module.FINANCE } },
      data: {
        status: mode === "ACTIVE" ? "ACTIVE" : "CANCELLED",
        expiresAt: null,
      },
    });
    for (const userId of [
      f.actor.userId,
      f.reviewer.userId,
      f.payerActor.userId,
    ])
      await app.get(AccessCacheService).invalidateUser(userId, orgId);
  }
  async function issueTaxInvoice() {
    const invoice = await f.invoices.createDraft(f.actor, randomUUID(), {
      payerAccountId: f.payer.id,
      dueDate: "2026-12-31",
      lines: [
        {
          description: "Synthetic taxable charge",
          quantity: "1.000",
          unitAmountMinor: "25000",
          taxRateBasisPoints: 2000,
        },
      ],
    });
    await f.invoices.submitForReview(f.actor, invoice.id, randomUUID());
    await f.invoices.approve(f.reviewer, invoice.id, randomUUID());
    return f.invoices.issue(f.actor, invoice.id, randomUUID());
  }
  async function persistedMoney(invoiceId: string) {
    return withTenantRlsContext(f.tenantId, orgId, async (tx) => ({
      balance: (await f.invoices.get(f.actor, invoiceId)).balance,
      invoiceCount: await tx.financeInvoice.count({
        where: { tenantId: f.tenantId, orgId },
      }),
      receipts: await tx.financeReceipt.findMany({
        where: { tenantId: f.tenantId, orgId },
        select: { id: true, amountMinor: true },
        orderBy: { id: "asc" },
      }),
      allocations: await tx.financeReceiptAllocation.findMany({
        where: { tenantId: f.tenantId, orgId },
        select: { id: true, invoiceId: true, amountMinor: true },
        orderBy: { id: "asc" },
      }),
    }));
  }
  async function requestBank(accountNumber: string) {
    const response = await request(app.getHttpServer())
      .post("/finance/bank-transfer-changes")
      .set("Authorization", staffAuthorization)
      .set("Idempotency-Key", randomUUID())
      .send({
        accountHolderName: "Synthetic school",
        sortCode: "123456",
        accountNumber,
        reason: "Synthetic approved destination version",
      })
      .expect(201);
    return responseId(response.body);
  }
  const approveBank = (id: string) =>
    request(app.getHttpServer())
      .post(`/finance/bank-transfer-changes/${id}/approve`)
      .set("Authorization", reviewerAuthorization)
      .set("Idempotency-Key", randomUUID())
      .expect(201);
  async function seedActiveMandate() {
    return withTenantRlsContext(f.tenantId, orgId, async (tx) => {
      const stripeAccountId = f.connection.stripeAccountId;
      if (!stripeAccountId)
        throw new Error("Missing lifecycle connected account");
      const account = {
        tenantId: f.tenantId,
        orgId,
        financeProfileId: f.profile.id,
        stripeConnectionId: f.connection.id,
        payerAccountId: f.payer.id,
        stripeAccountId,
        livemode: false,
      };
      const customer = await tx.financeStripeCustomer.create({
        data: {
          ...account,
          stripeCustomerId: `cus_${randomUUID().replaceAll("-", "")}`,
        },
      });
      return tx.financeMandate.create({
        data: {
          ...account,
          financeStripeCustomerId: customer.id,
          status: "ACTIVE",
          createdByUserId: f.payerActor.userId,
          acceptedByUserId: f.payerActor.userId,
          acceptedAt: new Date(),
          consentVersion: FINANCE_BACS_MANDATE_CONSENT_VERSION,
          stripeSetupIntentId: `seti_${randomUUID().replaceAll("-", "")}`,
          stripePaymentMethodId: `pm_${randomUUID().replaceAll("-", "")}`,
          stripeMandateId: `mandate_${randomUUID().replaceAll("-", "")}`,
        },
      });
    });
  }
  return {
    f,
    app,
    staffAuthorization,
    payerAuthorization,
    reviewerAuthorization,
    setMode,
    issueTaxInvoice,
    persistedMoney,
    requestBank,
    approveBank,
    seedActiveMandate,
    noNetworkBacs,
  };
}

export function responseId(body: unknown): string {
  if (
    !body ||
    typeof body !== "object" ||
    !("id" in body) ||
    typeof body.id !== "string"
  )
    throw new Error("Expected an HTTP resource id");
  return body.id;
}
export function responsePlanId(body: unknown): string {
  if (
    !body ||
    typeof body !== "object" ||
    !("planId" in body) ||
    typeof body.planId !== "string"
  )
    throw new Error("Expected an HTTP collection plan id");
  return body.planId;
}
