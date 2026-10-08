import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import { requireDatabase, seedE2eAuthUser } from "../../../test-helpers.e2e";

const orgAId = randomUUID();
const orgBId = randomUUID();
const siteAId = randomUUID();
const siteBId = randomUUID();
const siteCId = randomUUID();
const childAId = randomUUID();
const childBId = randomUUID();
const studentChildId = randomUUID();
const fullUserId = randomUUID();
const limitedUserId = randomUUID();
const studentUserId = randomUUID();
const unrelatedUserId = randomUUID();
const route = "/ace/family/contexts";

describe("ACE family context discovery", () => {
  let app: INestApplication | undefined;
  let fullAuthorization = "";
  let limitedAuthorization = "";
  let studentAuthorization = "";
  let unrelatedAuthorization = "";

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.createMany({
      data: [
        {
          id: orgAId,
          name: "Family discovery A",
          slug: `family-a-${orgAId}`,
          planCode: "trial",
        },
        {
          id: orgBId,
          name: "Family discovery B",
          slug: `family-b-${orgBId}`,
          planCode: "trial",
        },
      ],
    });
    await prisma.orgVertical.createMany({
      data: [orgAId, orgBId].map((orgId) => ({
        orgId,
        vertical: "ACE_SCHOOL",
      })),
    });
    await prisma.tenant.createMany({
      data: [
        {
          id: siteAId,
          orgId: orgAId,
          name: "Alpha School",
          slug: `family-site-${siteAId}`,
        },
        {
          id: siteBId,
          orgId: orgBId,
          name: "Bravo School",
          slug: `family-site-${siteBId}`,
        },
        {
          id: siteCId,
          orgId: orgAId,
          name: "Gamma School",
          slug: `family-site-${siteCId}`,
        },
      ],
    });
    fullAuthorization = (
      await seedE2eAuthUser({
        subject: `family-full-${fullUserId}`,
        userId: fullUserId,
        tenantId: siteAId,
      })
    ).authorization;
    limitedAuthorization = (
      await seedE2eAuthUser({
        subject: `family-limited-${limitedUserId}`,
        userId: limitedUserId,
        tenantId: siteAId,
      })
    ).authorization;
    studentAuthorization = (
      await seedE2eAuthUser({
        subject: `family-student-${studentUserId}`,
        userId: studentUserId,
        tenantId: siteCId,
      })
    ).authorization;
    unrelatedAuthorization = (
      await seedE2eAuthUser({
        subject: `family-unrelated-${unrelatedUserId}`,
        userId: unrelatedUserId,
        tenantId: siteAId,
      })
    ).authorization;

    await withTenantRlsContext(siteAId, orgAId, async (tx) => {
      await tx.child.create({
        data: {
          id: childAId,
          tenantId: siteAId,
          firstName: "Ari",
          lastName: "Alpha",
        },
      });
      const full = await tx.guardianIdentity.create({
        data: { tenantId: siteAId, userId: fullUserId },
      });
      const limited = await tx.guardianIdentity.create({
        data: { tenantId: siteAId, userId: limitedUserId },
      });
      await tx.guardianChildRelationship.createMany({
        data: [
          {
            tenantId: siteAId,
            guardianIdentityId: full.id,
            childId: childAId,
            legalAccess: "FULL",
          },
          {
            tenantId: siteAId,
            guardianIdentityId: limited.id,
            childId: childAId,
            legalAccess: "LIMITED",
          },
        ],
      });
    });
    await withTenantRlsContext(siteBId, orgBId, async (tx) => {
      await tx.child.create({
        data: {
          id: childBId,
          tenantId: siteBId,
          firstName: "Bea",
          lastName: "Bravo",
        },
      });
      const guardian = await tx.guardianIdentity.create({
        data: { tenantId: siteBId, userId: fullUserId },
      });
      await tx.guardianChildRelationship.create({
        data: {
          tenantId: siteBId,
          guardianIdentityId: guardian.id,
          childId: childBId,
          legalAccess: "FULL",
        },
      });
    });
    await withTenantRlsContext(siteCId, orgAId, async (tx) => {
      await tx.child.create({
        data: {
          id: studentChildId,
          tenantId: siteCId,
          firstName: "Sam",
          lastName: "Student",
        },
      });
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteCId, studentPortalEnabled: true },
      });
      const student = await tx.studentIdentity.create({
        data: { tenantId: siteCId, userId: studentUserId },
      });
      await tx.studentIdentityLink.create({
        data: {
          tenantId: siteCId,
          studentIdentityId: student.id,
          childId: studentChildId,
        },
      });
      const limitedGuardian = await tx.guardianIdentity.create({
        data: { tenantId: siteCId, userId: fullUserId },
      });
      await tx.guardianChildRelationship.create({
        data: {
          tenantId: siteCId,
          guardianIdentityId: limitedGuardian.id,
          childId: studentChildId,
          legalAccess: "LIMITED",
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

  it("discovers only active full guardian and student contexts across sites", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const full = await request(server)
      .get(route)
      .set("Authorization", fullAuthorization);
    expect(full.status).toBe(200);
    expect(full.body).toEqual({
      items: [
        {
          kind: "parent",
          siteId: siteAId,
          siteName: "Alpha School",
          childId: childAId,
          childName: "Ari Alpha",
        },
        {
          kind: "parent",
          siteId: siteBId,
          siteName: "Bravo School",
          childId: childBId,
          childName: "Bea Bravo",
        },
      ],
    });

    const student = await request(server)
      .get(route)
      .set("Authorization", studentAuthorization);
    expect(student.status).toBe(200);
    expect(student.body).toEqual({
      items: [
        {
          kind: "student",
          siteId: siteCId,
          siteName: "Gamma School",
          childId: studentChildId,
          childName: "Sam Student",
        },
      ],
    });
    for (const authorization of [
      limitedAuthorization,
      unrelatedAuthorization,
    ]) {
      const response = await request(server)
        .get(route)
        .set("Authorization", authorization);
      expect(response.status).toBe(200);
      expect(response.body).toEqual({ items: [] });
    }
    expect((await request(server).get(route)).status).toBe(401);
  });

  it("removes disabled, revoked and ended links on the next read", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    await prisma.org.update({
      where: { id: orgBId },
      data: { parentPortalEnabled: false },
    });
    let response = await request(server)
      .get(route)
      .set("Authorization", fullAuthorization);
    expect(response.status).toBe(200);
    expect(
      response.body.items.map((item: { siteId: string }) => item.siteId),
    ).toEqual([siteAId]);

    await withTenantRlsContext(siteAId, orgAId, (tx) =>
      tx.guardianChildRelationship.updateMany({
        where: {
          tenantId: siteAId,
          childId: childAId,
          guardianIdentity: { userId: fullUserId },
        },
        data: {
          revokedAt: new Date(),
          revokedByUserId: fullUserId,
          revocationReason: "Test revocation",
        },
      }),
    );
    response = await request(server)
      .get(route)
      .set("Authorization", fullAuthorization);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });

    await withTenantRlsContext(siteCId, orgAId, (tx) =>
      tx.studentPortalPolicy.update({
        where: { tenantId: siteCId },
        data: { studentPortalEnabled: false },
      }),
    );
    response = await request(server)
      .get(route)
      .set("Authorization", studentAuthorization);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });

    await withTenantRlsContext(siteCId, orgAId, async (tx) => {
      await tx.studentPortalPolicy.update({
        where: { tenantId: siteCId },
        data: { studentPortalEnabled: true },
      });
      await tx.studentIdentityLink.updateMany({
        where: {
          tenantId: siteCId,
          studentIdentity: { userId: studentUserId },
        },
        data: { endedAt: new Date() },
      });
    });
    response = await request(server)
      .get(route)
      .set("Authorization", studentAuthorization);
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ items: [] });
  });

  it("RLS reveals only the actor's identity site IDs without tenant context", async () => {
    if (!app || process.env.E2E_USE_GLOBAL_SETUP !== "true") return;
    const rows = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      await tx.$executeRaw`SELECT set_config('app.user_id', ${fullUserId}, true)`;
      const guardians = await tx.guardianIdentity.findMany({
        select: { tenantId: true },
        orderBy: { tenantId: "asc" },
      });
      const students = await tx.studentIdentity.findMany({
        select: { tenantId: true },
      });
      const relationships = await tx.guardianChildRelationship.count();
      return { guardians, students, relationships };
    });
    expect(rows.guardians.map(({ tenantId }) => tenantId)).toEqual(
      [siteAId, siteBId, siteCId].sort(),
    );
    expect(rows.students).toEqual([]);
    expect(rows.relationships).toBe(0);

    const withoutActor = await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL ROLE "pathway_e2e_tenant_rls"');
      return tx.guardianIdentity.count();
    });
    expect(withoutActor).toBe(0);
  });
});
