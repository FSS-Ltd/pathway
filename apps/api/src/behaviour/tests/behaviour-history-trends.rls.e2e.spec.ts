import { createHash, randomUUID } from "node:crypto";
import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  isDatabaseAvailable,
  requireDatabase,
} from "../../../test-helpers.e2e";
import type { EffectivePermissionsService } from "../../access-control/effective-permissions.service";
import type { BehaviourActor } from "../behaviour-command.service";
import { BehaviourQueryService } from "../behaviour-query.service";
import { BehaviourTrendsService } from "../behaviour-trends.service";
import {
  behaviourHistoryCursorScope,
  decodeBehaviourHistoryCursor,
} from "../behaviour-history-cursor";

interface Fixture {
  orgId: string;
  siteA: BehaviourActor;
  siteB: BehaviourActor;
  childAId: string;
  childBId: string;
  originalMeritId: string;
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

describe("ACE behaviour history and trends database boundary", () => {
  let fixture: Fixture | undefined;
  const previousSigningKey = process.env.INTERNAL_AUTH_SECRET;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    process.env.INTERNAL_AUTH_SECRET = "behaviour-history-e2e-signing-key";
    const orgId = randomUUID();
    const siteA = { tenantId: randomUUID(), orgId, userId: randomUUID() };
    const siteB = { tenantId: randomUUID(), orgId, userId: randomUUID() };
    const childAId = randomUUID();
    const childBId = randomUUID();
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Behaviour trends ${orgId}`,
        slug: `behaviour-trends-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteA, siteB].map((actor) => ({
        id: actor.tenantId,
        orgId,
        name: `Behaviour trends ${actor.tenantId}`,
        slug: `behaviour-trends-${actor.tenantId}`,
        timezone: "Europe/London",
      })),
    });
    for (const [actor, childId] of [
      [siteA, childAId],
      [siteB, childBId],
    ] as const) {
      await withTenantRlsContext(actor.tenantId, orgId, async (tx) => {
        await tx.user.create({
          data: {
            id: actor.userId,
            tenantId: actor.tenantId,
            email: `${actor.userId}@example.test`,
          },
        });
        await tx.siteMembership.create({
          data: { tenantId: actor.tenantId, userId: actor.userId },
        });
        await tx.child.create({
          data: {
            id: childId,
            tenantId: actor.tenantId,
            firstName: "Trend",
            lastName: "Learner",
          },
        });
      });
    }
    const originalMeritId = await createFact(siteA, childAId, {
      type: "MERIT",
      pointsDelta: 3,
      occurredAt: "2026-03-29T00:30:00.000Z",
    });
    await createFact(siteA, childAId, {
      type: "MERIT",
      pointsDelta: 5,
      occurredAt: "2026-03-29T01:30:00.000Z",
      correctsBehaviourEntryId: originalMeritId,
    });
    const retractedId = await createFact(siteA, childAId, {
      type: "DEMERIT",
      pointsDelta: -2,
      occurredAt: "2026-03-29T22:30:00.000Z",
    });
    await withTenantRlsContext(siteA.tenantId, orgId, (tx) =>
      tx.behaviourEntryRetraction.create({
        data: {
          tenantId: siteA.tenantId,
          childId: childAId,
          entryId: retractedId,
          reason: "Entered in error",
          retractedByUserId: siteA.userId,
          clientCommandKeyHash: createHash("sha256")
            .update(randomUUID())
            .digest("hex"),
          commandFingerprint: createHash("sha256")
            .update(randomUUID())
            .digest("hex"),
        },
      }),
    );
    await createFact(siteA, childAId, {
      type: "GENERAL",
      pointsDelta: 0,
      visibility: "SENSITIVE",
      occurredAt: "2026-03-29T00:45:00.000Z",
    });
    await createFact(siteA, childAId, {
      type: "GENERAL",
      pointsDelta: 0,
      occurredAt: "2026-03-29T22:00:00.000Z",
    });
    await createFact(siteA, childAId, {
      type: "MERIT",
      pointsDelta: 1,
      occurredAt: "2026-03-28T23:30:00.000Z",
    });
    await createFact(siteA, childAId, {
      type: "MERIT",
      pointsDelta: 2,
      occurredAt: "2026-03-29T23:30:00.000Z",
    });
    await createFact(siteA, childAId, {
      type: "MERIT",
      pointsDelta: 1,
      occurredAt: "2026-10-25T00:30:00.000Z",
    });
    await createFact(siteA, childAId, {
      type: "GENERAL",
      pointsDelta: 0,
      occurredAt: "2026-10-25T01:30:00.000Z",
    });
    await createFact(siteB, childBId, {
      type: "MERIT",
      pointsDelta: 99,
      occurredAt: "2026-03-29T12:00:00.000Z",
    });
    fixture = { orgId, siteA, siteB, childAId, childBId, originalMeritId };
  });

  afterAll(async () => {
    if (previousSigningKey === undefined)
      delete process.env.INTERNAL_AUTH_SECRET;
    else process.env.INTERNAL_AUTH_SECRET = previousSigningKey;
    if (!isDatabaseAvailable() || !fixture) return;
    for (const actor of [fixture.siteA, fixture.siteB]) {
      await withTenantRlsContext(actor.tenantId, fixture.orgId, async (tx) => {
        await tx.$executeRawUnsafe(
          "SET LOCAL session_replication_role = replica",
        );
        await tx.behaviourEntryRetraction.deleteMany({
          where: { tenantId: actor.tenantId },
        });
        await tx.behaviourEntry.deleteMany({
          where: { tenantId: actor.tenantId },
        });
        await tx.$executeRawUnsafe(
          "SET LOCAL session_replication_role = origin",
        );
      });
    }
    await prisma.child.deleteMany({
      where: {
        tenantId: { in: [fixture.siteA.tenantId, fixture.siteB.tenantId] },
      },
    });
    await prisma.siteMembership.deleteMany({
      where: { userId: { in: [fixture.siteA.userId, fixture.siteB.userId] } },
    });
    await prisma.user.deleteMany({
      where: { id: { in: [fixture.siteA.userId, fixture.siteB.userId] } },
    });
    await prisma.tenant.deleteMany({ where: { orgId: fixture.orgId } });
    await prisma.org.deleteMany({ where: { id: fixture.orgId } });
  });

  it("uses site-local day bounds across the spring daylight-saving change", async () => {
    if (!fixture) return;
    const service = new BehaviourTrendsService(permissions(true));
    const result = await service.get(fixture.siteA, {
      from: "2026-03-29",
      to: "2026-03-30",
      bucket: "daily",
      visibility: "ALL",
    });
    expect(result.items).toEqual([
      {
        bucketStart: "2026-03-29",
        totalCount: 3,
        meritCount: 1,
        demeritCount: 0,
        generalCount: 2,
        meritPoints: 5,
        demeritPoints: 0,
        netPoints: 5,
      },
      {
        bucketStart: "2026-03-30",
        totalCount: 1,
        meritCount: 1,
        demeritCount: 0,
        generalCount: 0,
        meritPoints: 2,
        demeritPoints: 0,
        netPoints: 2,
      },
    ]);
    expect(result.totals.totalCount).toBe(4);
    expect(JSON.stringify(result)).not.toContain("Learner");
  });

  it("returns aligned weekly and monthly buckets with empty periods", async () => {
    if (!fixture) return;
    const service = new BehaviourTrendsService(permissions(true));
    const weekly = await service.get(fixture.siteA, {
      from: "2026-03-28",
      to: "2026-04-02",
      bucket: "weekly",
      visibility: "GENERAL",
    });
    expect(
      weekly.items.map((item) => [item.bucketStart, item.totalCount]),
    ).toEqual([
      ["2026-03-23", 3],
      ["2026-03-30", 1],
    ]);
    const monthly = await service.get(fixture.siteA, {
      from: "2026-03-29",
      to: "2026-04-02",
      bucket: "monthly",
      visibility: "GENERAL",
    });
    expect(
      monthly.items.map((item) => [item.bucketStart, item.totalCount]),
    ).toEqual([
      ["2026-03-01", 3],
      ["2026-04-01", 0],
    ]);
  });

  it("counts both repeated local hours on the autumn daylight-saving change", async () => {
    if (!fixture) return;
    const result = await new BehaviourTrendsService(permissions(true)).get(
      fixture.siteA,
      {
        from: "2026-10-25",
        to: "2026-10-25",
        bucket: "daily",
        visibility: "GENERAL",
      },
    );
    expect(result.totals).toMatchObject({
      totalCount: 2,
      meritCount: 1,
      generalCount: 1,
      meritPoints: 1,
    });
  });

  it("denies sensitive and combined totals without sensitive-read permission", async () => {
    if (!fixture) return;
    const service = new BehaviourTrendsService(permissions(false));
    for (const visibility of ["SENSITIVE", "ALL"] as const) {
      await expect(
        service.get(fixture.siteA, {
          from: "2026-03-29",
          to: "2026-03-29",
          bucket: "daily",
          visibility,
        }),
      ).rejects.toHaveProperty("status", 403);
    }
    const general = await service.get(fixture.siteA, {
      from: "2026-03-29",
      to: "2026-03-29",
      bucket: "daily",
      visibility: "GENERAL",
    });
    expect(general.totals.totalCount).toBe(2);
    const otherSite = await new BehaviourTrendsService(permissions(true)).get(
      fixture.siteB,
      {
        from: "2026-03-29",
        to: "2026-03-29",
        bucket: "daily",
        visibility: "ALL",
      },
    );
    expect(otherSite.totals).toMatchObject({
      totalCount: 1,
      meritPoints: 99,
    });
    expect(general.totals.meritPoints).toBe(5);
  });

  it("keeps history pages stable under backdated inserts and binds cursors to filters", async () => {
    if (!fixture) return;
    const service = new BehaviourQueryService(permissions(true));
    const query = { visibility: "ALL" as const, limit: 1 };
    const first = await service.list(fixture.siteA, query);
    expect(first.items).toHaveLength(1);
    expect(first.nextCursor).toEqual(expect.any(String));
    const firstCursor = first.nextCursor;
    if (!firstCursor) throw new Error("Expected a second history page");
    const scope = behaviourHistoryCursorScope(fixture.siteA, query, true);
    const position = decodeBehaviourHistoryCursor(firstCursor, scope);
    const insertedId = await createFact(fixture.siteA, fixture.childAId, {
      type: "MERIT",
      pointsDelta: 4,
      occurredAt: "2026-03-29T23:00:00.000Z",
      createdAt: new Date(position.snapshotAt.getTime() + 1_000),
    });
    const seen = new Set(first.items.map((item) => item.id));
    let cursor: string | null = firstCursor;
    while (cursor) {
      const page = await service.list(fixture.siteA, { ...query, cursor });
      for (const item of page.items) {
        expect(seen.has(item.id)).toBe(false);
        seen.add(item.id);
      }
      cursor = page.nextCursor;
    }
    expect(seen.has(insertedId)).toBe(false);
    expect(seen.has(fixture.originalMeritId)).toBe(false);
    await expect(
      service.list(fixture.siteA, {
        ...query,
        visibility: "GENERAL",
        cursor: firstCursor,
      }),
    ).rejects.toHaveProperty("status", 400);
    await expect(
      new BehaviourQueryService(permissions(false)).list(fixture.siteA, {
        ...query,
        cursor: firstCursor,
      }),
    ).rejects.toHaveProperty("status", 400);
    await expect(
      service.list(fixture.siteB, { ...query, cursor: firstCursor }),
    ).rejects.toHaveProperty("status", 400);
    await expect(
      service.list(fixture.siteA, {
        ...query,
        cursor: `A${firstCursor.slice(1)}`,
      }),
    ).rejects.toHaveProperty("status", 400);
    await expect(
      new BehaviourQueryService(permissions(false)).list(fixture.siteA, {
        visibility: "SENSITIVE",
      }),
    ).rejects.toHaveProperty("status", 403);
    const generalHistory = await new BehaviourQueryService(
      permissions(false),
    ).list(fixture.siteA, { visibility: "GENERAL" });
    expect(
      generalHistory.items.every((item) => item.visibility === "GENERAL"),
    ).toBe(true);
  });
});

async function createFact(
  actor: BehaviourActor,
  childId: string,
  input: {
    type: "MERIT" | "DEMERIT" | "GENERAL";
    pointsDelta: number;
    occurredAt: string;
    visibility?: "GENERAL" | "SENSITIVE";
    correctsBehaviourEntryId?: string;
    createdAt?: Date;
  },
): Promise<string> {
  const entry = await withTenantRlsContext(actor.tenantId, actor.orgId, (tx) =>
    tx.behaviourEntry.create({
      data: {
        tenantId: actor.tenantId,
        childId,
        category: "fixture",
        type: input.type,
        visibility: input.visibility ?? "GENERAL",
        pointsDelta: input.pointsDelta,
        occurredAt: new Date(input.occurredAt),
        recordedByUserId: actor.userId,
        reason: "Fixture behaviour",
        correctsBehaviourEntryId: input.correctsBehaviourEntryId,
        createdAt: input.createdAt,
      },
      select: { id: true },
    }),
  );
  return entry.id;
}
