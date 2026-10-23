import { randomUUID } from "node:crypto";
import { applyTenantContext, Prisma, prisma } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";

const tables = [
  "FinanceReconciliationState",
  "FinanceReconciliationCase",
  "FinanceReconciliationCaseEvent",
];
const role = "pathway_e2e_tenant_rls";

interface Fixture {
  tx: Prisma.TransactionClient;
  orgId: string;
  tenantA: string;
  tenantB: string;
  connectionA: string;
  connectionB: string;
  accountA: string;
}

async function fixture(check: (data: Fixture) => Promise<void>): Promise<void> {
  const orgId = process.env.E2E_ORG_ID;
  const tenantA = process.env.E2E_TENANT_ID;
  const tenantB = process.env.E2E_TENANT2_ID;
  if (!orgId || !tenantA || !tenantB)
    throw new Error("Missing reconciliation E2E fixture scope");
  const rollback = new Error("rollback reconciliation fixture");
  try {
    await prisma.$transaction(async (tx) => {
      const userId = randomUUID();
      const connectionA = randomUUID();
      const connectionB = randomUUID();
      const accountA = `acct_${randomUUID().replaceAll("-", "")}`;
      await tx.user.create({
        data: { id: userId, email: `${userId}@example.test` },
      });
      for (const [tenantId, id, account] of [
        [tenantA, connectionA, accountA],
        [tenantB, connectionB, `acct_${randomUUID().replaceAll("-", "")}`],
      ]) {
        await applyTenantContext(tx, tenantId, orgId);
        const profile = await tx.financeProfile.create({
          data: { tenantId, orgId, legalEntityName: "Reconciliation test" },
        });
        await tx.financeStripeConnection.create({
          data: {
            id,
            tenantId,
            orgId,
            financeProfileId: profile.id,
            requestedByUserId: userId,
            stripeAccountId: account,
          },
        });
      }
      await applyTenantContext(tx, tenantA, orgId);
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${role}"`);
      await check({
        tx,
        orgId,
        tenantA,
        tenantB,
        connectionA,
        connectionB,
        accountA,
      });
      throw rollback;
    });
  } catch (error) {
    if (error !== rollback) throw error;
  }
}

describe("Finance reconciliation database boundaries", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Reconciliation tests require a working disposable database",
      );
    if (process.env.E2E_TENANT_RLS_ROLE !== role)
      throw new Error(
        "Reconciliation tests require the low-privilege tenant role",
      );
  });

  it("forces RLS on persisted coverage and case history", async () => {
    const rows = await prisma.$queryRaw<
      Array<{ name: string; enabled: boolean; forced: boolean }>
    >`
      SELECT c.relname AS name, c.relrowsecurity AS enabled, c.relforcerowsecurity AS forced
      FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'app' AND c.relname IN (${Prisma.join(tables)}) ORDER BY c.relname
    `;
    expect(rows).toEqual(
      [...tables].sort().map((name) => ({ name, enabled: true, forced: true })),
    );
  });

  it("keeps coverage, cases and case history hidden from another tenant", async () => {
    await fixture(async ({ tx, orgId, tenantA, tenantB, connectionA }) => {
      const stateId = randomUUID();
      const caseId = randomUUID();
      const eventId = randomUUID();
      await tx.$executeRaw`INSERT INTO app."FinanceReconciliationState" ("id", "stripeConnectionId", "tenantId", "orgId", "stream", "updatedAt") VALUES (${stateId}, ${connectionA}, ${tenantA}, ${orgId}, 'events', CURRENT_TIMESTAMP)`;
      await tx.$executeRaw`INSERT INTO app."FinanceReconciliationCase" ("id", "stripeConnectionId", "tenantId", "orgId", "caseKey", "kind", "details", "updatedAt") VALUES (${caseId}, ${connectionA}, ${tenantA}, ${orgId}, 'unknown-payment', 'UNMATCHED_MONEY', '{}'::jsonb, CURRENT_TIMESTAMP)`;
      await tx.$executeRaw`INSERT INTO app."FinanceReconciliationCaseEvent" ("id", "caseId", "tenantId", "orgId", "type", "details") VALUES (${eventId}, ${caseId}, ${tenantA}, ${orgId}, 'DETECTED', '{}'::jsonb)`;
      await applyTenantContext(tx, tenantB, orgId);
      expect(
        await tx.$queryRaw`SELECT "id" FROM app."FinanceReconciliationState" WHERE "id" = ${stateId}`,
      ).toEqual([]);
      expect(
        await tx.$queryRaw`SELECT "id" FROM app."FinanceReconciliationCase" WHERE "id" = ${caseId}`,
      ).toEqual([]);
      expect(
        await tx.$queryRaw`SELECT "id" FROM app."FinanceReconciliationCaseEvent" WHERE "id" = ${eventId}`,
      ).toEqual([]);
    });
  });

  it.each(["forged-tenant", "forged-connection"])(
    "rejects %s coverage writes",
    async (kind) => {
      await expect(
        fixture(
          async ({ tx, orgId, tenantA, tenantB, connectionA, connectionB }) => {
            const tenantId = kind === "forged-tenant" ? tenantB : tenantA;
            const connectionId =
              kind === "forged-tenant" ? connectionA : connectionB;
            await tx.$executeRaw`INSERT INTO app."FinanceReconciliationState" ("id", "stripeConnectionId", "tenantId", "orgId", "stream", "updatedAt") VALUES (${randomUUID()}, ${connectionId}, ${tenantId}, ${orgId}, 'events', CURRENT_TIMESTAMP)`;
          },
        ),
      ).rejects.toMatchObject({
        code: "P2010",
        meta: { code: kind === "forged-tenant" ? "42501" : "23503" },
      });
    },
  );

  it.each([
    { amount: 100n, currency: null },
    { amount: null, currency: "GBP" },
    { amount: 100n, currency: "gbp" },
  ])(
    "requires a complete and explicit money measure on a case",
    async ({ amount, currency }) => {
      await expect(
        fixture(async ({ tx, orgId, tenantA, connectionA }) => {
          await tx.$executeRaw`INSERT INTO app."FinanceReconciliationCase" ("id", "stripeConnectionId", "tenantId", "orgId", "caseKey", "kind", "amountMinor", "currency", "details", "updatedAt") VALUES (${randomUUID()}, ${connectionA}, ${tenantA}, ${orgId}, 'invalid-money', 'UNMATCHED_MONEY', ${amount}, ${currency}, '{}'::jsonb, CURRENT_TIMESTAMP)`;
        }),
      ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
    },
  );

  it("rejects a lease without an expiry", async () => {
    await expect(
      fixture(async ({ tx, orgId, tenantA, connectionA }) => {
        await tx.$executeRaw`INSERT INTO app."FinanceReconciliationState" ("id", "stripeConnectionId", "tenantId", "orgId", "stream", "leaseToken", "updatedAt") VALUES (${randomUUID()}, ${connectionA}, ${tenantA}, ${orgId}, 'events', 'claim-with-no-expiry', CURRENT_TIMESTAMP)`;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });

  it("rejects a case linked to another tenant's connection", async () => {
    await expect(
      fixture(async ({ tx, orgId, tenantA, connectionB }) => {
        await tx.$executeRaw`INSERT INTO app."FinanceReconciliationCase" ("id", "stripeConnectionId", "tenantId", "orgId", "caseKey", "kind", "details", "updatedAt") VALUES (${randomUUID()}, ${connectionB}, ${tenantA}, ${orgId}, 'forged-case', 'UNMATCHED_MONEY', '{}'::jsonb, CURRENT_TIMESTAMP)`;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23503" } });
  });

  it("rejects history linked across tenant scope", async () => {
    await expect(
      fixture(async ({ tx, orgId, tenantA, tenantB, connectionA }) => {
        const caseId = randomUUID();
        await tx.$executeRaw`INSERT INTO app."FinanceReconciliationCase" ("id", "stripeConnectionId", "tenantId", "orgId", "caseKey", "kind", "details", "updatedAt") VALUES (${caseId}, ${connectionA}, ${tenantA}, ${orgId}, 'history-scope', 'UNMATCHED_MONEY', '{}'::jsonb, CURRENT_TIMESTAMP)`;
        await applyTenantContext(tx, tenantB, orgId);
        await tx.$executeRaw`INSERT INTO app."FinanceReconciliationCaseEvent" ("id", "caseId", "tenantId", "orgId", "type", "details") VALUES (${randomUUID()}, ${caseId}, ${tenantB}, ${orgId}, 'DETECTED', '{}'::jsonb)`;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23503" } });
  });

  it("prevents a coverage cutoff moving backwards", async () => {
    await expect(
      fixture(async ({ tx, orgId, tenantA, connectionA }) => {
        const id = randomUUID();
        await tx.$executeRaw`INSERT INTO app."FinanceReconciliationState" ("id", "stripeConnectionId", "tenantId", "orgId", "stream", "completedThrough", "updatedAt") VALUES (${id}, ${connectionA}, ${tenantA}, ${orgId}, 'events', '2026-10-23 12:00:00', CURRENT_TIMESTAMP)`;
        await tx.$executeRaw`UPDATE app."FinanceReconciliationState" SET "completedThrough" = '2026-10-23 11:00:00' WHERE "id" = ${id}`;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });

  it("keeps case history append-only", async () => {
    await expect(
      fixture(async ({ tx, orgId, tenantA, connectionA }) => {
        const caseId = randomUUID();
        const eventId = randomUUID();
        await tx.$executeRaw`INSERT INTO app."FinanceReconciliationCase" ("id", "stripeConnectionId", "tenantId", "orgId", "caseKey", "kind", "details", "updatedAt") VALUES (${caseId}, ${connectionA}, ${tenantA}, ${orgId}, 'case-history', 'UNMATCHED_MONEY', '{}'::jsonb, CURRENT_TIMESTAMP)`;
        await tx.$executeRaw`INSERT INTO app."FinanceReconciliationCaseEvent" ("id", "caseId", "tenantId", "orgId", "type", "details") VALUES (${eventId}, ${caseId}, ${tenantA}, ${orgId}, 'DETECTED', '{}'::jsonb)`;
        await tx.$executeRaw`DELETE FROM app."FinanceReconciliationCaseEvent" WHERE "id" = ${eventId}`;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });

  it("records API-recovered inbox provenance immutably against the school connection", async () => {
    await expect(
      fixture(async ({ tx, orgId, tenantA, connectionA, accountA }) => {
        const eventId = `recovery_${randomUUID().replaceAll("-", "")}`;
        const payload = JSON.stringify({
          id: eventId,
          type: "refund.updated",
          account: accountA,
          livemode: false,
        });
        await tx.$executeRaw`INSERT INTO app."FinanceStripeWebhookEvent" ("id", "stripeEventId", "stripeAccountId", "eventType", "livemode", "payloadSha256", "payloadJson", "tenantId", "orgId", "evidenceSource", "reconciliationConnectionId") VALUES (${randomUUID()}, ${eventId}, ${accountA}, 'refund.updated', false, ${"b".repeat(64)}, ${payload}::jsonb, ${tenantA}, ${orgId}, 'API_RECONCILIATION', ${connectionA})`;
        const rows = await tx.$queryRaw<
          Array<{ evidenceSource: string }>
        >`SELECT "evidenceSource" FROM app."FinanceStripeWebhookEvent" WHERE "stripeEventId" = ${eventId}`;
        expect(rows).toEqual([{ evidenceSource: "API_RECONCILIATION" }]);
        await tx.$executeRaw`UPDATE app."FinanceStripeWebhookEvent" SET "evidenceSource" = 'SIGNED_WEBHOOK', "reconciliationConnectionId" = NULL WHERE "stripeEventId" = ${eventId}`;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });

  it("rejects API evidence for a different connected account", async () => {
    await expect(
      fixture(async ({ tx, orgId, tenantA, connectionA }) => {
        const eventId = `recovery_${randomUUID().replaceAll("-", "")}`;
        await tx.$executeRaw`INSERT INTO app."FinanceStripeWebhookEvent" ("id", "stripeEventId", "stripeAccountId", "eventType", "livemode", "payloadSha256", "payloadJson", "tenantId", "orgId", "evidenceSource", "reconciliationConnectionId") VALUES (${randomUUID()}, ${eventId}, 'acct_other', 'refund.updated', false, ${"b".repeat(64)}, '{}'::jsonb, ${tenantA}, ${orgId}, 'API_RECONCILIATION', ${connectionA})`;
      }),
    ).rejects.toMatchObject({ code: "P2010", meta: { code: "23514" } });
  });
});
