import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext, type Prisma } from "@pathway/db";
import { PostgresFinanceWebhookSubscription } from "../../../../workers/src/finance/postgres-finance-webhook-subscription";
import { createFinanceAssuranceFixture } from "./finance-assurance.fixture";

const listenerRole = "finance_e2e_notify_listener";
const listenerPassword = "synthetic_notify_test_only";

export async function prepareFinanceWebhookListenerRole(): Promise<string> {
  const rawUrl = process.env.TEST_DATABASE_URL ?? process.env.E2E_DATABASE_URL;
  if (!rawUrl) throw new Error("Disposable webhook test database required");
  const url = new URL(rawUrl);
  if (
    !["localhost", "127.0.0.1", "postgres"].includes(url.hostname) ||
    !/test|e2e|review/.test(url.pathname)
  )
    throw new Error(
      "Notification role setup requires a local disposable database",
    );
  // Fixed test-only DDL; no supplied identifier or credential is interpolated.
  await prisma.$executeRawUnsafe(`DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = 'finance_e2e_notify_listener') THEN
      CREATE ROLE finance_e2e_notify_listener LOGIN PASSWORD 'synthetic_notify_test_only'
        NOSUPERUSER NOBYPASSRLS NOINHERIT;
    END IF;
  END $$;`);
  await prisma.$executeRawUnsafe(
    "GRANT USAGE ON SCHEMA app TO finance_e2e_notify_listener",
  );
  const [functionState] = await prisma.$queryRaw<{ exists: boolean }[]>`
    SELECT to_regprocedure('app.plan_finance_stripe_webhook_work(timestamptz,boolean,integer)') IS NOT NULL AS "exists"
  `;
  if (functionState?.exists) await grantFinanceWebhookPlan();
  url.username = listenerRole;
  url.password = listenerPassword;
  url.searchParams.delete("schema");
  return url.toString();
}

export async function grantFinanceWebhookPlan(): Promise<void> {
  await prisma.$executeRawUnsafe(
    "GRANT EXECUTE ON FUNCTION app.plan_finance_stripe_webhook_work(timestamptz,boolean,integer) TO finance_e2e_notify_listener",
  );
}

export async function createFinanceWebhookWakeFixture() {
  const f = await createFinanceAssuranceFixture();
  function event(
    input: Partial<
      Pick<
        Prisma.FinanceStripeWebhookEventCreateManyInput,
        "status" | "livemode" | "nextAttemptAt" | "claimedAt" | "claimToken"
      >
    > = {},
  ): Prisma.FinanceStripeWebhookEventCreateManyInput {
    const id = `evt_notify_${randomUUID().replaceAll("-", "")}`;
    return {
      id: randomUUID(),
      tenantId: f.tenantId,
      orgId: f.orgId,
      stripeEventId: id,
      stripeAccountId: f.connection.stripeAccountId,
      eventType: "finance.synthetic.wakeup-proof",
      payloadSha256: "a".repeat(64),
      payloadJson: { synthetic: true },
      livemode: false,
      nextAttemptAt: new Date(),
      ...input,
    };
  }
  async function insert(input: Parameters<typeof event>[0] = {}) {
    return withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
      tx.financeStripeWebhookEvent.create({ data: event(input) }),
    );
  }
  async function complete() {
    await withTenantRlsContext(f.tenantId, f.orgId, (tx) =>
      tx.financeStripeWebhookEvent.updateMany({
        where: { tenantId: f.tenantId, orgId: f.orgId },
        data: {
          status: "COMPLETED",
          processedAt: new Date(),
          claimedAt: null,
          claimToken: null,
        },
      }),
    );
  }
  return { ...f, event, insert, complete };
}

export function observeFinanceWebhookWake(url: string) {
  const source = new PostgresFinanceWebhookSubscription(url, false);
  let count = 0;
  let received: (() => void) | null = null;
  return {
    source,
    count: () => count,
    start: () =>
      source.start(
        () => {
          count++;
          received?.();
        },
        () => {},
      ),
    next: () =>
      new Promise<void>((resolve, reject) => {
        const timeout = setTimeout(() => {
          received = null;
          reject(new Error("No committed Finance wake received"));
        }, 1_000);
        received = () => {
          received = null;
          clearTimeout(timeout);
          resolve();
        };
      }),
  };
}
