import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";
import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

describe("Lessons (e2e)", () => {
  let app: INestApplication;
  let authHeader: string;
  let authUserId: string;
  let otherLessonId: string | undefined;

  const TENANT_A_ID = process.env.E2E_TENANT_ID as string;
  const TENANT_B_ID = process.env.E2E_TENANT2_ID as string;
  const ORG_ID = process.env.E2E_ORG_ID as string;
  if (!TENANT_A_ID || !TENANT_B_ID || !ORG_ID) {
    throw new Error("E2E_TENANT_ID / E2E_TENANT2_ID / E2E_ORG_ID missing");
  }

  const ids = {
    tenant: TENANT_A_ID,
    group: randomUUID(), // avoid cross-run uniqueness collisions
  };

  const base = {
    title: "Lesson One",
    description: "Intro lesson",
    weekOfISO: "2025-01-06", // Monday
    fileKey: "uploads/lesson-one.pdf",
  };

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    // Seed minimal graph within RLS context using seeded org/tenants
    await withTenantRlsContext(ids.tenant, ORG_ID, async (tx) => {
      await tx.group.create({
        data: {
          id: ids.group,
          name: "Bluebirds",
          tenantId: ids.tenant,
          minAge: 5,
          maxAge: 7,
        },
      });
    });

    const auth = await seedE2eAuthUser({
      subject: "lessons-e2e",
      tenantId: ids.tenant,
      siteRole: "SITE_ADMIN",
      orgId: ORG_ID,
      orgRole: "ORG_ADMIN",
    });
    authUserId = auth.userId;
    authHeader = auth.authorization;

    // Seed another tenant/lesson to verify isolation (no cleanup needed; use unique records)
    await withTenantRlsContext(TENANT_B_ID, ORG_ID, async (tx) => {
      const otherGroup = await tx.group.create({
        data: {
          name: "Robins",
          tenantId: TENANT_B_ID,
          minAge: 8,
          maxAge: 9,
        },
      });
      const otherLesson = await tx.lesson.create({
        data: {
          tenantId: TENANT_B_ID,
          groupId: otherGroup.id,
          title: "Other Lesson",
          weekOf: new Date("2025-01-06"),
        },
      });
      otherLessonId = otherLesson.id;
    });
  });

  afterAll(async () => {
    if (otherLessonId) {
      await prisma.lesson.deleteMany({ where: { id: otherLessonId } });
    }
    if (app) {
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await app.close();
    }
  });

  describe("CRUD", () => {
    let createdId: string;

    it("POST /lessons should create a lesson", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .post("/lessons")
        .send({
          tenantId: ids.tenant,
          groupId: ids.group,
          title: base.title,
          description: base.description,
          fileKey: base.fileKey,
          weekOf: base.weekOfISO,
        })
        .set("content-type", "application/json")
        .set("Authorization", authHeader);

      expect(res.status).toBe(201);
      expect(res.body).toMatchObject({
        tenantId: ids.tenant,
        groupId: ids.group,
        title: base.title,
        description: base.description,
        fileKey: base.fileKey,
      });
      expect(res.body).toHaveProperty("id");
      expect(res.body).toHaveProperty("weekOf");
      expect(typeof res.body.weekOf).toBe("string");
      expect((res.body.weekOf as string).startsWith(base.weekOfISO)).toBe(true);
      createdId = res.body.id;
    });

    it("GET /lessons/:id should return the created lesson", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get(`/lessons/${createdId}`)
        .set("Authorization", authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: createdId,
        tenantId: ids.tenant,
        groupId: ids.group,
        title: base.title,
      });
    });

    it("GET /lessons should filter by tenantId/groupId/weekOf", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get(`/lessons?groupId=${ids.group}&weekOf=${base.weekOfISO}`)
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(
        res.body.every(
          (l: { tenantId: string; groupId: string; weekOf: string }) =>
            l.tenantId === ids.tenant &&
            l.groupId === ids.group &&
            typeof l.weekOf === "string" &&
            l.weekOf.startsWith(base.weekOfISO),
        ),
      ).toBe(true);
    });

    it("GET /lessons should not leak other tenant lessons", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get("/lessons")
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(
        res.body.every((l: { tenantId: string }) => l.tenantId === ids.tenant),
      ).toBe(true);
      expect(res.body.some((l: { id: string }) => l.id === otherLessonId)).toBe(
        false,
      );
    });

    it("PATCH /lessons/:id should update fields", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .patch(`/lessons/${createdId}`)
        .send({
          title: "Lesson One (Updated)",
          description: "Updated desc",
          weekOf: "2025-01-13", // next week
        })
        .set("content-type", "application/json")
        .set("Authorization", authHeader);

      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({
        id: createdId,
        title: "Lesson One (Updated)",
        description: "Updated desc",
      });
      expect(typeof res.body.weekOf).toBe("string");
      expect((res.body.weekOf as string).startsWith("2025-01-13")).toBe(true);
    });

    it("GET /lessons/:id should 404 for other tenant lesson", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .get(`/lessons/${otherLessonId}`)
        .set("Authorization", authHeader);

      expect(res.status).toBe(404);
    });

    it("DELETE /lessons/:id should delete and return the lesson", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .delete(`/lessons/${createdId}`)
        .set("Authorization", authHeader);
      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty("id", createdId);

      const gone = await prisma.lesson.findUnique({ where: { id: createdId } });
      expect(gone).toBeNull();
    });
  });

  describe("Validation", () => {
    it("POST /lessons should 400 for invalid uuids", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .post("/lessons")
        .send({
          tenantId: "not-a-uuid",
          title: "Bad",
          weekOf: base.weekOfISO,
        })
        .set("content-type", "application/json")
        .set("Authorization", authHeader);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("message");
    });

    it("POST /lessons should 400 for invalid weekOf", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .post("/lessons")
        .send({
          tenantId: ids.tenant,
          title: "Bad Date",
          weekOf: "not-a-date",
        })
        .set("content-type", "application/json")
        .set("Authorization", authHeader);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("message");
    });

    it("PATCH /lessons/:id should 400 for invalid id", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .patch("/lessons/not-a-uuid")
        .send({ title: "won't matter" })
        .set("content-type", "application/json")
        .set("Authorization", authHeader);

      expect(res.status).toBe(400);
      expect(res.body).toHaveProperty("message");
    });
  });
});
