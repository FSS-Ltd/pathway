import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

const orgId = process.env.E2E_ORG_ID;
const siteId = process.env.E2E_TENANT_ID;
const otherSiteId = process.env.E2E_TENANT2_ID;
if (!orgId || !siteId || !otherSiteId) {
  throw new Error(
    "Attendance history E2E requires seeded organisation and sites",
  );
}

const ids = {
  group: randomUUID(),
  child: randomUUID(),
  emptyChild: randomUUID(),
  attendance: randomUUID(),
  emptyAttendance: randomUUID(),
  otherGroup: randomUUID(),
  otherChild: randomUUID(),
  otherAttendance: randomUUID(),
  legacyEvent: randomUUID(),
};

describe("attendance correction history", () => {
  const originalSecret = process.env.INTERNAL_AUTH_SECRET;
  let app: INestApplication | undefined;
  let actor: Awaited<ReturnType<typeof seedE2eAuthUser>> | undefined;
  let viewer: Awaited<ReturnType<typeof seedE2eAuthUser>> | undefined;
  let typedRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let createdOrgVertical = false;

  beforeAll(async () => {
    process.env.INTERNAL_AUTH_SECRET = "attendance-history-e2e-secret";
    if (!requireDatabase()) return;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.group.create({
        data: { id: ids.group, tenantId: siteId, name: "History group" },
      });
      for (const [id, firstName] of [
        [ids.child, "History"],
        [ids.emptyChild, "Legacy"],
      ] as const) {
        await tx.child.create({
          data: {
            id,
            tenantId: siteId,
            groupId: ids.group,
            firstName,
            lastName: "Fixture",
          },
        });
      }
      await tx.attendance.createMany({
        data: [
          {
            id: ids.attendance,
            childId: ids.child,
            groupId: ids.group,
            present: false,
            status: "ABSENT",
          },
          {
            id: ids.emptyAttendance,
            childId: ids.emptyChild,
            groupId: ids.group,
            present: false,
            status: "ABSENT",
          },
        ],
      });
    });
    await withTenantRlsContext(otherSiteId, orgId, async (tx) => {
      await tx.group.create({
        data: {
          id: ids.otherGroup,
          tenantId: otherSiteId,
          name: "Other history group",
        },
      });
      await tx.child.create({
        data: {
          id: ids.otherChild,
          tenantId: otherSiteId,
          groupId: ids.otherGroup,
          firstName: "Other",
          lastName: "Fixture",
        },
      });
      await tx.attendance.create({
        data: {
          id: ids.otherAttendance,
          childId: ids.otherChild,
          groupId: ids.otherGroup,
          present: false,
          status: "ABSENT",
        },
      });
    });

    const existingVertical = await prisma.orgVertical.findUnique({
      where: { orgId },
    });
    if (!existingVertical) {
      await prisma.orgVertical.create({
        data: { orgId, vertical: "ACE_SCHOOL" },
      });
      createdOrgVertical = true;
    }
    actor = await seedE2eAuthUser({
      subject: `attendance-history-${randomUUID()}`,
      tenantId: siteId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
      name: "Alex Lee",
    });
    typedRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: actor.userId,
      scope: "site",
      permissionKeys: ["attendance.read", "attendance.manage"],
    });
    viewer = await seedE2eAuthUser({
      subject: `attendance-history-viewer-${randomUUID()}`,
      tenantId: siteId,
      siteRole: "VIEWER",
      orgId,
    });

    for (const status of ["PRESENT", "LATE", "ABSENT", "PRESENT"] as const) {
      const response = await request(app.getHttpServer())
        .patch(`/attendance/${ids.attendance}`)
        .send({ status, correctionReason: `Changed to ${status}` })
        .set("Authorization", actor.authorization);
      expect(response.status).toBe(200);
    }
  });

  afterAll(async () => {
    try {
      if (!app) return;
      await withTenantRlsContext(siteId, orgId, async (tx) => {
        await tx.$executeRawUnsafe(
          "SET LOCAL session_replication_role = replica",
        );
        await tx.attendanceCorrectionEvent.deleteMany({
          where: {
            attendanceId: { in: [ids.attendance, ids.emptyAttendance] },
          },
        });
        await tx.attendance.deleteMany({
          where: { id: { in: [ids.attendance, ids.emptyAttendance] } },
        });
        await tx.child.deleteMany({
          where: { id: { in: [ids.child, ids.emptyChild] } },
        });
        await tx.group.delete({ where: { id: ids.group } });
      });
      await withTenantRlsContext(otherSiteId, orgId, async (tx) => {
        await tx.attendance.deleteMany({ where: { id: ids.otherAttendance } });
        await tx.child.deleteMany({ where: { id: ids.otherChild } });
        await tx.group.deleteMany({ where: { id: ids.otherGroup } });
      });
      if (typedRole) await clearE2eTypedRole(typedRole, orgId);
      if (viewer) {
        await clearE2eAuthAccess(viewer.userId);
        await prisma.user.deleteMany({ where: { id: viewer.userId } });
      }
      if (actor) {
        await prisma.staffActivity.deleteMany({
          where: { staffUserId: actor.userId },
        });
        await clearE2eAuthAccess(actor.userId);
        await prisma.user.deleteMany({ where: { id: actor.userId } });
      }
      if (createdOrgVertical) {
        await prisma.orgVertical.deleteMany({ where: { orgId } });
      }
      await app.close();
    } finally {
      if (originalSecret === undefined) {
        delete process.env.INTERNAL_AUTH_SECRET;
      } else {
        process.env.INTERNAL_AUTH_SECRET = originalSecret;
      }
    }
  });

  it("pages newest-first and rejects edited or row-scoped cursors", async () => {
    if (!app || !actor || !isDatabaseAvailable()) return;
    const first = await request(app.getHttpServer())
      .get(`/attendance/${ids.attendance}/history?limit=2`)
      .set("Authorization", actor.authorization);
    expect(first.status).toBe(200);
    expect(first.body.items).toHaveLength(2);
    expect(first.body.items[0]).toMatchObject({
      previousStatus: expect.any(String),
      newStatus: expect.any(String),
      reason: expect.any(String),
      correctedAt: expect.any(String),
      correctedBy: "Alex Lee",
      recoveredLegacy: false,
    });
    expect(Object.keys(first.body.items[0]).sort()).toEqual([
      "correctedAt",
      "correctedBy",
      "newStatus",
      "previousStatus",
      "reason",
      "recoveredLegacy",
    ]);
    const cursor: unknown = first.body.nextCursor;
    if (typeof cursor !== "string") throw new Error("Expected history cursor");

    const second = await request(app.getHttpServer())
      .get(`/attendance/${ids.attendance}/history`)
      .query({ limit: "2", cursor })
      .set("Authorization", actor.authorization);
    expect(second.status).toBe(200);
    expect(second.body.items).toHaveLength(2);
    expect(second.body.nextCursor).toBeNull();
    expect(second.body.items).not.toEqual(first.body.items);
    const transitions = [...first.body.items, ...second.body.items]
      .map(
        (item: { previousStatus: string; newStatus: string; reason: string }) =>
          `${item.previousStatus}->${item.newStatus}: ${item.reason}`,
      )
      .sort();
    expect(transitions).toEqual(
      [
        "ABSENT->PRESENT: Changed to PRESENT",
        "PRESENT->LATE: Changed to LATE",
        "LATE->ABSENT: Changed to ABSENT",
        "ABSENT->PRESENT: Changed to PRESENT",
      ].sort(),
    );
    const timestamps = [...first.body.items, ...second.body.items].map(
      (item: { correctedAt: string }) => item.correctedAt,
    );
    expect(timestamps).toEqual([...timestamps].sort().reverse());

    const reused = await request(app.getHttpServer())
      .get(`/attendance/${ids.emptyAttendance}/history`)
      .query({ cursor })
      .set("Authorization", actor.authorization);
    expect(reused.status).toBe(400);
    const editedCursor = Buffer.from(
      Buffer.from(cursor, "base64url")
        .toString("utf8")
        .replace('"signature":"', '"signature":"x'),
    ).toString("base64url");
    const edited = await request(app.getHttpServer())
      .get(`/attendance/${ids.attendance}/history`)
      .query({ cursor: editedCursor })
      .set("Authorization", actor.authorization);
    expect(edited.status).toBe(400);
  });

  it("denies a viewer and hides missing or foreign-site rows", async () => {
    if (!app || !actor || !viewer || !isDatabaseAvailable()) return;
    const denied = await request(app.getHttpServer())
      .get(`/attendance/${ids.attendance}/history`)
      .set("Authorization", viewer.authorization);
    expect(denied.status).toBe(403);
    for (const id of [ids.otherAttendance, randomUUID()]) {
      const hidden = await request(app.getHttpServer())
        .get(`/attendance/${id}/history`)
        .set("Authorization", actor.authorization);
      expect(hidden.status).toBe(404);
    }
  });

  it("shows empty history and labels the recovered last correction", async () => {
    if (!app || !actor || !isDatabaseAvailable()) return;
    const actorId = actor.userId;
    const empty = await request(app.getHttpServer())
      .get(`/attendance/${ids.emptyAttendance}/history`)
      .set("Authorization", actor.authorization);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ items: [], nextCursor: null });

    const recoveredAt = new Date("2026-08-12T11:00:00.000Z");
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.attendance.update({
        where: { id: ids.emptyAttendance },
        data: {
          correctedAt: recoveredAt,
          correctedByUserId: actorId,
          correctionReason: "Recovered last correction",
        },
      });
      // Recreate only what the migration's historical backfill writes.
      await tx.$executeRawUnsafe(
        "SET LOCAL session_replication_role = replica",
      );
      await tx.attendanceCorrectionEvent.create({
        data: {
          id: ids.legacyEvent,
          tenantId: siteId,
          childId: ids.emptyChild,
          attendanceId: ids.emptyAttendance,
          previousStatus: null,
          newStatus: "ABSENT",
          reason: "Recovered last correction",
          correctedByUserId: actorId,
          correctedAt: recoveredAt,
          origin: "LEGACY_BACKFILL",
        },
      });
    });
    const history = await request(app.getHttpServer())
      .get(`/attendance/${ids.emptyAttendance}/history`)
      .set("Authorization", actor.authorization);
    expect(history.status).toBe(200);
    expect(history.body).toEqual({
      items: [
        {
          previousStatus: null,
          newStatus: "ABSENT",
          reason: "Recovered last correction",
          correctedAt: recoveredAt.toISOString(),
          correctedBy: "Alex Lee",
          recoveredLegacy: true,
        },
      ],
      nextCursor: null,
    });
  });
});
