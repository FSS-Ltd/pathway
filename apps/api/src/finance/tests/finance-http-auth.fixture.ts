import { Test } from "@nestjs/testing";
import { Module, prisma, withTenantRlsContext } from "@pathway/db";
import { randomUUID } from "node:crypto";
import { AppModule } from "../../app.module";
import { AccessCacheService } from "../../access-control/access-cache.service";
import { SupabaseStorageService } from "../../common/storage/supabase-storage.service";
import { seedE2eAuthUser, seedE2eTypedRole } from "../../../test-helpers.e2e";
import { FinanceCreditNoteService } from "../finance-credit-note.service";
import { FinanceStatementService } from "../finance-statement.service";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";

export const HTTP_PDF_MARKER =
  "%PDF-1.4 synthetic-private-finance-http-evidence";
export const HTTP_PRIVATE_NAME = "Synthetic protected HTTP payer";
const staffPermissions = [
  "finance.invoices.read",
  "finance.payments.read",
  "finance.statements.read",
  "finance.exports.create",
];
const payerPermissions = [
  "finance.family_invoices.read",
  "finance.family_statements.read",
];

export async function createFinanceHttpFixture() {
  const orgId = randomUUID();
  await prisma.org.create({
    data: {
      id: orgId,
      name: "Synthetic HTTP assurance",
      slug: `finance-http-${orgId}`,
      planCode: "trial",
    },
  });
  await prisma.orgVertical.create({ data: { orgId, vertical: "ACE_SCHOOL" } });
  await prisma.orgModule.create({
    data: { orgId, module: Module.FINANCE, status: "ACTIVE" },
  });
  const f = await createFinanceAssuranceFixture(orgId);
  const other = await createFinanceAssuranceFixture(orgId);
  await withTenantRlsContext(f.tenantId, orgId, (tx) =>
    tx.financePayerAccount.update({
      where: { id: f.payer.id },
      data: { displayName: HTTP_PRIVATE_NAME },
    }),
  );
  async function authenticate(
    userId: string,
    tenantId: string,
    permissions: readonly string[],
  ) {
    const identity = await seedE2eAuthUser({
      subject: `finance-http-${randomUUID()}`,
      userId,
      tenantId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    if (permissions.length)
      await seedE2eTypedRole({
        orgId,
        tenantId,
        userId,
        scope: "site",
        permissionKeys: permissions,
      });
    return identity.authorization;
  }
  const staffAuthorization = await authenticate(
    f.actor.userId,
    f.tenantId,
    staffPermissions,
  );
  const payerAuthorization = await authenticate(
    f.payerActor.userId,
    f.tenantId,
    payerPermissions,
  );
  const wrongTenantAuthorization = await authenticate(
    other.actor.userId,
    other.tenantId,
    [...staffPermissions, ...payerPermissions],
  );
  const deniedAuthorization = await authenticate(
    f.reviewer.userId,
    f.tenantId,
    [],
  );
  // Only private storage is replaced. The app retains the real authentication,
  // Finance access reader/policy, typed permissions, controllers and services.
  const objects = new Map<string, Buffer>();
  const storage = {
    uploadObject: jest.fn(
      async (input: { bucket: string; key: string; body: Buffer }) => {
        objects.set(input.key, input.body);
        return true;
      },
    ),
    downloadObject: jest.fn(
      async (_bucket: string, key: string) => objects.get(key) ?? null,
    ),
  };
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SupabaseStorageService)
    .useValue(storage)
    .compile();
  const app = module.createNestApplication();
  await app.init();
  const invoiceId = await f.createIssuedInvoice("1000");
  const invoice = await f.invoices.get(f.actor, invoiceId);
  const line = invoice.lines[0];
  if (!line) throw new Error("Missing HTTP assurance invoice line");
  const creditService = new FinanceCreditNoteService(f.access, f.commands);
  const credit = await creditService.createDraft(
    f.actor,
    invoiceId,
    randomUUID(),
    {
      reason: "Synthetic HTTP credit",
      lines: [{ sourceInvoiceLineId: line.id, quantity: "0.100" }],
    },
  );
  await creditService.submitForReview(f.actor, credit.id, randomUUID());
  await creditService.approve(f.reviewer, credit.id, randomUUID());
  await creditService.issue(f.actor, credit.id, randomUUID());
  await (
    await prepareAssuranceProviderSuccess(f, invoiceId, "card", 300)
  )();
  const receipt = await withTenantRlsContext(f.tenantId, orgId, (tx) =>
    tx.financeReceipt.findFirstOrThrow({
      where: { tenantId: f.tenantId, orgId, payerAccountId: f.payer.id },
    }),
  );
  // Use current timestamps so the statement includes this committed synthetic ledger.
  const periodEnd = new Date(Date.now() - 1).toISOString();
  const statement = await app
    .get(FinanceStatementService)
    .requestForStaff(f.actor, randomUUID(), {
      payerAccountId: f.payer.id,
      periodStart: new Date(Date.now() - 86400000).toISOString(),
      periodEnd,
    });
  const payerPrefix = `/finance/payer-accounts/${f.payer.id}`;
  const reportDate = new Date().toISOString().slice(0, 10);
  const reportQuery = new URLSearchParams({
    from: reportDate,
    to: reportDate,
    asOf: reportDate,
  });
  const staffPaths = [
    `/finance/invoices/${invoiceId}/document`,
    `/finance/credit-notes/${credit.id}/document`,
    `/finance/receipts/${receipt.id}/document`,
    "/finance/statements",
    `/finance/statements/${statement.id}`,
    `/finance/statements/${statement.id}/download`,
    `/finance/reports/receivables-ageing/export?${reportQuery.toString()}`,
  ];
  const payerPaths = [
    `${payerPrefix}/invoices/${invoiceId}/document`,
    `${payerPrefix}/credit-notes/${credit.id}/document`,
    `${payerPrefix}/receipts/${receipt.id}/document`,
    `${payerPrefix}/statements`,
    `${payerPrefix}/statements/${statement.id}`,
    `${payerPrefix}/statements/${statement.id}/download`,
  ];
  async function setMode(mode: "ACTIVE" | "SERVICING" | "LOCKED") {
    if (mode === "LOCKED")
      await prisma.orgModule.delete({
        where: { orgId_module: { orgId, module: Module.FINANCE } },
      });
    else
      await prisma.orgModule.upsert({
        where: { orgId_module: { orgId, module: Module.FINANCE } },
        create: {
          orgId,
          module: Module.FINANCE,
          status: mode === "ACTIVE" ? "ACTIVE" : "CANCELLED",
        },
        update: {
          status: mode === "ACTIVE" ? "ACTIVE" : "CANCELLED",
          expiresAt: null,
        },
      });
    for (const userId of [
      f.actor.userId,
      f.payerActor.userId,
      other.actor.userId,
      f.reviewer.userId,
    ])
      await app.get(AccessCacheService).invalidateUser(userId, orgId);
  }
  return {
    app,
    f,
    other,
    storage,
    staffAuthorization,
    payerAuthorization,
    wrongTenantAuthorization,
    deniedAuthorization,
    staffPaths,
    payerPaths,
    setMode,
  };
}
export type FinanceHttpFixture = Awaited<
  ReturnType<typeof createFinanceHttpFixture>
>;
