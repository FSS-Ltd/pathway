import { randomUUID } from "node:crypto";
import { type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { withSystemRoleFixtureWrites } from "../../access-control/tests/system-role-fixture";
import { AppModule } from "../../app.module";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";
import { DailyAttendanceService } from "../daily-attendance.service";

const orgId = randomUUID();
const siteAId = randomUUID();
const siteBId = randomUUID();
const staffId = randomUUID();
const unassignedId = randomUUID();
const leadId = randomUUID();
const deniedId = randomUUID();
const bandAId = randomUUID();
const bandBId = randomUUID();
const childAId = randomUUID();
const childBId = randomUUID();
const otherChildId = randomUUID();
const dateString = "2042-09-02";
const date = new Date(`${dateString}T00:00:00.000Z`);

describe("ACE daily attendance roster read", () => {
  let app: INestApplication | undefined;
  let staffAuthorization = "";
  let unassignedAuthorization = "";
  let leadAuthorization = "";
  let deniedAuthorization = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Daily roster ${orgId}`,
        slug: `daily-roster-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteAId, siteBId].map((id) => ({
        id,
        orgId,
        name: `Daily roster site ${id}`,
        slug: `daily-roster-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    staffAuthorization = (
      await seedE2eAuthUser({
        subject: `daily-staff-${staffId}`,
        userId: staffId,
        tenantId: siteAId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    unassignedAuthorization = (
      await seedE2eAuthUser({
        subject: `daily-unassigned-${unassignedId}`,
        userId: unassignedId,
        tenantId: siteAId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    leadAuthorization = (
      await seedE2eAuthUser({
        subject: `daily-lead-${leadId}`,
        userId: leadId,
        tenantId: siteAId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    deniedAuthorization = (
      await seedE2eAuthUser({
        subject: `daily-denied-${deniedId}`,
        userId: deniedId,
        tenantId: siteAId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;

    await withSystemRoleFixtureWrites(async (tx) => {
      for (const [template, assignees] of [
        [SYSTEM_ROLE_TEMPLATES.staff, [staffId, unassignedId]],
        [SYSTEM_ROLE_TEMPLATES.siteLead, [leadId]],
      ] as const) {
        const roleDefinitionId = randomUUID();
        const creatorId = assignees[0];
        await tx.orgRoleDefinition.create({
          data: {
            id: roleDefinitionId,
            orgId,
            tenantId: siteAId,
            name: template.name,
            scope: "site",
            isSystem: true,
            createdById: creatorId,
            updatedById: creatorId,
            permissions: {
              create: {
                permissionKey: "attendance.read",
                grantedById: creatorId,
              },
            },
          },
        });
        await tx.userRoleAssignment.createMany({
          data: assignees.map((userId) => ({
            orgId,
            tenantId: siteAId,
            userId,
            roleDefinitionId,
            assignedById: userId,
          })),
        });
      }
    });

    for (const [siteId, bandIds, childIds] of [
      [siteAId, [bandAId, bandBId], [childAId, childBId]],
      [siteBId, [randomUUID()], [otherChildId]],
    ] as const) {
      await withTenantRlsContext(siteId, orgId, async (tx) => {
        const academicYearId = randomUUID();
        await tx.academicYear.create({
          data: {
            id: academicYearId,
            tenantId: siteId,
            name: `Academic ${siteId}`,
            startsOn: new Date("2042-09-01T00:00:00.000Z"),
            endsOn: new Date("2043-08-31T00:00:00.000Z"),
            status: "ARCHIVED",
          },
        });
        await tx.aceTeachingDate.create({
          data: {
            tenantId: siteId,
            academicYearId,
            date,
            kind: "TEACHING",
          },
        });
        for (const [index, childId] of childIds.entries()) {
          const yearBandId = bandIds[index];
          await tx.aceYearBand.create({
            data: { id: yearBandId, tenantId: siteId, name: `Band ${index}` },
          });
          await tx.child.create({
            data: {
              id: childId,
              tenantId: siteId,
              firstName: `Child ${index}`,
              lastName: `Roster ${index}`,
            },
          });
          await tx.aceSchoolEnrollment.create({
            data: {
              tenantId: siteId,
              childId,
              academicYearId,
              yearBandId,
              startsOn: new Date("2042-09-01T00:00:00.000Z"),
            },
          });
        }
      });
    }
    await withTenantRlsContext(siteAId, orgId, async (tx) => {
      await tx.aceStaffYearBandAssignment.create({
        data: {
          tenantId: siteAId,
          userId: staffId,
          yearBandId: bandAId,
          startsOn: new Date("2042-09-01T00:00:00.000Z"),
        },
      });
      await tx.aceDailyAttendance.create({
        data: {
          tenantId: siteAId,
          childId: childAId,
          date,
          status: "PRESENT",
          recordedByUserId: staffId,
        },
      });
    });

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it("returns only the staff member's dated band with site-scoped counts", async () => {
    if (!app) return;
    const result = await request(app.getHttpServer())
      .get(`/attendance/daily?date=${dateString}&limit=1`)
      .set("Authorization", staffAuthorization);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      date: dateString,
      timezone: "Europe/London",
      total: 1,
      nextPage: null,
      counts: { present: 1, absent: 0, late: 0, unmarked: 0 },
      permittedBands: [{ id: bandAId, name: "Band 0" }],
    });
    expect(result.body.items).toEqual([
      expect.objectContaining({
        childId: childAId,
        mark: expect.objectContaining({ status: "PRESENT" }),
      }),
    ]);

    const otherBand = await request(app.getHttpServer())
      .get(`/attendance/daily?date=${dateString}&bandId=${bandBId}`)
      .set("Authorization", staffAuthorization);
    expect(otherBand.status).toBe(404);
  });

  it("lets the fixed Site Lead see the full roster and unmarked children", async () => {
    if (!app) return;
    const result = await request(app.getHttpServer())
      .get(`/attendance/daily?date=${dateString}&limit=1&page=2`)
      .set("Authorization", leadAuthorization);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      total: 2,
      page: 2,
      nextPage: null,
      counts: { present: 1, absent: 0, late: 0, unmarked: 1 },
    });
    expect(result.body.items).toEqual([
      expect.objectContaining({ childId: childBId, mark: null }),
    ]);
  });

  it("returns no children when a permitted staff member has no dated band", async () => {
    if (!app) return;
    const result = await request(app.getHttpServer())
      .get(`/attendance/daily?date=${dateString}`)
      .set("Authorization", unassignedAuthorization);
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({
      permittedBands: [],
      items: [],
      total: 0,
      counts: { present: 0, absent: 0, late: 0, unmarked: 0 },
    });
  });

  it("denies missing permission, invalid dates, and a foreign site context", async () => {
    if (!app) return;
    const denied = await request(app.getHttpServer())
      .get(`/attendance/daily?date=${dateString}`)
      .set("Authorization", deniedAuthorization);
    expect(denied.status).toBe(403);

    const invalid = await request(app.getHttpServer())
      .get("/attendance/daily?date=2042-02-30")
      .set("Authorization", staffAuthorization);
    expect(invalid.status).toBe(400);

    await expect(
      new DailyAttendanceService().list(
        { date: dateString, page: 1, limit: 50 },
        { tenantId: siteBId, orgId, userId: staffId },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
