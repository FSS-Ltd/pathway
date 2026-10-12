import { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { AppModule } from "../../app.module";
import {
  withTenantRlsContext,
  AssignmentStatus,
  Role,
  SwapStatus,
  prisma,
} from "@pathway/db";
import {
  clearE2eAuthAccess,
  isDatabaseAvailable,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

// E2E for Swap Requests
// This follows the same conventions as other e2e suites in this repo

describe("Swaps (e2e)", () => {
  let app: INestApplication;

  let ids = {
    userFrom: randomUUID(),
    userTo: randomUUID(),
    session: randomUUID(),
    assignment: randomUUID(),
  };

  const tenantId = process.env.E2E_TENANT_ID as string;
  const orgId = process.env.E2E_ORG_ID as string;
  let authHeader: string;
  let authUserId: string;

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    if (!tenantId || !orgId) {
      throw new Error("E2E_TENANT_ID / E2E_ORG_ID missing");
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const auth = await seedE2eAuthUser({
      subject: "swaps-e2e-user",
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    authUserId = auth.userId;
    authHeader = auth.authorization;
  });

  beforeEach(async () => {
    if (!isDatabaseAvailable()) return;
    // Fresh IDs per test run to avoid uniqueness and FK cleanup
    ids = {
      userFrom: randomUUID(),
      userTo: randomUUID(),
      session: randomUUID(),
      assignment: randomUUID(),
    };

    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      await tx.user.create({
        data: {
          id: ids.userFrom,
          email: `from-${ids.userFrom}@example.test`,
          name: "From User",
          tenantId,
        },
      });
      await tx.userTenantRole.create({
        data: { userId: ids.userFrom, tenantId, role: Role.TEACHER },
      });

      await tx.user.create({
        data: {
          id: ids.userTo,
          email: `to-${ids.userTo}@example.test`,
          name: "To User",
          tenantId,
        },
      });
      await tx.userTenantRole.create({
        data: { userId: ids.userTo, tenantId, role: Role.TEACHER },
      });

      await tx.session.create({
        data: {
          id: ids.session,
          tenantId,
          startsAt: new Date("2025-01-01T15:00:00.000Z"),
          endsAt: new Date("2025-01-01T16:00:00.000Z"),
        },
      });

      await tx.assignment.create({
        data: {
          id: ids.assignment,
          sessionId: ids.session,
          userId: ids.userFrom,
          role: Role.TEACHER,
          status: AssignmentStatus.CONFIRMED,
        },
      });
    });
  });

  afterAll(async () => {
    if (app) {
      await clearE2eAuthAccess(authUserId);
      await prisma.user.deleteMany({ where: { id: authUserId } });
      await app.close();
    }
  });

  it("POST /swaps should create a swap request", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .post("/swaps")
      .set("Authorization", authHeader)
      .send({
        assignmentId: ids.assignment,
        fromUserId: ids.userFrom,
        toUserId: ids.userTo,
        reason: "Need cover",
      });

    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      assignmentId: ids.assignment,
      fromUserId: ids.userFrom,
      toUserId: ids.userTo,
      status: SwapStatus.REQUESTED,
    });
  });

  it("GET /swaps/:id should return the created swap", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const createRes = await request(app.getHttpServer())
      .post("/swaps")
      .set("Authorization", authHeader)
      .send({
        assignmentId: ids.assignment,
        fromUserId: ids.userFrom,
        toUserId: ids.userTo,
        reason: "Need cover",
      });
    const id = createRes.body.id;

    const res = await request(app.getHttpServer())
      .get(`/swaps/${id}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", id);
  });

  it("GET /swaps should filter by fromUserId and status", async () => {
    if (!app || !isDatabaseAvailable()) return;
    await request(app.getHttpServer())
      .post("/swaps")
      .set("Authorization", authHeader)
      .send({
        assignmentId: ids.assignment,
        fromUserId: ids.userFrom,
        toUserId: ids.userTo,
        reason: "Need cover",
      });

    const res = await request(app.getHttpServer())
      .get(`/swaps?fromUserId=${ids.userFrom}&status=${SwapStatus.REQUESTED}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(
      res.body.every(
        (s: { fromUserId: string; status: SwapStatus }) =>
          s.fromUserId === ids.userFrom && s.status === SwapStatus.REQUESTED,
      ),
    ).toBe(true);
  });

  it("PATCH /swaps/:id should accept a swap when toUserId supplied", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const createRes = await request(app.getHttpServer())
      .post("/swaps")
      .set("Authorization", authHeader)
      .send({
        assignmentId: ids.assignment,
        fromUserId: ids.userFrom,
        toUserId: ids.userTo,
        reason: "Need cover",
      });
    const id = createRes.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/swaps/${id}`)
      .set("Authorization", authHeader)
      .send({ toUserId: ids.userTo, status: SwapStatus.ACCEPTED });

    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ id, status: SwapStatus.ACCEPTED });
  });

  it("PATCH /swaps/:id should 400 if accepting without toUserId", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const createRes = await request(app.getHttpServer())
      .post("/swaps")
      .set("Authorization", authHeader)
      .send({
        assignmentId: ids.assignment,
        fromUserId: ids.userFrom,
        reason: "Need cover",
      });
    const id = createRes.body.id;

    const res = await request(app.getHttpServer())
      .patch(`/swaps/${id}`)
      .set("Authorization", authHeader)
      .send({ status: SwapStatus.ACCEPTED });

    expect(res.status).toBe(400);
  });

  it("DELETE /swaps/:id should delete and return the swap", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const createRes = await request(app.getHttpServer())
      .post("/swaps")
      .set("Authorization", authHeader)
      .send({
        assignmentId: ids.assignment,
        fromUserId: ids.userFrom,
        toUserId: ids.userTo,
        reason: "Need cover",
      });
    const id = createRes.body.id;

    const res = await request(app.getHttpServer())
      .delete(`/swaps/${id}`)
      .set("Authorization", authHeader);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("id", id);

    const getRes = await request(app.getHttpServer())
      .get(`/swaps/${id}`)
      .set("Authorization", authHeader);
    expect(getRes.status).toBe(404);
  });

  it("POST /swaps should 400 for invalid UUIDs", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const res = await request(app.getHttpServer())
      .post("/swaps")
      .set("Authorization", authHeader)
      .send({
        assignmentId: "not-a-uuid",
        fromUserId: "not-a-uuid",
        toUserId: "also-not-uuid",
        reason: "Need cover",
      });

    expect(res.status).toBe(400);
  });

  it("PATCH /swaps/:id should 404 for unknown id", async () => {
    if (!app || !isDatabaseAvailable()) return;
    const res = await request(app.getHttpServer())
      .patch(`/swaps/123e4567-e89b-12d3-a456-426614174000`)
      .set("Authorization", authHeader)
      .send({ status: SwapStatus.ACCEPTED });

    expect(res.status).toBe(404);
  });
});
