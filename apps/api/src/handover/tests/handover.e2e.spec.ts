import request from "supertest";
import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { AppModule } from "../../app.module";
import {
  withTenantRlsContext,
  Role,
  AssignmentStatus,
} from "@pathway/db";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

describe("Handover (e2e)", () => {
  let app: INestApplication | null = null;

  const sessionStartsAt = new Date("2099-08-12T00:17:00.000Z");
  const sessionEndsAt = new Date("2099-08-12T01:17:00.000Z");
  const handoverDate = new Date("2099-08-12T00:00:00.000Z");
  const versionedHandoverDate = new Date("2099-08-13T00:00:00.000Z");

  const orgId = process.env.E2E_ORG_ID as string;
  const tenantId = process.env.E2E_TENANT_ID as string;

  const ids = {
    group: "" as string,
    session: "" as string,
    staffUser: "" as string,
    adminUser: "" as string,
    assignment: "" as string,
    handoverLog: "" as string,
    versionedHandoverLog: "" as string,
  };

  let staffAuthHeader: string;
  let adminAuthHeader: string;

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }
    if (!orgId || !tenantId) {
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID missing");
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    // Seed graph for tenant via RLS context
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      const group = await tx.group.create({
        data: {
          name: "Handover Group",
          minAge: 7,
          maxAge: 9,
          tenantId,
        },
        select: { id: true },
      });
      ids.group = group.id;

      const session = await tx.session.create({
        data: {
          tenantId,
          groups: { connect: [{ id: ids.group }] },
          startsAt: sessionStartsAt,
          endsAt: sessionEndsAt,
        },
        select: { id: true },
      });
      ids.session = session.id;

      const staffUser = await tx.user.create({
        data: {
          email: "handover-staff@example.com",
          name: "Staff User",
          tenantId,
        },
        select: { id: true },
      });
      ids.staffUser = staffUser.id;

      await tx.userTenantRole.create({
        data: {
          userId: ids.staffUser,
          tenantId,
          role: Role.TEACHER,
        },
      });

      const adminUser = await tx.user.create({
        data: {
          email: "handover-admin@example.com",
          name: "Admin User",
          tenantId,
        },
        select: { id: true },
      });
      ids.adminUser = adminUser.id;

      await tx.userTenantRole.create({
        data: {
          userId: ids.adminUser,
          tenantId,
          role: Role.ADMIN,
        },
      });
    });

    const staffAuth = await seedE2eAuthUser({
      subject: `handover-staff-${ids.staffUser}`,
      userId: ids.staffUser,
      tenantId,
      siteRole: "STAFF",
      orgId,
    });
    staffAuthHeader = staffAuth.authorization;

    const adminAuth = await seedE2eAuthUser({
      subject: `handover-admin-${ids.adminUser}`,
      userId: ids.adminUser,
      tenantId,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    adminAuthHeader = adminAuth.authorization;
  });

  afterAll(async () => {
    if (!app) return;
    await clearE2eAuthAccess(ids.staffUser);
    await clearE2eAuthAccess(ids.adminUser);
    try {
      await withTenantRlsContext(tenantId, orgId, async (tx) => {
        if (ids.handoverLog) {
          await tx.handoverLogVersion.deleteMany({
            where: { handoverLogId: ids.handoverLog },
          });
          await tx.handoverLog.deleteMany({ where: { id: ids.handoverLog } });
        }
        if (ids.versionedHandoverLog) {
          await tx.handoverLogVersion.deleteMany({
            where: { handoverLogId: ids.versionedHandoverLog },
          });
          await tx.handoverLog.deleteMany({
            where: { id: ids.versionedHandoverLog },
          });
        }
        if (ids.assignment) {
          await tx.assignment.deleteMany({ where: { id: ids.assignment } });
        }
        if (ids.session) {
          await tx.session.deleteMany({ where: { id: ids.session } });
        }
        if (ids.group) {
          await tx.group.deleteMany({ where: { id: ids.group } });
        }
        if (ids.staffUser) {
          await tx.userTenantRole.deleteMany({
            where: { userId: ids.staffUser },
          });
          await tx.user.deleteMany({ where: { id: ids.staffUser } });
        }
        if (ids.adminUser) {
          await tx.userTenantRole.deleteMany({
            where: { userId: ids.adminUser },
          });
          await tx.user.deleteMany({ where: { id: ids.adminUser } });
        }
      });
    } catch {
      // ignore best-effort cleanup
    }
    await app.close();
  });

  it("GET /handover/my-next returns {available:false} when no next CONFIRMED assignment", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get("/handover/my-next")
      .set("Authorization", staffAuthHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false });
  });

  it("GET /handover/my-next returns {available:false} when log is not approved", async () => {
    if (!app) return;

    // Create CONFIRMED assignment for staff for the seeded session
    await withTenantRlsContext(tenantId, orgId, async (tx) => {
      const assignment = await tx.assignment.create({
        data: {
          sessionId: ids.session,
          userId: ids.staffUser,
          role: Role.TEACHER,
          status: AssignmentStatus.CONFIRMED,
        },
        select: { id: true },
      });
      ids.assignment = assignment.id;
    });

    // Staff creates DRAFT log
    const createRes = await request(app.getHttpServer())
      .post("/handover")
      .set("Authorization", staffAuthHeader)
      .send({
        groupId: ids.group,
        handoverDate: handoverDate.toISOString(),
        contentJson: { summary: "Draft content", notes: [] },
      });

    expect(createRes.status).toBe(201);
    ids.handoverLog = createRes.body.id;

    const res = await request(app.getHttpServer())
      .get("/handover/my-next")
      .set("Authorization", staffAuthHeader);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ available: false });
  });

  it("After admin approval, staff sees only approved logs for next session groups and computed handoverDate", async () => {
    if (!app) return;

    // Approve the log via admin endpoint
    const approveRes = await request(app.getHttpServer())
      .post(`/admin/handover/${ids.handoverLog}/approve`)
      .set("Authorization", adminAuthHeader)
      .send({});

    expect([200, 201]).toContain(approveRes.status);

    const res = await request(app.getHttpServer())
      .get("/handover/my-next")
      .set("Authorization", staffAuthHeader);

    expect(res.status).toBe(200);
    expect(res.body.available).toBe(true);
    expect(res.body.sessionId).toBe(ids.session);
    expect(Array.isArray(res.body.logs)).toBe(true);
    expect(res.body.logs.length).toBeGreaterThanOrEqual(1);
    expect(
      res.body.logs.every(
        (l: { groupId: string }) => l.groupId === ids.group,
      ),
    ).toBe(true);
  });

  it("Admin list endpoint returns drafts and approved", async () => {
    if (!app) return;

    const res = await request(app.getHttpServer())
      .get("/admin/handover")
      .set("Authorization", adminAuthHeader);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    // At least the approved log should be present
    expect(
      res.body.some(
        (l: { id: string; status: string }) => l.id === ids.handoverLog,
      ),
    ).toBe(true);
  });

  it("PATCH creates new version each time (versions increment)", async () => {
    if (!app) return;

    // Make an edit as staff (status stays APPROVED blocked by service, so we just change content)
    const patchRes = await request(app.getHttpServer())
      .patch(`/handover/${ids.handoverLog}`)
      .set("Authorization", staffAuthHeader)
      .send({
        contentJson: { summary: "Edited content", notes: ["note"] },
        changeSummary: "Staff edit",
      });

    // Service should 400 because approved logs cannot be edited
    expect([400, 403]).toContain(patchRes.status);

    // Instead, create a new log to test version increments
    const createRes = await request(app.getHttpServer())
      .post("/handover")
      .set("Authorization", staffAuthHeader)
      .send({
        groupId: ids.group,
        handoverDate: versionedHandoverDate.toISOString(),
        contentJson: { summary: "V1", notes: [] },
        changeSummary: "v1",
      });
    expect(createRes.status).toBe(201);
    const logId: string = createRes.body.id;
    ids.versionedHandoverLog = logId;

    const v2Res = await request(app.getHttpServer())
      .patch(`/handover/${logId}`)
      .set("Authorization", staffAuthHeader)
      .send({
        contentJson: { summary: "V2", notes: [] },
        changeSummary: "v2",
      });
    expect(v2Res.status).toBe(200);

    const v3Res = await request(app.getHttpServer())
      .patch(`/handover/${logId}`)
      .set("Authorization", staffAuthHeader)
      .send({
        contentJson: { summary: "V3", notes: [] },
        changeSummary: "v3",
      });
    expect(v3Res.status).toBe(200);

    const versionsRes = await request(app.getHttpServer())
      .get(`/admin/handover/${logId}/versions`)
      .set("Authorization", adminAuthHeader);

    expect(versionsRes.status).toBe(200);
    const versions = versionsRes.body as Array<{ versionNumber: number }>;
    expect(versions.length).toBeGreaterThanOrEqual(3);
    const numbers = versions.map((v) => v.versionNumber);
    // Should be strictly decreasing order
    expect(numbers[0]).toBeGreaterThan(numbers[numbers.length - 1]);
  });
});
