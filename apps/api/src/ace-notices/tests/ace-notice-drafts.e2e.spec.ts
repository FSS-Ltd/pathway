import { randomUUID } from "node:crypto";
import { ForbiddenException, type INestApplication } from "@nestjs/common";
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
import { AceNoticeDraftsService } from "../ace-notice-drafts.service";

describe("ACE notice draft API", () => {
  const orgId = randomUUID();
  const siteId = randomUUID();
  const otherSiteId = randomUUID();
  const managerId = randomUUID();
  const readerId = randomUUID();
  const publisherId = randomUUID();
  const guardianUserId = randomUUID();
  const childId = randomUUID();
  const managerGuardianId = randomUUID();
  const parentGuardianId = randomUUID();
  let app: INestApplication | undefined;
  let managerAuthorization = "";
  let readerAuthorization = "";
  let publisherAuthorization = "";
  let guardianAuthorization = "";
  let managerRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let readerRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let publisherRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    await prisma.org.create({
      data: {
        id: orgId,
        name: `ACE notices ${orgId}`,
        slug: `ace-notices-${orgId}`,
        planCode: "trial",
      },
    });
    await prisma.tenant.createMany({
      data: [siteId, otherSiteId].map((id) => ({
        id,
        orgId,
        name: `ACE notices site ${id}`,
        slug: `ace-notices-${id}`,
        timezone: "Europe/London",
      })),
    });
    await prisma.orgVertical.create({
      data: { orgId, vertical: "ACE_SCHOOL" },
    });
    const manager = await seedE2eAuthUser({
      subject: `ace-notice-manager-${managerId}`,
      userId: managerId,
      tenantId: siteId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    const reader = await seedE2eAuthUser({
      subject: `ace-notice-reader-${readerId}`,
      userId: readerId,
      tenantId: siteId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    managerAuthorization = manager.authorization;
    readerAuthorization = reader.authorization;
    const publisher = await seedE2eAuthUser({
      subject: `ace-notice-publisher-${publisherId}`,
      userId: publisherId,
      tenantId: siteId,
      siteRole: "STAFF",
      orgId,
      orgRole: "ORG_MEMBER",
    });
    publisherAuthorization = publisher.authorization;
    managerRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: managerId,
      scope: "site",
      permissionKeys: ["notices.manage", "notices.publish", "notices.read"],
    });
    readerRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: readerId,
      scope: "site",
      permissionKeys: ["notices.read"],
    });
    publisherRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: publisherId,
      scope: "site",
      permissionKeys: ["notices.publish"],
    });
    const guardian = await seedE2eAuthUser({
      subject: `ace-notice-guardian-${guardianUserId}`,
      userId: guardianUserId,
      tenantId: siteId,
      hasFamilyAccess: true,
    });
    guardianAuthorization = guardian.authorization;
    await prisma.child.create({
      data: {
        id: childId,
        tenantId: siteId,
        firstName: "Notice",
        lastName: "Recipient",
      },
    });
    await prisma.guardianIdentity.createMany({
      data: [
        { id: managerGuardianId, tenantId: siteId, userId: managerId },
        { id: parentGuardianId, tenantId: siteId, userId: guardianUserId },
      ],
    });
    await prisma.guardianChildRelationship.createMany({
      data: [managerGuardianId, parentGuardianId].map((guardianIdentityId) => ({
        tenantId: siteId,
        guardianIdentityId,
        childId,
        legalAccess: "FULL",
      })),
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    if (!isDatabaseAvailable()) return;
    await app?.close();
    await prisma.auditEvent.deleteMany({ where: { orgId } });
    await prisma.outboxEvent.deleteMany({ where: { orgId } });
    // Published audience rows are intentionally immutable; disposable e2e
    // databases clear the four notice tables together after the suite.
    await prisma.$executeRawUnsafe(`
      TRUNCATE TABLE
        app."AceNoticeReceipt",
        app."AceNoticeAttachment",
        app."AceNoticeAudienceMember",
        app."AceNotice"
    `);
    await prisma.guardianChildRelationship.deleteMany({
      where: { tenantId: siteId, childId },
    });
    await prisma.guardianIdentity.deleteMany({ where: { tenantId: siteId } });
    await prisma.child.delete({ where: { id: childId } });
    if (readerRole) await clearE2eTypedRole(readerRole, orgId);
    if (publisherRole) await clearE2eTypedRole(publisherRole, orgId);
    if (managerRole) await clearE2eTypedRole(managerRole, orgId);
    await clearE2eAuthAccess(readerId);
    await clearE2eAuthAccess(publisherId);
    await clearE2eAuthAccess(managerId);
    await clearE2eAuthAccess(guardianUserId);
    await prisma.user.deleteMany({
      where: {
        id: { in: [managerId, readerId, publisherId, guardianUserId] },
      },
    });
    await prisma.orgVertical.deleteMany({ where: { orgId } });
    await prisma.tenant.deleteMany({
      where: { id: { in: [siteId, otherSiteId] } },
    });
    await prisma.org.delete({ where: { id: orgId } });
  });

  it("creates, lists, reads, and edits a draft with a revision and audit trail", async () => {
    if (!app) return;
    const content = {
      title: "Autumn term",
      body: "The term begins Monday.",
      audience: "PARENTS",
      expiresAt: null,
    };
    const created = await request(app.getHttpServer())
      .post("/ace/notices/drafts")
      .set("Authorization", managerAuthorization)
      .send(content);
    expect(created.status).toBe(201);
    expect(created.body).toMatchObject({
      title: content.title,
      audience: "PARENTS",
    });

    const listed = await request(app.getHttpServer())
      .get("/ace/notices/drafts?limit=1")
      .set("Authorization", managerAuthorization);
    expect(listed.status).toBe(200);
    expect(listed.body.items).toContainEqual(
      expect.objectContaining({ id: created.body.id, title: content.title }),
    );
    expect(listed.body.items[0]).not.toHaveProperty("body");

    const detail = await request(app.getHttpServer())
      .get(`/ace/notices/drafts/${created.body.id}`)
      .set("Authorization", managerAuthorization);
    expect(detail.status).toBe(200);
    expect(detail.body.body).toBe(content.body);

    const updated = await request(app.getHttpServer())
      .put(`/ace/notices/drafts/${created.body.id}`)
      .set("Authorization", managerAuthorization)
      .send({
        ...content,
        title: "Term update",
        expectedUpdatedAt: created.body.updatedAt,
      });
    expect(updated.status).toBe(200);
    expect(updated.body.title).toBe("Term update");
    expect(updated.body.updatedAt).not.toBe(created.body.updatedAt);

    const stale = await request(app.getHttpServer())
      .put(`/ace/notices/drafts/${created.body.id}`)
      .set("Authorization", managerAuthorization)
      .send({
        ...content,
        title: "Stale title",
        expectedUpdatedAt: created.body.updatedAt,
      });
    expect(stale.status).toBe(409);
    expect(
      await prisma.auditEvent.count({
        where: { orgId, entityId: created.body.id },
      }),
    ).toBe(2);
    const stored = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceNotice.findUnique({ where: { id: created.body.id } }),
    );
    expect(stored).toMatchObject({
      title: "Term update",
      publishedAt: null,
    });
  });

  it("denies a reader without notices.manage and an author at another site", async () => {
    if (!app) return;
    const denied = await request(app.getHttpServer())
      .post("/ace/notices/drafts")
      .set("Authorization", readerAuthorization)
      .send({
        title: "Denied",
        body: "Denied",
        audience: "STAFF",
        expiresAt: null,
      });
    expect(denied.status).toBe(403);
    await expect(
      app
        .get(AceNoticeDraftsService)
        .list(
          { limit: 25 },
          { tenantId: otherSiteId, orgId, userId: managerId },
        ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("publishes a staff notice once, writes receipts, and withdraws after the author leaves", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/notices/drafts")
      .set("Authorization", managerAuthorization)
      .send({
        title: "Staff update",
        body: "The meeting starts at nine.",
        audience: "STAFF",
        expiresAt: null,
      });
    expect(created.status).toBe(201);
    const preview = await request(app.getHttpServer())
      .get(`/ace/notices/drafts/${created.body.id}/audience-preview`)
      .set("Authorization", managerAuthorization);
    expect(preview.status).toBe(200);
    expect(preview.body.recipientCount).toBe(3);

    const publishBody = {
      expectedUpdatedAt: created.body.updatedAt,
      expectedAudienceVersion: preview.body.audienceVersion,
    };
    const denied = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/publish`)
      .set("Authorization", readerAuthorization)
      .send(publishBody);
    expect(denied.status).toBe(403);
    const published = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/publish`)
      .set("Authorization", managerAuthorization)
      .send(publishBody);
    expect(published.status).toBe(201);
    expect(published.body.recipientCount).toBe(3);
    const repeated = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/publish`)
      .set("Authorization", managerAuthorization)
      .send(publishBody);
    expect(repeated.status).toBe(201);
    expect(repeated.body).toEqual(published.body);
    const stored = await withTenantRlsContext(siteId, orgId, async (tx) => ({
      audience: await tx.aceNoticeAudienceMember.findMany({
        where: { tenantId: siteId, noticeId: created.body.id },
        include: { receipt: true },
      }),
      notice: await tx.aceNotice.findUnique({
        where: { id: created.body.id },
      }),
    }));
    expect(stored.audience).toHaveLength(3);
    expect(stored.audience.every((member) => member.receipt?.deliveredAt)).toBe(
      true,
    );
    expect(stored.notice?.publishedAt).not.toBeNull();

    await prisma.siteMembership.delete({
      where: { tenantId_userId: { tenantId: siteId, userId: managerId } },
    });
    const forbiddenWithdrawal = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/withdraw`)
      .set("Authorization", managerAuthorization)
      .send({ reason: "Superseded" });
    expect(forbiddenWithdrawal.status).toBe(403);
    const withdrawn = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/withdraw`)
      .set("Authorization", publisherAuthorization)
      .send({ reason: "Superseded" });
    expect(withdrawn.status).toBe(201);
    const repeatedWithdrawal = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/withdraw`)
      .set("Authorization", publisherAuthorization)
      .send({ reason: "Superseded" });
    expect(repeatedWithdrawal.body).toEqual(withdrawn.body);
    await prisma.siteMembership.create({
      data: { tenantId: siteId, userId: managerId, role: "SITE_ADMIN" },
    });
    expect(
      await prisma.outboxEvent.count({
        where: { orgId, aggregateId: created.body.id },
      }),
    ).toBe(2);
    expect(
      await prisma.auditEvent.count({
        where: { orgId, entityId: created.body.id },
      }),
    ).toBe(3);
  });

  it("rejects a stale recipient preview and deduplicates staff guardians", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/notices/drafts")
      .set("Authorization", managerAuthorization)
      .send({
        title: "Family and staff",
        body: "Please check the new timetable.",
        audience: "PARENTS_AND_STAFF",
        expiresAt: null,
      });
    expect(created.status).toBe(201);
    const preview = await request(app.getHttpServer())
      .get(`/ace/notices/drafts/${created.body.id}/audience-preview`)
      .set("Authorization", managerAuthorization);
    expect(preview.body.recipientCount).toBe(4);
    await prisma.org.update({
      where: { id: orgId },
      data: { parentPortalEnabled: false },
    });
    const stale = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/publish`)
      .set("Authorization", managerAuthorization)
      .send({
        expectedUpdatedAt: created.body.updatedAt,
        expectedAudienceVersion: preview.body.audienceVersion,
      });
    expect(stale.status).toBe(409);
    await prisma.org.update({
      where: { id: orgId },
      data: { parentPortalEnabled: true },
    });
    const published = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/publish`)
      .set("Authorization", managerAuthorization)
      .send({
        expectedUpdatedAt: created.body.updatedAt,
        expectedAudienceVersion: preview.body.audienceVersion,
      });
    expect(published.status).toBe(201);
    const members = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceNoticeAudienceMember.findMany({
        where: { tenantId: siteId, noticeId: created.body.id },
      }),
    );
    expect(members).toHaveLength(4);
    expect(
      members.find((member) => member.recipientUserId === managerId),
    ).toMatchObject({
      recipientKind: "GUARDIAN",
      guardianIdentityId: managerGuardianId,
    });
  });

  it("records explicit acknowledgement once and reports only scoped aggregate receipts", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/notices/drafts")
      .set("Authorization", managerAuthorization)
      .send({
        title: "Response requested",
        body: "Please confirm that you read this notice.",
        audience: "PARENTS_AND_STAFF",
        requiresAcknowledgement: true,
        expiresAt: null,
      });
    expect(created.status).toBe(201);
    const preview = await request(app.getHttpServer())
      .get(`/ace/notices/drafts/${created.body.id}/audience-preview`)
      .set("Authorization", managerAuthorization);
    expect(preview.status).toBe(200);
    const published = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/publish`)
      .set("Authorization", managerAuthorization)
      .send({
        expectedUpdatedAt: created.body.updatedAt,
        expectedAudienceVersion: preview.body.audienceVersion,
      });
    expect(published.status).toBe(201);

    const parentDetail = await request(app.getHttpServer())
      .get(`/ace/parent/sites/${siteId}/notices/${created.body.id}`)
      .set("Authorization", guardianAuthorization);
    expect(parentDetail.status).toBe(200);
    expect(parentDetail.body).toMatchObject({
      requiresAcknowledgement: true,
      readAt: null,
      acknowledgedAt: null,
    });
    const first = await request(app.getHttpServer())
      .post(
        `/ace/parent/sites/${siteId}/notices/${created.body.id}/acknowledge`,
      )
      .set("Authorization", guardianAuthorization);
    expect(first.status).toBe(201);
    expect(
      new Date(first.body.acknowledgedAt).getTime(),
    ).toBeGreaterThanOrEqual(new Date(first.body.readAt).getTime());
    const repeated = await request(app.getHttpServer())
      .post(
        `/ace/parent/sites/${siteId}/notices/${created.body.id}/acknowledge`,
      )
      .set("Authorization", guardianAuthorization);
    expect(repeated.status).toBe(201);
    expect(repeated.body).toEqual(first.body);

    const denied = await request(app.getHttpServer())
      .get(`/ace/notices/${created.body.id}/receipts`)
      .set("Authorization", readerAuthorization);
    expect(denied.status).toBe(403);
    const summary = await request(app.getHttpServer())
      .get(`/ace/notices/${created.body.id}/receipts`)
      .set("Authorization", managerAuthorization);
    expect(summary.status).toBe(200);
    expect(summary.body).toMatchObject({
      recipientCount: preview.body.recipientCount,
      deliveredCount: preview.body.recipientCount,
      readCount: 1,
      acknowledgedCount: 1,
      requiresAcknowledgement: true,
    });
    await expect(
      withTenantRlsContext(siteId, orgId, (tx) =>
        tx.aceNotice.update({
          where: { id: created.body.id },
          data: { requiresAcknowledgement: false },
        }),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining(
        "Published notice acknowledgement setting is immutable",
      ),
    });
    const guardianReceipt = await withTenantRlsContext(siteId, orgId, (tx) =>
      tx.aceNoticeReceipt.findFirst({
        where: {
          tenantId: siteId,
          audienceMember: {
            noticeId: created.body.id,
            recipientUserId: guardianUserId,
          },
        },
        select: { id: true },
      }),
    );
    if (!guardianReceipt) throw new Error("Guardian receipt was not stored");
    await expect(
      withTenantRlsContext(siteId, orgId, (tx) =>
        tx.aceNoticeReceipt.update({
          where: { id: guardianReceipt.id },
          data: { acknowledgedAt: null },
        }),
      ),
    ).rejects.toMatchObject({
      message: expect.stringContaining("Notice acknowledgement is write-once"),
    });
  });

  it("schedules, cancels, and publishes a notice once through the authenticated runner", async () => {
    if (!app) return;
    const priorSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "integration-test-notice-cron-secret";
    try {
      const created = await request(app.getHttpServer())
        .post("/ace/notices/drafts")
        .set("Authorization", managerAuthorization)
        .send({
          title: "Scheduled staff update",
          body: "Please check tomorrow's arrangements.",
          audience: "STAFF",
          expiresAt: null,
        });
      expect(created.status).toBe(201);
      const path = `/ace/notices/${created.body.id}`;
      const preview = await request(app.getHttpServer())
        .get(`/ace/notices/drafts/${created.body.id}/audience-preview`)
        .set("Authorization", managerAuthorization);
      expect(preview.status).toBe(200);
      const reviewed = {
        expectedUpdatedAt: created.body.updatedAt,
        expectedAudienceVersion: preview.body.audienceVersion,
      };
      const scheduledAt = new Date(Date.now() + 30_000).toISOString();
      const denied = await request(app.getHttpServer())
        .post(`${path}/schedule`)
        .set("Authorization", readerAuthorization)
        .send({ ...reviewed, scheduledAt });
      expect(denied.status).toBe(403);
      const scheduled = await request(app.getHttpServer())
        .post(`${path}/schedule`)
        .set("Authorization", managerAuthorization)
        .send({ ...reviewed, scheduledAt });
      expect(scheduled.status).toBe(201);
      expect(scheduled.body.scheduledAt).toBe(scheduledAt);
      const status = await request(app.getHttpServer())
        .get(`/announcements/${created.body.id}`)
        .set("Authorization", managerAuthorization);
      expect(status.body).toMatchObject({
        status: "scheduled",
        scheduledAt,
        publishedAt: null,
      });
      const earlyPublish = await request(app.getHttpServer())
        .post(`${path}/publish`)
        .set("Authorization", managerAuthorization)
        .send(reviewed);
      expect(earlyPublish.status).toBe(409);
      const editWhileScheduled = await request(app.getHttpServer())
        .put(`/ace/notices/drafts/${created.body.id}`)
        .set("Authorization", managerAuthorization)
        .send({
          title: "Changed after review",
          body: "Please check tomorrow's arrangements.",
          audience: "STAFF",
          expiresAt: null,
          expectedUpdatedAt: created.body.updatedAt,
        });
      expect(editWhileScheduled.status).toBe(409);
      const deniedCancellation = await request(app.getHttpServer())
        .post(`${path}/cancel-schedule`)
        .set("Authorization", readerAuthorization);
      expect(deniedCancellation.status).toBe(403);
      const deniedRunner = await request(app.getHttpServer()).get(
        "/internal/notice-schedules/run",
      );
      expect(deniedRunner.status).toBe(401);

      const cancelled = await request(app.getHttpServer())
        .post(`${path}/cancel-schedule`)
        .set("Authorization", managerAuthorization);
      expect(cancelled.status).toBe(201);
      const freshDraft = await request(app.getHttpServer())
        .get(`/ace/notices/drafts/${created.body.id}`)
        .set("Authorization", managerAuthorization);
      expect(freshDraft.body.scheduledAt).toBeNull();
      const freshPreview = await request(app.getHttpServer())
        .get(`/ace/notices/drafts/${created.body.id}/audience-preview`)
        .set("Authorization", managerAuthorization);
      const dueAt = new Date(Date.now() + 4_000).toISOString();
      const rescheduled = await request(app.getHttpServer())
        .post(`${path}/schedule`)
        .set("Authorization", managerAuthorization)
        .send({
          expectedUpdatedAt: freshDraft.body.updatedAt,
          expectedAudienceVersion: freshPreview.body.audienceVersion,
          scheduledAt: dueAt,
        });
      expect(rescheduled.status).toBe(201);

      await new Promise<void>((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, new Date(dueAt).getTime() - Date.now() + 200),
        ),
      );
      const run = await request(app.getHttpServer())
        .get("/internal/notice-schedules/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(run.status).toBe(200);
      expect(run.body.published).toBe(1);
      const repeated = await request(app.getHttpServer())
        .get("/internal/notice-schedules/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(repeated.status).toBe(200);
      expect(repeated.body.published).toBe(0);
      const stored = await withTenantRlsContext(siteId, orgId, async (tx) => ({
        notice: await tx.aceNotice.findUnique({
          where: { id: created.body.id },
        }),
        recipients: await tx.aceNoticeAudienceMember.count({
          where: { tenantId: siteId, noticeId: created.body.id },
        }),
      }));
      expect(stored.notice?.publishedAt).not.toBeNull();
      expect(stored.recipients).toBe(preview.body.recipientCount);
    } finally {
      if (priorSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = priorSecret;
    }
  });

  it("pauses a scheduled notice when its parent audience disappears", async () => {
    if (!app) return;
    const priorSecret = process.env.CRON_SECRET;
    process.env.CRON_SECRET = "integration-test-notice-cron-secret";
    try {
      const created = await request(app.getHttpServer())
        .post("/ace/notices/drafts")
        .set("Authorization", managerAuthorization)
        .send({
          title: "Parent schedule review",
          body: "Please read the arrangements.",
          audience: "PARENTS",
          expiresAt: null,
        });
      expect(created.status).toBe(201);
      const preview = await request(app.getHttpServer())
        .get(`/ace/notices/drafts/${created.body.id}/audience-preview`)
        .set("Authorization", managerAuthorization);
      expect(preview.body.recipientCount).toBeGreaterThan(0);
      const dueAt = new Date(Date.now() + 4_000).toISOString();
      const scheduled = await request(app.getHttpServer())
        .post(`/ace/notices/${created.body.id}/schedule`)
        .set("Authorization", managerAuthorization)
        .send({
          expectedUpdatedAt: created.body.updatedAt,
          expectedAudienceVersion: preview.body.audienceVersion,
          scheduledAt: dueAt,
        });
      expect(scheduled.status).toBe(201);
      await prisma.org.update({
        where: { id: orgId },
        data: { parentPortalEnabled: false },
      });
      await new Promise<void>((resolve) =>
        setTimeout(
          resolve,
          Math.max(0, new Date(dueAt).getTime() - Date.now() + 200),
        ),
      );
      const run = await request(app.getHttpServer())
        .get("/internal/notice-schedules/run")
        .set("Authorization", `Bearer ${process.env.CRON_SECRET}`);
      expect(run.status).toBe(200);
      expect(run.body.needsReview).toBe(1);
      const stored = await withTenantRlsContext(siteId, orgId, async (tx) => ({
        notice: await tx.aceNotice.findUnique({
          where: { id: created.body.id },
        }),
        recipients: await tx.aceNoticeAudienceMember.count({
          where: { tenantId: siteId, noticeId: created.body.id },
        }),
      }));
      expect(stored.notice).toMatchObject({
        publishedAt: null,
        scheduledAt: null,
        scheduleFailureReason: "AUDIENCE_CHANGED",
      });
      expect(stored.recipients).toBe(0);
    } finally {
      await prisma.org.update({
        where: { id: orgId },
        data: { parentPortalEnabled: true },
      });
      if (priorSecret === undefined) delete process.env.CRON_SECRET;
      else process.env.CRON_SECRET = priorSecret;
    }
  });

  it("lists only active staff-recipient notices and denies removed staff", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/notices/drafts")
      .set("Authorization", managerAuthorization)
      .send({
        title: "Staff inbox notice",
        body: "Read this from the staff inbox.",
        audience: "PARENTS_AND_STAFF",
        expiresAt: null,
      });
    expect(created.status).toBe(201);
    const preview = await request(app.getHttpServer())
      .get(`/ace/notices/drafts/${created.body.id}/audience-preview`)
      .set("Authorization", managerAuthorization);
    expect(preview.status).toBe(200);
    const published = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/publish`)
      .set("Authorization", managerAuthorization)
      .send({
        expectedUpdatedAt: created.body.updatedAt,
        expectedAudienceVersion: preview.body.audienceVersion,
      });
    expect(published.status).toBe(201);

    const denied = await request(app.getHttpServer())
      .get(`/ace/notices/${created.body.id}`)
      .set("Authorization", publisherAuthorization);
    expect(denied.status).toBe(403);
    const listed = await request(app.getHttpServer())
      .get("/ace/notices?limit=50")
      .set("Authorization", readerAuthorization);
    expect(listed.status).toBe(200);
    const summary = listed.body.items.find(
      (item: { id: string }) => item.id === created.body.id,
    );
    expect(summary).toBeDefined();
    expect(summary).not.toHaveProperty("body");
    expect(summary.deliveredAt).toBeTruthy();
    const detail = await request(app.getHttpServer())
      .get(`/ace/notices/${created.body.id}`)
      .set("Authorization", readerAuthorization);
    expect(detail.status).toBe(200);
    expect(detail.body.body).toBe("Read this from the staff inbox.");
    expect(detail.body.readAt).toBeNull();
    const read = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/read`)
      .set("Authorization", readerAuthorization);
    expect(read.status).toBe(201);
    expect(read.body.readAt).toBeTruthy();
    const repeatedRead = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/read`)
      .set("Authorization", readerAuthorization);
    expect(repeatedRead.status).toBe(201);
    expect(repeatedRead.body.readAt).toBe(read.body.readAt);
    const deniedRead = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/read`)
      .set("Authorization", publisherAuthorization);
    expect(deniedRead.status).toBe(403);

    const managerDetail = await request(app.getHttpServer())
      .get(`/ace/notices/${created.body.id}`)
      .set("Authorization", managerAuthorization);
    expect(managerDetail.status).toBe(200);
    expect(managerDetail.body.audience).toBe("PARENTS_AND_STAFF");

    const parentsOnly = await request(app.getHttpServer())
      .post("/ace/notices/drafts")
      .set("Authorization", managerAuthorization)
      .send({
        title: "Families only",
        body: "A family notice.",
        audience: "PARENTS",
        expiresAt: null,
      });
    expect(parentsOnly.status).toBe(201);
    const parentPreview = await request(app.getHttpServer())
      .get(`/ace/notices/drafts/${parentsOnly.body.id}/audience-preview`)
      .set("Authorization", managerAuthorization);
    expect(parentPreview.status).toBe(200);
    const parentPublished = await request(app.getHttpServer())
      .post(`/ace/notices/${parentsOnly.body.id}/publish`)
      .set("Authorization", managerAuthorization)
      .send({
        expectedUpdatedAt: parentsOnly.body.updatedAt,
        expectedAudienceVersion: parentPreview.body.audienceVersion,
      });
    expect(parentPublished.status).toBe(201);
    const hiddenParentNotice = await request(app.getHttpServer())
      .get(`/ace/notices/${parentsOnly.body.id}`)
      .set("Authorization", readerAuthorization);
    expect(hiddenParentNotice.status).toBe(404);

    await prisma.siteMembership.delete({
      where: { tenantId_userId: { tenantId: siteId, userId: readerId } },
    });
    try {
      const removed = await request(app.getHttpServer())
        .get(`/ace/notices/${created.body.id}`)
        .set("Authorization", readerAuthorization);
      expect(removed.status).toBe(403);
      const removedRead = await request(app.getHttpServer())
        .post(`/ace/notices/${created.body.id}/read`)
        .set("Authorization", readerAuthorization);
      expect(removedRead.status).toBe(403);
    } finally {
      await prisma.siteMembership.create({
        data: { tenantId: siteId, userId: readerId, role: "STAFF" },
      });
    }

    const withdrawn = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/withdraw`)
      .set("Authorization", managerAuthorization)
      .send({ reason: "Superseded" });
    expect(withdrawn.status).toBe(201);
    const hidden = await request(app.getHttpServer())
      .get(`/ace/notices/${created.body.id}`)
      .set("Authorization", readerAuthorization);
    expect(hidden.status).toBe(404);
    const withdrawnRead = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/read`)
      .set("Authorization", readerAuthorization);
    expect(withdrawnRead.status).toBe(404);
  });

  it("lets a linked guardian read only current parent deliveries", async () => {
    if (!app) return;
    const created = await request(app.getHttpServer())
      .post("/ace/notices/drafts")
      .set("Authorization", managerAuthorization)
      .send({
        title: "Family update",
        body: "The school day starts at nine.",
        audience: "PARENTS",
        expiresAt: null,
      });
    expect(created.status).toBe(201);
    const preview = await request(app.getHttpServer())
      .get(`/ace/notices/drafts/${created.body.id}/audience-preview`)
      .set("Authorization", managerAuthorization);
    expect(preview.status).toBe(200);
    const published = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/publish`)
      .set("Authorization", managerAuthorization)
      .send({
        expectedUpdatedAt: created.body.updatedAt,
        expectedAudienceVersion: preview.body.audienceVersion,
      });
    expect(published.status).toBe(201);

    const path = `/ace/parent/sites/${siteId}/notices`;
    const listed = await request(app.getHttpServer())
      .get(`${path}?limit=50`)
      .set("Authorization", guardianAuthorization);
    expect(listed.status).toBe(200);
    const summary = listed.body.items.find(
      (item: { id: string }) => item.id === created.body.id,
    );
    expect(summary).toBeDefined();
    expect(summary).not.toHaveProperty("body");
    expect(summary.deliveredAt).toBeTruthy();

    const detail = await request(app.getHttpServer())
      .get(`${path}/${created.body.id}`)
      .set("Authorization", guardianAuthorization);
    expect(detail.status).toBe(200);
    expect(detail.body.body).toBe("The school day starts at nine.");
    const read = await request(app.getHttpServer())
      .post(`${path}/${created.body.id}/read`)
      .set("Authorization", guardianAuthorization);
    expect(read.status).toBe(201);
    expect(read.body.readAt).toBeTruthy();
    const repeated = await request(app.getHttpServer())
      .post(`${path}/${created.body.id}/read`)
      .set("Authorization", guardianAuthorization);
    expect(repeated.body.readAt).toBe(read.body.readAt);

    const staffOnly = await request(app.getHttpServer())
      .get(`${path}/${created.body.id}`)
      .set("Authorization", readerAuthorization);
    expect(staffOnly.status).toBe(404);
    const otherSite = await request(app.getHttpServer())
      .get(`/ace/parent/sites/${otherSiteId}/notices/${created.body.id}`)
      .set("Authorization", guardianAuthorization);
    expect(otherSite.status).toBe(404);

    await prisma.org.update({
      where: { id: orgId },
      data: { parentPortalEnabled: false },
    });
    try {
      const closedPortal = await request(app.getHttpServer())
        .get(`${path}/${created.body.id}`)
        .set("Authorization", guardianAuthorization);
      expect(closedPortal.status).toBe(404);
    } finally {
      await prisma.org.update({
        where: { id: orgId },
        data: { parentPortalEnabled: true },
      });
    }

    await prisma.guardianChildRelationship.updateMany({
      where: {
        tenantId: siteId,
        guardianIdentityId: parentGuardianId,
        childId,
      },
      data: { endedAt: new Date() },
    });
    try {
      const endedLink = await request(app.getHttpServer())
        .post(`${path}/${created.body.id}/read`)
        .set("Authorization", guardianAuthorization);
      expect(endedLink.status).toBe(404);
    } finally {
      await prisma.guardianChildRelationship.updateMany({
        where: {
          tenantId: siteId,
          guardianIdentityId: parentGuardianId,
          childId,
        },
        data: { endedAt: null },
      });
    }

    const withdrawn = await request(app.getHttpServer())
      .post(`/ace/notices/${created.body.id}/withdraw`)
      .set("Authorization", managerAuthorization)
      .send({ reason: "Superseded" });
    expect(withdrawn.status).toBe(201);
    const hidden = await request(app.getHttpServer())
      .get(`${path}/${created.body.id}`)
      .set("Authorization", guardianAuthorization);
    expect(hidden.status).toBe(404);
  });

  it("publishes school roster audiences without widening staff or guardian reads", async () => {
    if (!app) return;
    const yearId = randomUUID();
    const bandId = randomUUID();
    const groupId = randomUUID();
    const foreignGroupId = randomUUID();
    const thisYear = new Date().getUTCFullYear();
    const startsOn = new Date(Date.UTC(thisYear - 1, 0, 1));
    const endsOn = new Date(Date.UTC(thisYear + 1, 11, 31));
    await prisma.academicYear.create({
      data: {
        id: yearId,
        tenantId: siteId,
        name: `Notice year ${yearId}`,
        startsOn,
        endsOn,
      },
    });
    await prisma.aceYearBand.create({
      data: { id: bandId, tenantId: siteId, name: `Notice band ${bandId}` },
    });
    await prisma.group.createMany({
      data: [
        { id: groupId, tenantId: siteId, name: `Notice group ${groupId}` },
        {
          id: foreignGroupId,
          tenantId: otherSiteId,
          name: `Notice group ${foreignGroupId}`,
        },
      ],
    });
    await prisma.child.update({ where: { id: childId }, data: { groupId } });
    await prisma.aceSchoolEnrollment.create({
      data: {
        tenantId: siteId,
        childId,
        academicYearId: yearId,
        yearBandId: bandId,
        startsOn,
      },
    });
    const assignment = await prisma.aceStaffYearBandAssignment.create({
      data: {
        tenantId: siteId,
        yearBandId: bandId,
        userId: readerId,
        startsOn,
      },
    });

    async function publishTarget(
      scope: "YEAR_BAND" | "GROUP" | "CHILD",
      targetId: string,
      audience: "PARENTS" | "PARENTS_AND_STAFF",
    ) {
      const created = await request(app!.getHttpServer())
        .post("/ace/notices/drafts")
        .set("Authorization", managerAuthorization)
        .send({
          title: `${scope} notice`,
          body: "This notice follows the selected roster.",
          audience,
          audienceScope: scope,
          audienceTargetId: targetId,
          expiresAt: null,
        });
      expect(created.status).toBe(201);
      const preview = await request(app!.getHttpServer())
        .get(`/ace/notices/drafts/${created.body.id}/audience-preview`)
        .set("Authorization", managerAuthorization);
      expect(preview.status).toBe(200);
      expect(preview.body.recipientCount).toBeGreaterThan(0);
      const published = await request(app!.getHttpServer())
        .post(`/ace/notices/${created.body.id}/publish`)
        .set("Authorization", managerAuthorization)
        .send({
          expectedUpdatedAt: created.body.updatedAt,
          expectedAudienceVersion: preview.body.audienceVersion,
        });
      expect(published.status).toBe(201);
      return created.body.id as string;
    }

    try {
      const targets = await request(app.getHttpServer())
        .get("/ace/notices/targets?scope=YEAR_BAND")
        .set("Authorization", managerAuthorization);
      expect(targets.status).toBe(200);
      expect(targets.body.items).toContainEqual({
        id: bandId,
        label: `Notice band ${bandId}`,
      });

      const classNoticeId = await publishTarget(
        "YEAR_BAND",
        bandId,
        "PARENTS_AND_STAFF",
      );
      const parentPath = `/ace/parent/sites/${siteId}/notices/${classNoticeId}`;
      expect(
        (
          await request(app.getHttpServer())
            .get(parentPath)
            .set("Authorization", guardianAuthorization)
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app.getHttpServer())
            .get(`/ace/notices/${classNoticeId}`)
            .set("Authorization", readerAuthorization)
        ).status,
      ).toBe(200);

      await prisma.aceStaffYearBandAssignment.delete({
        where: { id: assignment.id },
      });
      expect(
        (
          await request(app.getHttpServer())
            .get(`/ace/notices/${classNoticeId}`)
            .set("Authorization", readerAuthorization)
        ).status,
      ).toBe(404);

      const groupNoticeId = await publishTarget("GROUP", groupId, "PARENTS");
      expect(
        (
          await request(app.getHttpServer())
            .get(`/ace/parent/sites/${siteId}/notices/${groupNoticeId}`)
            .set("Authorization", guardianAuthorization)
        ).status,
      ).toBe(200);
      expect(
        (
          await request(app.getHttpServer())
            .get(`/ace/notices/${groupNoticeId}`)
            .set("Authorization", readerAuthorization)
        ).status,
      ).toBe(404);

      const childNoticeId = await publishTarget("CHILD", childId, "PARENTS");
      await prisma.guardianChildRelationship.updateMany({
        where: {
          tenantId: siteId,
          guardianIdentityId: parentGuardianId,
          childId,
        },
        data: { endedAt: new Date() },
      });
      expect(
        (
          await request(app.getHttpServer())
            .get(`/ace/parent/sites/${siteId}/notices/${childNoticeId}`)
            .set("Authorization", guardianAuthorization)
        ).status,
      ).toBe(404);

      const foreignDraft = await request(app.getHttpServer())
        .post("/ace/notices/drafts")
        .set("Authorization", managerAuthorization)
        .send({
          title: "Foreign group",
          body: "This must never publish.",
          audience: "PARENTS",
          audienceScope: "GROUP",
          audienceTargetId: foreignGroupId,
          expiresAt: null,
        });
      expect(foreignDraft.status).toBe(201);
      expect(
        (
          await request(app.getHttpServer())
            .get(`/ace/notices/drafts/${foreignDraft.body.id}/audience-preview`)
            .set("Authorization", managerAuthorization)
        ).status,
      ).toBe(404);
    } finally {
      await prisma.guardianChildRelationship.updateMany({
        where: {
          tenantId: siteId,
          guardianIdentityId: parentGuardianId,
          childId,
        },
        data: { endedAt: null },
      });
      await prisma.aceStaffYearBandAssignment.deleteMany({
        where: { tenantId: siteId, yearBandId: bandId },
      });
      await prisma.aceSchoolEnrollment.deleteMany({
        where: { tenantId: siteId, yearBandId: bandId },
      });
      await prisma.child.update({
        where: { id: childId },
        data: { groupId: null },
      });
      await prisma.group.deleteMany({
        where: { id: { in: [groupId, foreignGroupId] } },
      });
      await prisma.aceYearBand.delete({ where: { id: bandId } });
      await prisma.academicYear.delete({ where: { id: yearId } });
    }
  });
});
