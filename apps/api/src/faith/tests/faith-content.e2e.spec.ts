import { randomUUID } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";
import { AppModule } from "../../app.module";
import { EffectivePermissionsService } from "../../access-control/effective-permissions.service";

describe("ACE Faith content lifecycle", () => {
  const orgId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const foreignContentId = randomUUID();
  const leaderId = randomUUID();
  const viewerId = randomUUID();
  const guardianId = randomUUID();
  const studentId = randomUUID();
  const childId = randomUUID();
  const otherChildId = randomUUID();
  const youngerChildId = randomUUID();
  const yearId = randomUUID();
  const yearBandId = randomUUID();
  const ageBandId = randomUUID();
  let app: INestApplication | undefined;
  let leaderAuth = "";
  let viewerAuth = "";
  let guardianAuth = "";
  let studentAuth = "";
  let leaderRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let viewerRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let guardianRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let studentRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  const oldAuthoring = process.env.ACE_FAITH_AUTHORING_ENABLED;
  const oldPublication = process.env.ACE_FAITH_PUBLICATION_ENABLED;
  const oldCronSecret = process.env.CRON_SECRET;
  const cronSecret = `faith-test-${randomUUID()}`;

  beforeAll(async () => {
    if (!requireDatabase())
      throw new Error("PostgreSQL is required for Faith lifecycle E2E");
    process.env.ACE_FAITH_AUTHORING_ENABLED = "true";
    process.env.ACE_FAITH_PUBLICATION_ENABLED = "true";
    process.env.CRON_SECRET = cronSecret;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `Faith ${orgId}`,
        slug: `faith-${orgId}`,
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
        name: "Faith school",
        slug: `faith-${siteId}`,
        timezone: "Europe/London",
      },
    });
    await prisma.tenant.create({
      data: {
        id: otherSiteId,
        orgId,
        name: "Other Faith school",
        slug: `faith-other-${otherSiteId}`,
        timezone: "Europe/London",
      },
    });
    await withTenantRlsContext(otherSiteId, orgId, (tx) =>
      tx.faithContent.create({
        data: { id: foreignContentId, tenantId: otherSiteId },
      }),
    );
    leaderAuth = (
      await seedE2eAuthUser({
        subject: `faith-leader-${leaderId}`,
        userId: leaderId,
        tenantId: siteId,
        siteRole: "SITE_ADMIN",
        orgId,
        orgRole: "ORG_ADMIN",
      })
    ).authorization;
    viewerAuth = (
      await seedE2eAuthUser({
        subject: `faith-viewer-${viewerId}`,
        userId: viewerId,
        tenantId: siteId,
        siteRole: "VIEWER",
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    guardianAuth = (
      await seedE2eAuthUser({
        subject: `faith-guardian-${guardianId}`,
        userId: guardianId,
        tenantId: siteId,
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    studentAuth = (
      await seedE2eAuthUser({
        subject: `faith-student-${studentId}`,
        userId: studentId,
        tenantId: siteId,
        orgId,
        orgRole: "ORG_MEMBER",
      })
    ).authorization;
    leaderRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: leaderId,
      scope: "site",
      permissionKeys: ["ace.faith.manage", "ace.faith.publish"],
    });
    viewerRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: viewerId,
      scope: "site",
      permissionKeys: ["ace.faith.manage"],
    });
    guardianRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: guardianId,
      scope: "site",
      permissionKeys: ["ace.faith.read"],
    });
    studentRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: studentId,
      scope: "site",
      permissionKeys: ["ace.faith.read"],
    });
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
        data: { id: yearBandId, tenantId: siteId, name: "Year 5" },
      });
      await tx.child.createMany({
        data: [
          {
            id: childId,
            tenantId: siteId,
            firstName: "Linked",
            lastName: "Pupil",
            dateOfBirth: new Date(
              Date.UTC(new Date().getUTCFullYear() - 10, 0, 1),
            ),
          },
          {
            id: otherChildId,
            tenantId: siteId,
            firstName: "Other",
            lastName: "Pupil",
            dateOfBirth: new Date(
              Date.UTC(new Date().getUTCFullYear() - 10, 0, 1),
            ),
          },
          {
            id: youngerChildId,
            tenantId: siteId,
            firstName: "Young",
            lastName: "Pupil",
            dateOfBirth: new Date(
              Date.UTC(new Date().getUTCFullYear() - 5, 0, 1),
            ),
          },
        ],
      });
      const guardian = await tx.guardianIdentity.create({
        data: { tenantId: siteId, userId: guardianId },
      });
      await tx.guardianChildRelationship.create({
        data: {
          tenantId: siteId,
          guardianIdentityId: guardian.id,
          childId,
          legalAccess: "FULL",
        },
      });
      await tx.guardianChildRelationship.create({
        data: {
          tenantId: siteId,
          guardianIdentityId: guardian.id,
          childId: youngerChildId,
          legalAccess: "FULL",
        },
      });
      await tx.studentPortalPolicy.create({
        data: { tenantId: siteId, studentPortalEnabled: true },
      });
      const student = await tx.studentIdentity.create({
        data: { tenantId: siteId, userId: studentId },
      });
      await tx.studentIdentityLink.create({
        data: { tenantId: siteId, studentIdentityId: student.id, childId },
      });
      await tx.aceSchoolEnrollment.createMany({
        data: [childId, otherChildId, youngerChildId].map((id) => ({
          tenantId: siteId,
          childId: id,
          academicYearId: yearId,
          yearBandId,
          startsOn: new Date(Date.now() - 30 * 86_400_000),
        })),
      });
      await tx.faithAgeBand.create({
        data: {
          id: ageBandId,
          tenantId: siteId,
          name: "Older pupils",
          minimumAge: 9,
          maximumAge: 11,
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
    if (oldAuthoring === undefined)
      delete process.env.ACE_FAITH_AUTHORING_ENABLED;
    else process.env.ACE_FAITH_AUTHORING_ENABLED = oldAuthoring;
    if (oldPublication === undefined)
      delete process.env.ACE_FAITH_PUBLICATION_ENABLED;
    else process.env.ACE_FAITH_PUBLICATION_ENABLED = oldPublication;
    if (oldCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = oldCronSecret;
    await app?.close();
    if (!isDatabaseAvailable()) return;
    await prisma.$executeRaw`TRUNCATE TABLE "FaithReadReceipt", "FaithReflection", "FaithContentAudience", "FaithContentVersion", "FaithContentDraft", "FaithContent"`;
    await prisma.faithSiteSettings.deleteMany({ where: { tenantId: siteId } });
    await prisma.faithAgeBand.deleteMany({ where: { tenantId: siteId } });
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
    if (guardianRole) await clearE2eTypedRole(guardianRole, orgId);
    if (studentRole) await clearE2eTypedRole(studentRole, orgId);
    if (leaderRole) await clearE2eTypedRole(leaderRole, orgId);
    if (viewerRole) await clearE2eTypedRole(viewerRole, orgId);
    await clearE2eAuthAccess(guardianId);
    await clearE2eAuthAccess(studentId);
    await clearE2eAuthAccess(leaderId);
    await clearE2eAuthAccess(viewerId);
    await prisma.user.deleteMany({
      where: { id: { in: [leaderId, viewerId, guardianId, studentId] } },
    });
    await prisma.orgVertical.deleteMany({ where: { orgId } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [siteId, otherSiteId] } },
    });
    await prisma.org.delete({ where: { id: orgId } });
  });

  it("denies a viewer who has a faith management permission", async () => {
    if (!app) throw new Error("E2E app did not start");
    const decision = await app.get(EffectivePermissionsService).resolve({
      userId: viewerId,
      orgId,
      tenantId: siteId,
      permission: "ace.faith.manage",
      now: new Date(),
    });
    expect(decision.allowed).toBe(true);
    const list = await request(app.getHttpServer())
      .get("/ace/faith/content")
      .set("Authorization", viewerAuth);
    expect(list.status).toBe(403);
    const create = await request(app.getHttpServer())
      .post("/ace/faith/content")
      .set("Authorization", viewerAuth)
      .send({
        title: "Viewer draft",
        contentPayload: { body: "Not permitted." },
        audience: { type: "ALL_ACTIVE_STUDENTS" },
      });
    expect(create.status).toBe(403);
  });

  it("publishes an immutable age-scoped version, enforces linked-child read, then withdraws it", async () => {
    if (!app) throw new Error("E2E app did not start");
    const create = await request(app.getHttpServer())
      .post("/ace/faith/content")
      .set("Authorization", leaderAuth)
      .send({
        title: "Thought for today",
        contentPayload: { body: "A safe example." },
        audience: { type: "AGE_BAND", ageBandIds: [ageBandId] },
      });
    expect(create.status).toBe(201);
    const { id, draftId } = create.body as { id: string; draftId: string };
    const listed = await request(app.getHttpServer())
      .get("/ace/faith/content")
      .set("Authorization", leaderAuth);
    expect(listed.status).toBe(200);
    const updatedAt = listed.body.items.find(
      (item: { id: string }) => item.id === id,
    ).drafts[0].updatedAt as string;
    const staleEdit = await request(app.getHttpServer())
      .patch(`/ace/faith/content/${id}/drafts/${draftId}`)
      .set("Authorization", leaderAuth)
      .send({
        title: "Stale",
        contentPayload: { body: "Old." },
        audience: { type: "AGE_BAND", ageBandIds: [ageBandId] },
        expectedUpdatedAt: new Date(Date.now() - 86_400_000).toISOString(),
      });
    expect(staleEdit.status).toBe(409);
    const edit = await request(app.getHttpServer())
      .patch(`/ace/faith/content/${id}/drafts/${draftId}`)
      .set("Authorization", leaderAuth)
      .send({
        title: "Thought for today, revised",
        contentPayload: { body: "A safe example." },
        audience: { type: "AGE_BAND", ageBandIds: [ageBandId] },
        expectedUpdatedAt: updatedAt,
      });
    expect(edit.status).toBe(200);
    const publish = await request(app.getHttpServer())
      .post(`/ace/faith/content/${id}/publish`)
      .set("Authorization", leaderAuth)
      .send({ draftId, expectedVersionId: null });
    expect(publish.status).toBe(201);
    const versionId = publish.body.id as string;
    const decision = await app.get(EffectivePermissionsService).resolve({
      userId: guardianId,
      orgId,
      tenantId: siteId,
      permission: "ace.faith.read",
      now: new Date(),
    });
    expect(decision.allowed).toBe(true);
    const allowed = await request(app.getHttpServer())
      .get(`/ace/faith/sites/${siteId}/feed?childId=${childId}`)
      .set("Authorization", guardianAuth);
    expect(allowed.status).toBe(200);
    expect(allowed.body.reflectionsEnabled).toBe(false);
    expect(allowed.body.items).toEqual([
      expect.objectContaining({
        id,
        versionId,
        title: "Thought for today, revised",
      }),
    ]);
    const younger = await request(app.getHttpServer())
      .get(`/ace/faith/sites/${siteId}/feed?childId=${youngerChildId}`)
      .set("Authorization", guardianAuth);
    expect(younger.status).toBe(200);
    expect(younger.body.items).toEqual([]);
    const student = await request(app.getHttpServer())
      .get(`/ace/faith/sites/${siteId}/feed`)
      .set("Authorization", studentAuth);
    expect(student.status).toBe(200);
    expect(student.body.items).toEqual([
      expect.objectContaining({ id, versionId }),
    ]);
    const studentSelectedChild = await request(app.getHttpServer())
      .get(`/ace/faith/sites/${siteId}/feed?childId=${childId}`)
      .set("Authorization", studentAuth);
    expect(studentSelectedChild.status).toBe(404);
    const denied = await request(app.getHttpServer())
      .get(`/ace/faith/sites/${siteId}/feed?childId=${otherChildId}`)
      .set("Authorization", guardianAuth);
    expect(denied.status).toBe(404);
    const otherTenant = await request(app.getHttpServer())
      .get(`/ace/faith/sites/${otherSiteId}/feed?childId=${childId}`)
      .set("Authorization", guardianAuth);
    expect(otherTenant.status).toBe(404);
    const revision = await request(app.getHttpServer())
      .post("/ace/faith/content")
      .set("Authorization", leaderAuth)
      .send({
        faithContentId: id,
        title: "Thought for tomorrow",
        contentPayload: { body: "A future example." },
        audience: { type: "ALL_ACTIVE_STUDENTS" },
      });
    expect(revision.status).toBe(201);
    const revisionDraftId = revision.body.draftId as string;
    const schedule = await request(app.getHttpServer())
      .post(`/ace/faith/content/${id}/schedule`)
      .set("Authorization", leaderAuth)
      .send({
        draftId: revisionDraftId,
        expectedVersionId: versionId,
        scheduledAt: new Date(Date.now() + 86_400_000).toISOString(),
      });
    expect(schedule.status).toBe(201);
    const duplicate = await request(app.getHttpServer())
      .post("/ace/faith/content")
      .set("Authorization", leaderAuth)
      .send({
        faithContentId: id,
        title: "Unexpected revision",
        contentPayload: { body: "Should be denied." },
        audience: { type: "ALL_ACTIVE_STUDENTS" },
      });
    expect(duplicate.status).toBe(409);
    const scheduledDraft = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.faithContentDraft.findUniqueOrThrow({
        where: { id_tenantId: { id: revisionDraftId, tenantId: siteId } },
        select: { updatedAt: true },
      }),
    );
    const scheduledEdit = await request(app.getHttpServer())
      .patch(`/ace/faith/content/${id}/drafts/${revisionDraftId}`)
      .set("Authorization", leaderAuth)
      .send({
        title: "Change scheduled",
        contentPayload: { body: "Should be denied." },
        audience: { type: "ALL_ACTIVE_STUDENTS" },
        expectedUpdatedAt: scheduledDraft.updatedAt.toISOString(),
      });
    expect(scheduledEdit.status).toBe(409);
    const withdraw = await request(app.getHttpServer())
      .post(`/ace/faith/content/${id}/withdraw`)
      .set("Authorization", leaderAuth)
      .send({ expectedVersionId: versionId });
    expect(withdraw.status).toBe(201);
    const cancelledSchedule = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.faithContentDraft.findUniqueOrThrow({
        where: { id_tenantId: { id: revisionDraftId, tenantId: siteId } },
        select: { scheduledAt: true, scheduleFailureReason: true },
      }),
    );
    expect(cancelledSchedule).toEqual({
      scheduledAt: null,
      scheduleFailureReason: "CONTENT_WITHDRAWN",
    });
    const after = await request(app.getHttpServer())
      .get(`/ace/faith/sites/${siteId}/feed?childId=${childId}`)
      .set("Authorization", guardianAuth);
    expect(after.status).toBe(200);
    expect(after.body.items).toEqual([]);
  });

  it("rejects unsafe links and invalid terminology, then saves the site label", async () => {
    if (!app) throw new Error("E2E app did not start");
    const legacyContentId = randomUUID();
    await withTenantRlsContext(siteId, orgId, async (tx) => {
      await tx.faithContent.create({
        data: { id: legacyContentId, tenantId: siteId },
      });
      const draft = await tx.faithContentDraft.create({
        data: {
          tenantId: siteId,
          faithContentId: legacyContentId,
          authorUserId: leaderId,
          title: "Historical item",
          contentPayload: { legacy: "unstructured" },
        },
      });
      const version = await tx.faithContentVersion.create({
        data: {
          tenantId: siteId,
          faithContentId: legacyContentId,
          sourceDraftId: draft.id,
          versionNumber: 1,
          title: draft.title,
          contentPayload: { legacy: "unstructured" },
          publishedAt: new Date(),
        },
      });
      await tx.faithContentAudience.create({
        data: {
          tenantId: siteId,
          faithContentVersionId: version.id,
          type: "ALL_ACTIVE_STUDENTS",
        },
      });
    });
    const staffList = await request(app.getHttpServer())
      .get("/ace/faith/content")
      .set("Authorization", leaderAuth);
    expect(staffList.status).toBe(200);
    const historical = staffList.body.items.find(
      (item: { id: string }) => item.id === legacyContentId,
    );
    expect(historical).toMatchObject({
      publishedNeedsReview: true,
      publishedVersion: null,
      drafts: [
        expect.objectContaining({
          needsReview: true,
          contentPayload: null,
          audience: null,
        }),
      ],
    });
    expect(JSON.stringify(historical)).not.toContain("unstructured");
    const reader = await request(app.getHttpServer())
      .get(`/ace/faith/sites/${siteId}/feed?childId=${childId}`)
      .set("Authorization", guardianAuth);
    expect(reader.status).toBe(200);
    expect(reader.body.items).toEqual([]);
    const unsafe = await request(app.getHttpServer())
      .post("/ace/faith/content")
      .set("Authorization", leaderAuth)
      .send({
        title: "Unsafe",
        contentPayload: { body: "Example", sourceUrl: "http://example.test" },
        audience: { type: "ALL_ACTIVE_STUDENTS" },
      });
    expect(unsafe.status).toBe(400);
    const invalid = await request(app.getHttpServer())
      .patch("/ace/faith/settings")
      .set("Authorization", leaderAuth)
      .send({ displayLabel: "X" });
    expect(invalid.status).toBe(400);
    const saved = await request(app.getHttpServer())
      .patch("/ace/faith/settings")
      .set("Authorization", leaderAuth)
      .send({ displayLabel: "School Reflections" });
    expect(saved.status).toBe(200);
    const settings = await request(app.getHttpServer())
      .get("/ace/faith/settings")
      .set("Authorization", leaderAuth);
    expect(settings.body).toEqual({
      displayLabel: "School Reflections",
      reflectionsEnabled: false,
      reflectionFeatureAvailable: false,
    });
  });

  it("publishes due drafts and marks a schedule for review when its publisher becomes inactive", async () => {
    if (!app) throw new Error("E2E app did not start");
    const create = async (title: string) => {
      const response = await request(app!.getHttpServer())
        .post("/ace/faith/content")
        .set("Authorization", leaderAuth)
        .send({
          title,
          contentPayload: { body: "Scheduled content." },
          audience: { type: "ALL_ACTIVE_STUDENTS" },
        });
      expect(response.status).toBe(201);
      return response.body as { id: string; draftId: string };
    };
    const schedule = async (draft: { id: string; draftId: string }) => {
      const response = await request(app!.getHttpServer())
        .post(`/ace/faith/content/${draft.id}/schedule`)
        .set("Authorization", leaderAuth)
        .send({
          draftId: draft.draftId,
          expectedVersionId: null,
          scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
        });
      expect(response.status).toBe(201);
      await withTenantRlsContext(siteId, orgId, (tx) =>
        tx.faithContentDraft.update({
          where: { id_tenantId: { id: draft.draftId, tenantId: siteId } },
          data: { scheduledAt: new Date(Date.now() - 60_000) },
        }),
      );
    };
    const due = await create("Due content");
    const secondDraft = await request(app.getHttpServer())
      .post("/ace/faith/content")
      .set("Authorization", leaderAuth)
      .send({
        faithContentId: due.id,
        title: "Second draft",
        contentPayload: { body: "Not scheduled." },
        audience: { type: "ALL_ACTIVE_STUDENTS" },
      });
    expect(secondDraft.status).toBe(201);
    await schedule(due);
    const competing = await request(app.getHttpServer())
      .post(`/ace/faith/content/${due.id}/schedule`)
      .set("Authorization", leaderAuth)
      .send({
        draftId: secondDraft.body.draftId,
        expectedVersionId: null,
        scheduledAt: new Date(Date.now() + 3_600_000).toISOString(),
      });
    expect(competing.status).toBe(409);
    const run = async () =>
      request(app!.getHttpServer())
        .get("/internal/faith-schedules/run")
        .set("Authorization", `Bearer ${cronSecret}`);
    const published = await run();
    expect(published.status).toBe(200);
    expect(published.body.published).toBe(1);
    const publishedVersion = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.faithContentVersion.findFirst({
        where: { tenantId: siteId, faithContentId: due.id },
        select: { id: true },
      }),
    );
    expect(publishedVersion?.id).toEqual(expect.any(String));

    const changedActor = await create("Access changed");
    await schedule(changedActor);
    const firstPage = await request(app.getHttpServer())
      .get("/ace/faith/content?limit=1")
      .set("Authorization", leaderAuth);
    expect(firstPage.status).toBe(200);
    expect(firstPage.body.items).toHaveLength(1);
    expect(firstPage.body.nextCursor).toEqual(expect.any(String));
    const secondPage = await request(app.getHttpServer())
      .get(`/ace/faith/content?limit=1&cursor=${firstPage.body.nextCursor}`)
      .set("Authorization", leaderAuth);
    expect(secondPage.status).toBe(200);
    expect(secondPage.body.items).toHaveLength(1);
    expect(secondPage.body.items[0].id).not.toBe(firstPage.body.items[0].id);
    const feedPageOne = await request(app.getHttpServer())
      .get(`/ace/faith/sites/${siteId}/feed?childId=${childId}&limit=1`)
      .set("Authorization", guardianAuth);
    expect(feedPageOne.status).toBe(200);
    expect(feedPageOne.body.nextCursor).toEqual(expect.any(String));
    const feedPageTwo = await request(app.getHttpServer())
      .get(
        `/ace/faith/sites/${siteId}/feed?childId=${childId}&limit=1&cursor=${feedPageOne.body.nextCursor}`,
      )
      .set("Authorization", guardianAuth);
    expect(feedPageTwo.status).toBe(200);
    expect([...feedPageOne.body.items, ...feedPageTwo.body.items]).toEqual([
      expect.objectContaining({ id: due.id }),
    ]);
    const foreignCursor = await request(app.getHttpServer())
      .get(`/ace/faith/content?cursor=${foreignContentId}`)
      .set("Authorization", leaderAuth);
    expect(foreignCursor.status).toBe(404);
    await prisma.user.update({
      where: { id: leaderId },
      data: { isActive: false },
    });
    const reviewed = await run();
    expect(reviewed.status).toBe(200);
    expect(reviewed.body.needsReview).toBe(1);
    const failedDraft = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.faithContentDraft.findUniqueOrThrow({
        where: { id_tenantId: { id: changedActor.draftId, tenantId: siteId } },
        select: { scheduledAt: true, scheduleFailureReason: true },
      }),
    );
    expect(failedDraft).toEqual({
      scheduledAt: null,
      scheduleFailureReason: "PUBLISHER_ACCESS_CHANGED",
    });
  });
});
