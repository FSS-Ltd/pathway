import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { SYSTEM_ROLE_TEMPLATES } from "@pathway/auth";
import {
  AceDailyAbsenceReason,
  AttendanceStatus,
  prisma,
  withTenantRlsContext,
} from "@pathway/db";
import request from "supertest";
import { AccessCacheService } from "../../access-control/access-cache.service";
import { withSystemRoleFixtureWrites } from "../../access-control/tests/system-role-fixture";
import { AppModule } from "../../app.module";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";
import { DailyAttendanceExportService } from "../daily-attendance-export.service";

const orgId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const leadId = randomUUID();
const staffId = randomUUID();
const otherStaffId = randomUUID();
const bandAId = randomUUID();
const bandBId = randomUUID();
const otherBandId = randomUUID();
const childAId = randomUUID();
const childBId = randomUUID();
const otherChildId = randomUUID();
const firstDate = "2042-09-02";
const secondDate = "2042-09-03";
const date = (value: string) => new Date(`${value}T00:00:00.000Z`);

describe("ACE daily attendance export", () => {
  let app: INestApplication | undefined;
  let leadAuthorization = "";
  let staffAuthorization = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Daily export ${orgId}`,
        slug: `daily-export-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Daily export site ${id}`,
        slug: `daily-export-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    leadAuthorization = (
      await seedE2eAuthUser({
        subject: `daily-export-lead-${leadId}`,
        userId: leadId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    staffAuthorization = (
      await seedE2eAuthUser({
        subject: `daily-export-staff-${staffId}`,
        userId: staffId,
        tenantId: siteId,
        siteRole: "STAFF",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    await seedE2eAuthUser({
      subject: `daily-export-other-${otherStaffId}`,
      userId: otherStaffId,
      tenantId: otherSiteId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });

    await withSystemRoleFixtureWrites(async (tx) => {
      const roleDefinitionId = randomUUID();
      await tx.orgRoleDefinition.create({
        data: {
          id: roleDefinitionId,
          orgId,
          tenantId: siteId,
          name: SYSTEM_ROLE_TEMPLATES.siteLead.name,
          scope: "site",
          isSystem: true,
          createdById: leadId,
          updatedById: leadId,
          permissions: {
            create: {
              permissionKey: "ace.attendance.export",
              grantedById: leadId,
            },
          },
        },
      });
      await tx.userRoleAssignment.create({
        data: {
          orgId,
          tenantId: siteId,
          userId: leadId,
          roleDefinitionId,
          assignedById: leadId,
        },
      });
    });

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const academicYearId = randomUUID();
      await tx.academicYear.create({
        data: {
          id: academicYearId,
          tenantId: siteId,
          name: `Export year ${academicYearId}`,
          startsOn: date("2042-09-01"),
          endsOn: date("2043-08-31"),
          status: "ARCHIVED",
        },
      });
      await tx.aceYearBand.createMany({
        data: [
          { id: bandAId, tenantId: siteId, name: "Primary" },
          { id: bandBId, tenantId: siteId, name: "Secondary" },
        ],
      });
      for (const [childId, yearBandId, preferredName] of [
        [childAId, bandAId, '=2+2,"formula"'],
        [childBId, bandBId, null],
      ] as const) {
        await tx.child.create({
          data: {
            id: childId,
            tenantId: siteId,
            firstName: "Daily",
            lastName: "Student",
            preferredName,
          },
        });
        await tx.aceSchoolEnrollment.create({
          data: {
            tenantId: siteId,
            childId,
            academicYearId,
            yearBandId,
            startsOn: date("2042-09-01"),
          },
        });
      }
      await tx.aceTeachingDate.createMany({
        data: [firstDate, secondDate].map((value) => ({
          tenantId: siteId,
          academicYearId,
          date: date(value),
          kind: "TEACHING" as const,
        })),
      });
      await tx.aceStaffYearBandAssignment.create({
        data: {
          tenantId: siteId,
          userId: staffId,
          yearBandId: bandAId,
          startsOn: date(firstDate),
          endsOn: date(firstDate),
        },
      });
      await tx.aceDailyAttendance.createMany({
        data: [
          {
            childId: childAId,
            date: date(firstDate),
            status: AttendanceStatus.PRESENT,
          },
          {
            childId: childAId,
            date: date(secondDate),
            status: AttendanceStatus.LATE,
          },
          {
            childId: childBId,
            date: date(firstDate),
            status: AttendanceStatus.ABSENT,
            absenceReason: AceDailyAbsenceReason.SICK,
          },
        ].map((mark) => ({
          ...mark,
          tenantId: siteId,
          recordedByUserId: leadId,
        })),
      });
    });
    await withTenantRlsContext(otherSiteId, orgId, async (tx) => {
      const academicYearId = randomUUID();
      await tx.academicYear.create({
        data: {
          id: academicYearId,
          tenantId: otherSiteId,
          name: `Other export year ${academicYearId}`,
          startsOn: date("2042-09-01"),
          endsOn: date("2043-08-31"),
          status: "ARCHIVED",
        },
      });
      await tx.aceYearBand.create({
        data: { id: otherBandId, tenantId: otherSiteId, name: "Other" },
      });
      await tx.child.create({
        data: {
          id: otherChildId,
          tenantId: otherSiteId,
          firstName: "Other",
          lastName: "Student",
        },
      });
      await tx.aceSchoolEnrollment.create({
        data: {
          tenantId: otherSiteId,
          childId: otherChildId,
          academicYearId,
          yearBandId: otherBandId,
          startsOn: date("2042-09-01"),
        },
      });
      await tx.aceTeachingDate.create({
        data: {
          tenantId: otherSiteId,
          academicYearId,
          date: date(firstDate),
          kind: "TEACHING",
        },
      });
      await tx.aceDailyAttendance.create({
        data: {
          tenantId: otherSiteId,
          childId: otherChildId,
          date: date(firstDate),
          status: "PRESENT",
          recordedByUserId: otherStaffId,
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

  it("restricts CSV to the site and dated bands, and audits successful exports", async () => {
    if (!app) return;
    const url = `/attendance/daily/export?from=${firstDate}&to=${secondDate}`;
    expect(
      (
        await request(app.getHttpServer())
          .get(url)
          .set("Authorization", staffAuthorization)
      ).status,
    ).toBe(403);

    const lead = await request(app.getHttpServer())
      .get(url)
      .set("Authorization", leadAuthorization);
    expect(lead.status).toBe(200);
    expect(lead.headers["content-type"]).toContain("text/csv");
    expect(lead.headers["content-disposition"]).toContain("attachment;");
    expect(lead.text).toContain("'=2+2,");
    expect(lead.text).toContain(childBId);
    expect(lead.text).toContain(secondDate);
    expect(lead.text).not.toContain(otherChildId);

    const foreignChild = await request(app.getHttpServer())
      .get(`${url}&childId=${otherChildId}`)
      .set("Authorization", leadAuthorization);
    expect(foreignChild.status).toBe(200);
    expect(foreignChild.text).toContain("Student ID");
    expect(foreignChild.text).not.toContain(otherChildId);

    const grant = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.accessTagGrant.create({
        data: {
          orgId,
          tenantId: siteId,
          userId: staffId,
          tagKey: "ATTENDANCE_EXPORTER",
          grantedById: leadId,
        },
      }),
    );
    await app.get(AccessCacheService).invalidateUser(staffId, orgId);
    const staff = await request(app.getHttpServer())
      .get(url)
      .set("Authorization", staffAuthorization);
    expect(staff.status).toBe(200);
    expect(staff.text).toContain(childAId);
    expect(staff.text).not.toContain(childBId);
    expect(staff.text).not.toContain(secondDate);
    expect(staff.text).not.toContain(otherChildId);

    const audits = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.auditEvent.findMany({
        where: {
          tenantId: siteId,
          entityType: "ACE_RECORD",
          action: "EXPORTED",
        },
        select: { actorUserId: true, metadata: true },
      }),
    );
    expect(audits).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          actorUserId: leadId,
          metadata: expect.objectContaining({ rowCount: 3 }),
        }),
        expect.objectContaining({
          actorUserId: leadId,
          metadata: expect.objectContaining({
            rowCount: 0,
            childId: otherChildId,
          }),
        }),
        expect.objectContaining({
          actorUserId: staffId,
          metadata: expect.objectContaining({ rowCount: 1 }),
        }),
      ]),
    );

    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.accessTagGrant.update({
        where: { id: grant.id },
        data: { revokedAt: new Date(), revokedById: leadId },
      }),
    );
    await app.get(AccessCacheService).invalidateUser(staffId, orgId);
    expect(
      (
        await request(app.getHttpServer())
          .get(url)
          .set("Authorization", staffAuthorization)
      ).status,
    ).toBe(403);

    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.accessTagGrant.create({
        data: {
          orgId,
          tenantId: siteId,
          userId: staffId,
          tagKey: "ATTENDANCE_EXPORTER",
          grantedById: leadId,
          startsAt: new Date("2026-01-01T00:00:00.000Z"),
          expiresAt: new Date("2026-02-01T00:00:00.000Z"),
        },
      }),
    );
    await app.get(AccessCacheService).invalidateUser(staffId, orgId);
    expect(
      (
        await request(app.getHttpServer())
          .get(url)
          .set("Authorization", staffAuthorization)
      ).status,
    ).toBe(403);
  });

  it("rejects invalid ranges and an unauthorised site switch", async () => {
    if (!app) return;
    for (const query of [
      "from=2042-02-30&to=2042-03-01",
      "from=2042-09-03&to=2042-09-02",
      "from=2042-09-01&to=2042-10-02",
    ]) {
      const result = await request(app.getHttpServer())
        .get(`/attendance/daily/export?${query}`)
        .set("Authorization", leadAuthorization);
      expect(result.status).toBe(400);
    }
    await expect(
      new DailyAttendanceExportService().export(
        { from: firstDate, to: secondDate },
        { tenantId: otherSiteId, orgId, userId: leadId },
      ),
    ).rejects.toMatchObject({ status: 403 });
  });
});
