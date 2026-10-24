import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import {
  createFinanceWebhookWakeFixture,
  grantFinanceWebhookPlan,
  observeFinanceWebhookWake,
  prepareFinanceWebhookListenerRole,
} from "./finance-webhook-wakeup.fixture";

describe("transactional Finance webhook wakeups", () => {
  let url: string;
  beforeAll(async () => {
    if (!requireDatabase())
      throw new Error("Disposable notification database required");
    url = await prepareFinanceWebhookListenerRole();
  });

  it("delivers one empty hint after commit, never during the transaction or after rollback", async () => {
    const f = await createFinanceWebhookWakeFixture();
    const observer = observeFinanceWebhookWake(url);
    await observer.start();
    let release: () => void = () => {};
    let entered: () => void = () => {};
    const ready = new Promise<void>((resolve) => {
      entered = resolve;
    });
    const commit = new Promise<void>((resolve) => {
      release = resolve;
    });
    try {
      const pending = withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
        await tx.financeStripeWebhookEvent.createMany({
          data: Array.from({ length: 52 }, () => f.event()),
        });
        entered();
        await commit;
      });
      await Promise.race([ready, pending]);
      expect(observer.count()).toBe(0);
      const wake = observer.next();
      release();
      await pending;
      await wake;
      expect(observer.count()).toBe(1);
      await expect(
        withTenantRlsContext(f.tenantId, f.orgId, async (tx) => {
          await tx.financeStripeWebhookEvent.create({ data: f.event() });
          throw new Error("Synthetic rollback");
        }),
      ).rejects.toThrow("Synthetic rollback");
      // Bounded absence check only: no database/API discovery loop is involved.
      await new Promise((resolve) => setTimeout(resolve, 50));
      expect(observer.count()).toBe(1);
    } finally {
      release();
      await observer.source.close();
      await f.complete();
    }
  });

  it("plans future-only work and mode isolation independently of the bounded scope page", async () => {
    const f = await createFinanceWebhookWakeFixture();
    const other = await createFinanceWebhookWakeFixture();
    const observer = observeFinanceWebhookWake(url);
    await observer.start();
    // A controlled historical as-of keeps this scope ahead of other suites'
    // retained synthetic evidence without changing or draining their records.
    const now = new Date("0001-01-02T00:00:00.000Z");
    const future = new Date(now.getTime() + 60_000);
    const baseline = await observer.source.readPlan(now);
    try {
      await f.insert({ nextAttemptAt: future });
      await f.insert({ livemode: true, nextAttemptAt: now });
      expect(await observer.source.readPlan(now)).toEqual({
        scopes: [],
        nextWakeAt: future,
      });
      await other.insert({ nextAttemptAt: now });
      const rows = await prisma.$queryRaw<
        { scopes: unknown; nextWakeAt: Date | null }[]
      >`
        SELECT * FROM app.plan_finance_stripe_webhook_work(${now}, false, 1)
      `;
      expect(rows).toEqual([
        {
          scopes: [{ tenantId: other.tenantId, orgId: other.orgId }],
          nextWakeAt: future,
        },
      ]);
      await f.complete();
      await other.complete();
      expect(await observer.source.readPlan(now)).toEqual({
        ...baseline,
      });
    } finally {
      await observer.source.close();
      await f.complete();
      await other.complete();
    }
  });

  it("notifies an initial claim, keeps renewals silent and plans the renewed lease", async () => {
    const f = await createFinanceWebhookWakeFixture();
    const observer = observeFinanceWebhookWake(url);
    await observer.start();
    try {
      const insertedWake = observer.next();
      const event = await f.insert();
      await insertedWake;
      const claimAt = new Date("0001-01-01T00:00:00.000Z");
      const claimedWake = observer.next();
      await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
        tx.financeStripeWebhookEvent.update({
          where: { id: event.id },
          data: {
            status: "PROCESSING",
            claimToken: randomUUID(),
            claimedAt: claimAt,
          },
        }),
      );
      await claimedWake;
      let renewedAt = claimAt;
      for (let renewal = 1; renewal <= 5; renewal++) {
        renewedAt = new Date(claimAt.getTime() + renewal * 1000);
        await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
          tx.financeStripeWebhookEvent.update({
            where: { id: event.id },
            data: { claimedAt: renewedAt },
          }),
        );
      }
      const deadline = new Date(renewedAt.getTime() + 5 * 60_000);
      expect(await observer.source.readPlan(claimAt)).toEqual({
        scopes: [],
        nextWakeAt: deadline,
      });
      expect((await observer.source.readPlan(deadline)).scopes).toEqual([
        { tenantId: f.tenantId, orgId: f.orgId },
      ]);
      expect(observer.count()).toBe(2);
    } finally {
      await observer.source.close();
      await f.complete();
    }
  });

  it("denies plan access after permission revocation without exposing data", async () => {
    const observer = observeFinanceWebhookWake(url);
    await observer.start();
    try {
      await prisma.$executeRawUnsafe(
        "REVOKE EXECUTE ON FUNCTION app.plan_finance_stripe_webhook_work(timestamptz,boolean,integer) FROM finance_e2e_notify_listener",
      );
      await expect(observer.source.readPlan(new Date())).rejects.toMatchObject({
        reason: "PERMISSION",
      });
    } finally {
      await observer.source.close();
      await grantFinanceWebhookPlan();
    }
  });
});
