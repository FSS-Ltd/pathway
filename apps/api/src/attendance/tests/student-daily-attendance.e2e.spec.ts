import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";

const orgId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const studentUserId = randomUUID();
const unrelatedUserId = randomUUID();
const recorderId = randomUUID();
const childId = randomUUID();
const attendanceDate = new Date(Date.now() - 2 * 86_400_000);
const dateString = attendanceDate.toISOString().slice(0, 10);
const date = new Date(`${dateString}T00:00:00.000Z`);
const route = `/ace/student/sites/${siteId}/attendance/daily?from=${dateString}&to=${dateString}`;

describe("ACE student daily attendance history", () => {
  let app: INestApplication | undefined;
  let studentAuthorization = "";
  let unrelatedAuthorization = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Student daily attendance ${orgId}`,
        slug: `student-daily-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Student daily site ${id}`,
        slug: `student-daily-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    studentAuthorization = (
      await seedE2eAuthUser({
        subject: `student-daily-${studentUserId}`,
        userId: studentUserId,
        tenantId: siteId,
      })
    ).authorization;
    unrelatedAuthorization = (
      await seedE2eAuthUser({
        subject: `student-daily-unrelated-${unrelatedUserId}`,
        userId: unrelatedUserId,
        tenantId: siteId,
      })
    ).authorization;
    await seedE2eAuthUser({
      subject: `student-daily-recorder-${recorderId}`,
      userId: recorderId,
      tenantId: siteId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_MEMBER",
    });

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const academicYearId = randomUUID();
      const bandId = randomUUID();
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteId, studentPortalEnabled: true },
      });
      await tx.academicYear.create({
        data: {
          id: academicYearId,
          tenantId: siteId,
          name: "Student attendance test year",
          startsOn: new Date(date.getTime() - 30 * 86_400_000),
          endsOn: new Date(date.getTime() + 30 * 86_400_000),
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
      await tx.aceYearBand.create({
        data: { id: bandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.child.create({
        data: {
          id: childId,
          tenantId: siteId,
          firstName: "Student",
          lastName: "History",
        },
      });
      await tx.aceSchoolEnrollment.create({
        data: {
          tenantId: siteId,
          childId,
          academicYearId,
          yearBandId: bandId,
          startsOn: new Date(date.getTime() - 30 * 86_400_000),
        },
      });
      await tx.aceDailyAttendance.create({
        data: {
          tenantId: siteId,
          childId,
          date,
          status: "ABSENT",
          absenceReason: "SICK",
          recordedByUserId: recorderId,
        },
      });
      const identity = await tx.studentIdentity.create({
        data: { tenantId: siteId, userId: studentUserId },
      });
      await tx.studentIdentityLink.create({
        data: {
          tenantId: siteId,
          studentIdentityId: identity.id,
          childId,
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

  it("returns only the active student's issued marks without staff metadata", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .get(route)
      .set("Authorization", studentAuthorization);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      siteId,
      childId,
      from: dateString,
      to: dateString,
      counts: { present: 0, absent: 1, late: 0 },
      items: [{ date: dateString, status: "ABSENT", absenceReason: "SICK" }],
    });
  });

  it("denies unrelated users and other sites without revealing a child", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const unrelated = await request(server)
      .get(route)
      .set("Authorization", unrelatedAuthorization);
    const foreignSite = await request(server)
      .get(
        `/ace/student/sites/${otherSiteId}/attendance/daily?from=${dateString}&to=${dateString}`,
      )
      .set("Authorization", studentAuthorization);
    const anonymous = await request(server).get(route);
    expect(unrelated.status).toBe(404);
    expect(foreignSite.status).toBe(404);
    expect(anonymous.status).toBe(401);
  });

  it("rejects invalid, oversized and future date ranges", async () => {
    if (!app) return;
    const base = `/ace/student/sites/${siteId}/attendance/daily`;
    for (const query of [
      `from=${dateString}&to=not-a-date`,
      `from=2020-01-01&to=${dateString}`,
      `from=2999-01-01&to=2999-01-01`,
    ]) {
      const response = await request(app.getHttpServer())
        .get(`${base}?${query}`)
        .set("Authorization", studentAuthorization);
      expect(response.status).toBe(400);
    }
  });

  it("rechecks portal policy and link revocation on each read", async () => {
    if (!app) return;
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.studentPortalPolicy.update({
        where: { tenantId: siteId },
        data: { studentPortalEnabled: false },
      }),
    );
    const disabled = await request(app.getHttpServer())
      .get(route)
      .set("Authorization", studentAuthorization);
    expect(disabled.status).toBe(404);

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.studentPortalPolicy.update({
        where: { tenantId: siteId },
        data: { studentPortalEnabled: true },
      });
      await tx.studentIdentityLink.updateMany({
        where: { tenantId: siteId, childId },
        data: {
          revokedAt: new Date(),
          revokedByUserId: recorderId,
          revocationReason: "Student portal access closed",
        },
      });
    });
    const revoked = await request(app.getHttpServer())
      .get(route)
      .set("Authorization", studentAuthorization);
    expect(revoked.status).toBe(404);
  });
});
