import { prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import { FinanceStripeWebhookJob } from "../../../../workers/src/finance/finance-stripe-webhook.job";
import { PrismaFinanceStripeWebhookStore } from "../../../../workers/src/finance/finance-stripe-webhook.store";
import { FinanceStripeWebhookListener } from "../../../../workers/src/finance/finance-stripe-webhook-listener";
import { PostgresFinanceWebhookSubscription } from "../../../../workers/src/finance/postgres-finance-webhook-subscription";
import {
  createFinanceWebhookWakeFixture,
  prepareFinanceWebhookListenerRole,
} from "./finance-webhook-wakeup.fixture";

async function within<T>(work: Promise<T>): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(
          () => reject(new Error("Listener proof exceeded10 seconds")),
          10_000,
        );
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

describe("real PostgreSQL Finance listener lifecycle", () => {
  it("catches up more than one batch, isolates mode, reconnects and closes its subscription", async () => {
    if (!requireDatabase())
      throw new Error("Disposable listener database required");
    const url = await prepareFinanceWebhookListenerRole();
    const f = await createFinanceWebhookWakeFixture();
    const oldest = new Date("0001-01-01T00:00:00.000Z");
    await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
      tx.financeStripeWebhookEvent.createMany({
        data: [
          ...Array.from({ length: 52 }, () =>
            f.event({ nextAttemptAt: oldest }),
          ),
          f.event({ livemode: true, nextAttemptAt: oldest }),
        ],
      }),
    );

    let releaseReconnect: () => void = () => {};
    let reconnecting: () => void = () => {};
    let caughtUp: () => void = () => {};
    const reconnectGate = new Promise<void>((resolve) => {
      releaseReconnect = resolve;
    });
    const reconnectAttempt = new Promise<void>((resolve) => {
      reconnecting = resolve;
    });
    const recovered = new Promise<void>((resolve) => {
      caughtUp = resolve;
    });
    let connections = 0;
    let reads = 0;
    let processed = 0;
    const job = new FinanceStripeWebhookJob(
      new PrismaFinanceStripeWebhookStore(false),
      {
        process: async () => {
          processed++;
          return "processed";
        },
      },
    );
    const listener = new FinanceStripeWebhookListener({
      createSubscription: () => {
        const ordinal = ++connections;
        return new (class extends PostgresFinanceWebhookSubscription {
          override async start(
            onWake: () => void,
            onDisconnect: (error: unknown) => void,
          ) {
            if (ordinal > 1) {
              reconnecting();
              await reconnectGate;
            }
            await super.start(onWake, onDisconnect);
          }
          override async readPlan(now: Date) {
            reads++;
            const plan = await super.readPlan(now);
            // Other suites retain committed evidence in this disposable DB.
            // Never let this lifecycle transport double process their scopes.
            return {
              ...plan,
              scopes: plan.scopes.filter(
                (scope) =>
                  scope.tenantId === f.tenantId && scope.orgId === f.orgId,
              ),
            };
          }
        })(url, false);
      },
      runScopes: async (scopes, signal) => {
        const result = await job.runScopes(scopes, signal);
        if (processed === 53 && result.completed > 0) caughtUp();
        return result;
      },
    });
    try {
      // No subscriber existed when these records committed. Startup must recover
      // them from durable state, including the second (>50) batch.
      await within(listener.start());
      expect(processed).toBe(52);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const idleReads = reads;
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(reads).toBe(idleReads);
      await prisma.$queryRaw`
        SELECT pg_terminate_backend(pid) FROM pg_stat_activity
        WHERE datname = current_database() AND usename = 'finance_e2e_notify_listener'
          AND application_name = 'pathway-finance-webhook-listener' AND pid <> pg_backend_pid()
      `;
      await within(reconnectAttempt);
      await f.insert({ nextAttemptAt: oldest });
      // Commit while the replacement connection is gated before LISTEN.
      releaseReconnect();
      await within(recovered);
      expect(connections).toBe(2);
      expect(processed).toBe(53);
      const state = await withTenantRlsContext(
        f.tenantId,
        f.orgId,
        async (tx) => ({
          live: await tx.financeStripeWebhookEvent.count({
            where: {
              tenantId: f.tenantId,
              orgId: f.orgId,
              livemode: true,
              status: "RECEIVED",
            },
          }),
          completed: await tx.financeStripeWebhookEvent.count({
            where: {
              tenantId: f.tenantId,
              orgId: f.orgId,
              livemode: false,
              status: "COMPLETED",
            },
          }),
          receipts: await tx.financeReceipt.count({
            where: { tenantId: f.tenantId, orgId: f.orgId },
          }),
        }),
      );
      expect(state).toEqual({ live: 1, completed: 53, receipts: 0 });
    } finally {
      releaseReconnect();
      await listener.stop();
      await f.complete();
    }
    expect(listener.state).toBe("stopped");
    const clients = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT count(*) FROM pg_stat_activity WHERE datname = current_database()
        AND usename = 'finance_e2e_notify_listener' AND application_name = 'pathway-finance-webhook-listener'
    `;
    expect(clients[0]?.count).toBe(0n);
  });
});
