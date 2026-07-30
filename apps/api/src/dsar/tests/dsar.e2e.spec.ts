import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { AppModule } from "../../app.module";
import { withTenantRlsContext, Role } from "@pathway/db";
import {
  clearE2eAuthAccess,
  requireDatabase,
  seedE2eAuthUser,
} from "../../../test-helpers.e2e";

describe("DSAR (e2e)", () => {
  let app: INestApplication;
  let tenantA: string;
  let tenantB: string;
  let orgId: string;
  let childId: string;
  let groupId: string;
  let sessionId: string;
  let parentUserId: string;
  let staffUserId: string;
  let otherTenantUserId: string;
  let adminHeader: string;
  let otherTenantHeader: string;

  beforeAll(async () => {
    if (!requireDatabase()) {
      return;
    }

    orgId = process.env.E2E_ORG_ID as string;
    tenantA = process.env.E2E_TENANT_ID as string;
    tenantB = process.env.E2E_TENANT2_ID as string;
    if (!orgId || !tenantA || !tenantB) {
      throw new Error("E2E_ORG_ID / E2E_TENANT_ID / E2E_TENANT2_ID missing");
    }

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();

    parentUserId = randomUUID();
    staffUserId = randomUUID();

    // Seed data in tenant A
    await withTenantRlsContext(tenantA, orgId, async (tx) => {
      const parentEmail = `dsar-parent-${parentUserId}@example.com`;
      const staffEmail = `dsar-staff-${staffUserId}@example.com`;

      await tx.user.create({
        data: {
          id: parentUserId,
          email: parentEmail,
          name: "DSAR Parent",
          tenantId: tenantA,
          hasFamilyAccess: true,
        },
      });
      await tx.userTenantRole.create({
        data: { userId: parentUserId, tenantId: tenantA, role: Role.PARENT },
      });

      await tx.user.create({
        data: {
          id: staffUserId,
          email: staffEmail,
          name: "DSAR Staff",
          tenantId: tenantA,
          hasServeAccess: true,
        },
      });
      await tx.userTenantRole.create({
        data: { userId: staffUserId, tenantId: tenantA, role: Role.ADMIN },
      });

      const group = await tx.group.create({
        data: {
          tenantId: tenantA,
          name: "DSAR Group",
          minAge: 8,
          maxAge: 10,
        },
      });
      groupId = group.id;

      const session = await tx.session.create({
        data: {
          tenantId: tenantA,
          groups: { connect: [{ id: groupId }] },
          startsAt: new Date("2025-01-01T09:00:00Z"),
          endsAt: new Date("2025-01-01T10:00:00Z"),
          title: "DSAR Session",
        },
      });
      sessionId = session.id;

      const child = await tx.child.create({
        data: {
          tenantId: tenantA,
          firstName: "DSAR",
          lastName: "Child",
          groupId,
          guardians: { connect: { id: parentUserId } },
        },
      });
      childId = child.id;

      await tx.attendance.create({
        data: {
          childId,
          groupId,
          sessionId,
          present: true,
          timestamp: new Date("2025-01-01T09:05:00Z"),
        },
      });

      await tx.childNote.create({
        data: {
          childId,
          authorId: staffUserId,
          text: "DSAR note",
          visibleToParents: false,
        },
      });

      await tx.concern.create({
        data: {
          childId,
          summary: "DSAR concern",
          details: "Details hidden in UI but included for DSAR",
        },
      });
    });

    // Minimal seed for other tenant user so auth context is valid
    otherTenantUserId = randomUUID();
    await withTenantRlsContext(tenantB, orgId, async (tx) => {
      await tx.user.create({
        data: {
          id: otherTenantUserId,
          email: `dsar-other-${otherTenantUserId}@example.com`,
          tenantId: tenantB,
          hasServeAccess: true,
        },
      });
      await tx.userTenantRole.create({
        data: {
          userId: otherTenantUserId,
          tenantId: tenantB,
          role: Role.ADMIN,
        },
      });
    });

    const adminAuth = await seedE2eAuthUser({
      subject: "dsar-admin",
      userId: staffUserId,
      tenantId: tenantA,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    adminHeader = adminAuth.authorization;

    const otherTenantAuth = await seedE2eAuthUser({
      subject: "dsar-other",
      userId: otherTenantUserId,
      tenantId: tenantB,
      siteRole: "SITE_ADMIN",
      orgId,
      orgRole: "ORG_ADMIN",
    });
    otherTenantHeader = otherTenantAuth.authorization;
  });

  afterAll(async () => {
    await clearE2eAuthAccess(staffUserId);
    await clearE2eAuthAccess(otherTenantUserId);
    await withTenantRlsContext(tenantA, orgId, async (tx) => {
      await tx.attendance.deleteMany({ where: { childId } }).catch(() => undefined);
      await tx.childNote.deleteMany({ where: { childId } }).catch(() => undefined);
      await tx.concern.deleteMany({ where: { childId } }).catch(() => undefined);
      await tx.child.deleteMany({ where: { id: childId } }).catch(() => undefined);
      await tx.session.deleteMany({ where: { id: sessionId } }).catch(() => undefined);
      await tx.group.deleteMany({ where: { id: groupId } }).catch(() => undefined);
      await tx.userTenantRole
        .deleteMany({ where: { userId: { in: [parentUserId, staffUserId] }, tenantId: tenantA } })
        .catch(() => undefined);
      await tx.user
        .deleteMany({ where: { id: { in: [parentUserId, staffUserId] } } })
        .catch(() => undefined);
    }).catch(() => undefined);
    await withTenantRlsContext(tenantB, orgId, async (tx) => {
      await tx.userTenantRole.deleteMany({
        where: { userId: otherTenantUserId, tenantId: tenantB },
      });
      await tx.user.deleteMany({ where: { id: otherTenantUserId } });
    }).catch(() => undefined);

    if (app) {
      await app.close();
    }
  });

  it("returns DSAR export for an authorised admin in the same tenant", async () => {
    if (!app) return;
    const res = await request(app.getHttpServer())
      .get(`/internal/dsar/child/${childId}`)
      .set("Authorization", adminHeader)
      .expect(200);

    expect(res.body.child.id).toBe(childId);
    expect(res.body.parents).toHaveLength(1);
    expect(res.body.attendance).toHaveLength(1);
    expect(res.body.sessions?.length).toBeGreaterThanOrEqual(1);
    expect(res.body.notes?.length).toBeGreaterThanOrEqual(1);
    expect(res.body.concerns?.length).toBeGreaterThanOrEqual(1);
  });

  it("returns 404 when requesting a child from another tenant", async () => {
    if (!app) return;
    await request(app.getHttpServer())
      .get(`/internal/dsar/child/${childId}`)
      .set("Authorization", otherTenantHeader)
      .expect(404);
  });
});
