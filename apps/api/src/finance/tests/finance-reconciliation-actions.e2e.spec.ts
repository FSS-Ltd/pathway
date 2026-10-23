import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { requireDatabase } from "../../../test-helpers.e2e";
import type { FinanceAccessService } from "../access/finance-access.service";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { FinanceReconciliationService } from "../finance-reconciliation.service";

const now = new Date("2026-10-23T12:00:00Z");
async function fixture() {
  const orgId = process.env.E2E_ORG_ID;
  if (!orgId) throw new Error("Missing reconciliation test organisation");
  const tenantId = randomUUID();
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.tenant.create({
      data: {
        id: tenantId,
        orgId,
        name: "Synthetic staff recovery",
        slug: tenantId,
      },
    });
    const user = await tx.user.create({
      data: { email: `${randomUUID()}@example.test` },
    });
    const profile = await tx.financeProfile.create({
      data: { tenantId, orgId, legalEntityName: "Synthetic recovery school" },
    });
    const connection = await tx.financeStripeConnection.create({
      data: {
        tenantId,
        orgId,
        financeProfileId: profile.id,
        requestedByUserId: user.id,
        stripeAccountId: `acct_${randomUUID().replaceAll("-", "")}`,
      },
    });
    const record = await tx.financeReconciliationCase.create({
      data: {
        tenantId,
        orgId,
        stripeConnectionId: connection.id,
        caseKey: randomUUID(),
        kind: "UNMATCHED_MONEY",
        details: {},
        amountMinor: 1000n,
        currency: "GBP",
        lastSeenAt: now,
      },
    });
    return { actor: { tenantId, orgId, userId: user.id }, record, connection };
  });
}

// Only authorization is replaced; persistence, scope filters, locks and append-only events use the disposable database.
const access = {
  assertStaffAction: jest.fn().mockResolvedValue(undefined),
  resolveMode: jest.fn().mockResolvedValue("SERVICING_ONLY"),
} as unknown as FinanceAccessService;
const permissions = {
  resolve: jest.fn().mockResolvedValue({ allowed: true }),
} as unknown as EffectivePermissionsService;
const service = new FinanceReconciliationService(access, permissions);

describe("staff reconciliation durable actions", () => {
  beforeAll(() => {
    if (!requireDatabase())
      throw new Error(
        "Reconciliation actions require a working disposable database",
      );
  });
  afterAll(async () => {
    await prisma.$disconnect();
  });

  it("serializes repeated requests and persists one executable recheck without resolving", async () => {
    const { actor, record } = await fixture();
    const input = {
      requestId: randomUUID(),
      reason: "Synthetic recovery recheck",
      expectedLastSeenAt: now.toISOString(),
    };
    await Promise.all([
      service.act(actor, record.id, "RECHECK", input),
      service.act(actor, record.id, "RECHECK", {
        ...input,
        requestId: randomUUID(),
      }),
    ]);
    await withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      expect(
        await tx.financeReconciliationCaseEvent.count({
          where: { caseId: record.id, type: "REPLAY_REQUESTED" },
        }),
      ).toBe(1);
      expect(
        await tx.financeReconciliationCase.findUnique({
          where: { id: record.id },
        }),
      ).toMatchObject({ status: "OPEN", amountMinor: 1000n, resolvedAt: null });
    });
  });
  it("rejects cross-tenant detail/actions and mismatched stored evidence", async () => {
    const { actor, record, connection } = await fixture();
    const input = {
      requestId: randomUUID(),
      reason: "Synthetic recovery replay",
      expectedLastSeenAt: now.toISOString(),
    };
    const other = { ...actor, tenantId: randomUUID() };
    await expect(service.get(other, record.id)).rejects.toThrow(
      "case unavailable",
    );
    await expect(
      service.act(other, record.id, "RECHECK", input),
    ).rejects.toThrow("case unavailable");
    const evidence = await withTenantRlsContext(
      actor.tenantId,
      actor.orgId,
      (tx) =>
        tx.financeStripeWebhookEvent.create({
          data: {
            tenantId: actor.tenantId,
            orgId: actor.orgId,
            stripeEventId: `evt_${randomUUID()}`,
            stripeAccountId: connection.stripeAccountId,
            livemode: true,
            eventType: "payment_intent.succeeded",
            payloadSha256: "a".repeat(64),
            payloadJson: {},
          },
        }),
    );
    await expect(
      service.act(actor, record.id, "REPLAY", {
        ...input,
        evidenceId: evidence.id,
      }),
    ).rejects.toThrow("Scoped evidence unavailable");
  });
  it("acknowledges separately from resolution and rejects stale provider versions", async () => {
    const { actor, record } = await fixture();
    const input = {
      requestId: randomUUID(),
      reason: "Reviewed synthetic evidence",
      expectedLastSeenAt: now.toISOString(),
    };
    await service.act(actor, record.id, "ACKNOWLEDGE", input);
    await withTenantRlsContext(actor.tenantId, actor.orgId, async (tx) => {
      expect(
        await tx.financeReconciliationCase.findUnique({
          where: { id: record.id },
        }),
      ).toMatchObject({ status: "ACKNOWLEDGED", resolvedAt: null });
      expect(
        await tx.financeReconciliationCaseEvent.findFirst({
          where: { caseId: record.id },
        }),
      ).toMatchObject({ type: "ACKNOWLEDGED", actorUserId: actor.userId });
      await tx.financeReconciliationCase.update({
        where: { id: record.id },
        data: { lastSeenAt: new Date(now.getTime() + 1000) },
      });
    });
    await expect(
      service.act(actor, record.id, "RECHECK", {
        ...input,
        requestId: randomUUID(),
      }),
    ).rejects.toThrow("Case changed");
  });
});
