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
import { withSystemRoleFixtureWrites } from "../../access-control/tests/system-role-fixture";
import { OutboxService } from "../../common/outbox/outbox.service";
import type { MailerService } from "../../mailer/mailer.service";
import { BehaviourCommandService } from "../behaviour-command.service";
import { BehaviourBatchService } from "../behaviour-batch.service";
import { behaviourBatchFactKeyHash } from "../behaviour-entry.support";
import { BehaviourQueryService } from "../behaviour-query.service";
import { BehaviourRetractionService } from "../behaviour-retraction.service";
import { DemeritEscalationService } from "../demerit-escalation.service";
import { findActiveReviewers } from "../behaviour-review-access";

const TENANT_RLS_ROLE = "pathway_e2e_tenant_rls";

interface Fixture {
  orgId: string;
  tenantAId: string;
  tenantBId: string;
  actorAId: string;
  actorBId: string;
  guardianBId: string;
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

function commandService(allowed = true): BehaviourCommandService {
  return behaviourRuntime(allowed).command;
}

function batchService(allowed = true): BehaviourBatchService {
  return new BehaviourBatchService(
    commandService(allowed),
    permissions(allowed),
  );
}

function behaviourRuntime(
  allowed = true,
  mailer: MailerService = {
    sendBehaviourNotification: jest.fn().mockResolvedValue(undefined),
  } as unknown as MailerService,
): {
  command: BehaviourCommandService;
  escalation: DemeritEscalationService;
} {
  const outbox = new OutboxService();
  const escalation = new DemeritEscalationService(outbox, mailer);
  return {
    command: new BehaviourCommandService(
      outbox,
      permissions(allowed),
      escalation,
    ),
    escalation,
  };
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
      guardianBId: randomUUID(),
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
    await seedGuardianRelationship(
      fixture.tenantBId,
      fixture.orgId,
      fixture.guardianBId,
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
        await tx.behaviourReviewRequest.deleteMany({ where: { tenantId } });
        await tx.behaviourEntryRetraction.deleteMany({ where: { tenantId } });
        await tx.behaviourEntry.deleteMany({ where: { tenantId } });
        await tx.behaviourCategory.deleteMany({ where: { tenantId } });
        await tx.demeritPolicy.deleteMany({ where: { tenantId } });
        await tx.guardianChildRelationship.deleteMany({ where: { tenantId } });
        await tx.guardianIdentity.deleteMany({ where: { tenantId } });
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
          in: [
            fixture.actorAId,
            fixture.actorBId,
            fixture.guardianBId,
            fixture.orgRecorderId,
          ],
        },
      },
    });
    await prisma.tenant.deleteMany({ where: { orgId: fixture.orgId } });
    await prisma.org.deleteMany({ where: { id: fixture.orgId } });
  });

  it("finds an active organisation Head with no legacy site id and respects revocation", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const roleId = randomUUID();
    const assignmentId = randomUUID();
    const now = new Date();
    await withSystemRoleFixtureWrites((tx) =>
      tx.orgRoleDefinition.create({
        data: {
          id: roleId,
          orgId: fixture!.orgId,
          tenantId: null,
          name: "Organisation Head",
          scope: "organisation",
          isSystem: true,
          createdById: fixture!.actorAId,
          updatedById: fixture!.actorAId,
        },
      }),
    );
    await withTenantRlsContext(fixture.tenantAId, fixture.orgId, (tx) =>
      tx.userRoleAssignment.create({
        data: {
          id: assignmentId,
          orgId: fixture!.orgId,
          tenantId: null,
          userId: fixture!.orgRecorderId,
          roleDefinitionId: roleId,
          assignedById: fixture!.actorAId,
          startsAt: new Date(now.getTime() - 1_000),
        },
      }),
    );
    try {
      const legacySiteId = await prisma.user.findUniqueOrThrow({
        where: { id: fixture.orgRecorderId },
        select: { tenantId: true },
      });
      expect(legacySiteId.tenantId).toBeNull();
      const headIds = await withTenantRlsContext(
        fixture.tenantAId,
        fixture.orgId,
        (tx) =>
          findActiveReviewers(
            tx,
            { tenantId: fixture!.tenantAId, orgId: fixture!.orgId },
            "HEAD",
            now,
          ),
      );
      expect(headIds).toContain(fixture.orgRecorderId);

      await withTenantRlsContext(fixture.tenantAId, fixture.orgId, (tx) =>
        tx.userRoleAssignment.update({
          where: { id: assignmentId },
          data: { revokedAt: now, revokedById: fixture!.actorAId },
        }),
      );
      const revokedIds = await withTenantRlsContext(
        fixture.tenantAId,
        fixture.orgId,
        (tx) =>
          findActiveReviewers(
            tx,
            { tenantId: fixture!.tenantAId, orgId: fixture!.orgId },
            "HEAD",
            new Date(now.getTime() + 1_000),
          ),
      );
      expect(revokedIds).not.toContain(fixture.orgRecorderId);
    } finally {
      await prisma.userRoleAssignment.deleteMany({
        where: { id: assignmentId },
      });
      await withSystemRoleFixtureWrites((tx) =>
        tx.orgRoleDefinition.deleteMany({ where: { id: roleId } }),
      );
    }
  });

  it("commits one fact, audit, and merit intent for concurrent command replay", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = commandService();
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
      tenantId: fixture.tenantAId,
      orgId: fixture.orgId,
      pointsDelta: -3,
      correctsBehaviourEntryId: results[0]!.entry.id,
    });
  });

  it("records an atomic multi-learner batch with quantities and replays it once", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const secondChildId = randomUUID();
    await withTenantRlsContext(fixture.tenantAId, fixture.orgId, (tx) =>
      tx.child.create({
        data: {
          id: secondChildId,
          tenantId: fixture!.tenantAId,
          firstName: "Second",
          lastName: "Learner",
        },
      }),
    );
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgId,
      userId: fixture.actorAId,
    };
    const batch = {
      idempotencyKey: randomUUID(),
      childIds: [fixture.childAId, secondChildId],
      occurredAt: "2026-08-12T09:30:00.000Z",
      entries: [
        {
          category: "service",
          type: "MERIT" as const,
          visibility: "GENERAL" as const,
          pointsDelta: 2,
          reason: "Helped a peer",
          quantity: 2,
        },
        {
          category: "pastoral",
          type: "GENERAL" as const,
          visibility: "SENSITIVE" as const,
          pointsDelta: 0,
          reason: "Pastoral check in",
          quantity: 1,
        },
      ],
    };
    const service = batchService();
    const results = await Promise.all([
      service.record(batch, actor),
      service.record(batch, actor),
    ]);
    const created = results.find((result) => !result.duplicate);
    const replay = results.find((result) => result.duplicate);
    expect(created).toBeDefined();
    expect(replay).toBeDefined();
    if (!created || !replay) throw new Error("Expected one batch replay");
    expect(created.duplicate).toBe(false);
    expect(created.entries).toHaveLength(6);
    expect(created.entries.map((entry) => entry.childId)).toEqual([
      fixture.childAId,
      fixture.childAId,
      fixture.childAId,
      secondChildId,
      secondChildId,
      secondChildId,
    ]);
    expect(replay).toEqual({ entries: created.entries, duplicate: true });
    const counts = await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgId,
      async (tx) => ({
        facts: await tx.behaviourEntry.count({
          where: {
            tenantId: fixture!.tenantAId,
            clientCommandKeyHash: {
              in: created.entries.map((_, index) =>
                behaviourBatchFactKeyHash(
                  fixture!.tenantAId,
                  batch.idempotencyKey,
                  index,
                ),
              ),
            },
          },
        }),
        audits: await tx.auditEvent.count({
          where: { entityId: { in: created.entries.map((entry) => entry.id) } },
        }),
        merits: await tx.outboxEvent.count({
          where: {
            aggregateId: { in: created.entries.map((entry) => entry.id) },
            eventType: "behaviour.merit-awarded",
          },
        }),
      }),
    );
    expect(counts).toEqual({ facts: 6, audits: 6, merits: 4 });
    await expect(
      service.record(
        { ...batch, entries: [{ ...batch.entries[0]!, quantity: 1 }] },
        actor,
      ),
    ).rejects.toHaveProperty("status", 409);
  });

  it("rolls back the whole batch on a bad row or cross-site learner", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgId,
      userId: fixture.actorAId,
    };
    const batch = {
      idempotencyKey: randomUUID(),
      childIds: [fixture.childAId],
      occurredAt: "2026-08-12T09:30:00.000Z",
      entries: [
        {
          category: "service",
          type: "MERIT" as const,
          visibility: "GENERAL" as const,
          pointsDelta: 2,
          reason: "Helped a peer",
          quantity: 1,
        },
        {
          category: "missing-category",
          type: "MERIT" as const,
          visibility: "GENERAL" as const,
          pointsDelta: 2,
          reason: "Invalid row",
          quantity: 1,
        },
      ],
    };
    const service = batchService();
    await expect(service.record(batch, actor)).rejects.toHaveProperty(
      "status",
      404,
    );
    const firstKey = behaviourBatchFactKeyHash(
      fixture.tenantAId,
      batch.idempotencyKey,
      0,
    );
    expect(
      await withTenantRlsContext(fixture.tenantAId, fixture.orgId, (tx) =>
        tx.behaviourEntry.count({
          where: {
            tenantId: fixture!.tenantAId,
            clientCommandKeyHash: firstKey,
          },
        }),
      ),
    ).toBe(0);
    await expect(
      service.record(
        { ...batch, childIds: [fixture.childAId, fixture.childBId] },
        actor,
      ),
    ).rejects.toHaveProperty("status", 404);
    const corrected = await service.record(
      { ...batch, entries: [batch.entries[0]!] },
      actor,
    );
    expect(corrected.entries).toHaveLength(1);
  });

  it("requires sensitive access for creation and replay of a sensitive batch", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgId,
      userId: fixture.actorAId,
    };
    const batch = {
      idempotencyKey: randomUUID(),
      childIds: [fixture.childAId],
      occurredAt: "2026-08-12T09:30:00.000Z",
      entries: [
        {
          category: "pastoral",
          type: "GENERAL" as const,
          visibility: "SENSITIVE" as const,
          pointsDelta: 0,
          reason: "Pastoral check in",
          quantity: 1,
        },
      ],
    };
    await expect(
      batchService(false).record(batch, actor),
    ).rejects.toHaveProperty("status", 403);
    const created = await batchService(true).record(batch, actor);
    expect(created.entries).toHaveLength(1);
    await expect(
      batchService(false).record(batch, actor),
    ).rejects.toHaveProperty("status", 403);
  });

  it("accepts the 50-fact boundary in one transaction", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const result = await batchService().record(
      {
        idempotencyKey: randomUUID(),
        childIds: [fixture.childAId],
        occurredAt: "2026-08-12T09:30:00.000Z",
        entries: [
          {
            category: "service",
            type: "MERIT",
            visibility: "GENERAL",
            pointsDelta: 1,
            reason: "Supported classmates",
            quantity: 50,
          },
        ],
      },
      {
        tenantId: fixture.tenantAId,
        orgId: fixture.orgId,
        userId: fixture.actorAId,
      },
    );
    expect(result.entries).toHaveLength(50);
    expect(new Set(result.entries.map((entry) => entry.id)).size).toBe(50);
  });

  it("applies demerit escalation across repeated rows in a batch", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const childId = randomUUID();
    await withTenantRlsContext(fixture.tenantAId, fixture.orgId, (tx) =>
      tx.child.create({
        data: {
          id: childId,
          tenantId: fixture!.tenantAId,
          firstName: "Demerit",
          lastName: "Learner",
        },
      }),
    );
    const created = await batchService().record(
      {
        idempotencyKey: randomUUID(),
        childIds: [childId],
        occurredAt: "2026-08-12T09:30:00.000Z",
        entries: [
          {
            category: "routine",
            type: "DEMERIT",
            visibility: "GENERAL",
            pointsDelta: -1,
            reason: "Repeated disruption",
            note: "Three separate incidents in the lesson",
            quantity: 3,
          },
        ],
      },
      {
        tenantId: fixture.tenantAId,
        orgId: fixture.orgId,
        userId: fixture.actorAId,
      },
    );
    expect(created.entries).toHaveLength(3);
    const reviewCount = await withTenantRlsContext(
      fixture.tenantAId,
      fixture.orgId,
      (tx) =>
        tx.behaviourReviewRequest.count({
          where: { tenantId: fixture!.tenantAId, childId },
        }),
    );
    expect(reviewCount).toBe(1);
  });

  it("keeps the committed fact and pending intent when notification delivery fails", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const mailer = {
      sendBehaviourNotification: jest
        .fn()
        .mockRejectedValue(new Error("provider unavailable")),
    } as unknown as MailerService;
    const runtime = behaviourRuntime(true, mailer);
    const actor = {
      tenantId: fixture.tenantBId,
      orgId: fixture.orgId,
      userId: fixture.actorBId,
    };
    await runtime.command.record(
      {
        idempotencyKey: randomUUID(),
        childId: fixture.childBId,
        category: "routine",
        type: "DEMERIT",
        visibility: "GENERAL",
        pointsDelta: -5,
        occurredAt: "2026-08-12T09:00:00.000Z",
        reason: "Initial cumulative demerit",
      },
      actor,
    );
    const created = await runtime.command.record(
      {
        idempotencyKey: randomUUID(),
        childId: fixture.childBId,
        category: "routine",
        type: "DEMERIT",
        visibility: "GENERAL",
        pointsDelta: -1,
        occurredAt: "2026-08-12T10:00:00.000Z",
        reason: "Crossed guardian notification threshold",
      },
      actor,
    );
    const intent = await withTenantRlsContext(
      fixture.tenantBId,
      fixture.orgId,
      (tx) =>
        tx.outboxEvent.findFirstOrThrow({
          where: {
            aggregateId: created.entry.id,
            eventType: "behaviour.guardian-notification.requested",
          },
          select: {
            aggregateType: true,
            aggregateId: true,
            eventType: true,
            payload: true,
            idempotencyKey: true,
          },
        }),
    );

    await expect(runtime.escalation.dispatch(intent)).rejects.toThrow(
      "provider unavailable",
    );

    const persisted = await withTenantRlsContext(
      fixture.tenantBId,
      fixture.orgId,
      async (tx) => ({
        fact: await tx.behaviourEntry.findUnique({
          where: { id: created.entry.id },
          select: { id: true },
        }),
        outbox: await tx.outboxEvent.findFirst({
          where: { idempotencyKey: intent.idempotencyKey },
          select: { status: true },
        }),
      }),
    );
    expect(persisted).toEqual({
      fact: { id: created.entry.id },
      outbox: { status: "PENDING" },
    });
  });

  it("encrypts sensitive narrative at rest and filters it without the sensitive permission", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const sensitiveService = commandService();
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
      canVoid: false,
      items: expect.arrayContaining([
        expect.objectContaining({ id: created.entry.id, note: plaintext }),
      ]),
    });
  });

  it("allows one concurrent immutable correction and returns only terminal facts", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = commandService();
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
        note: "Required serious conduct context",
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
      note: "Required corrected conduct context",
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

  it("voids a merit once, keeps its audit trail, and hides it across tenant boundaries", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const actor = {
      tenantId: fixture.tenantAId,
      orgId: fixture.orgId,
      userId: fixture.actorAId,
    };
    const roleId = randomUUID();
    const assignmentId = randomUUID();
    await prisma.orgMembership.create({
      data: { orgId: actor.orgId, userId: actor.userId, role: "ORG_MEMBER" },
    });
    await withSystemRoleFixtureWrites((tx) =>
      tx.orgRoleDefinition.create({
        data: {
          id: roleId,
          orgId: fixture!.orgId,
          tenantId: fixture!.tenantAId,
          name: "Site Lead",
          scope: "site",
          isSystem: true,
          createdById: actor.userId,
          updatedById: actor.userId,
        },
      }),
    );
    await withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
      tx.userRoleAssignment.create({
        data: {
          id: assignmentId,
          orgId: actor.orgId,
          tenantId: actor.tenantId,
          userId: actor.userId,
          roleDefinitionId: roleId,
          assignedById: actor.userId,
          startsAt: new Date(Date.now() - 1_000),
        },
      }),
    );
    try {
      const created = await commandService().record(
        {
          idempotencyKey: randomUUID(),
          childId: fixture.childAId,
          category: "service",
          type: "MERIT",
          visibility: "GENERAL",
          pointsDelta: 2,
          occurredAt: "2026-08-12T13:00:00.000Z",
          reason: "Merit to void",
        },
        actor,
      );
      const service = new BehaviourRetractionService(
        permissions(true),
        new OutboxService(),
      );
      const command = {
        idempotencyKey: randomUUID(),
        reason: "Recorded against the wrong event",
      };
      const first = await service.retract(created.entry.id, command, actor);
      const replay = await service.retract(created.entry.id, command, actor);
      expect(first.duplicate).toBe(false);
      expect(replay).toMatchObject({ id: first.id, duplicate: true });

      const evidence = await withTenantRlsContext(
        actor.tenantId,
        actor.orgId,
        async (tx) => ({
          retraction: await tx.behaviourEntryRetraction.findUniqueOrThrow({
            where: { id: first.id },
          }),
          auditCount: await tx.auditEvent.count({
            where: {
              tenantId: actor.tenantId,
              entityId: created.entry.id,
            },
          }),
          adjustments: await tx.outboxEvent.findMany({
            where: { aggregateId: first.id },
            select: { payload: true },
          }),
        }),
      );
      expect(evidence.retraction.reason).toBe(command.reason);
      expect(evidence.auditCount).toBe(2);
      expect(evidence.adjustments).toEqual([
        { payload: expect.objectContaining({ pointsDelta: -2 }) },
      ]);
      const history = await new BehaviourQueryService(permissions(true)).list(
        actor,
        { childId: fixture.childAId },
      );
      expect(history.items.some((item) => item.id === created.entry.id)).toBe(
        false,
      );
      const crossTenantCount = await withBehaviourRlsContext(
        fixture.tenantBId,
        fixture.orgId,
        (tx) =>
          tx.behaviourEntryRetraction.count({
            where: { tenantId: fixture!.tenantAId },
          }),
      );
      expect(crossTenantCount).toBe(0);
    } finally {
      await prisma.userRoleAssignment.deleteMany({
        where: { id: assignmentId },
      });
      await withSystemRoleFixtureWrites((tx) =>
        tx.orgRoleDefinition.deleteMany({ where: { id: roleId } }),
      );
      await prisma.orgMembership.deleteMany({
        where: { orgId: actor.orgId, userId: actor.userId },
      });
    }
  });

  it("accepts an organisation-scoped behaviour recorder and keeps tenant scope forced", async () => {
    if (!isDatabaseAvailable() || !fixture) return;
    const service = commandService();
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
    await tx.$executeRawUnsafe(`SET LOCAL ROLE "${TENANT_RLS_ROLE}"`);

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
          code: "routine",
          label: "Routine",
          type: "DEMERIT",
          visibility: "GENERAL",
          isActive: true,
          isSerious: false,
          sortOrder: 4,
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
    await tx.demeritPolicy.create({
      data: {
        tenantId,
        version: 1,
        windowDays: 30,
        stageOneThreshold: 3,
        stageTwoThreshold: 6,
        stageThreeThreshold: 10,
        seriousMisconductStage: 3,
        effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
        createdByUserId: actorId,
        reason: "Behaviour command fixture",
      },
    });
  });
}

async function seedGuardianRelationship(
  tenantId: string,
  orgId: string,
  guardianUserId: string,
  childId: string,
): Promise<void> {
  await withTenantRlsContext(tenantId, orgId, async (tx) => {
    await tx.user.create({
      data: {
        id: guardianUserId,
        tenantId,
        email: `${guardianUserId}@example.test`,
      },
    });
    const identity = await tx.guardianIdentity.create({
      data: { tenantId, userId: guardianUserId },
      select: { id: true },
    });
    await tx.guardianChildRelationship.create({
      data: {
        tenantId,
        childId,
        guardianIdentityId: identity.id,
        legalAccess: "FULL",
      },
    });
  });
}
