import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import { prisma, withTenantRlsContext } from "@pathway/db";
import { randomUUID } from "crypto";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

// Sessions e2e: reuse seeded org/tenants and seed records via RLS context

describe("Sessions (e2e)", () => {
  let app: INestApplication;

  const orgId = process.env.E2E_ORG_ID as string;
  const tenantId = process.env.E2E_TENANT_ID as string; // main tenant
  const otherTenantId = process.env.E2E_TENANT2_ID as string; // other tenant
  const ids = {
    group: randomUUID(),
    session: randomUUID(),
    otherGroup: randomUUID(),
    otherSession: randomUUID(),
  };

  let authHeader: string;
  let otherAuthHeader: string;
  let authUserId: string;
  let otherAuthUserId: string;

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    if (!orgId || !tenantId || !otherTenantId) {
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID / E2E_TENANT2_ID missing");
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const auth = await seedE2eAuthUser({
      subject: "sessions-e2e",
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    authUserId = auth.userId;
    authHeader = auth.authorization;

    const otherAuth = await seedE2eAuthUser({
      subject: "sessions-e2e-other",
      tenantId: otherTenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    otherAuthUserId = otherAuth.userId;
    otherAuthHeader = otherAuth.authorization;

    // Seed groups and sessions in each tenant via RLS
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.group.create({
        data: {
          id: ids.group,
          name: "5-6s",
          tenantId,
          minAge: 5,
          maxAge: 6,
        },
      });
      await tx.session.create({
        data: {
          id: ids.session,
          tenantId,
          groups: { connect: [{ id: ids.group }] },
          startsAt: new Date("2025-01-01T15:00:00.000Z"),
          endsAt: new Date("2025-01-01T16:00:00.000Z"),
        },
      });
    });

    await withTenantRlsContext(otherTenantId, orgId, async (tx) => {
      await tx.group.create({
        data: {
          id: ids.otherGroup,
          name: "7-8s",
          tenantId: otherTenantId,
          minAge: 7,
          maxAge: 8,
        },
      });
      await tx.session.create({
        data: {
          id: ids.otherSession,
          tenantId: otherTenantId,
          groups: { connect: [{ id: ids.otherGroup }] },
          startsAt: new Date("2025-02-01T15:00:00.000Z"),
          endsAt: new Date("2025-02-01T16:00:00.000Z"),
        },
      });
    });
  });

  afterAll(async () => {
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.session.deleteMany({ where: { id: ids.session } });
      await tx.group.deleteMany({ where: { id: ids.group } });
    }).catch(() => undefined);
    await withTenantRlsContext(otherTenantId, orgId, async (tx) => {
      await tx.session.deleteMany({ where: { id: ids.otherSession } });
      await tx.group.deleteMany({ where: { id: ids.otherGroup } });
    }).catch(() => undefined);
    if (app) {
      await clearE2eAuthAccess(authUserId);
      await clearE2eAuthAccess(otherAuthUserId);
      await prisma.user.deleteMany({
        where: { id: { in: [authUserId, otherAuthUserId] } },
      });
      await app.close();
    }
  });

  it("GET /sessions should return array", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/sessions")
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });

  it("POST /sessions should create a session", async () => {
    if (!app) return;
    const newSessionId = randomUUID();
    const res = await request(app.getHttpServer())
      .post("/sessions")
      .set("Authorization", authHeader)
      .send({
        startsAt: new Date("2025-03-01T10:00:00.000Z"),
        endsAt: new Date("2025-03-01T11:00:00.000Z"),
        groupId: ids.group,
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty("id");

    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.session.deleteMany({
        where: { id: res.body.id ?? newSessionId },
      });
    });
  });

  it("GET /sessions/:id should return the created session", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/sessions/${ids.session}`)
      .set("Authorization", authHeader);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", ids.session);
  });

  it("PATCH /sessions/:id should update a session", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .patch(`/sessions/${ids.session}`)
      .set("Authorization", authHeader)
      .send({ endsAt: new Date("2025-01-01T17:00:00.000Z") });

    expect(res.status).toBe(200);
    expect(new Date(res.body.endsAt).toISOString()).toBe(
      new Date("2025-01-01T17:00:00.000Z").toISOString(),
    );
  });

  it("POST /sessions should 400 when endsAt <= startsAt (validation)", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/sessions")
      .set("Authorization", authHeader)
      .send({
        startsAt: new Date("2025-03-01T12:00:00.000Z"),
        endsAt: new Date("2025-03-01T11:00:00.000Z"),
        groupId: ids.group,
      });

    expect(res.status).toBe(400);
  });

  it("POST /sessions should 400 when group is from another tenant", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/sessions")
      .set("Authorization", authHeader)
      .send({
        startsAt: new Date("2025-03-02T12:00:00.000Z"),
        endsAt: new Date("2025-03-02T13:00:00.000Z"),
        groupId: ids.otherGroup,
      });

    expect(res.status).toBe(400);
  });

  it("GET /sessions should not leak other tenant records", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/sessions")
      .set("Authorization", otherAuthHeader);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(
      res.body.every((s: { tenantId: string }) => s.tenantId === otherTenantId),
    ).toBe(true);
  });

  it("GET /sessions/:id should 404 for other tenant session", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/sessions/${ids.otherSession}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(404);
  });
});
