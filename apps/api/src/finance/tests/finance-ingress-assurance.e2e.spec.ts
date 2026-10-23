import { randomUUID } from "node:crypto";
import request from "supertest";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceReportRepository } from "../finance-report.repository";
import {
  FinanceStripeWebhookReplayService,
  PrismaFinanceStripeWebhookInbox,
} from "../stripe/finance-stripe-webhook.service";
import { PrismaFinanceStripeWebhookStore } from "../../../../workers/src/finance/finance-stripe-webhook.store";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";
import {
  createFinanceIngressApp,
  createFinanceIngressFixture,
  prepareIngressCheckout,
  inbox,
  ledger,
  type FinanceIngressApp,
  type AssuranceStripeEvent,
} from "./finance-ingress-assurance.fixture";

const emptyLedger = { receipts: [], allocations: [], movements: [] };

describe("Finance signed HTTP ingress and durable replay assurance", () => {
  let server: FinanceIngressApp;
  beforeAll(async () => {
    if (!requireDatabase())
      throw new Error(
        "Signed Finance ingress assurance requires the disposable database",
      );
    server = await createFinanceIngressApp();
  });
  afterAll(async () => {
    await server?.app.close();
  });

  it.each(["forged signature", "changed raw bytes"])(
    "rejects %s at the registered HTTP boundary without persisting or posting",
    async (mutation) => {
      const f = await createFinanceIngressFixture();
      const { event } = await prepareIngressCheckout(f);
      const response = await server.send(
        event,
        mutation === "forged signature"
          ? { signature: "t=1,v1=forged" }
          : { rawBody: `${JSON.stringify(event)} ` },
      );
      expect(response.status).toBe(400);
      expect(await inbox(f, event.id)).toBeNull();
      expect(await ledger(f)).toEqual(emptyLedger);
    },
  );

  it("rejects a correctly signed live event before the sandbox inbox or ledger", async () => {
    const f = await createFinanceIngressFixture();
    const { event } = await prepareIngressCheckout(f);
    const response = await server.send({ ...event, livemode: true });
    expect(response.status).toBe(400);
    expect(await inbox(f, event.id)).toBeNull();
    expect(await ledger(f)).toEqual(emptyLedger);
  });

  it("routes a signed other-school account to that school but cannot post another school's attempt", async () => {
    const f = await createFinanceIngressFixture();
    const other = await createFinanceAssuranceFixture(f.orgId);
    const { event } = await prepareIngressCheckout(f);
    const response = await server.send({
      ...event,
      account: other.connection.stripeAccountId ?? undefined,
    });
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("accepted");
    expect(await inbox(f, event.id)).toBeNull();
    expect(await inbox(other, event.id)).toMatchObject({
      tenantId: other.tenantId,
      orgId: other.orgId,
      status: "RECEIVED",
    });
    expect((await server.worker(other).run()).retried).toBe(1);
    expect(await inbox(other, event.id)).toMatchObject({
      status: "RETRY",
      attempts: 1,
      lastError: "Finance Checkout event does not match an attempt",
    });
    expect(await ledger(f)).toEqual(emptyLedger);
    expect(await ledger(other)).toEqual(emptyLedger);
  });

  it("acknowledges five deliveries once while the worker is unavailable and later polls the durable event", async () => {
    const f = await createFinanceIngressFixture();
    const { event, invoiceId } = await prepareIngressCheckout(f);
    for (let delivery = 0; delivery < 5; delivery += 1) {
      const response = await server.send(event);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe(
        delivery === 0 ? "accepted" : "duplicate",
      );
    }
    expect(await inbox(f, event.id)).toMatchObject({
      status: "RECEIVED",
      attempts: 0,
    });
    expect(await ledger(f)).toEqual(emptyLedger);
    expect(
      await new PrismaFinanceStripeWebhookStore(false).findDueScopes(
        new Date(),
      ),
    ).toContainEqual({ tenantId: f.tenantId, orgId: f.orgId });
    expect((await server.worker(f).run()).completed).toBe(1);
    const posted = await ledger(f);
    expect(posted.receipts).toHaveLength(1);
    expect(posted.receipts[0]?.amountMinor).toBe(30000n);
    expect(posted.allocations).toHaveLength(1);
    expect(posted.allocations[0]?.amountMinor).toBe(30000n);
    expect(posted.movements).toEqual([]);
    expect(
      (await f.invoices.get(f.actor, invoiceId)).balance.outstandingMinor,
    ).toBe("0");
    expect(await inbox(f, event.id)).toMatchObject({
      status: "COMPLETED",
      attempts: 1,
    });
  });

  it("returns HTTP503 when persistence fails, then accepts the provider retry without a false acknowledgement", async () => {
    const f = await createFinanceIngressFixture();
    const { event } = await prepareIngressCheckout(f);
    const capture = jest
      .spyOn(server.app.get(PrismaFinanceStripeWebhookInbox), "capture")
      .mockRejectedValueOnce(new Error("Synthetic persistence unavailable"));
    try {
      const failed = await server.send(event);
      expect(failed.status).toBe(503);
      expect(failed.text).not.toContain("Synthetic persistence unavailable");
      expect(await inbox(f, event.id)).toBeNull();
      expect(await ledger(f)).toEqual(emptyLedger);
    } finally {
      capture.mockRestore();
    }
    const retried = await server.send(event);
    expect(retried.status).toBe(200);
    expect(retried.body.status).toBe("accepted");
    expect(await inbox(f, event.id)).toMatchObject({ status: "RECEIVED" });
  });

  it("reclaims an expired worker lease after committed posting without a second receipt or allocation", async () => {
    const f = await createFinanceIngressFixture();
    const { event } = await prepareIngressCheckout(f);
    expect((await server.send(event)).status).toBe(200);
    const store = new PrismaFinanceStripeWebhookStore(false);
    const now = new Date();
    const [claimed] = await store.claim(
      f.actor,
      now,
      new Date(now.getTime() - 300000),
      randomUUID(),
      100,
    );
    if (!claimed) throw new Error("Expected claimed synthetic event");
    expect(
      await server.app
        .get(FinanceStripeWebhookReplayService)
        .processClaimedEvent({
          eventId: claimed.id,
          tenantId: f.tenantId,
          orgId: f.orgId,
          claimToken: claimed.claimToken,
        }),
    ).toBe("processed");
    const posted = await ledger(f);
    expect(posted.receipts).toHaveLength(1);
    expect(posted.allocations).toHaveLength(1);
    expect(await inbox(f, event.id)).toMatchObject({
      status: "PROCESSING",
      attempts: 1,
    });
    // A crashed process never acknowledges the committed posting. Age only this
    // synthetic lease, then restart with fresh worker/store instances.
    expect(await store.renew(claimed, new Date(Date.now() - 600000))).toBe(
      true,
    );
    expect((await server.worker(f).run()).completed).toBe(1);
    expect(await ledger(f)).toEqual(posted);
    expect(await inbox(f, event.id)).toMatchObject({
      status: "COMPLETED",
      attempts: 2,
      claimToken: null,
    });
  });

  it("quarantines an unknown Checkout status and exposes it in scoped operator exceptions without posting", async () => {
    const f = await createFinanceIngressFixture();
    const other = await createFinanceAssuranceFixture(f.orgId);
    const prepared = await prepareIngressCheckout(f);
    const event = {
      ...prepared.event,
      data: {
        object: {
          ...prepared.event.data.object,
          payment_status: "new_provider_status",
        },
      },
    };
    expect((await server.send(event)).status).toBe(200);
    for (let attempt = 0; attempt < 8; attempt += 1) {
      if (attempt > 0)
        await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
          tx.financeStripeWebhookEvent.updateMany({
            where: {
              tenantId: f.tenantId,
              orgId: f.orgId,
              stripeEventId: event.id,
              status: "RETRY",
            },
            data: { nextAttemptAt: new Date(0) },
          }),
        );
      const result = await server.worker(f).run();
      expect(attempt === 7 ? result.deadLettered : result.retried).toBe(1);
    }
    expect(await inbox(f, event.id)).toMatchObject({
      status: "DEAD_LETTER",
      attempts: 8,
      lastError: "Finance Checkout event payload is invalid",
    });
    expect(await ledger(f)).toEqual(emptyLedger);
    expect(
      (await f.invoices.get(f.actor, prepared.invoiceId)).balance
        .outstandingMinor,
    ).toBe("30000");
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const repository = server.app.get(FinanceReportRepository);
    const report = await repository.loadSnapshot(f.actor, {
      from: day,
      to: day,
      asOf: day,
    });
    expect(report.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          recordType: "exceptions",
          reference: event.id,
          status: "WEBHOOK_DEAD_LETTER",
          amountMinor: null,
          currency: null,
        }),
      ]),
    );
    expect(JSON.stringify(report.rows)).not.toContain("new_provider_status");
    const foreign = await repository.loadSnapshot(other.actor, {
      from: day,
      to: day,
      asOf: day,
    });
    expect(foreign.rows.some((row) => row.reference === event.id)).toBe(false);
  });

  it("reconciles a signed Dashboard refund once and reopens only the returned principal", async () => {
    const f = await createFinanceIngressFixture();
    const { event, invoiceId } = await prepareIngressCheckout(f);
    await server.send(event).expect(200);
    expect((await server.worker(f).run()).completed).toBe(1);
    const refundReference = `re_${randomUUID().replaceAll("-", "")}`;
    const refund: AssuranceStripeEvent = {
      id: `evt_${randomUUID().replaceAll("-", "")}`,
      type: "refund.updated",
      created: Math.floor(Date.now() / 1000),
      account: event.account,
      livemode: false,
      data: {
        object: {
          id: refundReference,
          object: "refund",
          status: "succeeded",
          amount: 5000,
          currency: "gbp",
          payment_intent: event.data.object.payment_intent,
          metadata: {},
        },
      },
    };
    await server.send(refund).expect(200);
    expect((await server.worker(f).run()).completed).toBe(1);
    for (let duplicate = 0; duplicate < 4; duplicate += 1)
      expect((await server.send(refund)).body.status).toBe("duplicate");
    const posted = await ledger(f);
    expect(posted.receipts).toHaveLength(1);
    expect(posted.movements).toEqual([
      expect.objectContaining({
        type: "REFUND",
        amountMinor: 5000n,
        sourceReference: refundReference,
      }),
    ]);
    expect(
      (await f.invoices.get(f.actor, invoiceId)).balance.outstandingMinor,
    ).toBe("5000");
    expect(
      await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
        tx.financeRefundEvent.findMany({
          where: {
            tenantId: f.tenantId,
            orgId: f.orgId,
            sourceReference: refundReference,
          },
          select: { refundId: true },
        }),
      ),
    ).toEqual([{ refundId: null }]);
  });

  it("replays the actual SaaS handler without creating family money or changing Finance entitlement", async () => {
    const f = await createFinanceIngressFixture();
    const family = await prepareIngressCheckout(f);
    await server.send(family.event).expect(200);
    await server.worker(f).run();
    const before = await ledger(f);
    const entitlement = await prisma.orgModule.findUniqueOrThrow({
      where: { orgId_module: { orgId: f.orgId, module: "FINANCE" } },
    });
    const eventId = `evt_saas_${randomUUID()}`;
    const subscriptionId = `sub_saas_${randomUUID()}`;
    const body = {
      eventId,
      type: "subscription.updated",
      orgId: f.orgId,
      subscriptionId,
      planCode: "starter",
      status: "active",
      periodStart: "2026-10-01T00:00:00Z",
      periodEnd: "2026-11-01T00:00:00Z",
    };
    for (let delivery = 0; delivery < 5; delivery += 1) {
      const response = await request(server.app.getHttpServer())
        .post("/billing/webhook")
        .set("x-billing-signature", "test-signature")
        .send(body);
      expect(response.status).toBe(200);
      expect(response.body.status).toBe(
        delivery === 0 ? "ok" : "ignored_duplicate",
      );
    }
    expect(
      await prisma.subscription.findMany({
        where: { orgId: f.orgId, providerSubId: subscriptionId },
        select: { status: true },
      }),
    ).toEqual([{ status: "ACTIVE" }]);
    expect(
      await prisma.orgModule.findUniqueOrThrow({
        where: { orgId_module: { orgId: f.orgId, module: "FINANCE" } },
      }),
    ).toEqual(entitlement);
    expect(await ledger(f)).toEqual(before);
    // A genuine Finance signature does not turn a SaaS-shaped event into money.
    const misrouted: AssuranceStripeEvent = {
      id: `evt_${randomUUID().replaceAll("-", "")}`,
      type: "customer.subscription.updated",
      created: Math.floor(Date.now() / 1000),
      livemode: false,
      data: {
        object: {
          id: subscriptionId,
          object: "subscription",
          status: "active",
        },
      },
    };
    const response = await server.send(misrouted);
    expect(response.status).toBe(200);
    expect(response.body.status).toBe("unmatched");
    expect(await ledger(f)).toEqual(before);
  });
});
