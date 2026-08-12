import { randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext, type Prisma } from "@pathway/db";
import { isEncryptedField } from "@pathway/util";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import { OutboxService } from "../../common/outbox/outbox.service";
import { BehaviourCommandService } from "../behaviour-command.service";
import { BehaviourQueryService } from "../behaviour-query.service";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";

interface Fixture {
  orgId: string;
  tenantAId: string;
  tenantBId: string;
  actorAId: string;
  actorBId: string;
  orgRecorderId: string;
  childAId: string;
  childBId: string;
}

function permissions(allowed: boolean): EffectivePermissionsService {
  return {
    resolve: jest.fn().mockResolvedValue({
      allowed,
      reason: allowed ? "allowed" : "permission-missing",
      sourceRoleIds: allowed ? ["role-1"] : [],
    }),
  } as unknown as EffectivePermissionsService;
}

describe("ACE behaviour command database boundary", () => {
  let fixture: Fixture | undefined;
  let orgRecorderRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    fixture = {
      orgId: randomUUID(),
      tenantAId: randomUUID(),
      tenantBId: randomUUID(),
      actorAId: randomUUID(),
      actorBId: randomUUID(),
      orgRecorderId: randomUUID(),
      childAId: randomUUID(),
      childBId: randomUUID(),
    };
    await prisma.org.create({
      data: {
        id: fixture.orgId,
        name: `Behaviour command org ${fixture.orgId}`,
        slug: `behaviour-command-${fixture.orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: fixture.tenantAId,
          orgId: fixture.orgId,
          name: "Behaviour command site A",
          slug: `behaviour-command-${fixture.tenantAId}`,
          timezone: "Europe/London",
        },
        {
          id: fixture.tenantBId,
          orgId: fixture.orgId,
          name: "Behaviour command site B",
          slug: `behaviour-command-${fixture.tenantBId}`,
          timezone: "Europe/London",
        },
      ],
    });

    await seedSite(
      fixture.tenantAId,
      fixture.orgId,
      fixture.actorAId,
      fixture.childAId,
    );
    await seedSite(
      fixture.tenantBId,
      fixture.orgId,
      fixture.actorBId,
      fixture.childBId,
    );
    await seedE2eAuthUser({
      subject: `behaviour-org-recorder-${fixture.orgRecorderId}`,
      userId: fixture.orgRecorderId,
      orgId: fixture.orgId,
      orgRole: "ORG_MEMBER",
    });
    orgRecorderRole = await seedE2eTypedRole({
      orgId: fixture.orgId,
      userId: fixture.orgRecorderId,
      scope: "organisation",
      name: "Behaviour Recorder",
      permissionKeys: ["ace.behaviour.record"],
    });
  });

  afterAll(async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    await prisma.outboxEvent.deleteMany({ where: { orgId: fixture.orgId } });
    await prisma.auditEvent.deleteMany({
      where: { tenantId: { in: [fixture.tenantAId, fixture.tenantBId] } },
    });
    for (const tenantId of [fixture.tenantAId, fixture.tenantBId]) {
      await withTenantRlsContext(tenantId, fixture.orgId, async (tx) => {
        await tx.$executeRawUnsafe(
          "SET LOCAL session_replication_role = replica",
        );
        await tx.behaviourEntry.deleteMany({ where: { tenantId } });
        await tx.behaviourCategory.deleteMany({ where: { tenantId } });
        await tx.$executeRawUnsafe(
          "SET LOCAL session_replication_role = origin",
        );
      });
    }
    if (orgRecorderRole) {
      await clearE2eTypedRole(orgRecorderRole, fixture.orgId);
    }
    await clearE2eAuthAccess(fixture.orgRecorderId);
    await prisma.child.deleteMany({
      where: { tenantId: { in: [fixture.tenantAId, fixture.tenantBId] } },
    });
    await prisma.siteMembership.deleteMany({
      where: { userId: { in: [fixture.actorAId, fixture.actorBId] } },
    });
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [fixture.actorAId, fixture.actorBId, fixture.orgRecorderId],
        },
      },
    });
    await prisma.tenant.deleteMany({ where: { orgId: fixture.orgId } });
    await prisma.org.deleteMany({ where: { id: fixture.orgId } });
  });

  it("commits one fact, audit, and merit intent for concurrent command replay", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = new BehaviourCommandService(
      new OutboxService(),
      permissions(true),
    );
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgId,
      userId: fixture.actorAId,
    };
    const command = {
      idempotencyKey: randomUUID(),
      childId: fixture.childAId,
      category: "service",
      type: "MERIT" as const,
      visibility: "GENERAL" as const,
      pointsDelta: 3,
      occurredAt: "2026-08-12T09:30:00.000Z",
      reason: "Concurrent merit command",
      note: "Helped prepare the learning space",
    };

    const results = await Promise.all([
      service.record(command, actor),
      service.record(command, actor),
    ]);
    expect(new Set(results.map((result) => result.entry.id)).size).toBe(1);
    expect(results.filter((result) => result.duplicate)).toHaveLength(1);

    const counts = await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgId,
      async (tx) => ({
        facts: await tx.behaviourEntry.count({
          where: { tenantId: fixture!.tenantAId, category: "service" },
        }),
        audits: await tx.auditEvent.count({
          where: {
            tenantId: fixture!.tenantAId,
            entityId: results[0]!.entry.id,
          },
        }),
        intents: await tx.outboxEvent.count({
          where: {
            aggregateId: results[0]!.entry.id,
            eventType: "behaviour.merit-awarded",
          },
        }),
      }),
    );
    expect(counts).toEqual({ facts: 1, audits: 1, intents: 1 });

    const reversal = await service.correct(
      results[0]!.entry.id,
      {
        idempotencyKey: randomUUID(),
        childId: fixture.childAId,
        category: "pastoral",
        type: "GENERAL",
        visibility: "SENSITIVE",
        pointsDelta: 0,
        occurredAt: "2026-08-12T09:30:00.000Z",
        reason: "Merit was recorded against the wrong category",
      },
      actor,
    );
    const reversalIntent = await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgId,
      (tx) =>
        tx.outboxEvent.findFirstOrThrow({
          where: {
            aggregateId: reversal.entry.id,
            eventType: "behaviour.merit-awarded",
          },
          select: { payload: true },
        }),
    );
    expect(reversalIntent.payload).toEqual({
      behaviourEntryId: reversal.entry.id,
      childId: fixture.childAId,
      pointsDelta: -3,
      correctsBehaviourEntryId: results[0]!.entry.id,
    });
  });

  it("encrypts sensitive narrative at rest and filters it without the sensitive permission", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const sensitiveService = new BehaviourCommandService(
      new OutboxService(),
      permissions(true),
    );
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgId,
      userId: fixture.actorAId,
    };
    const plaintext = "Sensitive pastoral narrative";
    const created = await sensitiveService.record(
      {
        idempotencyKey: randomUUID(),
        childId: fixture.childAId,
        category: "pastoral",
        type: "GENERAL",
        visibility: "SENSITIVE",
        pointsDelta: 0,
        occurredAt: "2026-08-12T10:00:00.000Z",
        reason: "Pastoral context recorded",
        note: plaintext,
      },
      actor,
    );

    const stored = await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgId,
      async (tx) => {
        const [atRest] = await tx.$queryRaw<Array<{ note: string }>>`
          SELECT "note" FROM "BehaviourEntry" WHERE "id" = ${created.entry.id}
        `;
        const throughPrisma = await tx.behaviourEntry.findUniqueOrThrow({
          where: { id: created.entry.id },
          select: { note: true },
        });
        return { atRest: atRest?.note, throughPrisma: throughPrisma.note };
      },
    );
    expect(stored.atRest).not.toBe(plaintext);
    expect(isEncryptedField(stored.atRest ?? "")).toBe(true);
    expect(stored.throughPrisma).toBe(plaintext);

    const deniedQuery = new BehaviourQueryService(permissions(false));
    const allowedQuery = new BehaviourQueryService(permissions(true));
    const hidden = await deniedQuery.list(actor, { childId: fixture.childAId });
    expect(hidden.items.some((item) => item.id === created.entry.id)).toBe(
      false,
    );
    await expect(
      allowedQuery.list(actor, { childId: fixture.childAId }),
    ).resolves.toEqual({
      items: expect.arrayContaining([
        expect.objectContaining({ id: created.entry.id, note: plaintext }),
      ]),
    });
  });

  it("allows one concurrent immutable correction and returns only terminal facts", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = new BehaviourCommandService(
      new OutboxService(),
      permissions(true),
    );
    const query = new BehaviourQueryService(permissions(true));
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgId,
      userId: fixture.actorAId,
    };
    const original = await service.record(
      {
        idempotencyKey: randomUUID(),
        childId: fixture.childAId,
        category: "conduct",
        type: "DEMERIT",
        visibility: "GENERAL",
        pointsDelta: -2,
        occurredAt: "2026-08-12T11:00:00.000Z",
        reason: "Original conduct record",
      },
      actor,
    );
    const replacement = {
      childId: fixture.childAId,
      category: "conduct",
      type: "DEMERIT" as const,
      visibility: "GENERAL" as const,
      pointsDelta: -1,
      occurredAt: "2026-08-12T11:00:00.000Z",
      reason: "Corrected conduct points",
    };

    const results = await Promise.allSettled([
      service.correct(
        original.entry.id,
        {
          ...replacement,
          idempotencyKey: randomUUID(),
        },
        actor,
      ),
      service.correct(
        original.entry.id,
        {
          ...replacement,
          idempotencyKey: randomUUID(),
        },
        actor,
      ),
    ]);
    expect(
      results.filter((result) => result.status === "fulfilled"),
    ).toHaveLength(1);
    expect(
      results.filter((result) => result.status === "rejected"),
    ).toHaveLength(1);

    const listed = await query.list(actor, {
      childId: fixture.childAId,
      type: "DEMERIT",
    });
    expect(listed.items).toEqual([
      expect.objectContaining({
        pointsDelta: -1,
        correctsBehaviourEntryId: original.entry.id,
        categoryPolicyVersion: 1,
        categoryIsSerious: true,
      }),
    ]);
  });

  it("accepts an organisation-scoped behaviour recorder and keeps tenant scope forced", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = new BehaviourCommandService(
      new OutboxService(),
      permissions(true),
    );
    await expect(
      service.record(
        {
          idempotencyKey: randomUUID(),
          childId: fixture.childAId,
          category: "service",
          type: "MERIT",
          visibility: "GENERAL",
          pointsDelta: 1,
          occurredAt: "2026-08-12T12:00:00.000Z",
          reason: "Organisation recorder fixture",
        },
        {
          tenantId: fixture.tenantAId,
          orgId: fixture.orgId,
          userId: fixture.orgRecorderId,
        },
      ),
    ).resolves.toMatchObject({
      entry: { recordedByUserId: fixture.orgRecorderId },
    });

    const crossTenantCount = await withBehaviourRlsContext(
      fixture.tenantBId,
      fixture.orgId,
      (tx) =>
        tx.behaviourEntry.count({ where: { tenantId: fixture!.tenantAId } }),
    );
    expect(crossTenantCount).toBe(0);

    const [catalog] = await prisma.$queryRaw<
      Array<{
        rowSecurity: boolean;
        forceRowSecurity: boolean;
        immutableTrigger: boolean;
      }>
    >`
      SELECT
        cls.relrowsecurity AS "rowSecurity",
        cls.relforcerowsecurity AS "forceRowSecurity",
        EXISTS (
          SELECT 1 FROM pg_catalog.pg_trigger trigger
          WHERE trigger.tgrelid = cls.oid
            AND trigger.tgname = 'BehaviourEntry_immutable'
            AND NOT trigger.tgisinternal
        ) AS "immutableTrigger"
      FROM pg_catalog.pg_class cls
      WHERE cls.oid = '"BehaviourEntry"'::regclass
    `;
    expect(catalog).toEqual({
      rowSecurity: true,
      forceRowSecurity: true,
      immutableTrigger: true,
    });
  });
});

async function withBehaviourRlsContext<T>(
  tenantId: string,
  orgId: string,
  callback: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  return withTenantRlsContext(tenantId, orgId, async (tx) => {
    if (process.env.E2E_USE_GLOBAL_SETUP === "true") {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);
    }

    return callback(tx);
  });
}

async function seedSite(
  tenantId: string,
  orgId: string,
  actorId: string,
  childId: string,
): Promise<void> {
  await withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.user.create({
      data: {
        id: actorId,
        tenantId,
        email: `${actorId}@example.test`,
      },
    });
    await tx.siteMembership.create({ data: { tenantId, userId: actorId } });
    await tx.child.create({
      data: {
        id: childId,
        tenantId,
        firstName: "Behaviour",
        lastName: "Learner",
      },
    });
    await tx.behaviourCategory.createMany({
      data: [
        {
          tenantId,
          policyVersion: 1,
          code: "service",
          label: "Service",
          type: "MERIT",
          visibility: "GENERAL",
          isActive: true,
          isSerious: false,
          sortOrder: 1,
          createdByUserId: actorId,
          reason: "Behaviour command fixture",
        },
        {
          tenantId,
          policyVersion: 1,
          code: "pastoral",
          label: "Pastoral",
          type: "GENERAL",
          visibility: "SENSITIVE",
          isActive: true,
          isSerious: false,
          sortOrder: 2,
          createdByUserId: actorId,
          reason: "Behaviour command fixture",
        },
        {
          tenantId,
          policyVersion: 1,
          code: "conduct",
          label: "Conduct",
          type: "DEMERIT",
          visibility: "GENERAL",
          isActive: true,
          isSerious: true,
          sortOrder: 3,
          createdByUserId: actorId,
          reason: "Behaviour command fixture",
        },
      ],
    });
  });
}
