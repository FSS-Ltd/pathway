import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { AppModule } from "../../app.module";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

describe("Parents (e2e)", () => {
  let app: INestApplication;
  let tenantId: string;
  let tenant2Id: string;
  let orgId: string;
  let parentIdTenant1: string;
  let parentIdTenant2: string;
  let authHeaderTenant1: string;
  let authUserId: string;
  const nonce = Date.now();

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    tenantId = process.env.E2E_TENANT_ID as string;
    tenant2Id = process.env.E2E_TENANT2_ID as string;
    orgId = process.env.E2E_ORG_ID as string;

    if (!tenantId || !tenant2Id || !orgId) {
      throw new Error("E2E_TENANT_ID / E2E_TENANT2_ID / E2E_ORG_ID missing");
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      const child = await tx.child.create({
        data: {
          firstName: `Child-${nonce}`,
          lastName: "One",
          allergies: "none",
          tenantId,
        },
        select: { id: true },
      });

      const parent = await tx.user.create({
        data: {
          email: `parent-${nonce}@test.local`,
          name: `Parent ${nonce}`,
          tenantId,
          hasFamilyAccess: true,
          children: { connect: { id: child.id } },
        },
        select: { id: true },
      });

      parentIdTenant1 = parent.id;
    });

    await withTenantRlsContext(tenant2Id, orgId, async (tx) => {
      const otherChild = await tx.child.create({
        data: {
          firstName: `Child-${nonce}-other`,
          lastName: "Two",
          allergies: "none",
          tenantId: tenant2Id,
        },
        select: { id: true },
      });

      const otherParent = await tx.user.create({
        data: {
          email: `parent-${nonce}-other@test.local`,
          name: `Parent Other ${nonce}`,
          tenantId: tenant2Id,
          hasFamilyAccess: true,
          children: { connect: { id: otherChild.id } },
        },
        select: { id: true },
      });

      parentIdTenant2 = otherParent.id;
    });

    const auth = await seedE2eAuthUser({
      subject: "parents-e2e",
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    authUserId = auth.userId;
    authHeaderTenant1 = auth.authorization;
  });

  afterAll(async () => {
    if (app) {
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await app.close();
    }
  });

  it("GET /parents returns parents from the current tenant only", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/parents")
      .set("Authorization", authHeaderTenant1);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const ids = res.body.map((p: { id: string }) => p.id);
    expect(ids).toContain(parentIdTenant1);
    expect(ids).not.toContain(parentIdTenant2);
  });

  it("GET /parents/:id returns detail for tenant parent", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/parents/${parentIdTenant1}`)
      .set("Authorization", authHeaderTenant1);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", parentIdTenant1);
    expect(res.body).toHaveProperty("children");
    expect(Array.isArray(res.body.children)).toBe(true);
  });

  it("GET /parents/:id 404s for cross-tenant parent", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/parents/${parentIdTenant2}`)
      .set("Authorization", authHeaderTenant1);

    expect(res.status).toBe(404);
  });
});
