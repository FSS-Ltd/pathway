import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import { StudentDailyAttendanceService } from "../../attendance/student-daily-attendance.service";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";

const orgId = randomUUID();
const siteId = randomUUID();
const otherSiteId = randomUUID();
const childId = randomUUID();
const otherChildId = randomUUID();
const studentUserId = randomUUID();
const unrelatedUserId = randomUUID();
const recorderUserId = randomUUID();
const today = new Date(
  `${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`,
);
const yesterday = new Date(today.getTime() - 86_400_000);
const route = (site: string) => `/ace/student/sites/${site}/summary`;

describe("ACE student self web facade", () => {
  let app: INestApplication | undefined;
  let studentAuthorization = "";
  let unrelatedAuthorization = "";
  let linkId = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Student self ${orgId}`,
        slug: `student-self-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Student self site ${id}`,
        slug: `student-self-${id}`,
        timezone: "Europe/London",
      })),
    });
    studentAuthorization = (
      await seedE2eAuthUser({
        subject: `student-self-${studentUserId}`,
        userId: studentUserId,
        tenantId: siteId,
      })
    ).authorization;
    unrelatedAuthorization = (
      await seedE2eAuthUser({
        subject: `student-self-unrelated-${unrelatedUserId}`,
        userId: unrelatedUserId,
        tenantId: siteId,
      })
    ).authorization;
    await seedE2eAuthUser({
      subject: `student-self-recorder-${recorderUserId}`,
      userId: recorderUserId,
      tenantId: siteId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const academicYearId = randomUUID();
      const yearBandId = randomUUID();
      await tx.academicYear.create({
        data: {
          id: academicYearId,
          tenantId: siteId,
          name: "Student self year",
          startsOn: new Date(today.getTime() - 30 * 86_400_000),
          endsOn: new Date(today.getTime() + 30 * 86_400_000),
          status: "ARCHIVED",
        },
      });
      await tx.aceYearBand.create({
        data: { id: yearBandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.aceTeachingDate.create({
        data: {
          tenantId: siteId,
          academicYearId,
          date: yesterday,
          kind: "TEACHING",
        },
      });
      await tx.child.createMany({
        data: [
          { id: childId, firstName: "Sam", lastName: "Student" },
          { id: otherChildId, firstName: "Other", lastName: "Student" },
        ].map((child) => ({ ...child, tenantId: siteId })),
      });
      await tx.aceSchoolEnrollment.createMany({
        data: [childId, otherChildId].map((id) => ({
          tenantId: siteId,
          childId: id,
          academicYearId,
          yearBandId,
          startsOn: new Date(today.getTime() - 30 * 86_400_000),
        })),
      });
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteId, studentPortalEnabled: true },
      });
      const identity = await tx.studentIdentity.create({
        data: { tenantId: siteId, userId: studentUserId },
      });
      const link = await tx.studentIdentityLink.create({
        data: {
          tenantId: siteId,
          studentIdentityId: identity.id,
          childId,
        },
      });
      linkId = link.id;
      await tx.aceDailyAttendance.createMany({
        data: [childId, otherChildId].map((id) => ({
          tenantId: siteId,
          childId: id,
          date: yesterday,
          status: id === childId ? ("PRESENT" as const) : ("ABSENT" as const),
          absenceReason: id === childId ? null : ("SICK" as const),
          recordedByUserId: recorderUserId,
        })),
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

  it("returns only the signed-in student's released attendance", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .get(route(siteId))
      .set("Authorization", studentAuthorization);
    expect(response.status).toBe(200);
    expect(response.body.childName).toBe("Sam Student");
    expect(response.body.sections.attendance).toMatchObject({
      status: "ready",
      data: {
        childId,
        counts: { present: 1, absent: 0, late: 0 },
        items: [{ status: "PRESENT" }],
      },
    });
    for (const section of [
      "homework",
      "pace",
      "faith",
      "reports",
      "slips",
      "community",
    ]) {
      expect(response.body.sections[section]).toEqual({
        status: "unavailable",
      });
    }
    expect(JSON.stringify(response.body)).not.toContain(otherChildId);
    expect(JSON.stringify(response.body)).not.toContain("ABSENT");
    const contexts = await request(app.getHttpServer())
      .get("/ace/family/contexts")
      .set("Authorization", studentAuthorization);
    expect(contexts.status).toBe(200);
    expect(contexts.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "student",
          childId,
          sections: expect.arrayContaining(["student-summary"]),
        }),
      ]),
    );
  });

  it("denies unrelated, wrong-site, and anonymous reads", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    expect(
      (
        await request(server)
          .get(route(siteId))
          .set("Authorization", unrelatedAuthorization)
      ).status,
    ).toBe(404);
    expect(
      (
        await request(server)
          .get(route(otherSiteId))
          .set("Authorization", studentAuthorization)
      ).status,
    ).toBe(404);
    expect((await request(server).get(route(siteId))).status).toBe(401);
  });

  it("denies a disabled portal, inactive account, and revoked link", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.studentPortalPolicy.update({
        where: { tenantId: siteId },
        data: { studentPortalEnabled: false },
      }),
    );
    try {
      expect(
        (
          await request(server)
            .get(route(siteId))
            .set("Authorization", studentAuthorization)
        ).status,
      ).toBe(404);
    } finally {
      await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.studentPortalPolicy.update({
          where: { tenantId: siteId },
          data: { studentPortalEnabled: true },
        }),
      );
    }
    await prisma.user.update({
      where: { id: studentUserId },
      data: { isActive: false },
    });
    try {
      expect(
        (
          await request(server)
            .get(route(siteId))
            .set("Authorization", studentAuthorization)
        ).status,
      ).toBe(404);
    } finally {
      await prisma.user.update({
        where: { id: studentUserId },
        data: { isActive: true },
      });
    }
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.studentIdentityLink.update({
        where: { id: linkId },
        data: {
          revokedAt: new Date(),
          revokedByUserId: recorderUserId,
          revocationReason: "Access review test",
        },
      }),
    );
    try {
      expect(
        (
          await request(server)
            .get(route(siteId))
            .set("Authorization", studentAuthorization)
        ).status,
      ).toBe(404);
    } finally {
      await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.studentIdentityLink.update({
          where: { id: linkId },
          data: {
            revokedAt: null,
            revokedByUserId: null,
            revocationReason: null,
          },
        }),
      );
    }
  });

  it("denies a student whose school enrolment has ended", async () => {
    if (!app) return;
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceSchoolEnrollment.updateMany({
        where: { tenantId: siteId, childId },
        data: { endsOn: yesterday },
      }),
    );
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId))
        .set("Authorization", studentAuthorization);
      expect(response.status).toBe(404);
      const contexts = await request(app.getHttpServer())
        .get("/ace/family/contexts")
        .set("Authorization", studentAuthorization);
      expect(contexts.body.items[0].sections).not.toContain("student-summary");
    } finally {
      await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.aceSchoolEnrollment.updateMany({
          where: { tenantId: siteId, childId },
          data: { endsOn: null },
        }),
      );
    }
  });

  it("does not return attendance if the student link is revoked during the read", async () => {
    if (!app) return;
    const attendance = app.get(StudentDailyAttendanceService);
    const originalList = attendance.list.bind(attendance);
    const spy = jest
      .spyOn(attendance, "list")
      .mockImplementationOnce(async (site, query, user) => {
        const result = await originalList(site, query, user);
        await withTenantRlsContext(siteId, orgId, (tx) =>
          tx.studentIdentityLink.update({
            where: { id: linkId },
            data: {
              revokedAt: new Date(),
              revokedByUserId: recorderUserId,
              revocationReason: "Access changed during read",
            },
          }),
        );
        return result;
      });
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId))
        .set("Authorization", studentAuthorization);
      expect(response.status).toBe(404);
      expect(JSON.stringify(response.body)).not.toContain("PRESENT");
    } finally {
      spy.mockRestore();
      await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.studentIdentityLink.update({
          where: { id: linkId },
          data: {
            revokedAt: null,
            revokedByUserId: null,
            revocationReason: null,
          },
        }),
      );
    }
  });

  it("isolates an attendance failure without exposing internal details", async () => {
    if (!app) return;
    const attendance = app.get(StudentDailyAttendanceService);
    const spy = jest
      .spyOn(attendance, "list")
      .mockRejectedValueOnce(new Error("private attendance detail"));
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId))
        .set("Authorization", studentAuthorization);
      expect(response.status).toBe(200);
      expect(response.body.sections.attendance.status).toBe("error");
      expect(JSON.stringify(response.body)).not.toContain(
        "private attendance detail",
      );
    } finally {
      spy.mockRestore();
    }
  });

  it("can disable its attendance section independently", async () => {
    if (!app) return;
    const original = process.env.ACE_STUDENT_FACADE_ATTENDANCE_ENABLED;
    process.env.ACE_STUDENT_FACADE_ATTENDANCE_ENABLED = "false";
    try {
      const response = await request(app.getHttpServer())
        .get(route(siteId))
        .set("Authorization", studentAuthorization);
      expect(response.status).toBe(200);
      expect(response.body.sections.attendance).toEqual({
        status: "unavailable",
      });
    } finally {
      if (original === undefined) {
        delete process.env.ACE_STUDENT_FACADE_ATTENDANCE_ENABLED;
      } else {
        process.env.ACE_STUDENT_FACADE_ATTENDANCE_ENABLED = original;
      }
    }
  });
});
