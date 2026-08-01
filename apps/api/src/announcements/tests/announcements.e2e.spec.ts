import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";
import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  clearE2eAuthAccess,
  clearE2eTypedRole,
  requireDatabase,
  seedE2eAuthUser,
  seedE2eTypedRole,
} from "../../../test-helpers.e2e";

// Types to keep the spec strongly typed (no any)
type Announcement = {
  id: string;
  tenantId: string;
  title: string;
  body: string;
  audience: "ALL" | "PARENTS" | "STAFF";
  publishedAt: string | null; // serialized by Nest/Prisma to ISO string or null
  createdAt: string;
  updatedAt: string;
};

describe("Announcements (e2e)", () => {
  let app: INestApplication;
  const orgId = process.env.E2E_ORG_ID as string;
  const tenantId = process.env.E2E_TENANT_ID as string;
  const otherTenantId = process.env.E2E_TENANT2_ID as string;
  let createdId: string;
  let authHeader: string;
  let authUserId: string;
  let otherAnnouncementId: string;
  let typedRole: Awaited<ReturnType<typeof seedE2eTypedRole>> | undefined;
  let createdOrgVertical = false;

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    if (!orgId || !tenantId || !otherTenantId) {
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID / E2E_TENANT2_ID missing");
    }

    // notices.read/manage are org-capability-gated (PLATFORM_CORE_CAPABILITIES,
    // granted by any vertical); the shared E2E_ORG_ID fixture has no OrgVertical
    // row by default, so PermissionGuard would deny every request with
    // capability-missing regardless of the typed assignment below.
    const existingVertical = await prisma.orgVertical.findUnique({
      where: { orgId },
    });
    if (!existingVertical) {
      await prisma.orgVertical.create({
        data: { orgId, vertical: "ACE_SCHOOL" },
      });
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

    // seed announcement in other tenant
    await withTenantRlsContext(otherTenantId, orgId, async (tx) => {
      await tx.announcement.deleteMany({ where: { tenantId: otherTenantId } });
      const otherAnnouncement = await tx.announcement.create({
        data: {
          tenantId: otherTenantId,
          title: "Other tenant announcement",
          body: "Should not be visible",
          audience: "ALL",
        },
      });
      otherAnnouncementId = otherAnnouncement.id;
    });
  });

  afterAll(async () => {
    if (app) {
      await prisma.announcement
        .deleteMany({ where: { tenantId: { in: [tenantId, otherTenantId] } } })
        .catch(() => undefined);
      if (typedRole) {
        await clearE2eTypedRole(typedRole, orgId);
      }
      if (createdOrgVertical) {
        await prisma.orgVertical.deleteMany({ where: { orgId } });
      }
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await app.close();
    }
  });

  describe("CRUD", () => {
    it("POST /announcements should create an announcement (default audience ALL)", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .post("/announcements")
        .send({
          tenantId,
          title: "Welcome",
          body: "We are live!",
          // audience omitted → defaults to ALL
        })
        .set("content-type", "application/json")
        .set("Authorization", authHeader);

      expect(res.status).toBe(201);
      const body: Announcement = res.body as Announcement;
      expect(body.id).toBeTruthy();
      expect(body.tenantId).toBe(tenantId);
      expect(body.audience).toBe("ALL");
      expect(typeof body.createdAt).toBe("string");
      expect(typeof body.updatedAt).toBe("string");
      createdId = body.id;
    });

    it("GET /announcements should filter by tenant and audience & publishedOnly", async () => {
      if (!app) return;
      // Create additional announcements with differing audiences and publishedAt
      const parents = await request(app.getHttpServer())
        .post("/announcements")
        .send({
          tenantId,
          title: "For Parents",
          body: "Info for parents",
          audience: "PARENTS",
          publishedAt: "2025-01-10",
        })
        .set("content-type", "application/json")
        .set("Authorization", authHeader);
      expect(parents.status).toBe(201);

      const staff = await request(app.getHttpServer())
        .post("/announcements")
        .send({
          tenantId,
          title: "For Staff",
          body: "Info for staff",
          audience: "STAFF",
        })
        .set("content-type", "application/json")
        .set("Authorization", authHeader);
      expect(staff.status).toBe(201);

      // Query parents + publishedOnly
      const resParents = await request(app.getHttpServer())
        .get(`/announcements`)
        .query({ audience: "PARENTS", publishedOnly: true })
        .set("Authorization", authHeader);

      expect(resParents.status).toBe(200);
      const listParents: Announcement[] = resParents.body as Announcement[];
      expect(Array.isArray(listParents)).toBe(true);
      expect(listParents.length).toBeGreaterThanOrEqual(1);
      expect(
        listParents.every(
          (a) =>
            a.tenantId === tenantId &&
            a.audience === "PARENTS" &&
            typeof a.publishedAt === "string",
        ),
      ).toBe(true);

      // Query all audience (ALL)
      const resAll = await request(app.getHttpServer())
        .get(`/announcements`)
        .query({ audience: "ALL" })
        .set("Authorization", authHeader);
      expect(resAll.status).toBe(200);
      const listAll: Announcement[] = resAll.body as Announcement[];
      expect(
        listAll.every((a) => a.tenantId === tenantId && a.audience === "ALL"),
      ).toBe(true);
    });

    it("GET /announcements should not leak other tenant announcements", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get(`/announcements`)
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(
        res.body.some((a: { id: string }) => a.id === otherAnnouncementId),
      ).toBe(false);
    });

    it("GET /announcements/:id should return the announcement", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get(`/announcements/${createdId}`)
        .set("Authorization", authHeader);
      expect(res.status).toBe(200);
      const body: Announcement = res.body as Announcement;
      expect(body.id).toBe(createdId);
    });

    it("GET /announcements/:id should 404 for other tenant", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get(`/announcements/${otherAnnouncementId}`)
        .set("Authorization", authHeader);
      expect(res.status).toBe(404);
    });

    it("PATCH /announcements/:id should update fields", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .patch(`/announcements/${createdId}`)
        .send({
          title: "Welcome Updated",
          audience: "STAFF",
          publishedAt: "2025-01-12",
        })
        .set("content-type", "application/json")
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      const body: Announcement = res.body as Announcement;
      expect(body.title).toBe("Welcome Updated");
      expect(body.audience).toBe("STAFF");
      expect(typeof body.publishedAt).toBe("string");
      expect((body.publishedAt as string).startsWith("2025-01-12")).toBe(true);
    });

    it("DELETE /announcements/:id should delete and return the announcement", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .delete(`/announcements/${createdId}`)
        .set("Authorization", authHeader);
      expect(res.status).toBe(200);
      const body: { id: string } = res.body as { id: string };
      expect(body.id).toBe(createdId);

      // Verify it no longer exists
      const res404 = await request(app.getHttpServer())
        .get(`/announcements/${createdId}`)
        .set("Authorization", authHeader);
      expect(res404.status).toBe(404);
    });
  });
});
