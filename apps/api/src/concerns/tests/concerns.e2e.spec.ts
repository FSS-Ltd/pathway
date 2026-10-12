import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";
import { withTenantRlsContext, Role } from "@pathway/db";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

// API response shape (serialized)
type Concern = {
  id: string;
  childId: string;
  summary: string;
  details: string | null;
  createdAt: string;
  updatedAt: string;
};

describe("Concerns (e2e)", () => {
  let app: INestApplication;
  let tenantId: string;
  let orgId: string;
  let childId: string | null = null;
  let createdId: string | undefined;
  let authHeader: string;
  let teacherAuthHeader: string;
  let teacherUserId: string;
  const userId = randomUUID();
  const userEmail = `concerns.e2e-${userId}@pathway.app`;

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    orgId = process.env.E2E_ORG_ID as string;
    tenantId = process.env.E2E_TENANT_ID as string;
    if (!orgId || !tenantId) {
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID missing");
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.user.create({
        data: {
          id: userId,
          email: userEmail,
          name: "Concerns E2E User",
          tenant: { connect: { id: tenantId } },
        },
      });
      await tx.userTenantRole.create({
        data: { userId, tenantId, role: Role.ADMIN },
      });

      const child = await tx.child.create({
        data: {
          tenantId,
          firstName: "E2E",
          lastName: "Child",
        } as Parameters<typeof tx.child.create>[0]["data"],
      });
      childId = child.id;
    });

    const adminAuth = await seedE2eAuthUser({
      subject: "concerns-e2e-user",
      userId,
      email: userEmail,
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    authHeader = adminAuth.authorization;

    const teacherAuth = await seedE2eAuthUser({
      subject: "concerns-e2e-teacher",
      tenantId,
      siteRole: "STAFF",
      orgId,
    });
    teacherUserId = teacherAuth.userId;
    teacherAuthHeader = teacherAuth.authorization;

    if (!childId) {
      throw new Error("failed to seed child for concerns e2e");
    }
  });

  afterAll(async () => {
    if (createdId) {
      await withTenantRlsContext(tenantId, orgId, async (tx) => {
        await tx.concern
          .delete({ where: { id: createdId } })
          .catch(() => undefined);
      }).catch(() => undefined);
    }
    if (childId) {
      await withTenantRlsContext(tenantId, orgId, async (tx) => {
        await tx.child
          .delete({ where: { id: childId as string } })
          .catch(() => undefined);
      }).catch(() => undefined);
    }
    await clearE2eAuthAccess(userId);
    await clearE2eAuthAccess(teacherUserId);
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.userTenantRole
        .deleteMany({ where: { userId, tenantId } })
        .catch(() => undefined);
      await tx.user
        .deleteMany({ where: { id: { in: [userId, teacherUserId] } } })
        .catch(() => undefined);
    }).catch(() => undefined);
    if (app) {
      await app.close();
    }
  });

  describe("validation", () => {
    it("POST /concerns returns 400 for empty summary (before FK checks)", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .post("/concerns")
        .set("Authorization", authHeader)
        .send({ summary: "", details: "", childId });

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("fieldErrors");
      expect(res.body.fieldErrors?.summary?.length).toBeGreaterThan(0);
    });
  });

  describe("RBAC", () => {
    it("returns 403 for teacher role accessing concerns", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get("/concerns")
        .set("Authorization", teacherAuthHeader);

      expect(res.status).toBe(403);
    });
  });

  describe("CRUD", () => {
    it("POST /concerns creates a concern when child exists", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .post("/concerns")
        .set("Authorization", authHeader)
        .send({
          summary: "Playground incident",
          details: "Minor disagreement",
          childId,
        });

      expect(res.status).toBe(201);
      createdId = (res.body as Concern).id;
      expect(res.body).toMatchObject({
        summary: "Playground incident",
        details: "Minor disagreement",
        childId,
      });
    });

    it("GET /concerns filters by childId", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get(`/concerns?childId=${childId}`)
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect((res.body as Concern[]).every((c) => c.childId === childId)).toBe(
        true,
      );
    });

    it("GET /concerns/:id returns the concern", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get(`/concerns/${createdId}`)
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", createdId);
    });

    it("PATCH /concerns/:id updates summary/details", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .patch(`/concerns/${createdId}`)
        .set("Authorization", authHeader)
        .send({ summary: "Updated summary", details: "Updated details" });

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: createdId,
        summary: "Updated summary",
        details: "Updated details",
      });
    });

    it("DELETE /concerns/:id deletes and then 404s on fetch", async () => {
      if (!app) return;
      const resDelete = await request(app.getHttpServer())
        .delete(`/concerns/${createdId}`)
        .set("Authorization", authHeader);
      expect(resDelete.status).toBe(200);

      const resGet = await request(app.getHttpServer())
        .get(`/concerns/${createdId}`)
        .set("Authorization", authHeader);
      expect(resGet.status).toBe(404);
      createdId = undefined;
    });
  });
});
