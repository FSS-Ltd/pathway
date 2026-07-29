import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "../../app.module";
import { Role, withTenantRlsContext } from "@pathway/db";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

// Types for responses
type Note = {
  id: string;
  childId: string;
  authorId: string;
  text: string;
  visibleToParents: boolean;
  approvedByUserId?: string | null;
  approvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

describe("Notes (e2e)", () => {
  let app: INestApplication;
  const orgId = process.env.E2E_ORG_ID as string;
  const tenantId = process.env.E2E_TENANT_ID as string;
  const seededAuthorId = randomUUID();
  const seededChildId = randomUUID();
  let childId: string | null = null;
  let authorId: string | null = null;
  let createdId: string;
  let authHeader: string;
  let parentAuthHeader: string;
  let parentUserId: string;

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    if (!orgId || !tenantId) {
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID missing");
    }

    // Seed author and child within tenant RLS context
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.childNote.deleteMany({
        where: {
          OR: [{ childId: seededChildId }, { authorId: seededAuthorId }],
        },
      });
      await tx.concern.deleteMany({ where: { childId: seededChildId } });
      await tx.child.deleteMany({ where: { id: seededChildId } });
      await tx.user.deleteMany({ where: { id: seededAuthorId } });

      const user = await tx.user.create({
        data: {
          id: seededAuthorId,
          tenantId,
          name: "E2E Author",
          email: `e2e.author.${Date.now()}@example.com`,
        } as Parameters<typeof tx.user.create>[0]["data"],
      });
      authorId = user.id;

      const child = await tx.child.create({
        data: {
          id: seededChildId,
          tenantId,
          firstName: "E2E",
          lastName: "Child",
        } as Parameters<typeof tx.child.create>[0]["data"],
      });
      childId = child.id;
    });

    const authorAuth = await seedE2eAuthUser({
      subject: `notes-author-${seededAuthorId}`,
      userId: seededAuthorId,
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
      email: "notes.e2e@pathway.app",
    });
    authHeader = authorAuth.authorization;

    const parentAuth = await seedE2eAuthUser({
      subject: `notes-parent-${randomUUID()}`,
      tenantId,
      orgId,
      hasFamilyAccess: true,
    });
    parentUserId = parentAuth.userId;
    parentAuthHeader = parentAuth.authorization;
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.userTenantRole.create({
        data: { userId: parentUserId, tenantId, role: Role.PARENT },
      });
    });
  });

  afterAll(async () => {
    await clearE2eAuthAccess(seededAuthorId);
    await clearE2eAuthAccess(parentUserId);
    // Cleanup in reverse order; guard for missing FKs
    if (createdId || childId || authorId) {
      await withTenantRlsContext(tenantId, orgId, async (tx) => {
        if (createdId)
          await tx.childNote.deleteMany({ where: { id: createdId } });
        if (childId) {
          await tx.concern.deleteMany({ where: { childId } });
          await tx.child.deleteMany({ where: { id: childId } });
        }
        await tx.userTenantRole.deleteMany({ where: { userId: parentUserId } });
        await tx.user.deleteMany({
          where: { id: { in: [seededAuthorId, parentUserId] } },
        });
      }).catch(() => undefined);
    }
    if (app) {
      await app.close();
    }
  });

  describe("validation", () => {
    it("POST /notes should 400 on empty text", async () => {
      if (!app) return;
      const res = await request(app.getHttpServer())
        .post("/notes")
        .set("Authorization", authHeader)
        .send({
          childId: "00000000-0000-0000-0000-000000000000",
          text: "   ",
        })
        .set("content-type", "application/json");
      expect(res.status).toBe(400);
    });
  });

  const seedOk = () => Boolean(childId && authorId);

  describe("RBAC", () => {
    it("blocks parents from accessing staff notes", async () => {
      if (!seedOk()) return;
      const res = await request(app.getHttpServer())
        .get("/notes")
        .set("Authorization", parentAuthHeader);
      expect(res.status).toBe(403);
    });
  });

  describe("CRUD", () => {
    it("POST /notes should create a note when FKs exist", async () => {
      if (!seedOk()) {
        // Skip happy path if FK seeding failed
        return;
      }
      const res = await request(app.getHttpServer())
        .post("/notes")
        .set("Authorization", authHeader)
        .send({ childId, text: "Great progress today" })
        .set("content-type", "application/json");
      expect(res.status).toBe(201);
      const body: Note = res.body as Note;
      expect(body.id).toBeTruthy();
      expect(body.childId).toBe(childId);
      expect(body.authorId).toBe(authorId);
      createdId = body.id;
    });

    it("GET /notes should filter by childId", async () => {
      if (!seedOk()) return;
      const res = await request(app.getHttpServer())
        .get("/notes")
        .set("Authorization", authHeader)
        .query({ childId });
      expect(res.status).toBe(200);
      const list: Note[] = res.body as Note[];
      expect(Array.isArray(list)).toBe(true);
      expect(list.every((n) => n.childId === childId)).toBe(true);
    });

    it("GET /notes/:id should return the note", async () => {
      if (!seedOk()) return;
      const res = await request(app.getHttpServer())
        .get(`/notes/${createdId}`)
        .set("Authorization", authHeader);
      expect(res.status).toBe(200);
      const body: Note = res.body as Note;
      expect(body.id).toBe(createdId);
    });

    it("PATCH /notes/:id should update text", async () => {
      if (!seedOk()) return;
      const res = await request(app.getHttpServer())
        .patch(`/notes/${createdId}`)
        .set("Authorization", authHeader)
        .send({ text: "Updated note text" })
        .set("content-type", "application/json");
      expect(res.status).toBe(200);
      const body: Note = res.body as Note;
      expect(body.text).toBe("Updated note text");
    });

    it("DELETE /notes/:id should delete and then 404 on fetch", async () => {
      if (!seedOk()) return;
      const res = await request(app.getHttpServer())
        .delete(`/notes/${createdId}`)
        .set("Authorization", authHeader);
      expect(res.status).toBe(200);
      const deleted: { id: string } = res.body as { id: string };
      expect(deleted.id).toBe(createdId);

      const res404 = await request(app.getHttpServer())
        .get(`/notes/${createdId}`)
        .set("Authorization", authHeader);
      expect(res404.status).toBe(404);
    });
  });
});
