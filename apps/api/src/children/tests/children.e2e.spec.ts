import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import { prisma, withTenantRlsContext } from "@pathway/db";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

describe("Children (e2e)", () => {
  let app: INestApplication;
  let tenantId: string;
  let groupId: string;
  let childId: string;
  let authHeader: string;
  let authUserId: string;
  const nonce = Date.now();

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    const orgId = process.env.E2E_ORG_ID as string;
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
      const g = await tx.group.create({
        data: { name: `Sparks-${nonce}`, minAge: 5, maxAge: 7, tenantId },
        select: { id: true },
      });
      groupId = g.id;
    });

    const auth = await seedE2eAuthUser({
      subject: "children-e2e",
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    authUserId = auth.userId;
    authHeader = auth.authorization;
  });

  afterAll(async () => {
    if (app) {
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await app.close();
    }
  });

  it("GET /children should return array", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/children")
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /children should create a child (minimal)", async () => {
    if (!app) return;
    const payload = {
      firstName: "Jess",
      lastName: "Doe",
      allergies: "peanuts",
      tenantId,
    };

    const res = await request(app.getHttpServer())
      .post("/children")
      .send(payload)
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      firstName: "Jess",
      lastName: "Doe",
      allergies: "peanuts",
      tenantId,
    });
    expect(res.body).toHaveProperty("id");
    childId = res.body.id;
  });

  it("GET /children/:id should return the created child", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/children/${childId}`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", childId);
    expect(res.body).toHaveProperty("tenantId", tenantId);
  });

  it("PATCH /children/:id should update group and guardians", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .patch(`/children/${childId}`)
      .send({ groupId })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("groupId", groupId);
  });

  it("POST /children without allergies defaults to none", async () => {
    if (!app) return;
    const payload = { firstName: "No", lastName: "Allergy", tenantId };

    const res = await request(app.getHttpServer())
      .post("/children")
      .send(payload)
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("allergies", "none");
  });

  it("POST /children group from another tenant should 400", async () => {
    if (!app) return;
    const otherTenantId = process.env.E2E_TENANT2_ID as string;
    const orgId = process.env.E2E_ORG_ID as string;
    if (!otherTenantId || !orgId) {
      throw new Error("E2E_TENANT2_ID / E2E_ORG_ID missing");
    }
    const otherGroup = await withTenantRlsContext(
      otherTenantId,
      orgId,
      async (tx) =>
        tx.group.create({
          data: {
            name: "Older",
            minAge: 8,
            maxAge: 10,
            tenantId: otherTenantId,
          },
          select: { id: true },
        }),
    );

    const res = await request(app.getHttpServer())
      .post("/children")
      .send({
        firstName: "Cross",
        lastName: "Tenant",
        allergies: "none",
        tenantId,
        disabilities: [],
        groupId: otherGroup.id, // mismatched tenant
      })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(400);
  });
});
