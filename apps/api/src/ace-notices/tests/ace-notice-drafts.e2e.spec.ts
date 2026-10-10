import { randomUUID } from "node:crypto";
import { ForbiddenException, type INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma } from "@pathway/db";
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
  let app: INestApplication | undefined;
  let managerAuthorization = "";
  let readerAuthorization = "";
  let managerRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let readerRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;

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
    managerRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: managerId,
      scope: "site",
      permissionKeys: ["notices.manage"],
    });
    readerRole = await seedE2eTypedRole({
      orgId,
      tenantId: siteId,
      userId: readerId,
      scope: "site",
      permissionKeys: ["notices.read"],
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
    await prisma.aceNotice.deleteMany({ where: { tenantId: siteId } });
    if (readerRole) await clearE2eTypedRole(readerRole, orgId);
    if (managerRole) await clearE2eTypedRole(managerRole, orgId);
    await clearE2eAuthAccess(readerId);
    await clearE2eAuthAccess(managerId);
    await prisma.user.deleteMany({
      where: { id: { in: [managerId, readerId] } },
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
    expect(
      await prisma.aceNotice.findUnique({ where: { id: created.body.id } }),
    ).toMatchObject({
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
});
