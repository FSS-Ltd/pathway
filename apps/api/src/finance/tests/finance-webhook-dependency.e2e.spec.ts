import { randomUUID } from "node:crypto";
import { withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceReportRepository } from "../finance-report.repository";
import {
  createFinanceIngressApp,
  createFinanceIngressFixture,
  prepareIngressCheckout,
  inbox,
  ledger,
  type AssuranceStripeEvent,
  type FinanceIngressApp,
} from "./finance-ingress-assurance.fixture";

function refundBeforeReceipt(
  original: AssuranceStripeEvent,
): AssuranceStripeEvent {
  return {
    ...original,
    id: `evt_dependency_${randomUUID().replaceAll("-", "")}`,
    type: "refund.updated",
    data: {
      object: {
        id: `re_dependency_${randomUUID().replaceAll("-", "")}`,
        object: "refund",
        status: "succeeded",
        amount: 5000,
        currency: "gbp",
        payment_intent: original.data.object.payment_intent,
        metadata: {},
      },
    },
  };
}

describe("Finance supported webhook dependency recovery", () => {
  let server: FinanceIngressApp;
  beforeAll(async () => {
    if (!requireDatabase())
      throw new Error("Disposable dependency database required");
    server = await createFinanceIngressApp();
  });
  afterAll(async () => server?.app.close());

  it("persists a retry for an early refund and posts it once after its receipt arrives", async () => {
    const f = await createFinanceIngressFixture();
    const { event, invoiceId } = await prepareIngressCheckout(f);
    const refund = refundBeforeReceipt(event);
    await server.send(refund).expect(200);
    expect((await server.worker(f).run()).retried).toBe(1);
    const delayed = await inbox(f, refund.id);
    expect(delayed).toMatchObject({ status: "RETRY", attempts: 1 });
    expect(delayed?.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(await ledger(f)).toEqual({
      receipts: [],
      movements: [],
      allocations: [],
    });

    await server.send(event).expect(200);
    expect((await server.worker(f).run()).completed).toBe(1);
    // Make the persisted deadline due without waiting two wall-clock minutes.
    // Deadline scheduling itself is checked with the listener's controlled clock.
    await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
      tx.financeStripeWebhookEvent.updateMany({
        where: {
          tenantId: f.tenantId,
          orgId: f.orgId,
          stripeEventId: refund.id,
          status: "RETRY",
        },
        data: { nextAttemptAt: new Date(0) },
      }),
    );
    expect((await server.worker(f).run()).completed).toBe(1);
    await server.send(refund).expect(200);
    expect((await server.worker(f).run()).completed).toBe(0);
    const posted = await ledger(f);
    expect(posted.receipts).toHaveLength(1);
    expect(posted.movements).toEqual([
      expect.objectContaining({ type: "REFUND", amountMinor: 5000n }),
    ]);
    expect(
      (await f.invoices.get(f.actor, invoiceId)).balance.outstandingMinor,
    ).toBe("5000");
  });

  it("retains unsupported evidence in a handler hold without routine retries", async () => {
    const f = await createFinanceIngressFixture();
    const { event } = await prepareIngressCheckout(f);
    const unsupported = { ...event, type: "finance.synthetic.unsupported" };
    await server.send(unsupported).expect(200);
    expect((await server.worker(f).run()).deferred).toBe(1);
    expect(await inbox(f, event.id)).toMatchObject({
      status: "AWAITING_HANDLER",
      attempts: 1,
    });
    expect((await server.worker(f).run()).retried).toBe(0);
    expect(await ledger(f)).toEqual({
      receipts: [],
      movements: [],
      allocations: [],
    });
  });

  it("keeps exhausted dependency evidence visible for manual review", async () => {
    const f = await createFinanceIngressFixture();
    const { event } = await prepareIngressCheckout(f);
    const refund = refundBeforeReceipt(event);
    await server.send(refund).expect(200);
    await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
      tx.financeStripeWebhookEvent.updateMany({
        where: {
          tenantId: f.tenantId,
          orgId: f.orgId,
          stripeEventId: refund.id,
        },
        data: { attempts: 7 },
      }),
    );
    expect((await server.worker(f).run()).deadLettered).toBe(1);
    expect(await inbox(f, refund.id)).toMatchObject({
      status: "DEAD_LETTER",
      attempts: 8,
    });
    const day = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/London",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date());
    const report = await server.app
      .get(FinanceReportRepository)
      .loadSnapshot(f.actor, { from: day, to: day, asOf: day });
    expect(report.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reference: refund.id,
          status: "WEBHOOK_DEAD_LETTER",
        }),
      ]),
    );
    expect(await ledger(f)).toEqual({
      receipts: [],
      movements: [],
      allocations: [],
    });
  });
});
