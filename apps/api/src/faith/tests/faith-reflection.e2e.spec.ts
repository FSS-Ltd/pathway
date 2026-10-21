import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";

describe("ACE Faith reflection HTTP policy", () => {
  const orgId = randomUUID();
  const siteId = randomUUID();
  const leaderId = randomUUID();
  const studentUserId = randomUUID();
  const guardianUserId = randomUUID();
  const childId = randomUUID();
  const otherChildId = randomUUID();
  const yearId = randomUUID();
  const bandId = randomUUID();
  const contentId = randomUUID();
  let versionId = "";
  let studentIdentityId = "";
  let app: INestApplication;
  let leaderAuth = "";
  let studentAuth = "";
  let guardianAuth = "";
  const roles: Array<Awaited<ReturnType<typeof seedE2eTypedRole>>> = [];
  const oldReflections = process.env.ACE_FAITH_REFLECTIONS_ENABLED;
  const oldAuthoring = process.env.ACE_FAITH_AUTHORING_ENABLED;

  beforeAll(async () => {
    if (!requireDatabase())
      throw new Error("PostgreSQL is required for Faith reflection E2E");
    process.env.ACE_FAITH_REFLECTIONS_ENABLED = "true";
    process.env.ACE_FAITH_AUTHORING_ENABLED = "true";
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Faith reflections ${orgId}`,
        slug: `faith-reflections-${orgId}`,
        planCode: "trial",
        parentPortalEnabled: true,
      },
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    await prisma.tenant.create({
      data: {
        id: siteId,
        orgId,
        name: "Faith reflection school",
        slug: `faith-reflections-${siteId}`,
        timezone: "Europe/London",
      },
    });
    leaderAuth = (
      await seedE2eAuthUser({
        subject: `faith-reflection-leader-${leaderId}`,
        userId: leaderId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_ADMIN",
      })
    ).authorization;
    studentAuth = (
      await seedE2eAuthUser({
        subject: `faith-reflection-student-${studentUserId}`,
        userId: studentUserId,
        tenantId: siteId,
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    guardianAuth = (
      await seedE2eAuthUser({
        subject: `faith-reflection-guardian-${guardianUserId}`,
        userId: guardianUserId,
        tenantId: siteId,
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    roles.push(
      await seedE2eTypedRole({
        orgId,
        tenantId: siteId,
        userId: leaderId,
        scope: "site",
        permissionKeys: [
          "ace.faith.manage",
          "ace.faith.read",
          "ace.faith.publish",
        ],
      }),
    );
    roles.push(
      await seedE2eTypedRole({
        orgId,
        tenantId: siteId,
        userId: studentUserId,
        scope: "site",
        permissionKeys: ["ace.faith.read", "ace.faith.reflect"],
      }),
    );
    roles.push(
      await seedE2eTypedRole({
        orgId,
        tenantId: siteId,
        userId: guardianUserId,
        scope: "site",
        permissionKeys: ["ace.faith.read", "ace.faith.reflect"],
      }),
    );
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.academicYear.create({
        data: {
          id: yearId,
          tenantId: siteId,
          name: "Faith year",
          startsOn: new Date(Date.now() - 90 * 86_400_000),
          endsOn: new Date(Date.now() + 90 * 86_400_000),
          status: "ACTIVE",
        },
      });
      await tx.aceYearBand.create({
        data: { id: bandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.child.createMany({
        data: [childId, otherChildId].map((id) => ({
          id,
          tenantId: siteId,
          firstName: "Test",
          lastName: "Pupil",
          dateOfBirth: new Date(
            Date.UTC(new Date().getUTCFullYear() - 10, 0, 1),
          ),
        })),
      });
      await tx.aceSchoolEnrollment.createMany({
        data: [childId, otherChildId].map((id) => ({
          tenantId: siteId,
          childId: id,
          academicYearId: yearId,
          yearBandId: bandId,
          startsOn: new Date(Date.now() - 30 * 86_400_000),
        })),
      });
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteId, studentPortalEnabled: true },
      });
      const student = await tx.studentIdentity.create({
        data: { tenantId: siteId, userId: studentUserId },
      });
      studentIdentityId = student.id;
      await tx.studentIdentityLink.create({
        data: { tenantId: siteId, studentIdentityId, childId },
      });
      const guardian = await tx.guardianIdentity.create({
        data: { tenantId: siteId, userId: guardianUserId },
      });
      await tx.guardianChildRelationship.create({
        data: {
          tenantId: siteId,
          guardianIdentityId: guardian.id,
          childId,
          legalAccess: "FULL",
        },
      });
      await tx.faithSiteSettings.create({
        data: { tenantId: siteId, reflectionsEnabled: true },
      });
      await tx.faithContent.create({
        data: { id: contentId, tenantId: siteId },
      });
      const draft = await tx.faithContentDraft.create({
        data: {
          tenantId: siteId,
          faithContentId: contentId,
          authorUserId: leaderId,
          title: "A safe reflection",
          contentPayload: {
            body: "A short reading.",
            audience: { type: "ALL_ACTIVE_STUDENTS" },
          },
        },
      });
      const version = await tx.faithContentVersion.create({
        data: {
          tenantId: siteId,
          faithContentId: contentId,
          sourceDraftId: draft.id,
          versionNumber: 1,
          title: draft.title,
          contentPayload: {
            body: "A short reading.",
            audience: { type: "ALL_ACTIVE_STUDENTS" },
          },
          publishedAt: new Date(),
        },
      });
      versionId = version.id;
      await tx.faithContentAudience.create({
        data: {
          tenantId: siteId,
          faithContentVersionId: version.id,
          type: "ALL_ACTIVE_STUDENTS",
        },
      });
    });
    app = (
      await Test.createTestingModule({ imports: [AppModule] }).compile()
    ).createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (oldReflections === undefined)
      delete process.env.ACE_FAITH_REFLECTIONS_ENABLED;
    else process.env.ACE_FAITH_REFLECTIONS_ENABLED = oldReflections;
    if (oldAuthoring === undefined)
      delete process.env.ACE_FAITH_AUTHORING_ENABLED;
    else process.env.ACE_FAITH_AUTHORING_ENABLED = oldAuthoring;
    await app?.close();
    await prisma.concern.deleteMany({
      where: { childId: { in: [childId, otherChildId] } },
    });
    await prisma.$executeRaw`TRUNCATE TABLE "FaithReadReceipt", "FaithReflection", "FaithContentAudience", "FaithContentVersion", "FaithContentDraft", "FaithContent"`;
    await prisma.faithSiteSettings.deleteMany({ where: { tenantId: siteId } });
    await prisma.guardianChildRelationship.deleteMany({
      where: { tenantId: siteId },
    });
    await prisma.guardianIdentity.deleteMany({ where: { tenantId: siteId } });
    await prisma.studentIdentityLink.deleteMany({
      where: { tenantId: siteId },
    });
    await prisma.studentIdentity.deleteMany({ where: { tenantId: siteId } });
    await prisma.studentPortalPolicy.deleteMany({
      where: { tenantId: siteId },
    });
    await prisma.aceSchoolEnrollment.deleteMany({
      where: { tenantId: siteId },
    });
    await prisma.child.deleteMany({ where: { tenantId: siteId } });
    await prisma.aceYearBand.deleteMany({ where: { tenantId: siteId } });
    await prisma.academicYear.deleteMany({ where: { tenantId: siteId } });
    await prisma.auditEvent.deleteMany({ where: { orgId } });
    for (const role of roles) await clearE2eTypedRole(role, orgId);
    for (const id of [leaderId, studentUserId, guardianUserId]) {
      await clearE2eAuthAccess(id);
    }
    await prisma.user.deleteMany({
      where: { id: { in: [leaderId, studentUserId, guardianUserId] } },
    });
    await prisma.orgVertical.deleteMany({ where: { orgId } });
    await prisma.tenant.delete({ where: { id: siteId } });
    await prisma.org.delete({ where: { id: orgId } });
  });

  it("records a student read once and rejects guardian read writes", async () => {
    const first = await request(app.getHttpServer())
      .post(`/ace/faith/content/${contentId}/read?siteId=${siteId}`)
      .set("Authorization", studentAuth);
    const repeat = await request(app.getHttpServer())
      .post(`/ace/faith/content/${contentId}/read?siteId=${siteId}`)
      .set("Authorization", studentAuth);
    expect(first.status).toBe(201);
    expect(repeat.status).toBe(201);
    expect(repeat.body.id).toBe(first.body.id);
    expect(repeat.body.readAt).toBe(first.body.readAt);
    const guardian = await request(app.getHttpServer())
      .post(`/ace/faith/content/${contentId}/read?siteId=${siteId}`)
      .set("Authorization", guardianAuth);
    expect(guardian.status).toBe(404);
  });

  it("keeps submissions disabled until both the global and site gates allow them", async () => {
    process.env.ACE_FAITH_REFLECTIONS_ENABLED = "false";
    const enableBlocked = await request(app.getHttpServer())
      .patch("/ace/faith/settings")
      .set("Authorization", leaderAuth)
      .send({ displayLabel: "Faith Corner", reflectionsEnabled: true });
    expect(enableBlocked.status).toBe(503);
    const globalOff = await request(app.getHttpServer())
      .post(`/ace/faith/content/${contentId}/reflections?siteId=${siteId}`)
      .set("Authorization", studentAuth)
      .send({ text: "A private thought" });
    expect(globalOff.status).toBe(503);
    process.env.ACE_FAITH_REFLECTIONS_ENABLED = "true";
    const disabled = await request(app.getHttpServer())
      .patch("/ace/faith/settings")
      .set("Authorization", leaderAuth)
      .send({ displayLabel: "Faith Corner", reflectionsEnabled: false });
    expect(disabled.status).toBe(200);
    const siteOff = await request(app.getHttpServer())
      .post(`/ace/faith/content/${contentId}/reflections?siteId=${siteId}`)
      .set("Authorization", studentAuth)
      .send({ text: "A private thought" });
    expect(siteOff.status).toBe(503);
    const enabled = await request(app.getHttpServer())
      .patch("/ace/faith/settings")
      .set("Authorization", leaderAuth)
      .send({ displayLabel: "Faith Corner", reflectionsEnabled: true });
    expect(enabled.body.reflectionsEnabled).toBe(true);
  });

  it("accepts one student-authored reflection with an immutable child target", async () => {
    const guardian = await request(app.getHttpServer())
      .post(`/ace/faith/content/${contentId}/reflections?siteId=${siteId}`)
      .set("Authorization", guardianAuth)
      .send({ text: "A guardian-authored thought" });
    expect(guardian.status).toBe(404);
    const forgedChild = await request(app.getHttpServer())
      .post(`/ace/faith/content/${contentId}/reflections?siteId=${siteId}`)
      .set("Authorization", studentAuth)
      .send({ text: "Wrong target", childId: otherChildId });
    expect(forgedChild.status).toBe(400);
    const submitted = await request(app.getHttpServer())
      .post(`/ace/faith/content/${contentId}/reflections?siteId=${siteId}`)
      .set("Authorization", studentAuth)
      .send({ text: "A private thought" });
    expect(submitted.status).toBe(201);
    expect(submitted.body).toMatchObject({
      visibility: "AUTHOR_AND_STAFF",
      moderationStatus: "PENDING",
    });
    expect(JSON.stringify(submitted.body)).not.toContain("A private thought");
    const duplicate = await request(app.getHttpServer())
      .post(`/ace/faith/content/${contentId}/reflections?siteId=${siteId}`)
      .set("Authorization", studentAuth)
      .send({ text: "Another thought" });
    expect(duplicate.status).toBe(409);
    const stored = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.faithReflection.findUniqueOrThrow({
        where: {
          tenantId_faithContentVersionId_studentIdentityId: {
            tenantId: siteId,
            faithContentVersionId: versionId,
            studentIdentityId,
          },
        },
      }),
    );
    expect(stored.childId).toBe(childId);
    expect(stored.reflectionEncrypted).toBe("A private thought");
  });

  it("shows pending text to its student and staff, then releases only after approval", async () => {
    const reflection = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.faithReflection.findUniqueOrThrow({
        where: {
          tenantId_faithContentVersionId_studentIdentityId: {
            tenantId: siteId,
            faithContentVersionId: versionId,
            studentIdentityId,
          },
        },
        select: { id: true },
      }),
    );
    const path = `/ace/faith/content/${contentId}/reflections`;
    const student = await request(app.getHttpServer())
      .get(`${path}?siteId=${siteId}`)
      .set("Authorization", studentAuth);
    const staff = await request(app.getHttpServer())
      .get(path)
      .set("Authorization", leaderAuth);
    const guardianBefore = await request(app.getHttpServer())
      .get(`${path}?siteId=${siteId}&childId=${childId}`)
      .set("Authorization", guardianAuth);
    expect(student.body.items).toHaveLength(1);
    expect(staff.body.items).toHaveLength(1);
    expect(guardianBefore.body.items).toEqual([]);
    const earlyRelease = await request(app.getHttpServer())
      .post(`${path}/${reflection.id}/release`)
      .set("Authorization", leaderAuth);
    expect(earlyRelease.status).toBe(404);
    const earlyReport = await request(app.getHttpServer())
      .post(
        `${path}/${reflection.id}/report?siteId=${siteId}&childId=${childId}`,
      )
      .set("Authorization", guardianAuth)
      .send({ category: "SAFETY" });
    expect(earlyReport.status).toBe(404);
    const approved = await request(app.getHttpServer())
      .post(`${path}/${reflection.id}/moderate`)
      .set("Authorization", leaderAuth)
      .send({ decision: "APPROVED" });
    expect(approved.status).toBe(201);
    const reverseDecision = await request(app.getHttpServer())
      .post(`${path}/${reflection.id}/moderate`)
      .set("Authorization", leaderAuth)
      .send({ decision: "REJECTED" });
    expect(reverseDecision.status).toBe(404);
    const released = await request(app.getHttpServer())
      .post(`${path}/${reflection.id}/release`)
      .set("Authorization", leaderAuth);
    expect(released.status).toBe(201);
    const repeatRelease = await request(app.getHttpServer())
      .post(`${path}/${reflection.id}/release`)
      .set("Authorization", leaderAuth);
    expect(repeatRelease.status).toBe(404);
    const guardianAfter = await request(app.getHttpServer())
      .get(`${path}?siteId=${siteId}&childId=${childId}`)
      .set("Authorization", guardianAuth);
    expect(guardianAfter.body.items).toEqual([
      expect.objectContaining({ id: reflection.id, text: "A private thought" }),
    ]);
    const wrongChild = await request(app.getHttpServer())
      .get(`${path}?siteId=${siteId}&childId=${otherChildId}`)
      .set("Authorization", guardianAuth);
    expect(wrongChild.status).toBe(404);
    const report = await request(app.getHttpServer())
      .post(
        `${path}/${reflection.id}/report?siteId=${siteId}&childId=${childId}`,
      )
      .set("Authorization", guardianAuth)
      .send({ category: "SAFETY" });
    expect(report.status).toBe(201);
    const concern = await prisma.concern.findUniqueOrThrow({
      where: { id: report.body.referenceId as string },
    });
    expect(concern.childId).toBe(childId);
    expect(concern.details).toBe(`faith-reflection:${reflection.id}`);
    expect(JSON.stringify(concern)).not.toContain("A private thought");
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.guardianChildRelationship.updateMany({
        where: { tenantId: siteId, childId },
        data: { endedAt: new Date() },
      }),
    );
    const ended = await request(app.getHttpServer())
      .get(`${path}?siteId=${siteId}&childId=${childId}`)
      .set("Authorization", guardianAuth);
    expect(ended.status).toBe(404);
  });

  it("hides withdrawn content from family reflection reads", async () => {
    await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.faithContent.update({
        where: { id_tenantId: { id: contentId, tenantId: siteId } },
        data: { withdrawnAt: new Date() },
      }),
    );
    const response = await request(app.getHttpServer())
      .get(`/ace/faith/content/${contentId}/reflections?siteId=${siteId}`)
      .set("Authorization", studentAuth);
    expect(response.status).toBe(404);
  });
});
