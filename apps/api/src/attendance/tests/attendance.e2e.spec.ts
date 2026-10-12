import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  PathwayRequestContext,
  UserTenantRole,
  type AuthContext,
} from "@pathway/auth";
import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import type { Request } from "express";
import request from "supertest";
import { AppModule } from "../../app.module";
import { Av30ActivityService } from "../../av30/av30-activity.service";
import { AttendanceService } from "../attendance.service";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

const ids = {
  group: randomUUID(),
  group2: randomUUID(),
  child: randomUUID(),
  child2: randomUUID(),
  child3: randomUUID(),
  session: randomUUID(),
} as const;

const nonce = Date.now();

const TENANT_A_ID = process.env.E2E_TENANT_ID;
const TENANT_B_ID = process.env.E2E_TENANT2_ID;
const ORG_ID = process.env.E2E_ORG_ID;
if (!TENANT_A_ID || !TENANT_B_ID || !ORG_ID) {
  throw new Error(
    "E2E_TENANT_ID / E2E_TENANT2_ID / E2E_ORG_ID are missing. Ensure test.setup.e2e.ts seeds tenants and exports their IDs.",
  );
}

describe("Attendance (e2e)", () => {
  let app: INestApplication;
  let createdId: string;
  let authHeader: string;
  let authUserId: string;
  let typedRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let createdOrgVertical = false;

  async function clearFixtureCorrectionEvents(): Promise<void> {
    const tenantId = TENANT_A_ID;
    const orgId = ORG_ID;
    if (!tenantId || !orgId) {
      throw new Error("Attendance E2E tenant context is unavailable");
    }
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      // Test teardown only: bypass the append-only trigger for these fixtures.
      await tx.$executeRawUnsafe(
        "SET LOCAL session_replication_role = replica",
      );
      await tx.attendanceCorrectionEvent.deleteMany({
        where: { childId: { in: [ids.child, ids.child2, ids.child3] } },
      });
    });
  }

  function directAttendanceService(actorUserId = authUserId) {
    const tenantId = TENANT_A_ID;
    const orgId = ORG_ID;
    if (!tenantId || !orgId) {
      throw new Error("Attendance E2E tenant context is unavailable");
    }
    const context = new PathwayRequestContext({} as Request);
    const authContext: AuthContext = {
      user: {
        userId: actorUserId,
        email: "attendance-e2e@example.com",
        authProvider: "auth0",
      },
      org: { orgId },
      tenant: { tenantId, orgId },
      roles: { org: [], tenant: [UserTenantRole.ADMIN] },
      permissions: ["attendance.read", "attendance.manage"],
      rawClaims: {},
    };
    context.setContext(authContext);
    const recordActivityForCurrentUser = jest.fn().mockResolvedValue(undefined);
    const av30 = {
      recordActivityForCurrentUser,
    } as unknown as Av30ActivityService;
    return {
      service: new AttendanceService(av30, context),
      recordActivityForCurrentUser,
    };
  }

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await clearFixtureCorrectionEvents();
    // Seed inside RLS-aware context for each tenant
    await withTenantRlsContext(TENANT_A_ID, ORG_ID, async (tx) => {
      // cleanup for deterministic runs
      await tx.attendance.deleteMany({
        where: {
          OR: [
            { childId: ids.child },
            { groupId: { in: [ids.group, ids.group2] } },
          ],
        },
      });
      await tx.child.deleteMany({
        where: { id: { in: [ids.child, ids.child2, ids.child3] } },
      });
      await tx.session.deleteMany({ where: { id: ids.session } });
      await tx.group.deleteMany({
        where: { id: { in: [ids.group, ids.group2] } },
      });

      await tx.group.create({
        data: {
          id: ids.group,
          name: `Kids A ${nonce}` as string,
          tenantId: TENANT_A_ID,
          minAge: 3,
          maxAge: 5,
        },
      });
      await tx.child.create({
        data: {
          id: ids.child,
          firstName: "Sam",
          lastName: "Smith",
          tenantId: TENANT_A_ID,
          groupId: ids.group,
          allergies: "none",
          disabilities: [],
        },
      });
      await tx.child.create({
        data: {
          id: ids.child3,
          firstName: "Jordan",
          lastName: "Morgan",
          tenantId: TENANT_A_ID,
          groupId: ids.group,
          allergies: "none",
          disabilities: [],
        },
      });
      await tx.child.create({
        data: {
          id: ids.child2,
          firstName: "Alex",
          lastName: "Taylor",
          tenantId: TENANT_A_ID,
          groupId: ids.group,
          allergies: "none",
          disabilities: [],
        },
      });
      await tx.session.create({
        data: {
          id: ids.session,
          tenantId: TENANT_A_ID,
          title: `Attendance ${nonce}`,
          startsAt: new Date("2026-08-12T09:00:00.000Z"),
          endsAt: new Date("2026-08-12T10:00:00.000Z"),
          groups: { connect: { id: ids.group } },
        },
      });
    });

    await withTenantRlsContext(TENANT_B_ID, ORG_ID, async (tx) => {
      await tx.group.deleteMany({ where: { id: ids.group2 } });
      await tx.group.create({
        data: {
          id: ids.group2,
          name: `Kids B ${nonce}` as string,
          tenantId: TENANT_B_ID,
          minAge: 6,
          maxAge: 8,
        },
      });
    });

    // attendance.read/manage are org-capability-gated (PLATFORM_CORE_CAPABILITIES,
    // granted by any vertical); the shared E2E_ORG_ID fixture has no OrgVertical
    // row by default, so PermissionGuard would deny every request with
    // capability-missing regardless of the typed assignment below.
    const existingVertical = await prisma.orgVertical.findUnique({
      where: { orgId: ORG_ID },
    });
    if (!existingVertical) {
      await prisma.orgVertical.create({
        data: { orgId: ORG_ID, vertical: "ACE_SCHOOL" },
      });
      createdOrgVertical = true;
    }

    const auth = await seedE2eAuthUser({
      subject: "attendance-e2e",
      tenantId: TENANT_A_ID,
      siteRole: "SITE_ADMIN",
      orgId: ORG_ID,
      orgRole: "ORG_ADMIN",
    });
    authUserId = auth.userId;
    authHeader = auth.authorization;
    typedRole = await seedE2eTypedRole({
      orgId: ORG_ID,
      tenantId: TENANT_A_ID,
      userId: authUserId,
      scope: "site",
      permissionKeys: ["attendance.read", "attendance.manage"],
    });
  });

  afterAll(async () => {
    if (app) {
      await prisma.staffActivity.deleteMany({
        where: { staffUserId: authUserId },
      });
      await clearFixtureCorrectionEvents();
      await prisma.attendance.deleteMany({
        where: { groupId: { in: [ids.group, ids.group2] } },
      });
      await prisma.child.deleteMany({
        where: {
          OR: [{ id: ids.child }, { groupId: { in: [ids.group, ids.group2] } }],
        },
      });
      await prisma.session.deleteMany({ where: { id: ids.session } });
      await prisma.group.deleteMany({
        where: { id: { in: [ids.group, ids.group2] } },
      });
      if (typedRole) {
        await clearE2eTypedRole(typedRole, ORG_ID);
      }
      if (createdOrgVertical) {
        await prisma.orgVertical.deleteMany({ where: { orgId: ORG_ID } });
      }
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await app.close();
    }
  });

  it("GET /attendance should return array", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/attendance")
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /attendance accepts the legacy Boolean and returns its status", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/attendance")
      .send({
        childId: ids.child,
        groupId: ids.group,
        sessionId: ids.session,
        present: true,
      })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      childId: ids.child,
      groupId: ids.group,
      present: true,
      status: "PRESENT",
    });
    expect(res.body).toHaveProperty("id");
    createdId = res.body.id;
  });

  it("GET /attendance/:id should return created record", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/attendance/${createdId}`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: createdId,
      childId: ids.child,
      groupId: ids.group,
      present: true,
      status: "PRESENT",
    });
  });

  it("POST /attendance creates and reads Late without losing legacy meaning", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/attendance")
      .send({
        childId: ids.child3,
        groupId: ids.group,
        sessionId: ids.session,
        status: "LATE",
      })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      childId: ids.child3,
      present: true,
      status: "LATE",
    });

    const read = await request(app.getHttpServer())
      .get(`/attendance/${created.body.id as string}`)
      .set("Authorization", authHeader);
    expect(read.status).toBe(200);
    expect(read.body).toMatchObject({ present: true, status: "LATE" });
  });

  it("PATCH /attendance/:id rejects a status correction without a reason", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .patch(`/attendance/${createdId}`)
      .send({ present: false })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);
    expect(res.status).toBe(400);
  });

  it("PATCH /attendance/:id round-trips Late and records correction provenance", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .patch(`/attendance/${createdId}`)
      .send({ status: "LATE", correctionReason: "Transport delay" })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: createdId,
      present: true,
      status: "LATE",
      correctedByUserId: authUserId,
      correctionReason: "Transport delay",
    });
    expect(res.body.correctedAt).toEqual(expect.any(String));

    const stored = await prisma.attendance.findUniqueOrThrow({
      where: { id: createdId },
      select: {
        present: true,
        status: true,
        correctedByUserId: true,
        correctionReason: true,
      },
    });
    expect(stored).toEqual({
      present: true,
      status: "LATE",
      correctedByUserId: authUserId,
      correctionReason: "Transport delay",
    });
    const events = await prisma.attendanceCorrectionEvent.findMany({
      where: { attendanceId: createdId },
      select: {
        previousStatus: true,
        newStatus: true,
        reason: true,
        correctedByUserId: true,
        origin: true,
      },
    });
    expect(events).toEqual([
      {
        previousStatus: "PRESENT",
        newStatus: "LATE",
        reason: "Transport delay",
        correctedByUserId: authUserId,
        origin: "LIVE",
      },
    ]);

    const sameStatus = await request(app.getHttpServer())
      .patch(`/attendance/${createdId}`)
      .send({ status: "LATE" })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);
    expect(sameStatus.status).toBe(200);
    expect(
      await prisma.attendanceCorrectionEvent.count({
        where: { attendanceId: createdId },
      }),
    ).toBe(1);
  });

  it("PUT /attendance/session/:id creates Late and corrects existing statuses", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .put(`/attendance/session/${ids.session}`)
      .send({ rows: [{ childId: ids.child2, status: "LATE" }] })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(created.status).toBe(200);
    expect(created.body.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          childId: ids.child2,
          present: true,
          status: "LATE",
        }),
      ]),
    );

    const rejected = await request(app.getHttpServer())
      .put(`/attendance/session/${ids.session}`)
      .send({ rows: [{ childId: ids.child2, status: "ABSENT" }] })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);
    expect(rejected.status).toBe(400);

    const corrected = await request(app.getHttpServer())
      .put(`/attendance/session/${ids.session}`)
      .send({
        rows: [
          {
            childId: ids.child2,
            status: "ABSENT",
            correctionReason: "Marked in error",
          },
        ],
      })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);
    expect(corrected.status).toBe(200);
    expect(corrected.body.rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          childId: ids.child2,
          present: false,
          status: "ABSENT",
          correctedByUserId: authUserId,
          correctionReason: "Marked in error",
        }),
      ]),
    );
    const attendance = await prisma.attendance.findFirstOrThrow({
      where: { sessionId: ids.session, childId: ids.child2 },
      select: { id: true },
    });
    expect(
      await prisma.attendanceCorrectionEvent.findMany({
        where: { attendanceId: attendance.id },
        select: { previousStatus: true, newStatus: true, reason: true },
      }),
    ).toEqual([
      {
        previousStatus: "LATE",
        newStatus: "ABSENT",
        reason: "Marked in error",
      },
    ]);
  });

  it("accepts an empty session save without creating a correction", async () => {
    if (!app) return;
    const before = await prisma.attendanceCorrectionEvent.count({
      where: { tenantId: TENANT_A_ID },
    });
    const response = await request(app.getHttpServer())
      .put(`/attendance/session/${ids.session}`)
      .send({ rows: [] })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);
    expect(response.status).toBe(200);
    expect(response.body.rows).toEqual(expect.any(Array));
    expect(
      await prisma.attendanceCorrectionEvent.count({
        where: { tenantId: TENANT_A_ID },
      }),
    ).toBe(before);
  });

  it("rolls back an earlier valid correction when a later batch row is invalid", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const { service, recordActivityForCurrentUser } = directAttendanceService();
    const eventCount = await prisma.attendanceCorrectionEvent.count({
      where: { childId: { in: [ids.child, ids.child2] } },
    });

    await expect(
      service.upsertSessionAttendance(ids.session, TENANT_A_ID, {
        rows: [
          {
            childId: ids.child,
            status: "ABSENT",
            correctionReason: "First row is valid",
          },
          { childId: ids.child2, status: "PRESENT" },
        ],
      }),
    ).rejects.toThrow(
      "correctionReason is required when changing attendance status",
    );

    const storedRows = await prisma.attendance.findMany({
      where: {
        sessionId: ids.session,
        childId: { in: [ids.child, ids.child2] },
      },
      select: { childId: true, status: true },
    });
    expect(storedRows).toHaveLength(2);
    expect(storedRows).toEqual(
      expect.arrayContaining([
        { childId: ids.child, status: "LATE" },
        { childId: ids.child2, status: "ABSENT" },
      ]),
    );
    expect(
      await prisma.attendanceCorrectionEvent.count({
        where: { childId: { in: [ids.child, ids.child2] } },
      }),
    ).toBe(eventCount);
    expect(recordActivityForCurrentUser).not.toHaveBeenCalled();
  });

  it("rejects duplicate child rows before the service writes", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const { service, recordActivityForCurrentUser } = directAttendanceService();

    await expect(
      service.upsertSessionAttendance(ids.session, TENANT_A_ID, {
        rows: [
          {
            childId: ids.child3,
            status: "ABSENT",
            correctionReason: "First duplicate",
          },
          {
            childId: ids.child3,
            status: "PRESENT",
            correctionReason: "Second duplicate",
          },
        ],
      }),
    ).rejects.toThrow("childId must be unique within an attendance batch");

    await expect(
      prisma.attendance.findFirstOrThrow({
        where: { sessionId: ids.session, childId: ids.child3 },
        select: { status: true, correctionReason: true },
      }),
    ).resolves.toEqual({ status: "LATE", correctionReason: null });
    expect(recordActivityForCurrentUser).not.toHaveBeenCalled();
  });

  it("commits a fully valid session batch", async () => {
    if (!app || !isDatabaseAvailable()) return;

    const res = await request(app.getHttpServer())
      .put(`/attendance/session/${ids.session}`)
      .send({
        rows: [
          {
            childId: ids.child,
            status: "ABSENT",
            correctionReason: "Confirmed absent",
          },
          {
            childId: ids.child2,
            status: "PRESENT",
            correctionReason: "Arrived onsite",
          },
        ],
      })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    const storedRows = await prisma.attendance.findMany({
      where: {
        sessionId: ids.session,
        childId: { in: [ids.child, ids.child2] },
      },
      select: { childId: true, status: true, correctionReason: true },
    });
    expect(storedRows).toHaveLength(2);
    expect(storedRows).toEqual(
      expect.arrayContaining([
        {
          childId: ids.child,
          status: "ABSENT",
          correctionReason: "Confirmed absent",
        },
        {
          childId: ids.child2,
          status: "PRESENT",
          correctionReason: "Arrived onsite",
        },
      ]),
    );
  });

  it("serializes concurrent corrections against the latest committed status", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const before = await prisma.attendanceCorrectionEvent.count({
      where: { attendanceId: createdId },
    });

    const responses = await Promise.all(
      (["LATE", "PRESENT"] as const).map((status) =>
        request(app.getHttpServer())
          .patch(`/attendance/${createdId}`)
          .send({ status, correctionReason: `Concurrent ${status}` })
          .set("content-type", "application/json")
          .set("Authorization", authHeader),
      ),
    );
    expect(responses.map((response) => response.status)).toEqual([200, 200]);

    const events = await prisma.attendanceCorrectionEvent.findMany({
      where: { attendanceId: createdId },
      orderBy: [{ correctedAt: "asc" }, { id: "asc" }],
      select: { previousStatus: true, newStatus: true },
    });
    const concurrentEvents = events.slice(before);
    expect(concurrentEvents).toHaveLength(2);
    expect(concurrentEvents[0]?.previousStatus).toBe("ABSENT");
    expect(concurrentEvents[1]?.previousStatus).toBe(
      concurrentEvents[0]?.newStatus,
    );
    const latest = await prisma.attendance.findUniqueOrThrow({
      where: { id: createdId },
      select: { status: true },
    });
    expect(latest.status).toBe(concurrentEvents[1]?.newStatus);
  });

  it("rolls back the row update when the correction event cannot be written", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const before = await prisma.attendance.findUniqueOrThrow({
      where: { id: createdId },
      select: { status: true, correctionReason: true },
    });
    const eventCount = await prisma.attendanceCorrectionEvent.count({
      where: { attendanceId: createdId },
    });
    const nextStatus = before.status === "PRESENT" ? "ABSENT" : "PRESENT";
    const { service, recordActivityForCurrentUser } = directAttendanceService();
    await prisma.$executeRaw`
      ALTER TABLE "AttendanceCorrectionEvent"
      ADD CONSTRAINT "AttendanceCorrectionEvent_e2e_reject_insert"
      CHECK (false) NOT VALID
    `;
    try {
      await expect(
        service.update(
          createdId,
          { status: nextStatus, correctionReason: "Event insert blocked" },
          TENANT_A_ID,
        ),
      ).rejects.toBeDefined();
    } finally {
      await prisma.$executeRaw`
        ALTER TABLE "AttendanceCorrectionEvent"
        DROP CONSTRAINT "AttendanceCorrectionEvent_e2e_reject_insert"
      `;
    }
    expect(
      await prisma.attendance.findUniqueOrThrow({
        where: { id: createdId },
        select: { status: true, correctionReason: true },
      }),
    ).toEqual(before);
    expect(
      await prisma.attendanceCorrectionEvent.count({
        where: { attendanceId: createdId },
      }),
    ).toBe(eventCount);
    expect(recordActivityForCurrentUser).not.toHaveBeenCalled();
  });

  it("exports Late using the authoritative status", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(
        "/exports/attendance/site?from=2026-08-12T00:00:00.000Z&to=2026-08-12T23:59:59.999Z&type=children",
      )
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.text).toContain("LATE");
  });

  it("keeps status and present coherent for expand-era database writes", async () => {
    if (!app || !isDatabaseAvailable()) return;

    await prisma.$executeRaw`
      UPDATE "Attendance"
      SET "present" = false
      WHERE "id" = ${createdId}
    `;
    await expect(
      prisma.attendance.findUniqueOrThrow({
        where: { id: createdId },
        select: { present: true, status: true },
      }),
    ).resolves.toEqual({ present: false, status: "ABSENT" });

    await prisma.$executeRaw`
      UPDATE "Attendance"
      SET "status" = 'LATE'::"AttendanceStatus"
      WHERE "id" = ${createdId}
    `;
    await expect(
      prisma.attendance.findUniqueOrThrow({
        where: { id: createdId },
        select: { present: true, status: true },
      }),
    ).resolves.toEqual({ present: true, status: "LATE" });
  });

  it("does not expose another site's correction metadata under strict RLS", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const roleName = process.env.E2E_TENANT_RLS_ROLE;
    if (!roleName) return;
    if (roleName !== "pathway_e2e_tenant_rls") {
      throw new Error(`Unexpected E2E tenant RLS role: ${roleName}`);
    }

    const rows = await withTenantRlsContext(TENANT_B_ID, ORG_ID, async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL ROLE "${roleName}"`);
      return tx.$queryRaw<
        Array<{
          id: string;
          correctedByUserId: string | null;
          correctionReason: string | null;
        }>
      >`
          SELECT "id", "correctedByUserId", "correctionReason"
          FROM "Attendance"
          WHERE "id" = ${createdId}
        `;
    });

    expect(rows).toEqual([]);
  });

  it("POST /attendance should 404 when child/group cross-tenant", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/attendance")
      .send({ childId: ids.child, groupId: ids.group2, present: true })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(404);
  });

  it("GET /attendance should not leak other tenant records", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const childB = await withTenantRlsContext(TENANT_B_ID, ORG_ID, async (tx) =>
      tx.child.create({
        data: {
          firstName: "Other",
          lastName: "Child",
          tenantId: TENANT_B_ID,
          groupId: ids.group2,
          allergies: "none",
          disabilities: [],
        } as unknown as Parameters<typeof tx.child.create>[0]["data"],
      }),
    );
    await withTenantRlsContext(TENANT_B_ID, ORG_ID, async (tx) =>
      tx.attendance.create({
        data: {
          childId: childB.id,
          groupId: ids.group2,
          present: true,
          status: "PRESENT",
        },
      }),
    );

    const res = await request(app.getHttpServer())
      .get("/attendance")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(
      res.body.every((row: { childId: string }) => row.childId !== childB.id),
    ).toBe(true);
  });

  it("GET /attendance/:id should 404 for other tenant record", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const childB = await withTenantRlsContext(TENANT_B_ID, ORG_ID, async (tx) =>
      tx.child.create({
        data: {
          firstName: "Other2",
          lastName: "Child",
          tenantId: TENANT_B_ID,
          groupId: ids.group2,
          allergies: "none",
          disabilities: [],
        } as unknown as Parameters<typeof tx.child.create>[0]["data"],
      }),
    );
    const attendanceB = await withTenantRlsContext(
      TENANT_B_ID,
      ORG_ID,
      async (tx) =>
        tx.attendance.create({
          data: {
            childId: childB.id,
            groupId: ids.group2,
            present: false,
            status: "ABSENT",
          },
        }),
    );

    const res = await request(app.getHttpServer())
      .get(`/attendance/${attendanceB.id}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(404);
  });
});
