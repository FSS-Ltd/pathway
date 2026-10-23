import { Test } from "@nestjs/testing";
import { Module, prisma, withTenantRlsContext } from "@pathway/db";
import { randomUUID } from "node:crypto";
import request from "supertest";
import { AppModule } from "../../app.module";
import {
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { FINANCE_STRIPE_CHECKOUT_CONFIG } from "../stripe/finance-stripe-checkout.config";
import {
  FINANCE_STRIPE_BACS_PROVIDER,
  StripeFinanceBacsProvider,
} from "../stripe/finance-stripe-bacs.provider";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";

async function fixture() {
  const orgId = randomUUID();
  await prisma.org.create({
    data: {
      id: orgId,
      name: "Synthetic command HTTP assurance",
      slug: `finance-command-${orgId}`,
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
      subject: `assurance-http-${randomUUID()}`,
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
  const staff = await authenticate(f.actor.userId, [
    "finance.invoices.manage",
    "finance.invoices.read",
  ]);
  const payer = await authenticate(f.payerActor.userId, [
    "finance.family_payments.pay",
  ]);
  const forms: URLSearchParams[] = [];
  const config = {
    mode: "test",
    secretKey: "sk_test_assurance_fixture",
    webAppUrl: "https://family.example.test",
  } as const;
  const provider = new StripeFinanceBacsProvider(
    config,
    async (input, init) => {
      forms.push(new URLSearchParams(String(init?.body)));
      if (String(input).endsWith("/v1/customers"))
        return Response.json({ id: "cus_assurance_http", livemode: false });
      if (String(input).endsWith("/v1/checkout/sessions"))
        return Response.json({
          id: "cs_assurance_http",
          livemode: false,
          url: "https://checkout.stripe.com/c/pay/assurance",
          expires_at: Math.floor(Date.now() / 1000) + 3600,
        });
      throw new Error("Unexpected provider operation");
    },
  );
  // Real auth, entitlement, payer grant, route parsing and service transactions.
  // Only the Bacs transport/config is replaced with a no-network test adapter.
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FINANCE_STRIPE_CHECKOUT_CONFIG)
    .useValue(config)
    .overrideProvider(FINANCE_STRIPE_BACS_PROVIDER)
    .useValue(provider)
    .compile();
  const app = module.createNestApplication();
  await app.init();
  return { f, app, staff, payer, forms };
}

describe("Finance command identity and Bacs name HTTP assurance", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Command HTTP assurance requires the central disposable database",
      );
  });

  it("returns409 for same-key changed body and POST-to-PATCH reuse without changing the invoice", async () => {
    const { f, app, staff } = await fixture();
    try {
      const key = randomUUID();
      const body = {
        payerAccountId: f.payer.id,
        dueDate: "2026-12-31",
        lines: [
          {
            description: "Synthetic HTTP invoice",
            quantity: "1",
            unitAmountMinor: "500",
            taxRateBasisPoints: 0,
          },
        ],
      };
      const created = await request(app.getHttpServer())
        .post("/finance/invoices")
        .set("Authorization", staff)
        .set("Idempotency-Key", key)
        .send(body)
        .expect(201);
      const parsed: unknown = created.body;
      if (
        !parsed ||
        typeof parsed !== "object" ||
        !("id" in parsed) ||
        typeof parsed.id !== "string"
      )
        throw new Error("Invoice route returned no invoice id");
      const id = parsed.id;
      const changed = await request(app.getHttpServer())
        .post("/finance/invoices")
        .set("Authorization", staff)
        .set("Idempotency-Key", key)
        .send({
          ...body,
          lines: [{ ...body.lines[0], unitAmountMinor: "600" }],
        });
      expect(changed.status).toBe(409);
      expect(changed.body).toMatchObject({
        statusCode: 409,
        error: "Conflict",
        code: "IDEMPOTENCY_CONFLICT",
      });
      const crossMethod = await request(app.getHttpServer())
        .patch(`/finance/invoices/${id}`)
        .set("Authorization", staff)
        .set("Idempotency-Key", key)
        .send(body);
      expect(crossMethod.status).toBe(409);
      expect(crossMethod.body).toMatchObject({
        statusCode: 409,
        error: "Conflict",
        code: "IDEMPOTENCY_CONFLICT",
      });
      expect((await f.invoices.get(f.actor, id)).totalMinor).toBe("500");
      await withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        expect(
          await tx.financeInvoice.count({
            where: { tenantId: f.tenantId, orgId: f.orgId },
          }),
        ).toBe(1);
        expect(
          await tx.financeCommandReceipt.count({
            where: {
              tenantId: f.tenantId,
              orgId: f.orgId,
              actorUserId: f.actor.userId,
              idempotencyKey: key,
            },
          }),
        ).toBe(1);
      });
    } finally {
      await app.close();
    }
  });

  it("ignores a newly supplied custom Bacs name at the authenticated setup HTTP boundary", async () => {
    const { f, app, payer, forms } = await fixture();
    try {
      const result = await request(app.getHttpServer())
        .post(`/finance/payer-accounts/${f.payer.id}/bacs/mandates/setup`)
        .set("Authorization", payer)
        .send({
          customBacsName: "Unapproved paid custom name",
          payment_method_options: {
            bacs_debit: {
              setup_future_usage: "off_session",
              mandate_options: { reference_prefix: "UNAPPROVED" },
            },
          },
          business_profile: { name: "Unapproved paid custom name" },
        });
      expect(result.status).toBe(201);
      expect(forms).toHaveLength(2);
      const serialized = forms.map((form) => form.toString()).join("\n");
      expect(serialized).not.toMatch(
        /Unapproved|UNAPPROVED|customBacsName|reference_prefix|business_profile|statement_descriptor/,
      );
      expect(forms[0]?.get("name")).toBe(f.payer.displayName);
      expect(forms[1]?.get("allowed_payment_method_types[0]")).toBe(
        "bacs_debit",
      );
      expect(forms[1]?.get("mode")).toBe("setup");
    } finally {
      await app.close();
    }
  });
});
