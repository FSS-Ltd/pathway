import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";
import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

/**
 * E2E tests for Groups module
 * - Isolated tenant per run
 * - GET /groups returns array
 * - POST /groups creates group (requires minAge/maxAge)
 * - GET /groups/:id returns the created group
 * - PATCH /groups/:id updates group
 * - POST duplicate (same tenant+name) -> 400
 * - POST invalid ages -> 400
 */

describe("Groups (e2e)", () => {
  let app: INestApplication;
  let tenantId: string;
  let otherTenantId: string;
  let createdGroupId: string;
  let otherGroupId: string | undefined;
  let authHeader: string;
  let authUserId: string;

  const nonce = Date.now();
  const baseName = `Group-${nonce}`;

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    const orgId = process.env.E2E_ORG_ID as string;
    const seededTenant = process.env.E2E_TENANT_ID as string;
    const seededTenant2 = process.env.E2E_TENANT2_ID as string;
    if (!orgId || !seededTenant || !seededTenant2) {
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID / E2E_TENANT2_ID missing");
    }
    tenantId = seededTenant;
    otherTenantId = seededTenant2;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const auth = await seedE2eAuthUser({
      subject: "groups-e2e",
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
      email: "groups.e2e@pathway.app",
    });
    authUserId = auth.userId;
    authHeader = auth.authorization;

    // Seed a group in another tenant to validate isolation
    await withTenantRlsContext(otherTenantId, orgId, async (tx) => {
      const g = await tx.group.create({
        data: {
          name: `Other-${nonce}`,
          tenantId: otherTenantId,
          minAge: 5,
          maxAge: 7,
        } as Parameters<typeof tx.group.create>[0]["data"],
        select: { id: true },
      });
      otherGroupId = g.id;
    });
  });

  afterAll(async () => {
    if (app) {
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await app.close();
    }
  });

  it("GET /groups should return array", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/groups")
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(
      res.body.every((g: { tenantId?: string }) => g.tenantId === tenantId),
    ).toBe(true);
  });

  it("POST /groups should create a group", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/groups")
      .send({ name: baseName, tenantId, minAge: 7, maxAge: 9 })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      name: baseName,
      tenantId,
      minAge: 7,
      maxAge: 9,
    });
    expect(res.body).toHaveProperty("id");
    createdGroupId = res.body.id;
  });

  it("GET /groups/:id should return the created group", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/groups/${createdGroupId}`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: createdGroupId,
      name: baseName,
      tenantId,
      minAge: 7,
      maxAge: 9,
    });
  });

  it("PATCH /groups/:id should update group", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .patch(`/groups/${createdGroupId}`)
      .send({ name: `Group-${nonce}-updated`, minAge: 6, maxAge: 10 })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: createdGroupId,
      name: `Group-${nonce}-updated`,
      tenantId,
      minAge: 6,
      maxAge: 10,
    });
  });

  it("POST /groups duplicate name for same tenant should 400", async () => {
    if (!app) return;
    // First create another group with a fixed name
    const name = `Group-${nonce}-dup`;
    const res1 = await request(app.getHttpServer())
      .post("/groups")
      .send({ name, tenantId, minAge: 5, maxAge: 6 })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);
    expect(res1.status).toBe(201);

    // Attempt duplicate under same tenant
    const res2 = await request(app.getHttpServer())
      .post("/groups")
      .send({ name, tenantId, minAge: 5, maxAge: 6 })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res2.status).toBe(400);
  });

  it("POST /groups invalid ages should 400", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/groups")
      .send({ name: `Group-${nonce}-bad`, tenantId, minAge: 10, maxAge: 9 }) // invalid: minAge > maxAge
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(400);
  });

  it("GET /groups should not include other tenant groups", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/groups")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(
      res.body.every((g: { tenantId: string }) => g.tenantId === tenantId),
    ).toBe(true);
  });

  it("GET /groups/:id should 404 when accessing other tenant", async () => {
    if (!app) return;
    if (!otherGroupId) throw new Error("otherGroupId missing");

    const res = await request(app.getHttpServer())
      .get(`/groups/${otherGroupId}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(404);
  });
});
