import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";
import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  clearE2eAuthAccess,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

describe("Users (e2e)", () => {
  let app: INestApplication;
  const orgId = process.env.E2E_ORG_ID as string;
  const tenantId = process.env.E2E_TENANT_ID as string;
  const otherTenantId = process.env.E2E_TENANT2_ID as string;
  const unique = Date.now();
  const email = `user${unique}@example.com`;
  const name = "Test User";
  let authHeader: string;
  let authUserId: string;
  let otherTenantUserId: string | undefined;

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    // Spin up app first
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    if (!orgId || !tenantId || !otherTenantId) {
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID / E2E_TENANT2_ID missing");
    }

    const auth = await seedE2eAuthUser({
      subject: "users-e2e",
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
      email: "users.e2e@pathway.app",
    });
    authUserId = auth.userId;
    authHeader = auth.authorization;

    // Seed a user in another tenant to validate cross-tenant isolation
    const otherUser = await withTenantRlsContext(
      otherTenantId,
      orgId,
      async (tx) =>
        tx.user.create({
          data: {
            email: `other-${unique}@example.com`,
            name: "Other Tenant User",
            tenantId: otherTenantId,
          } as Parameters<typeof tx.user.create>[0]["data"],
          select: { id: true },
        }),
    );
    otherTenantUserId = otherUser.id;
  });

  afterAll(async () => {
    if (otherTenantUserId) {
      await withTenantRlsContext(otherTenantId, orgId, async (tx) => {
        await tx.user.deleteMany({ where: { id: otherTenantUserId } });
      }).catch(() => undefined);
    }
    if (app) {
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await app.close();
    }
  });

  it("GET /users should return array", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(
      res.body.every((u: { tenantId?: string }) => u.tenantId === tenantId),
    ).toBe(true);
  });

  it("POST /users should create a user", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/users")
      .send({
        email,
        name,
        tenantId,
        hasServeAccess: false,
        hasFamilyAccess: false,
      })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ email: email.toLowerCase(), name });
    expect(res.body).toHaveProperty("id");
  });

  it("GET /users/:id should return the created user", async () => {
    if (!app || !isDatabaseAvailable()) return;
    // Find the created user to get its id
    const created = await withTenantRlsContext(tenantId, orgId, (tx) =>
      tx.user.findFirst({ where: { email } }),
    );
    expect(created).toBeTruthy();
    const res = await request(app.getHttpServer())
      .get(`/users/${created!.id}`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: created!.id,
      email: email.toLowerCase(),
      name,
    });
  });

  it("POST /users duplicate email should 400", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/users")
      .send({
        email,
        name: "Dup User",
        tenantId,
        hasServeAccess: false,
        hasFamilyAccess: false,
      })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(400);
    expect(res.body).toHaveProperty("message");
  });

  it("POST /users invalid email should 400", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/users")
      .send({
        email: "not-an-email",
        name: "Bad",
        tenantId,
        hasServeAccess: false,
        hasFamilyAccess: false,
      })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(400);
  });

  it("GET /users should not leak other tenants", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/users")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(
      res.body.every((u: { tenantId: string }) => u.tenantId === tenantId),
    ).toBe(true);
    expect(
      res.body.some(
        (u: { id: string }) => u.id === (otherTenantUserId as string),
      ),
    ).toBe(false);
  });

  it("GET /users/:id should 404 for another tenant", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/users/${otherTenantUserId}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(404);
  });
});
