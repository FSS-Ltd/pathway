import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import request from "supertest";
import { AppModule } from "../../app.module";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

describe("Shared site notices (e2e)", () => {
  let app: INestApplication;
  const orgId = process.env.E2E_ORG_ID as string;
  const tenantId = process.env.E2E_TENANT_ID as string;
  const otherTenantId = process.env.E2E_TENANT2_ID as string;
  let authHeader: string;
  let authUserId: string;
  let currentNoticeId: string;
  let otherNoticeId: string;
  let typedRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let createdOrgVertical = false;

  beforeAll(async () => {
    if (!requireDatabase()) return;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    if (!orgId || !tenantId || !otherTenantId) {
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID / E2E_TENANT2_ID missing");
    }
    const existingVertical = await prisma.orgVertical.findUnique({
      where: { orgId },
    });
    if (!existingVertical) {
      await prisma.orgVertical.create({ data: { orgId, vertical: "NURSERY" } });
      createdOrgVertical = true;
    }
    const auth = await seedE2eAuthUser({
      subject: "announcements-e2e",
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    authUserId = auth.userId;
    authHeader = auth.authorization;
    typedRole = await seedE2eTypedRole({
      orgId,
      tenantId,
      userId: authUserId,
      scope: "site",
      permissionKeys: ["notices.read", "notices.manage"],
    });
    const current = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.announcement.create({
        data: {
          tenantId,
          title: "Historical shared notice",
          body: "Preserved message",
          audience: "ALL",
          publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    );
    currentNoticeId = current.id;
    const other = await withTenantRlsContext(otherTenantId, orgId, (tx) =>
      tx.announcement.create({
        data: {
          tenantId: otherTenantId,
          title: "Other site notice",
          body: "Must not leak",
          audience: "STAFF",
          publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        },
      }),
    );
    otherNoticeId = other.id;
  });

  afterAll(async () => {
    if (!app) return;
    for (const [siteId, noticeId] of [
      [tenantId, currentNoticeId],
      [otherTenantId, otherNoticeId],
    ]) {
      if (!noticeId) continue;
      await withTenantRlsContext(siteId, orgId, async (tx) => {
        await tx.announcement.deleteMany({
          where: { id: noticeId, tenantId: siteId },
        });
        await tx.aceNotice.deleteMany({
          where: { id: noticeId, tenantId: siteId },
        });
      });
    }
    if (typedRole) await clearE2eTypedRole(typedRole, orgId);
    if (createdOrgVertical)
      await prisma.orgVertical.deleteMany({ where: { orgId } });
    await clearE2eAuthAccess(authUserId);
    await prisma.user.deleteMany({ where: { id: authUserId } });
    await app.close();
  });

  it("reads the canonical imported record with its original ID and unknown provenance", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .get(`/announcements/${currentNoticeId}`)
      .set("Authorization", authHeader);
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      id: currentNoticeId,
      audience: "ALL",
      status: "sent",
    });
    expect(response.body.legacyImportedAt).toBeTruthy();
    const canonical = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.aceNotice.findFirst({ where: { id: currentNoticeId, tenantId } }),
    );
    expect(canonical?.createdByUserId).toBeNull();
  });

  it("keeps another site out of list and detail", async () => {
    if (!app) return;
    const list = await request(app.getHttpServer())
      .get("/announcements")
      .set("Authorization", authHeader);
    expect(list.status).toBe(200);
    expect(
      list.body.some((row: { id: string }) => row.id === otherNoticeId),
    ).toBe(false);
    const detail = await request(app.getHttpServer())
      .get(`/announcements/${otherNoticeId}`)
      .set("Authorization", authHeader);
    expect(detail.status).toBe(404);
  });

  it("shows imported staff notices in the shared inbox without a fake receipt", async () => {
    if (!app) return;
    const response = await request(app.getHttpServer())
      .get("/ace/notices")
      .set("Authorization", authHeader);
    expect(response.status).toBe(200);
    expect(response.body.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: currentNoticeId,
          historical: true,
          deliveredAt: null,
          readAt: null,
        }),
      ]),
    );
  });

  it("retires the old write endpoints", async () => {
    if (!app) return;
    const server = app.getHttpServer();
    const create = await request(server)
      .post("/announcements")
      .send({})
      .set("Authorization", authHeader);
    const update = await request(server)
      .patch(`/announcements/${currentNoticeId}`)
      .send({})
      .set("Authorization", authHeader);
    const remove = await request(server)
      .delete(`/announcements/${currentNoticeId}`)
      .set("Authorization", authHeader);
    expect([create.status, update.status, remove.status]).toEqual([
      410, 410, 410,
    ]);
  });
});
