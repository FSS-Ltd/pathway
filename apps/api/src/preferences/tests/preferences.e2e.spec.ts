import { INestApplication } from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "../../app.module";
import { prisma, Weekday, withTenantRlsContext } from "@pathway/db";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

describe("Preferences (e2e)", () => {
  let app: INestApplication;
  let authHeader: string;
  let authUserId: string;

  // IDs we will create and reuse
  const tenantId = process.env.E2E_TENANT_ID as string;
  const orgId = process.env.E2E_ORG_ID as string;
  const userId = randomUUID();
  let prefId = "";

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    if (!tenantId || !orgId) {
      throw new Error("E2E_TENANT_ID / E2E_ORG_ID missing");
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // Use the global pipes configured in AppModule (Zod-based); no class-validator here.
    await app.init();

    const auth = await seedE2eAuthUser({
      subject: "preferences-e2e",
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    authUserId = auth.userId;
    authHeader = auth.authorization;

    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.volunteerPreference.deleteMany({
        where: { OR: [{ tenantId }, { userId }] },
      });
      await tx.user.create({
        data: {
          id: userId,
          email: `pref-user-${userId}@example.com`,
          name: "Pref User",
          tenant: { connect: { id: tenantId } },
        },
      });
    });
  });

  afterAll(async () => {
    if (prefId) {
      await withTenantRlsContext(tenantId, orgId, async (tx) => {
        await tx.volunteerPreference.deleteMany({ where: { id: prefId } });
        await tx.user.deleteMany({ where: { id: userId } });
      });
    }
    if (app) {
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await app.close();
    }
  });

  it("POST /preferences should create a volunteer preference", async () => {
    if (!app) return;
    const payload = {
      userId,
      tenantId,
      weekday: Weekday.MON,
      startMinute: 9 * 60, // 09:00
      endMinute: 12 * 60, // 12:00
    };

    const res = await request(app.getHttpServer())
      .post("/preferences")
      .send(payload)
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      userId,
      tenantId,
      weekday: Weekday.MON,
      startMinute: 540,
      endMinute: 720,
    });
    expect(res.body).toHaveProperty("id");
    prefId = res.body.id;
  });

  it("GET /preferences should return an array including the created preference", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/preferences")
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    const found = res.body.find((p: { id: string }) => p.id === prefId);
    expect(found).toBeTruthy();
  });

  it("GET /preferences/:id should return the created preference", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/preferences/${prefId}`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: prefId,
      userId,
      tenantId,
      weekday: Weekday.MON,
    });
  });

  it("PATCH /preferences/:id should update time window and weekday", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .patch(`/preferences/${prefId}`)
      .send({
        weekday: Weekday.TUE,
        startMinute: 13 * 60, // 13:00
        endMinute: 14 * 60 + 30, // 14:30
      })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      id: prefId,
      weekday: Weekday.TUE,
      startMinute: 13 * 60,
      endMinute: 14 * 60 + 30,
    });
  });

  it("POST /preferences should 400 when endMinute <= startMinute", async () => {
    if (!app) return;
    const payload = {
      userId,
      tenantId,
      weekday: Weekday.MON,
      startMinute: 10,
      endMinute: 5,
    };

    const res = await request(app.getHttpServer())
      .post("/preferences")
      .send(payload)
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(400);
  });

  it("PATCH /preferences/:id with invalid UUID should 400", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .patch("/preferences/not-a-uuid")
      .send({ weekday: Weekday.WED, startMinute: 60, endMinute: 120 })
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(400);
  });

  it("POST /preferences should 400 when minutes are out of range", async () => {
    if (!app) return;
    const payload = {
      userId,
      tenantId,
      weekday: Weekday.MON,
      startMinute: -1,
      endMinute: 60,
    };

    const res = await request(app.getHttpServer())
      .post("/preferences")
      .send(payload)
      .set("content-type", "application/json")
      .set("Authorization", authHeader);

    expect(res.status).toBe(400);
  });

  it("DELETE /preferences/:id should delete the record (then GET 404)", async () => {
    if (!app) return;
    const resDelete = await request(app.getHttpServer())
      .delete(`/preferences/${prefId}`)
      .set("Authorization", authHeader);
    expect(resDelete.status).toBe(200);

    const resGet = await request(app.getHttpServer())
      .get(`/preferences/${prefId}`)
      .set("Authorization", authHeader);
    expect(resGet.status).toBe(404);
  });
});
