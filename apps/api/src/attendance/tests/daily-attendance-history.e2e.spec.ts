import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { withSystemRoleFixtureWrites } from "../../access-control/tests/system-role-fixture";
import { AppModule } from "../../app.module";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";
import {
  attendanceHistoryCursorScope,
  encodeAttendanceHistoryCursor,
} from "../attendance-history-cursor";
import { DailyAttendanceHistoryService } from "../daily-attendance-history.service";

const orgId = randomUUID();
const siteAId = randomUUID();
const siteBId = randomUUID();
const staffId = randomUUID();
const leadId = randomUUID();
const deniedId = randomUUID();
const bandAId = randomUUID();
const bandBId = randomUUID();
const otherBandId = randomUUID();
const childAId = randomUUID();
const childBId = randomUUID();
const otherChildId = randomUUID();
const markAId = randomUUID();
const markBId = randomUUID();
const otherMarkId = randomUUID();
const dateString = "2042-09-02";
const date = new Date(`${dateString}T00:00:00.000Z`);

describe("ACE daily correction history", () => {
  const originalSecret = process.env.INTERNAL_AUTH_SECRET;
  let app: INestApplication | undefined;
  let staffAuthorization = "";
  let leadAuthorization = "";
  let deniedAuthorization = "";

  beforeAll(async () => {
    process.env.INTERNAL_AUTH_SECRET = "daily-attendance-history-e2e-secret";
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Daily history ${orgId}`,
        slug: `daily-history-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteAId, siteBId].map((id) => ({
        id,
        orgId,
        name: `Daily history site ${id}`,
        slug: `daily-history-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    staffAuthorization = (
      await seedE2eAuthUser({
        subject: `daily-history-staff-${staffId}`,
        userId: staffId,
        tenantId: siteAId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    leadAuthorization = (
      await seedE2eAuthUser({
        subject: `daily-history-lead-${leadId}`,
        userId: leadId,
        tenantId: siteAId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    deniedAuthorization = (
      await seedE2eAuthUser({
        subject: `daily-history-denied-${deniedId}`,
        userId: deniedId,
        tenantId: siteAId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;

    await withSystemRoleFixtureWrites(async (tx) => {
      for (const [template, userId] of [
        [SYSTEM_ROLE_TEMPLATES.staff, staffId],
        [SYSTEM_ROLE_TEMPLATES.siteLead, leadId],
      ] as const) {
        const roleDefinitionId = randomUUID();
        await tx.orgRoleDefinition.create({
          data: {
            id: roleDefinitionId,
            orgId,
            tenantId: siteAId,
            name: template.name,
            scope: "site",
            isSystem: true,
            createdById: userId,
            updatedById: userId,
            permissions: {
              create: ["attendance.read", "attendance.manage"].map(
                (permissionKey) => ({ permissionKey, grantedById: userId }),
              ),
            },
          },
        });
        await tx.userRoleAssignment.create({
          data: {
            orgId,
            tenantId: siteAId,
            userId,
            roleDefinitionId,
            assignedById: userId,
          },
        });
      }
    });

    for (const site of [
      {
        tenantId: siteAId,
        rows: [
          { bandId: bandAId, childId: childAId, markId: markAId },
          { bandId: bandBId, childId: childBId, markId: markBId },
        ],
      },
      {
        tenantId: siteBId,
        rows: [
          { bandId: otherBandId, childId: otherChildId, markId: otherMarkId },
        ],
      },
    ]) {
      await withTenantRlsContext(site.tenantId, orgId, async (tx) => {
        const academicYearId = randomUUID();
        await tx.academicYear.create({
          data: {
            id: academicYearId,
            tenantId: site.tenantId,
            name: `Academic ${site.tenantId}`,
            startsOn: new Date("2042-09-01T00:00:00.000Z"),
            endsOn: new Date("2043-08-31T00:00:00.000Z"),
            status: "ARCHIVED",
          },
        });
        await tx.aceTeachingDate.create({
          data: {
            tenantId: site.tenantId,
            academicYearId,
            date,
            kind: "TEACHING",
          },
        });
        for (const row of site.rows) {
          await tx.aceYearBand.create({
            data: {
              id: row.bandId,
              tenantId: site.tenantId,
              name: `Band ${row.bandId}`,
            },
          });
          await tx.child.create({
            data: {
              id: row.childId,
              tenantId: site.tenantId,
              firstName: "History",
              lastName: "Student",
            },
          });
          await tx.aceSchoolEnrollment.create({
            data: {
              tenantId: site.tenantId,
              childId: row.childId,
              academicYearId,
              yearBandId: row.bandId,
              startsOn: new Date("2042-09-01T00:00:00.000Z"),
            },
          });
          await tx.aceDailyAttendance.create({
            data: {
              id: row.markId,
              tenantId: site.tenantId,
              childId: row.childId,
              date,
              status: "PRESENT",
              recordedByUserId: leadId,
            },
          });
        }
      });
    }
    await withTenantRlsContext(siteAId, orgId, (tx) =>
      tx.aceStaffYearBandAssignment.create({
        data: {
          tenantId: siteAId,
          userId: staffId,
          yearBandId: bandAId,
          startsOn: new Date("2042-09-01T00:00:00.000Z"),
        },
      }),
    );

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    try {
      await app?.close();
    } finally {
      if (originalSecret === undefined) {
        delete process.env.INTERNAL_AUTH_SECRET;
      } else {
        process.env.INTERNAL_AUTH_SECRET = originalSecret;
      }
    }
  });

  it("pages daily corrections and rejects tampered or cross-fact cursors", async () => {
    if (!app) return;
    const historyUrl = `/attendance/daily/${markAId}/history`;
    const empty = await request(app.getHttpServer())
      .get(historyUrl)
      .set("Authorization", staffAuthorization);
    expect(empty.status).toBe(200);
    expect(empty.body).toEqual({ items: [], nextCursor: null });

    for (const change of [
      {
        status: "ABSENT",
        absenceReason: "SICK",
        correctionReason: "Sick call",
      },
      { status: "LATE", correctionReason: "Arrived after register" },
      { status: "PRESENT", correctionReason: "Attendance confirmed" },
    ]) {
      const saved = await request(app.getHttpServer())
        .put(`/attendance/daily/${dateString}/children/${childAId}`)
        .set("Authorization", staffAuthorization)
        .send(change);
      expect(saved.status).toBe(200);
    }

    const pages: Array<{
      items: Array<{ correctionReason: string }>;
      nextCursor: string | null;
    }> = [];
    let cursor: string | null = null;
    for (let index = 0; index < 3; index += 1) {
      const response: request.Response = await request(app.getHttpServer())
        .get(`${historyUrl}?limit=1${cursor ? `&cursor=${cursor}` : ""}`)
        .set("Authorization", staffAuthorization);
      expect(response.status).toBe(200);
      expect(response.body.items).toHaveLength(1);
      pages.push(response.body);
      cursor = response.body.nextCursor;
    }
    expect(pages[0].nextCursor).toEqual(expect.any(String));
    expect(pages[1].nextCursor).toEqual(expect.any(String));
    expect(pages[2].nextCursor).toBeNull();
    expect(pages.map((page) => page.items[0].correctionReason).sort()).toEqual(
      ["Sick call", "Arrived after register", "Attendance confirmed"].sort(),
    );

    const pageCursor = pages[0].nextCursor;
    if (!pageCursor) throw new Error("Expected a daily history cursor");
    const tampered = `${pageCursor[0] === "Z" ? "Y" : "Z"}${pageCursor.slice(1)}`;
    const badCursor = await request(app.getHttpServer())
      .get(`${historyUrl}?cursor=${tampered}`)
      .set("Authorization", staffAuthorization);
    expect(badCursor.status).toBe(400);

    const wrongFact = await request(app.getHttpServer())
      .get(`/attendance/daily/${markBId}/history?cursor=${pageCursor}`)
      .set("Authorization", leadAuthorization);
    expect(wrongFact.status).toBe(400);

    const sessionCursor = encodeAttendanceHistoryCursor(
      { correctedAt: new Date(), id: randomUUID() },
      attendanceHistoryCursorScope(siteAId, orgId, markAId),
    );
    const wrongDomain = await request(app.getHttpServer())
      .get(`${historyUrl}?cursor=${sessionCursor}`)
      .set("Authorization", staffAuthorization);
    expect(wrongDomain.status).toBe(400);

    const invalidLimit = await request(app.getHttpServer())
      .get(`${historyUrl}?limit=51`)
      .set("Authorization", staffAuthorization);
    expect(invalidLimit.status).toBe(400);
  });

  it("hides foreign and out-of-band facts before evaluating history cursors", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const outOfBand = await request(server)
      .get(`/attendance/daily/${markBId}/history?cursor=invalid`)
      .set("Authorization", staffAuthorization);
    expect(outOfBand.status).toBe(404);

    const foreign = await request(server)
      .get(`/attendance/daily/${otherMarkId}/history`)
      .set("Authorization", leadAuthorization);
    expect(foreign.status).toBe(404);

    const denied = await request(server)
      .get(`/attendance/daily/${markAId}/history`)
      .set("Authorization", deniedAuthorization);
    expect(denied.status).toBe(403);

    await expect(
      new DailyAttendanceHistoryService().list(
        markAId,
        {},
        { tenantId: siteBId, orgId, userId: staffId },
      ),
    ).rejects.toMatchObject({ status: 404 });
  });

  it("keeps saved history readable after a calendar correction, then rechecks band access", async () => {
    if (!app) return;
    await withTenantRlsContext(siteAId, orgId, (tx) =>
      tx.aceTeachingDate.update({
        where: { tenantId_date: { tenantId: siteAId, date } },
        data: { kind: "CLOSED", reason: "Calendar corrected" },
      }),
    );
    const historyUrl = `/attendance/daily/${markAId}/history`;
    const afterClosure = await request(app.getHttpServer())
      .get(historyUrl)
      .set("Authorization", staffAuthorization);
    expect(afterClosure.status).toBe(200);
    expect(afterClosure.body.items).toHaveLength(3);

    await withTenantRlsContext(siteAId, orgId, (tx) =>
      tx.aceStaffYearBandAssignment.updateMany({
        where: { tenantId: siteAId, userId: staffId, yearBandId: bandAId },
        data: { endsOn: new Date("2042-09-01T00:00:00.000Z") },
      }),
    );
    const expiredBand = await request(app.getHttpServer())
      .get(historyUrl)
      .set("Authorization", staffAuthorization);
    expect(expiredBand.status).toBe(404);
    const leader = await request(app.getHttpServer())
      .get(historyUrl)
      .set("Authorization", leadAuthorization);
    expect(leader.status).toBe(200);
  });
});
