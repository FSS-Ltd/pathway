import { Test } from "@nestjs/testing";
import { Module, prisma, withTenantRlsContext } from "@pathway/db";
import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import request from "supertest";
import { AppModule } from "../../app.module";
import {
  BILLING_WEBHOOK_PROVIDER,
  FakeBillingWebhookProvider,
} from "../../billing/billing-webhook.provider";
import { FINANCE_STRIPE_WEBHOOK_CONFIG } from "../stripe/finance-stripe-webhook.config";
import { FinanceStripeWebhookReplayService } from "../stripe/finance-stripe-webhook.service";
import { FinanceStripeWebhookJob } from "../../../../workers/src/finance/finance-stripe-webhook.job";
import { PrismaFinanceStripeWebhookStore } from "../../../../workers/src/finance/finance-stripe-webhook.store";
import {
  createFinanceAssuranceFixture,
  type FinanceAssuranceFixture,
} from "./finance-assurance.fixture";
import { prepareAssuranceProviderSuccess } from "./finance-assurance-provider.fixture";

const signatureKey = "whsec_synthetic_t18_ingress_assurance";
const stripe = new Stripe("sk_test_synthetic_t18_assurance", {
  apiVersion: "2023-10-16",
});
export interface AssuranceStripeEvent {
  id: string;
  type: string;
  created: number;
  account?: string;
  livemode: boolean;
  data: { object: Record<string, unknown> };
}

export async function createFinanceIngressApp() {
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(FINANCE_STRIPE_WEBHOOK_CONFIG)
    .useValue({
      mode: "test",
      secretKey: "sk_test_synthetic_t18_assurance",
      webhookSecret: signatureKey,
    })
    .overrideProvider(BILLING_WEBHOOK_PROVIDER)
    .useValue(new FakeBillingWebhookProvider())
    .compile();
  const app = module.createNestApplication({ rawBody: true });
  await app.init();
  function sign(rawBody: string): string {
    return stripe.webhooks.generateTestHeaderString({
      payload: rawBody,
      secret: signatureKey,
    });
  }
  function send(
    event: AssuranceStripeEvent,
    options: { rawBody?: string; signature?: string } = {},
  ) {
    const original = JSON.stringify(event);
    return request(app.getHttpServer())
      .post("/finance/stripe/webhook")
      .set("Content-Type", "application/json")
      .set("stripe-signature", options.signature ?? sign(original))
      .send(options.rawBody ?? original);
  }
  function worker(f: FinanceAssuranceFixture) {
    // Scope discovery is checked separately; never run a test worker over another
    // suite's committed inbox rows in the shared disposable database.
    class ScopedFinanceWebhookStore extends PrismaFinanceStripeWebhookStore {
      override async findDueScopes() {
        return [{ tenantId: f.tenantId, orgId: f.orgId }];
      }
    }
    const scopedStore = new ScopedFinanceWebhookStore(false);
    return new FinanceStripeWebhookJob(scopedStore, {
      process: (event) =>
        app.get(FinanceStripeWebhookReplayService).processClaimedEvent({
          eventId: event.id,
          tenantId: event.tenantId,
          orgId: event.orgId,
          claimToken: event.claimToken,
        }),
    });
  }
  return { app, send, worker };
}
export type FinanceIngressApp = Awaited<
  ReturnType<typeof createFinanceIngressApp>
>;

export async function createFinanceIngressFixture() {
  const orgId = randomUUID();
  await prisma.org.create({
    data: {
      id: orgId,
      name: "Synthetic signed-ingress assurance",
      slug: `ingress-${orgId}`,
      planCode: "trial",
    },
  });
  await prisma.orgVertical.create({ data: { orgId, vertical: "ACE_SCHOOL" } });
  await prisma.orgModule.create({
    data: { orgId, module: Module.FINANCE, status: "ACTIVE" },
  });
  return createFinanceAssuranceFixture(orgId);
}

export async function prepareIngressCheckout(
  f: FinanceAssuranceFixture,
): Promise<{ event: AssuranceStripeEvent; invoiceId: string }> {
  const invoiceId = await f.createIssuedInvoice("30000");
  // Reuse existing provider fixture preparation without invoking its posting callback.
  await prepareAssuranceProviderSuccess(f, invoiceId, "card", 30000);
  const attempt = await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
    tx.financeCheckoutAttempt.findFirstOrThrow({
      where: { invoiceId, tenantId: f.tenantId, orgId: f.orgId },
    }),
  );
  return {
    invoiceId,
    event: {
      id: `evt_${randomUUID().replaceAll("-", "")}`,
      type: "checkout.session.async_payment_succeeded",
      created: Math.floor(Date.now() / 1000),
      account: attempt.stripeAccountId,
      livemode: false,
      data: {
        object: {
          id: attempt.stripeCheckoutSessionId,
          object: "checkout.session",
          client_reference_id: attempt.id,
          amount_total: 30000,
          currency: "gbp",
          payment_intent: `pi_${randomUUID().replaceAll("-", "")}`,
          payment_status: "paid",
          status: "complete",
          metadata: {
            finance_checkout_attempt_id: attempt.id,
            finance_invoice_id: invoiceId,
          },
        },
      },
    },
  };
}

export function inbox(f: FinanceAssuranceFixture, eventId: string) {
  return withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
    tx.financeStripeWebhookEvent.findFirst({
      where: { stripeEventId: eventId, tenantId: f.tenantId, orgId: f.orgId },
    }),
  );
}
export function ledger(f: FinanceAssuranceFixture) {
  return withTenantRlsContext(f.tenantId, f.orgId, async (tx) => ({
    receipts: await tx.financeReceipt.findMany({
      where: { tenantId: f.tenantId, orgId: f.orgId },
      select: { id: true, amountMinor: true, sourceReference: true },
      orderBy: { id: "asc" },
    }),
    allocations: await tx.financeReceiptAllocation.findMany({
      where: { tenantId: f.tenantId, orgId: f.orgId },
      select: { id: true, amountMinor: true, invoiceId: true },
      orderBy: { id: "asc" },
    }),
    movements: await tx.financeReceiptMovement.findMany({
      where: { tenantId: f.tenantId, orgId: f.orgId },
      select: {
        id: true,
        amountMinor: true,
        type: true,
        sourceReference: true,
      },
      orderBy: { id: "asc" },
    }),
  }));
}
