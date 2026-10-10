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
const childId = randomUUID();
const otherChildId = randomUUID();
const fullUserId = randomUUID();
const limitedUserId = randomUUID();
const unrelatedUserId = randomUUID();
const recorderId = randomUUID();
const dateString = new Date(Date.now() - 2 * 86_400_000)
  .toISOString()
  .slice(0, 10);
const date = new Date(`${dateString}T00:00:00.000Z`);
const base = `/ace/parent/sites/${siteId}/children/${childId}/attendance/daily`;
const route = `${base}?from=${dateString}&to=${dateString}`;

describe("ACE parent daily attendance history", () => {
  let app: INestApplication | undefined;
  let fullAuthorization = "";
  let limitedAuthorization = "";
  let unrelatedAuthorization = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Parent daily attendance ${orgId}`,
        slug: `parent-daily-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `Parent daily site ${id}`,
        slug: `parent-daily-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    fullAuthorization = (
      await seedE2eAuthUser({
        subject: `parent-daily-full-${fullUserId}`,
        userId: fullUserId,
        tenantId: siteId,
      })
    ).authorization;
    limitedAuthorization = (
      await seedE2eAuthUser({
        subject: `parent-daily-limited-${limitedUserId}`,
        userId: limitedUserId,
        tenantId: siteId,
      })
    ).authorization;
    unrelatedAuthorization = (
      await seedE2eAuthUser({
        subject: `parent-daily-unrelated-${unrelatedUserId}`,
        userId: unrelatedUserId,
        tenantId: siteId,
      })
    ).authorization;
    await seedE2eAuthUser({
      subject: `parent-daily-recorder-${recorderId}`,
      userId: recorderId,
      tenantId: siteId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_MEMBER",
    });

    await withTenantRlsContext(siteId, orgId, async (tx) => {
      const academicYearId = randomUUID();
      const bandId = randomUUID();
      await tx.academicYear.create({
        data: {
          id: academicYearId,
          tenantId: siteId,
          name: "Parent attendance test year",
          startsOn: new Date(date.getTime() - 30 * 86_400_000),
          endsOn: new Date(date.getTime() + 30 * 86_400_000),
          status: "ARCHIVED",
        },
      });
      await tx.aceTeachingDate.create({
        data: { tenantId: siteId, academicYearId, date, kind: "TEACHING" },
      });
      await tx.aceYearBand.create({
        data: { id: bandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.child.createMany({
        data: [childId, otherChildId].map((id) => ({
          id,
          tenantId: siteId,
          firstName: "Parent",
          lastName: `History ${id}`,
        })),
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
      for (const [userId, legalAccess] of [
        [fullUserId, "FULL"],
        [limitedUserId, "LIMITED"],
      ] as const) {
        const guardian = await tx.guardianIdentity.create({
          data: { tenantId: siteId, userId },
        });
        await tx.guardianChildRelationship.create({
          data: {
            tenantId: siteId,
            guardianIdentityId: guardian.id,
            childId,
            legalAccess,
          },
        });
      }
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

  it("returns issued marks for the full-access linked child without staff details", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .get(route)
      .set("Authorization", fullAuthorization);
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

  it("denies a disabled guardian even while the child link remains active", async () => {
    if (!app) return;
    await prisma.user.update({
      where: { id: fullUserId },
      data: { isActive: false },
    });
    try {
      const response = await request(app.getHttpServer())
        .get(route)
        .set("Authorization", fullAuthorization);
      expect(response.status).toBe(404);
    } finally {
      await prisma.user.update({
        where: { id: fullUserId },
        data: { isActive: true },
      });
    }
  });

  it("denies limited, unrelated, wrong-child, wrong-site and anonymous reads", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const denied = await Promise.all([
      request(server).get(route).set("Authorization", limitedAuthorization),
      request(server).get(route).set("Authorization", unrelatedAuthorization),
      request(server)
        .get(
          `/ace/parent/sites/${siteId}/children/${otherChildId}/attendance/daily?from=${dateString}&to=${dateString}`,
        )
        .set("Authorization", fullAuthorization),
      request(server)
        .get(
          `/ace/parent/sites/${otherSiteId}/children/${childId}/attendance/daily?from=${dateString}&to=${dateString}`,
        )
        .set("Authorization", fullAuthorization),
    ]);
    expect(denied.map(({ status }) => status)).toEqual([404, 404, 404, 404]);
    expect((await request(server).get(route)).status).toBe(401);

    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.guardianChildRelationship.updateMany({
        where: {
          tenantId: siteId,
          childId,
          guardianIdentity: { userId: limitedUserId },
        },
        data: { legalAccess: "NONE" },
      }),
    );
    expect(
      (
        await request(server)
          .get(route)
          .set("Authorization", limitedAuthorization)
      ).status,
    ).toBe(404);
  });

  it("rejects invalid, oversized and future ranges", async () => {
    if (!app) return;
    for (const query of [
      `from=${dateString}&to=not-a-date`,
      `from=2020-01-01&to=${dateString}`,
      `from=2999-01-01&to=2999-01-01`,
    ]) {
      const response = await request(app.getHttpServer())
        .get(`${base}?${query}`)
        .set("Authorization", fullAuthorization);
      expect(response.status).toBe(400);
    }
  });

  it("rechecks the organisation parent portal switch on each read", async () => {
    if (!app) return;
    await prisma.org.update({
      where: { id: orgId },
      data: { parentPortalEnabled: false },
    });
    try {
      const disabled = await request(app.getHttpServer())
        .get(route)
        .set("Authorization", fullAuthorization);
      expect(disabled.status).toBe(404);
    } finally {
      await prisma.org.update({
        where: { id: orgId },
        data: { parentPortalEnabled: true },
      });
    }
    const enabled = await request(app.getHttpServer())
      .get(route)
      .set("Authorization", fullAuthorization);
    expect(enabled.status).toBe(200);
  });

  it("rechecks relationship start, end and revocation on each read", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const update = (data: {
      startsAt?: Date;
      endedAt?: Date | null;
      revokedAt?: Date | null;
      revokedByUserId?: string | null;
      revocationReason?: string | null;
    }) =>
      withTenantRlsContext(siteId, orgId, (tx) =>
        tx.guardianChildRelationship.updateMany({
          where: {
            tenantId: siteId,
            childId,
            guardianIdentity: { userId: fullUserId },
          },
          data,
        }),
      );

    await update({ startsAt: new Date(Date.now() + 86_400_000) });
    expect(
      (await request(server).get(route).set("Authorization", fullAuthorization))
        .status,
    ).toBe(404);
    await update({
      startsAt: new Date(Date.now() - 86_400_000),
      endedAt: new Date(),
    });
    expect(
      (await request(server).get(route).set("Authorization", fullAuthorization))
        .status,
    ).toBe(404);
    await update({
      endedAt: null,
      revokedAt: new Date(),
      revokedByUserId: recorderId,
      revocationReason: "Guardian attendance access closed",
    });
    expect(
      (await request(server).get(route).set("Authorization", fullAuthorization))
        .status,
    ).toBe(404);
  });
});
